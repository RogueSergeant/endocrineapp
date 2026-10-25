// Messages between the page and ocrWorker.ts.
import type { Quad } from "@/lib/perspective";

/** A substance name the keyword spotter found in one line of the photo. */
export interface Spot {
  /** Index key of the name. */
  key: string;
  /** 0-1, see spotting.ts. */
  score: number;
  /** The line as the recogniser read it. */
  line: string;
  /** That line cropped from the photo, so the user can check it. */
  snippet: Blob | null;
}

export type WorkerRequest =
  | { type: "init" }
  | { type: "recognise"; id: number; bitmap: ImageBitmap }
  // Where the ingredient list probably is in a whole photo.
  | { type: "detect"; id: number; bitmap: ImageBitmap };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  // Every file is downloaded; the models are being initialised.
  | { type: "downloaded" }
  | { type: "ready" }
  | { type: "init-error"; message: string }
  | {
      type: "result";
      id: number;
      text: string;
      confidence: number;
      angle: number;
      spots: Spot[];
      ms: number;
    }
  /** Corners normalised to 0-1 across and down the photo, or null if no list was found. */
  | { type: "region"; id: number; corners: Quad | null; ms: number }
  | { type: "error"; id: number; message: string };
