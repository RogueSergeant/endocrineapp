import { create } from "zustand";
import { cleanOcrOutput } from "./cleanOcrOutput";
import { repairOcrWords } from "./ocrVocabulary";
import type { Spot, WorkerRequest, WorkerResponse } from "./protocol";

export interface RecognitionResult {
  rawText: string;
  text: string;
  /** Substance names the keyword spotter found, for possible matches. */
  spots: Spot[];
  ms: number;
}

/** What the worker sends back for one image. */
type WorkerResult = Pick<RecognitionResult, "text" | "spots" | "ms">;

export const OCR_TIMEOUT_MS = 20_000;
/**
 * Give up on loading the models after this long without any progress. A
 * mobile connection can drop mid-download without the fetch ever erroring,
 * and initialisation can hang; either would otherwise spin forever.
 */
export const LOAD_STALL_MS = 45_000;
const STALL_MESSAGE = "The text reader download stalled. Check your connection and try again.";
/**
 * Initialising the models after the download sends no progress, and can be
 * slow on low-end phones, so it gets its own, longer allowance.
 */
export const INIT_TIMEOUT_MS = 120_000;
const INIT_MESSAGE =
  "The text reader took too long to start on this device. Try again, or paste the ingredients instead.";

type OcrStatus = "idle" | "loading" | "ready" | "error";

interface OcrState {
  status: OcrStatus;
  loaded: number;
  total: number;
  error: string | null;
}

/** Model download / warm-up state, for the progress bar on the scan page. */
export const useOcrStatus = create<OcrState>(() => ({
  status: "idle",
  loaded: 0,
  total: 0,
  error: null,
}));

interface Pending {
  resolve: (r: WorkerResult) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let loadWatchdog: ReturnType<typeof setTimeout> | null = null;

function clearLoadWatchdog() {
  if (loadWatchdog) clearTimeout(loadWatchdog);
  loadWatchdog = null;
}

/**
 * (Re)start the load timer: LOAD_STALL_MS while downloading, re-armed on
 * each progress message, then INIT_TIMEOUT_MS once everything is downloaded.
 */
function armLoadWatchdog(ms = LOAD_STALL_MS, message = STALL_MESSAGE) {
  clearLoadWatchdog();
  loadWatchdog = setTimeout(() => {
    loadWatchdog = null;
    if (useOcrStatus.getState().status !== "loading") return;
    useOcrStatus.setState({ status: "error", error: message });
    resetWorker(new Error(message));
  }, ms);
}

function send(w: Worker, msg: WorkerRequest, transfer: Transferable[] = []) {
  w.postMessage(msg, transfer);
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./ocrWorker.ts", import.meta.url), { type: "module" });
  w.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    switch (msg.type) {
      case "progress":
        useOcrStatus.setState({ loaded: msg.loaded, total: msg.total });
        if (useOcrStatus.getState().status === "loading") armLoadWatchdog();
        break;
      case "downloaded":
        if (useOcrStatus.getState().status === "loading") {
          armLoadWatchdog(INIT_TIMEOUT_MS, INIT_MESSAGE);
        }
        break;
      case "ready":
        clearLoadWatchdog();
        useOcrStatus.setState({ status: "ready", error: null });
        break;
      case "init-error":
        clearLoadWatchdog();
        useOcrStatus.setState({ status: "error", error: msg.message });
        break;
      case "result":
      case "error": {
        const p = pending.get(msg.id);
        if (!p) break;
        pending.delete(msg.id);
        if (msg.type === "result") p.resolve({ text: msg.text, spots: msg.spots, ms: msg.ms });
        else p.reject(new Error(msg.message));
        break;
      }
    }
  });
  w.addEventListener("error", (event) => {
    useOcrStatus.setState({ status: "error", error: event.message || "OCR worker crashed" });
    resetWorker(new Error(event.message || "OCR worker crashed"));
  });
  worker = w;
  return w;
}

function resetWorker(reason: Error) {
  clearLoadWatchdog();
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(reason);
  pending.clear();
}

/**
 * Start downloading and initialising the OCR models in the background.
 * Safe to call repeatedly; also retries after a failed or stalled load.
 */
export function preloadOcr(): void {
  const { status } = useOcrStatus.getState();
  if (status === "loading" || status === "ready") return;
  useOcrStatus.setState({ status: "loading", error: null, loaded: 0, total: 0 });
  send(getWorker(), { type: "init" });
  armLoadWatchdog();
}

/**
 * Run on-device PaddleOCR on an image. Returns both the raw and cleaned
 * text. Takes ownership of `bitmap` (it is transferred to the worker).
 *
 * The 20s timeout only starts once the models are loaded, so a slow first
 * download on mobile data doesn't count against it. A timed-out worker is
 * killed and recreated: a stuck WASM call can't be cancelled any other way.
 */
export async function recogniseText(bitmap: ImageBitmap): Promise<RecognitionResult> {
  preloadOcr();
  await waitUntilReady();
  const w = getWorker();
  const id = nextId++;
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      const err = new Error(`Text recognition timed out after ${OCR_TIMEOUT_MS / 1000}s`);
      reject(err);
      useOcrStatus.setState({ status: "idle" });
      resetWorker(err);
    }, OCR_TIMEOUT_MS);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    send(w, { type: "recognise", id, bitmap }, [bitmap]);
  });
  return {
    rawText: result.text,
    text: repairOcrWords(cleanOcrOutput(result.text)),
    spots: result.spots,
    ms: result.ms,
  };
}

function waitUntilReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const settled = (s: OcrState) => {
      if (s.status === "ready") resolve();
      else if (s.status === "error")
        reject(new Error(s.error ?? "Couldn't load the text recogniser"));
      else return false;
      return true;
    };
    if (settled(useOcrStatus.getState())) return;
    const unsub = useOcrStatus.subscribe((s) => {
      if (settled(s)) unsub();
    });
  });
}
