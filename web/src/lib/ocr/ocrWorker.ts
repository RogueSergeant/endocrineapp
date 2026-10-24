/// <reference lib="webworker" />
// PaddleOCR in a dedicated worker so WASM inference never blocks the page.
// Models and the WASM runtime are served from this origin; nothing about
// the photo ever leaves the device.
import * as ort from "onnxruntime-web";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { PaddleOcrService } from "ppu-paddle-ocr/web";
import {
  DownloadInterruptedError,
  downloadChunkedFile,
  loadManifest,
  openChunkStore,
  pruneStore,
} from "./chunkedDownload";
import { deskew } from "./deskew";
import { createProgress } from "./progress";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// Names in the chunk manifest written by scripts/chunk-assets.mjs.
const FILES = ["det", "rec", "dict", "wasm"] as const;
const CHUNK_CACHE = "ocr-chunks-v1";
// Where the service worker used to cache the unchunked files.
const OLD_CACHE = "ocr-assets";

declare const self: DedicatedWorkerGlobalScope;

// ppu-paddle-ocr points onnxruntime at a CDN unless told otherwise. The
// binary itself comes from the chunked download (wasmBinary, below), so
// this URL is only a fallback that is never fetched.
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

const MB = (bytes: number) => (bytes / 1_000_000).toFixed(1);

async function downloadAll() {
  const store = await openChunkStore(CHUNK_CACHE);
  const manifest = await loadManifest({ store });
  const files = FILES.map((name) => {
    const file = manifest.files[name];
    if (!file) throw new Error(`The text reader manifest is missing ${name}`);
    return { name, file };
  });
  const progress = createProgress(
    files.map((f) => ({ name: f.name, approxBytes: f.file.gzipBytes })),
  );
  const total = files.reduce((sum, f) => sum + f.file.gzipBytes, 0);
  let saved = 0;
  const results = await Promise.allSettled(
    files.map(({ name, file }) =>
      downloadChunkedFile(file, {
        store,
        onBytes: (loaded) => {
          const p = progress.update(name, loaded, file.gzipBytes);
          saved = p.loaded;
          post({ type: "progress", ...p });
        },
      }),
    ),
  );
  // Wait for every file to finish or give up before reporting, so each
  // keeps saving chunks while it can.
  const failed = results.find((r) => r.status === "rejected");
  if (failed) {
    const reason = (failed as PromiseRejectedResult).reason as unknown;
    if (reason instanceof DownloadInterruptedError) {
      throw new Error(
        `The download was interrupted (${MB(saved)} of ${MB(total)} MB saved; trying again picks up from there).`,
      );
    }
    throw reason;
  }
  const value = (i: number) => (results[i] as PromiseFulfilledResult<ArrayBuffer>).value;
  void pruneStore(store, manifest).catch(() => undefined);
  // Cache Storage only exists in secure contexts (not plain-HTTP dev on a LAN).
  void self.caches?.delete(OLD_CACHE).catch(() => undefined);
  return { det: value(0), rec: value(1), dict: value(2), wasm: value(3) };
}

let servicePromise: Promise<PaddleOcrService> | null = null;

function getService(): Promise<PaddleOcrService> {
  if (servicePromise) return servicePromise;
  servicePromise = (async () => {
    const { det, rec, dict, wasm } = await downloadAll();
    ort.env.wasm.wasmBinary = wasm;
    post({ type: "downloaded" });
    const service = new PaddleOcrService({
      model: {
        detection: det,
        recognition: rec,
        charactersDictionary: dict,
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
