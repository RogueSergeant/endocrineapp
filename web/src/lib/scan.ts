import type { Match, ScanDoc, StoredMatch, Substance } from "@/types";
import { parseIngredients } from "@/lib/matching/ingredientParser";
import { matchIngredients } from "@/lib/matching/matcher";
import { deleteAllScans, deleteScan, saveScan } from "@/lib/history";
import { recogniseText } from "@/lib/ocr/textRecognition";
import { getSubstanceById, substanceDb, useScanStore } from "@/lib/store/scanStore";

export class TooFewIngredientsError extends Error {}

/** Fewer ingredients than this from a photo almost always means a bad read. */
export const MIN_OCR_INGREDIENTS = 3;

/**
 * Shared tail of the photo and paste flows: parse, match, save to history
 * and make it the current scan. Returns the history id (null if history
 * is unavailable in this browser).
 */
export async function completeScan(
  rawText: string,
  cleanedText: string,
  { minIngredients = MIN_OCR_INGREDIENTS }: { minIngredients?: number } = {},
): Promise<string | null> {
  const createdAt = Date.now();
  const parsed = parseIngredients(cleanedText);
  if (parsed.length < Math.max(1, minIngredients)) {
    throw new TooFewIngredientsError(
      "Only a few words came through. Try a tighter crop, better lighting, or a closer photo.",
    );
  }
  const matches = matchIngredients(parsed, substanceDb.index, substanceDb.lookup);
  const id = await saveScan({
    createdAt,
    ocrText: rawText,
    parsedIngredients: parsed,
    matches,
    substancesDbVersion: substanceDb.version,
  });
  useScanStore.getState().setCurrentScan({
    id,
    createdAt,
    ocrText: rawText,
    parsedIngredients: parsed,
    matches,
  });
  return id;
}

/**
 * The photo flow: OCR a crop, then complete the scan. If `signal` aborts
 * while OCR runs (the user left the page), nothing is saved and the
 * current scan is left alone; the promise rejects with an AbortError.
 */
export async function scanImage(crop: ImageBitmap, signal: AbortSignal): Promise<string | null> {
  const { rawText, text, ms } = await recogniseText(crop);
  signal.throwIfAborted();
  console.info(`OCR took ${ms} ms`);
  return completeScan(rawText, text);
}

/** Delete one scan from history, and from memory if it is the current one. */
export async function forgetScan(id: string): Promise<void> {
  await deleteScan(id);
  const { current, clearCurrentScan } = useScanStore.getState();
  if (current?.id === id) clearCurrentScan();
}

/** Delete all history, including the scan held in memory. */
export async function forgetAllScans(): Promise<void> {
  await deleteAllScans();
  useScanStore.getState().clearCurrentScan();
}

/**
 * Stand-in for a substance a stored scan flagged that is no longer in the
 * bundled database (removed or re-keyed by a data update), built from the
 * name and tier saved with the scan.
 */
function retiredSubstance(m: StoredMatch): Substance {
  return {
    id: m.substanceId,
    casNumber: null,
    ecNumber: null,
    canonicalName: m.canonicalName,
    evidenceTier: m.evidenceTier,
    healthEffects: false,
    envEffects: false,
    assessments: [],
    aliases: [],
    inciName: null,
  };
}

/** Rehydrate a stored scan's matches against the current substance DB. */
export function matchesFromDoc(doc: ScanDoc): Match[] {
  return doc.matches.map(
    (m) =>
      ({
        substance: getSubstanceById(m.substanceId) ?? retiredSubstance(m),
        matchedAlias: m.matchedAlias,
        matchedIngredient: m.matchedIngredient,
        ingredientPosition: m.ingredientPosition,
        matchType: m.matchType,
        confidence: m.confidence,
      }) satisfies Match,
  );
}
