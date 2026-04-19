import TextRecognition from "@react-native-ml-kit/text-recognition";
import { cleanOcrOutput } from "./cleanOcrOutput";

export interface RecognitionResult {
  rawText: string;
  text: string;
}

const OCR_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (err) => {
        clearTimeout(id);
        reject(err as Error);
      },
    );
  });
}

/**
 * Run on-device ML Kit text recognition on a captured image.
 * Returns both the raw and cleaned text.
 *
 * Wrapped in a 20s timeout because ML Kit's promise has been observed
 * to hang silently on some Android devices and label compositions
 * (particularly dense aerosol cans). Without the timeout the calling
 * spinner would never clear.
 */
export async function recogniseText(imageUri: string): Promise<RecognitionResult> {
  const result = await withTimeout(
    TextRecognition.recognize(imageUri),
    OCR_TIMEOUT_MS,
    "Text recognition",
  );
  const rawText = result.text ?? "";
  return { rawText, text: cleanOcrOutput(rawText) };
}
