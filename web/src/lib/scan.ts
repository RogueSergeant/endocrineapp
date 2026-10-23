import type { Match, ScanDoc } from "@/types";
import { parseIngredients } from "@/lib/matching/ingredientParser";
import { matchIngredients } from "@/lib/matching/matcher";
import { saveScan } from "@/lib/history";
import { getSubstanceById, substanceDb, useScanStore } from "@/lib/store/scanStore";

export class TooFewIngredientsError extends Error {}

/**
 * Shared tail of the photo and paste flows: parse, match, save to history
 * and make it the current scan. Returns the history id (null if history
 * is unavailable in this browser).
 */
export async function completeScan(rawText: string, cleanedText: string): Promise<string | null> {
  const createdAt = Date.now();
  const parsed = parseIngredients(cleanedText);
  if (parsed.length < 3) {
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

/** Rehydrate a stored scan's matches against the current substance DB. */
export function matchesFromDoc(doc: ScanDoc): Match[] {
  return doc.matches
    .map((m) => {
      const substance = getSubstanceById(m.substanceId);
      if (!substance) return null;
      return {
        substance,
        matchedAlias: m.matchedAlias,
        matchedIngredient: m.matchedIngredient,
        ingredientPosition: m.ingredientPosition,
        matchType: m.matchType,
        confidence: m.confidence,
      } satisfies Match;
    })
    .filter((m): m is Match => m !== null);
}
