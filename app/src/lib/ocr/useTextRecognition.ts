import { useCallback, useState } from "react";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { cleanOcrOutput } from "./cleanOcrOutput";

export type OcrStatus = "idle" | "recognising" | "done" | "error";

export interface OcrResult {
  raw: string;
  cleaned: string;
}

export interface UseTextRecognitionReturn {
  status: OcrStatus;
  result: OcrResult | null;
  error: string | null;
  recognise: (imageUri: string) => Promise<OcrResult>;
  reset: () => void;
}

export function useTextRecognition(): UseTextRecognitionReturn {
  const [status, setStatus] = useState<OcrStatus>("idle");
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognise = useCallback(async (imageUri: string): Promise<OcrResult> => {
    setStatus("recognising");
    setError(null);
    try {
      const mlResult = await TextRecognition.recognize(imageUri);
      const raw = mlResult?.text ?? "";
      const cleaned = cleanOcrOutput(raw);
      const out = { raw, cleaned };
      setResult(out);
      setStatus("done");
      return out;
    } catch (err) {
      const message = err instanceof Error ? err.message : "OCR failed";
      setError(message);
      setStatus("error");
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, recognise, reset };
}
