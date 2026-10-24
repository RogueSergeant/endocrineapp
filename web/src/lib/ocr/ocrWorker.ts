/// <reference lib="webworker" />
// PaddleOCR in a dedicated worker so WASM inference never blocks the page.
// Models and the WASM runtime are served from this origin; nothing about
// the photo ever leaves the device.
import * as ort from "onnxruntime-web";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { PaddleOcrService } from "ppu-paddle-ocr/web";
import { deskew } from "./deskew";
import { createProgress } from "./progress";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// Keep in sync with MODEL_DIR in scripts/fetch-models.mjs.
const MODEL_BASE = "/models/ppocrv5-en";

// Approximate sizes, used for the progress bar only when the server
// doesn't send Content-Length (e.g. compressed responses).
const MODEL_FILES = [
  { name: "det", url: `${MODEL_BASE}/det.ort`, approxBytes: 4_896_928 },
  { name: "rec", url: `${MODEL_BASE}/rec.ort`, approxBytes: 7_962_368 },
] as const;

declare const self: DedicatedWorkerGlobalScope;

// ppu-paddle-ocr points onnxruntime at a CDN unless told otherwise.
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function fetchWithProgress(
  url: string,
  approxBytes: number,
  onBytes: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't download ${url} (HTTP ${res.status})`);
  const header = Number(res.headers.get("Content-Length"));
  const total = header > 0 ? header : approxBytes;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

let servicePromise: Promise<PaddleOcrService> | null = null;

function getService(): Promise<PaddleOcrService> {
  if (servicePromise) return servicePromise;
  servicePromise = (async () => {
    const progress = createProgress(MODEL_FILES);
    const [det, rec, dictRes] = await Promise.all([
      ...MODEL_FILES.map((f) =>
        fetchWithProgress(f.url, f.approxBytes, (l, t) => {
          post({ type: "progress", ...progress.update(f.name, l, t) });
        }),
      ),
      fetch(`${MODEL_BASE}/dict.txt`),
    ]);
    if (!(dictRes instanceof Response) || !dictRes.ok) {
      throw new Error("Couldn't download the OCR dictionary");
    }
    const service = new PaddleOcrService({
      model: {
        detection: det as ArrayBuffer,
        recognition: rec as ArrayBuffer,
        charactersDictionary: await dictRes.arrayBuffer(),
      },
      session: { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
      // Batched recognition (the library default of 6) garbles this
      // model's output; one line per inference reads correctly.
      recognition: { recBatchSize: 1, charactersDictionary: [] },
    });
    await service.initialize();
    return service;
  })();
  // A failed load (e.g. offline on first visit) must be retryable.
  servicePromise.catch(() => {
    servicePromise = null;
  });
  return servicePromise;
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "init") {
    getService().then(
      () => post({ type: "ready" }),
      (err: unknown) => post({ type: "init-error", message: errorMessage(err) }),
    );
    return;
  }
  if (msg.type === "recognise") {
    void (async () => {
      try {
        const service = await getService();
        const canvas = new OffscreenCanvas(msg.bitmap.width, msg.bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable in worker");
        ctx.drawImage(msg.bitmap, 0, 0);
        msg.bitmap.close();
        const started = performance.now();
        const { canvas: level, angle } = deskew(canvas, (w, h) => new OffscreenCanvas(w, h));
        const result = await service.recognize(level);
        post({
          type: "result",
          id: msg.id,
          text: result.text,
          confidence: result.confidence,
          angle,
          ms: Math.round(performance.now() - started),
        });
      } catch (err) {
        post({ type: "error", id: msg.id, message: errorMessage(err) });
      }
    })();
  }
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
