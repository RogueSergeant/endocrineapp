// Messages between the page and ocrWorker.ts.

export type WorkerRequest =
  { type: "init" } | { type: "recognise"; id: number; bitmap: ImageBitmap };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "init-error"; message: string }
  | { type: "result"; id: number; text: string; confidence: number; angle: number; ms: number }
  | { type: "error"; id: number; message: string };
