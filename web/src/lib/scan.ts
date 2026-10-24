import type { Match, ScanDoc, StoredMatch, Substance } from "@/types";
import { parseIngredients } from "@/lib/matching/ingredientParser";
import { matchIngredients } from "@/lib/matching/matcher";
import { looseMatches } from "@/lib/matching/possible";
import type { Spot } from "@/lib/ocr/protocol";
import { deleteAllScans, deleteScan, discardScan, newId, saveScan } from "@/lib/history";
import { isKnownWord, repairOcrWords } from "@/lib/ocr/ocrVocabulary";
import { recogniseText } from "@/lib/ocr/textRecognition";
import { getSubstanceById, substanceDb, useScanStore } from "@/lib/store/scanStore";

export class TooFewIngredientsError extends Error {}

/** Fewer ingredients than this from a photo almost always means a bad read. */
export const MIN_OCR_INGREDIENTS = 3;

interface CompleteOptions {
  minIngredients?: number;
  /** Aborted when the user has left; nothing is kept and the current scan is left alone. */
  signal?: AbortSignal;
  /** Substance names the OCR's keyword spotter found in the photo. */
  spots?: readonly Spot[];
}

/**
 * Shared tail of the photo and paste flows: parse, match, save to history
 * and make it the current scan. Returns the history id, or null if the
 * scan couldn't be saved (history unavailable in this browser).
 */
export async function completeScan(
  rawText: string,
  cleanedText: string,
  { minIngredients = MIN_OCR_INGREDIENTS, signal, spots = [] }: CompleteOptions = {},
): Promise<string | null> {
  signal?.throwIfAborted();
  const id = newId();
  const createdAt = Date.now();
  const parsed = parseIngredients(cleanedText);
  if (parsed.length < Math.max(1, minIngredients)) {
    throw new TooFewIngredientsError(
      "Only a few words came through. Try a tighter crop, better lighting, or a closer photo.",
    );
  }
  const direct = matchIngredients(parsed, substanceDb.index, substanceDb.lookup, isKnownWord);
  // Then what a looser reading finds: names split or glued across commas,
  // and names the spotter saw in the photo. Possible matches come last.
  const loose = looseMatches(
    cleanedText,
    spots,
    direct,
    substanceDb.index,
    substanceDb.lookup,
    isKnownWord,
    repairOcrWords,
  );
  const matches = [...direct, ...loose.confirmed, ...loose.possible];
  const saved = await saveScan({
    id,
    createdAt,
    ocrText: rawText,
    parsedIngredients: parsed,
    matches,
    substancesDbVersion: substanceDb.version,
  });
  if (signal?.aborted) {
    // The user left while it was saving: take back the history entry
    // (also when the save timed out, in case it commits late).
    await discardScan(id);
    signal.throwIfAborted();
  }
  // The current scan keeps the id even if saving failed: a save that timed
  // out can still commit later, and History then shows it under this id.
  useScanStore.getState().setCurrentScan({
    id,
    createdAt,
    ocrText: rawText,
    parsedIngredients: parsed,
    matches,
  });
  return saved ? id : null;
}

/**
 * The photo flow: OCR a crop, then complete the scan. If `signal` aborts
 * at any point (the user left the page), nothing is kept and the current
 * scan is left alone; the promise rejects with an AbortError.
 */
export async function scanImage(crop: ImageBitmap, signal: AbortSignal): Promise<string | null> {
  const { rawText, text, spots, ms } = await recogniseText(crop);
  console.info(`OCR took ${ms} ms`);
  return completeScan(rawText, text, { signal, spots });
}

/**
 * Delete one scan from history and, if it is the current one, from
 * memory. Memory is cleared first, so it is cleared even if the delete
 * fails; where history is unavailable there is nothing to delete.
 */
export async function forgetScan(id: string): Promise<void> {
  const { current, clearCurrentScan } = useScanStore.getState();
  if (current?.id === id) clearCurrentScan();
  await deleteScan(id);
}

/** Delete all history and the scan held in memory (memory first, as above). */
export async function forgetAllScans(): Promise<void> {
  useScanStore.getState().clearCurrentScan();
  await deleteAllScans();
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
    edlistsUrl: null,
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
        ...(m.readAs !== undefined ? { readAs: m.readAs } : {}),
      }) satisfies Match,
  );
}
