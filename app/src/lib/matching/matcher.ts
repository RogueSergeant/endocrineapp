import type { Match, Substance } from "../../types";
import { extractCas, looksLikeCas, normalise } from "./normaliser";
import { boundedLevenshtein } from "./fuzzy";

const FUZZY_MIN_LENGTH = 8;
const FUZZY_MAX_DISTANCE = 2;

export interface MatcherInputs {
  ingredients: string[];
  index: Record<string, string>;
  substances: Record<string, Substance>;
}

interface FuzzyCandidate {
  alias: string;
  normalised: string;
  substanceId: string;
}

function buildFuzzyCandidates(
  index: Record<string, string>,
): Map<string, FuzzyCandidate[]> {
  const buckets = new Map<string, FuzzyCandidate[]>();
  for (const [normalised, substanceId] of Object.entries(index)) {
    if (normalised.length < FUZZY_MIN_LENGTH) continue;
    if (looksLikeCas(normalised)) continue;
    const first = normalised[0]!;
    if (!buckets.has(first)) buckets.set(first, []);
    buckets.get(first)!.push({ alias: normalised, normalised, substanceId });
  }
  return buckets;
}

function findCasMatch(
  token: string,
  substances: Record<string, Substance>,
): Substance | null {
  const cas = extractCas(token);
  if (!cas) return null;
  for (const sub of Object.values(substances)) {
    if (sub.casNumber === cas) return sub;
  }
  return null;
}

export function matchIngredients({
  ingredients,
  index,
  substances,
}: MatcherInputs): Match[] {
  const fuzzyBuckets = buildFuzzyCandidates(index);
  const byId = new Map<string, Match>();

  ingredients.forEach((raw, position) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const casSub = findCasMatch(trimmed, substances);
    if (casSub) {
      upsertMatch(byId, {
        substance: casSub,
        matchedAlias: casSub.casNumber ?? trimmed,
        matchedIngredient: trimmed,
        ingredientPosition: position,
        matchType: "cas",
        confidence: 1,
      });
      return;
    }

    const n = normalise(trimmed);
    if (!n) return;

    const exactId = index[n];
    if (exactId && substances[exactId]) {
      upsertMatch(byId, {
        substance: substances[exactId],
        matchedAlias: n,
        matchedIngredient: trimmed,
        ingredientPosition: position,
        matchType: "exact",
        confidence: 1,
      });
      return;
    }

    if (n.length < FUZZY_MIN_LENGTH) return;
    const bucket = fuzzyBuckets.get(n[0]!);
    if (!bucket) return;

    let best: { cand: FuzzyCandidate; distance: number } | null = null;
    for (const cand of bucket) {
      if (Math.abs(cand.normalised.length - n.length) > FUZZY_MAX_DISTANCE) continue;
      const d = boundedLevenshtein(n, cand.normalised, FUZZY_MAX_DISTANCE);
      if (d <= FUZZY_MAX_DISTANCE && (best == null || d < best.distance)) {
        best = { cand, distance: d };
        if (d === 0) break;
      }
    }
    if (best && substances[best.cand.substanceId]) {
      const confidence = 1 - best.distance * 0.15;
      upsertMatch(byId, {
        substance: substances[best.cand.substanceId],
        matchedAlias: best.cand.alias,
        matchedIngredient: trimmed,
        ingredientPosition: position,
        matchType: "fuzzy",
        confidence: Math.max(0.7, Math.min(0.9, confidence)),
      });
    }
  });

  return [...byId.values()].sort((a, b) => {
    const tier = a.substance.evidenceTier - b.substance.evidenceTier;
    if (tier !== 0) return tier;
    return a.ingredientPosition - b.ingredientPosition;
  });
}

function upsertMatch(byId: Map<string, Match>, m: Match): void {
  const existing = byId.get(m.substance.id);
  if (!existing || m.confidence > existing.confidence) {
    byId.set(m.substance.id, m);
  }
}
