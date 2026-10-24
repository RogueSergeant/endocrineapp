// Messages between the page and ocrWorker.ts.

export type WorkerRequest =
  { type: "init" } | { type: "recognise"; id: number; bitmap: ImageBitmap };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  // Every file is downloaded; the models are being initialised.
  | { type: "downloaded" }
  | { type: "ready" }
  | { type: "init-error"; message: string }
  | { type: "result"; id: number; text: string; confidence: number; angle: number; ms: number }
  | { type: "error"; id: number; message: string };
