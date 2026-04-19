import TextRecognition from "@react-native-ml-kit/text-recognition";
import { cleanOcrOutput } from "./cleanOcrOutput";

export interface RecognitionResult {
  rawText: string;
  text: string;
}

/**
 * Run on-device ML Kit text recognition on a captured image.
 * Returns both the raw and cleaned text so callers can store the raw
 * output in the scan history without losing fidelity.
 */
export async function recogniseText(imageUri: string): Promise<RecognitionResult> {
  const result = await TextRecognition.recognize(imageUri);
  const rawText = result.text ?? "";
  return { rawText, text: cleanOcrOutput(rawText) };
}
