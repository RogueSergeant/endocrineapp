import { VlmExtractor } from "../../../modules/vlm-extractor";
import { recogniseText } from "@/lib/ocr/textRecognition";
import { parseIngredients } from "@/lib/matching/ingredientParser";
import { correctIngredients } from "@/lib/matching/ocrCorrector";

export interface LabelExtraction {
  source: "vlm" | "rules";
  productName: string | null;
  ingredients: string[];
  rawText: string;
  confidence: number;
}

/**
 * Unified label extractor. Tries the on-device multimodal VLM first and
 * falls back to the ML Kit OCR + rules pipeline when the VLM isn't
 * available (device below floor, model not yet downloaded, native
 * module not linked) or returns an empty result.
 *
 * Today this always takes the rules path — the native stubs in
 * modules/vlm-extractor always report unsupported. PR 2/3 flip the
 * switch on supported devices.
 */
export async function extractFromLabel(
  imageUri: string,
): Promise<LabelExtraction> {
  try {
    const cap = await VlmExtractor.isAvailable();
    if (cap.supported && cap.modelState === "ready") {
      const result = await VlmExtractor.extract(imageUri);
      if (result.ingredients.length > 0) {
        return {
          source: "vlm",
          productName: result.productName,
          ingredients: result.ingredients,
          confidence: result.confidence,
          // PR 5 will run OCR in parallel for the cross-check guardrail
          // and put that text here so saveScan still has something to
          // persist. For PR 2/3 we accept an empty rawText on the VLM
          // path.
          rawText: "",
        };
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("VLM path failed; falling back to rules:", err);
  }
  return runRulesPipeline(imageUri);
}

async function runRulesPipeline(imageUri: string): Promise<LabelExtraction> {
  const { rawText, text } = await recogniseText(imageUri);
  const ingredients = correctIngredients(parseIngredients(text));
  return {
    source: "rules",
    productName: null,
    ingredients,
    rawText,
    confidence: 0,
  };
}
