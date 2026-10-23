import { create } from "zustand";
import { cleanOcrOutput } from "./cleanOcrOutput";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export interface RecognitionResult {
  rawText: string;
  text: string;
  ms: number;
}

const OCR_TIMEOUT_MS = 20_000;

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
  resolve: (r: { text: string; ms: number }) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

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
        break;
      case "ready":
        useOcrStatus.setState({ status: "ready", error: null });
        break;
      case "init-error":
        useOcrStatus.setState({ status: "error", error: msg.message });
        break;
      case "result":
      case "error": {
        const p = pending.get(msg.id);
        if (!p) break;
        pending.delete(msg.id);
        if (msg.type === "result") p.resolve({ text: msg.text, ms: msg.ms });
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
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(reason);
  pending.clear();
}

/**
 * Start downloading and initialising the OCR models in the background.
 * Safe to call repeatedly; also retries after a failed load.
 */
export function preloadOcr(): void {
  const { status } = useOcrStatus.getState();
  if (status === "loading" || status === "ready") return;
  useOcrStatus.setState({ status: "loading", error: null });
  send(getWorker(), { type: "init" });
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
  const result = await new Promise<{ text: string; ms: number }>((resolve, reject) => {
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
  return { rawText: result.text, text: cleanOcrOutput(result.text), ms: result.ms };
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
