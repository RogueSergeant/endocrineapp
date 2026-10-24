import type { Match, SubstancesIndex } from "@/types";
import type { Spot } from "@/lib/ocr/protocol";
import { boundedDistance, fuzzyConfidence, type KnownWord, type SubstanceLookup } from "./matcher";
import { normalise } from "./normaliser";
import { findInSpans } from "./spans";

// What the parsed-ingredient matcher missed, from reading the list more
// loosely. Anything certain joins the confirmed matches; anything that
// rests on an uncertain reading is a "possible" match for the user to
// check against the label, never silently dropped and never presented as
// confirmed.

/** Spotter scores below this are too weak to show (see spotting.ts). */
export const SPOT_MIN = 0.8;

/**
 * Whether real words other than the name explain where the spotter found
 * it. The spotter scores a name against the model's raw probabilities, so
 * it can find "potassio" in a line that, once its misreads are repaired,
 * plainly says "Potassium". The run of words closest to the name decides:
 * the name itself is a find; real, different words mean the spotter only
 * found a lookalike; unknown words leave it possible.
 */
function explainedByOtherWords(
  key: string,
  line: string,
  repair: (text: string) => string,
  isKnownWord: KnownWord,
): boolean {
  const words = normalise(repair(line)).split(" ").filter(Boolean);
  const n = key.split(" ").length;
  let best: { text: string; distance: number } | null = null;
  for (let i = 0; i + n <= words.length; i++) {
    const text = words.slice(i, i + n).join(" ");
    const distance = boundedDistance(text, key, key.length);
    if (!best || distance < best.distance) best = { text, distance };
  }
  if (!best || best.text === key) return false;
  return best.text.split(" ").every((w) => /^[a-z]+$/.test(w) && isKnownWord(w));
}

export function looseMatches(
  text: string,
  spots: readonly Spot[],
  confirmed: readonly Match[],
  index: SubstancesIndex,
  lookup: SubstanceLookup,
  isKnownWord?: KnownWord,
  repair: (text: string) => string = (t) => t,
): { confirmed: Match[]; possible: Match[] } {
  const have = new Set(confirmed.map((m) => m.substance.id));
  const extraConfirmed = new Map<string, Match>();
  const possible = new Map<string, Match>();
  const offer = (m: Match) => {
    const prev = possible.get(m.substance.id);
    if (!prev || m.confidence > prev.confidence) possible.set(m.substance.id, m);
  };

  for (const f of findInSpans(text, index, isKnownWord)) {
    if (have.has(f.substanceId)) continue;
    const substance = lookup.byId[f.substanceId];
    if (!substance) continue;
    const base = {
      substance,
      matchedAlias: f.alias,
      matchedIngredient: f.text,
      ingredientPosition: Number.MAX_SAFE_INTEGER,
    };
    // Read exactly and within one ingredient: only the commas were wrong.
    if (f.distance === 0 && !f.crossesSeparator) {
      extraConfirmed.set(f.substanceId, { ...base, matchType: "exact", confidence: 1 });
    } else {
      offer({
        ...base,
        matchType: "possible",
        confidence: fuzzyConfidence(f.distance) * (f.crossesSeparator ? 0.9 : 1),
        readAs: f.text,
      });
    }
  }

  for (const spot of spots) {
    if (spot.score < SPOT_MIN) continue;
    const id = index[spot.key];
    const substance = id ? lookup.byId[id] : undefined;
    if (!id || !substance || have.has(id) || extraConfirmed.has(id)) continue;
    if (isKnownWord && explainedByOtherWords(spot.key, spot.line, repair, isKnownWord)) continue;
    offer({
      substance,
      matchedAlias: spot.key,
      matchedIngredient: spot.line,
      ingredientPosition: Number.MAX_SAFE_INTEGER,
      matchType: "possible",
      confidence: spot.score,
      readAs: spot.line,
      ...(spot.snippet ? { snippet: spot.snippet } : {}),
    });
  }

  for (const id of extraConfirmed.keys()) possible.delete(id);
  // A possible match backed by both readings keeps the photo crop.
  for (const spot of spots) {
    const id = index[spot.key];
    const m = id ? possible.get(id) : undefined;
    if (m && !m.snippet && spot.snippet) m.snippet = spot.snippet;
  }
  return {
    confirmed: [...extraConfirmed.values()],
    possible: [...possible.values()].sort((a, b) => b.confidence - a.confidence),
  };
}
