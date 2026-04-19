import type { Match, Substance, SubstancesIndex } from "@/types";
import { looksLikeCas, normalise } from "./normaliser";

const FUZZY_MIN_LENGTH = 8;
const FUZZY_MAX_DISTANCE = 2;

/**
 * Levenshtein distance with an early-exit cap. Returns `cap + 1`
 * if the true distance exceeds the cap. OCR errors are dominated by
 * substitutions, insertions, and deletions; transpositions are rare
 * enough on printed labels that a plain Levenshtein keeps things simple.
 */
export function boundedDistance(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > cap) return cap + 1;

  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j]! + 1;
      const ins = curr[j - 1]! + 1;
      const sub = prev[j - 1]! + cost;
      const val = Math.min(del, ins, sub);
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/**
 * Build a per-first-letter view of the index for cheaper fuzzy lookups.
 * Pure, but expensive enough to memoise.
 */
function bucketByFirstChar(index: SubstancesIndex): Record<string, string[]> {
  const buckets: Record<string, string[]> = {};
  for (const alias of Object.keys(index)) {
    if (alias.startsWith("cas:")) continue;
    const first = alias.charAt(0);
    if (!first) continue;
    (buckets[first] ??= []).push(alias);
  }
  return buckets;
}

let cachedBuckets: { index: SubstancesIndex; buckets: Record<string, string[]> } | null = null;
function getBuckets(index: SubstancesIndex): Record<string, string[]> {
  if (cachedBuckets && cachedBuckets.index === index) return cachedBuckets.buckets;
  const buckets = bucketByFirstChar(index);
  cachedBuckets = { index, buckets };
  return buckets;
}

function fuzzyMatch(
  needle: string,
  index: SubstancesIndex,
): { alias: string; substanceId: string; distance: number } | null {
  if (needle.length < FUZZY_MIN_LENGTH) return null;
  const buckets = getBuckets(index);
  const first = needle.charAt(0);
  const candidates = buckets[first] ?? [];
  let best: { alias: string; substanceId: string; distance: number } | null = null;
  for (const alias of candidates) {
    if (Math.abs(alias.length - needle.length) > FUZZY_MAX_DISTANCE) continue;
    const d = boundedDistance(needle, alias, FUZZY_MAX_DISTANCE);
    if (d <= FUZZY_MAX_DISTANCE && (!best || d < best.distance)) {
      const id = index[alias];
      if (id) best = { alias, substanceId: id, distance: d };
      if (d === 0) break;
    }
  }
  return best;
}

function fuzzyConfidence(distance: number): number {
  if (distance === 0) return 1;
  if (distance === 1) return 0.9;
  if (distance === 2) return 0.7;
  return 0;
}

export interface SubstanceLookup {
  byId: Record<string, Substance>;
}

export function buildLookup(substances: Substance[]): SubstanceLookup {
  const byId: Record<string, Substance> = {};
  for (const s of substances) byId[s.id] = s;
  return { byId };
}

export function matchIngredients(
  ingredients: string[],
  index: SubstancesIndex,
  lookup: SubstanceLookup,
): Match[] {
  const matches = new Map<string, Match>();

  ingredients.forEach((rawIngredient, position) => {
    const trimmed = rawIngredient.trim();
    if (!trimmed) return;

    // CAS branch
    if (looksLikeCas(trimmed)) {
      const id = index[`cas:${trimmed}`];
      const substance = id ? lookup.byId[id] : undefined;
      if (substance) {
        record(matches, {
          substance,
          matchedAlias: trimmed,
          matchedIngredient: rawIngredient,
          ingredientPosition: position,
          matchType: "cas",
          confidence: 1,
        });
      }
      return;
    }

    const normalised = normalise(trimmed);
    if (!normalised) return;

    const exactId = index[normalised];
    if (exactId) {
      const substance = lookup.byId[exactId];
      if (substance) {
        record(matches, {
          substance,
          matchedAlias: normalised,
          matchedIngredient: rawIngredient,
          ingredientPosition: position,
          matchType: "exact",
          confidence: 1,
        });
        return;
      }
    }

    const fuzzy = fuzzyMatch(normalised, index);
    if (fuzzy) {
      const substance = lookup.byId[fuzzy.substanceId];
      if (substance) {
        record(matches, {
          substance,
          matchedAlias: fuzzy.alias,
          matchedIngredient: rawIngredient,
          ingredientPosition: position,
          matchType: "fuzzy",
          confidence: fuzzyConfidence(fuzzy.distance),
        });
      }
    }
  });

  return Array.from(matches.values()).sort((a, b) => {
    if (a.substance.evidenceTier !== b.substance.evidenceTier) {
      return a.substance.evidenceTier - b.substance.evidenceTier;
    }
    return a.ingredientPosition - b.ingredientPosition;
  });
}

function record(map: Map<string, Match>, match: Match): void {
  const existing = map.get(match.substance.id);
  if (!existing || match.confidence > existing.confidence) {
    map.set(match.substance.id, match);
  }
}
