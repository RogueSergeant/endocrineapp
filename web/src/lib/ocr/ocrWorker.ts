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
import { createSpotter } from "./spotting";
import { textAngleFromMap } from "./textAngle";
import substancesIndex from "@/data/substances-index.json";
import { GENERIC_ALIAS_DENYLIST } from "@/lib/matching/matcher";
import type { Spot, WorkerRequest, WorkerResponse } from "./protocol";

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

// Mean and spread the detection model was trained with (as ppu-paddle-ocr
// normalises its input), and a map size that keeps the extra pass quick.
const DET_MEAN = [0.485, 0.456, 0.406] as const;
const DET_STD = [0.229, 0.224, 0.225] as const;
const TILT_SIDE = 960;

/**
 * Tilt of the text, measured on the detection model's probability map
 * (see textAngle.ts), or null when it found too little text to say.
 */
async function measureTilt(
  session: ort.InferenceSession,
  source: OffscreenCanvas,
): Promise<number | null> {
  const scale = Math.min(1, TILT_SIDE / Math.max(source.width, source.height));
  const sw = Math.max(1, Math.round(source.width * scale));
  const sh = Math.max(1, Math.round(source.height * scale));
  // The model needs sides that are multiples of 32.
  const w = Math.ceil(sw / 32) * 32;
  const h = Math.ceil(sh / 32) * 32;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, w, h);
  const plane = w * h;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0, j = 0; i < plane; i++, j += 4) {
    for (let c = 0; c < 3; c++) {
      tensor[c * plane + i] = (data[j + c]! / 255 - DET_MEAN[c]!) / DET_STD[c]!;
    }
  }
  const input = session.inputNames[0];
  const output = session.outputNames[0];
  if (!input || !output) return null;
  const results = await session.run({ [input]: new ort.Tensor("float32", tensor, [1, 3, h, w]) });
  const map = results[output]?.data;
  return map instanceof Float32Array ? textAngleFromMap(map, w, h) : null;
}

// The recogniser's input height, and the score a name needs before it is
// worth reporting to the page (which applies its own, higher bar).
const REC_HEIGHT = 48;
const SPOT_REPORT = 0.75;
// Line crops sent back for the user to check, at most this wide.
const SNIPPET_WIDTH = 720;

interface Reader {
  service: PaddleOcrService;
  /** A second session on the detection model, for measuring tilt. */
  detector: ort.InferenceSession;
  /** And on the recognition model, for its raw per-frame probabilities. */
  recogniser: ort.InferenceSession;
  dictionary: string[];
}

type Box = { x: number; y: number; width: number; height: number };

/** One line of the photo as the recogniser's input: grey levels scaled to -1..1, 48px high. */
function lineTensor(source: OffscreenCanvas, box: Box): ort.Tensor | null {
  const width = Math.max(8, Math.round((REC_HEIGHT * box.width) / Math.max(1, box.height)));
  const canvas = new OffscreenCanvas(width, REC_HEIGHT);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, width, REC_HEIGHT);
  const { data } = ctx.getImageData(0, 0, width, REC_HEIGHT);
  const plane = width * REC_HEIGHT;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0, j = 0; i < plane; i++, j += 4) {
    const grey = 0.299 * data[j]! + 0.587 * data[j + 1]! + 0.114 * data[j + 2]!;
    tensor[i] = tensor[plane + i] = tensor[2 * plane + i] = grey / 127.5 - 1;
  }
  return new ort.Tensor("float32", tensor, [1, 3, REC_HEIGHT, width]);
}

/**
 * The recogniser's classes in output order (index 0 the CTC blank), lined
 * up with the dictionary the way ppu-paddle-ocr does: the dictionary may or
 * may not include the blank, and the space class may be implicit.
 */
function alignClasses(dictionary: string[], numClasses: number): string[] {
  const entries = [...dictionary];
  while (entries.length > 0 && entries[entries.length - 1] === "") entries.pop();
  const aligned = ["", ...(entries[0] === "" ? entries.slice(1) : entries)];
  if (aligned.length === numClasses - 1) aligned.push(" ");
  return aligned.slice(0, numClasses);
}

let spotter: ReturnType<typeof createSpotter> | null = null;

/**
 * Every substance name the spotter finds in the lines `result` read from
 * `source`: the best line for each name, with its text and a crop.
 */
async function spotNames(
  reader: Reader,
  source: OffscreenCanvas,
  lines: { text: string; box: Box }[][],
): Promise<Spot[]> {
  const best = new Map<string, { score: number; line: number }>();
  const lineBoxes: Box[] = [];
  const lineTexts: string[] = [];
  for (const items of lines) {
    if (items.length === 0) continue;
    // The line's extent: the union of its words' boxes.
    const x0 = Math.max(0, Math.min(...items.map((i) => i.box.x)));
    const y0 = Math.max(0, Math.min(...items.map((i) => i.box.y)));
    const x1 = Math.min(source.width, Math.max(...items.map((i) => i.box.x + i.box.width)));
    const y1 = Math.min(source.height, Math.max(...items.map((i) => i.box.y + i.box.height)));
    if (x1 - x0 < 4 || y1 - y0 < 4) continue;
    const box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const input = lineTensor(source, box);
    const inputName = reader.recogniser.inputNames[0];
    const outputName = reader.recogniser.outputNames[0];
    if (!input || !inputName || !outputName) continue;
    const out = (await reader.recogniser.run({ [inputName]: input }))[outputName];
    if (!out || !(out.data instanceof Float32Array) || out.dims.length !== 3) continue;
    const frames = out.dims[1]!;
    const numClasses = out.dims[2]!;
    if (!spotter) {
      // The same names the matcher accepts: no CAS keys, no generic words.
      const keys = Object.keys(substancesIndex).filter(
        (k) => !k.startsWith("cas:") && !GENERIC_ALIAS_DENYLIST.has(k),
      );
      spotter = createSpotter(keys, alignClasses(reader.dictionary, numClasses), {
        minScore: SPOT_REPORT,
      });
    }
    const n = lineBoxes.push(box) - 1;
    lineTexts.push(items.map((i) => i.text).join(" "));
    for (const hit of spotter.spot(out.data, frames)) {
      const prev = best.get(hit.key);
      if (!prev || hit.score > prev.score) best.set(hit.key, { score: hit.score, line: n });
    }
  }
  const snippets = new Map<number, Promise<Blob | null>>();
  const snippet = (n: number) => {
    let p = snippets.get(n);
    if (!p) {
      const box = lineBoxes[n]!;
      const scale = Math.min(1, SNIPPET_WIDTH / box.width);
      const c = new OffscreenCanvas(Math.round(box.width * scale), Math.round(box.height * scale));
      const ctx = c.getContext("2d");
      ctx?.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, c.width, c.height);
      p = ctx ? c.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : Promise.resolve(null);
      snippets.set(n, p);
    }
    return p;
  };
  return Promise.all(
    [...best].map(async ([key, { score, line }]) => ({
      key,
      score,
      line: lineTexts[line]!,
      snippet: await snippet(line).catch(() => null),
    })),
  );
}

let servicePromise: Promise<Reader> | null = null;

function getService(): Promise<Reader> {
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
      // The library pads each detected line by 40% of its height above and
      // below. Ingredient lists are set with tight leading, so that pulls
      // half of the neighbouring lines into every strip and the recogniser
      // reads two lines at once. Measured on real and synthetic labels:
      // 0.4 recovered ~50% of words, 0.15 ~99%; 0.1 starts clipping.
      detection: { paddingVertical: 0.15 },
    });
    await service.initialize();
    const detector = await ort.InferenceSession.create(new Uint8Array(det), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    const recogniser = await ort.InferenceSession.create(new Uint8Array(rec), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    const dictionary = new TextDecoder().decode(dict).split(/\r?\n/);
    return { service, detector, recogniser, dictionary };
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
        const reader = await getService();
        const { service, detector } = reader;
        const canvas = new OffscreenCanvas(msg.bitmap.width, msg.bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable in worker");
        ctx.drawImage(msg.bitmap, 0, 0);
        msg.bitmap.close();
        const started = performance.now();
        // The detector's angle ignores packaging graphics and works on
        // light-on-dark text; the edge-based estimate covers crops where
        // it finds too little text to measure.
        const measured = await measureTilt(detector, canvas);
        const { canvas: level, angle } = deskew(
          canvas,
          (w, h) => new OffscreenCanvas(w, h),
          measured ?? undefined,
        );
        const result = await service.recognize(level);
        // Spotting is extra evidence; a failure there must not lose the read.
        const spots =
          "lines" in result ? await spotNames(reader, level, result.lines).catch(() => []) : [];
        post({
          type: "result",
          id: msg.id,
          text: result.text,
          confidence: result.confidence,
          angle,
          spots,
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
