import { v5 as uuidv5 } from "uuid";
import type {
  Assessment,
  ListId,
  RawAssessmentRow,
  Substance,
} from "./types.ts";
import { normalise } from "./normalise.ts";
import {
  CURATED_ALIASES,
  dedupeAliases,
  expandName,
  readabilityRank,
  isCompoundName,
  splitNames,
} from "./aliases.ts";

// Deterministic UUID namespace so substance IDs are stable across builds.
const UUID_NAMESPACE = "9d8a45a4-2c4c-4d40-9f3a-3b0a5e2b8a7e";

function substanceId(key: string): string {
  return uuidv5(key, UUID_NAMESPACE);
}

function normaliseCas(cas: string | null): string | null {
  if (!cas) return null;
  const trimmed = cas.trim();
  if (!trimmed) return null;
  if (!/^\d{2,7}-\d{2}-\d$/.test(trimmed)) return null;
  return trimmed;
}

const ABBREV_RE = /\(([A-Z0-9][A-Z0-9\-]{1,})\)\s*$/;

/**
 * Display name for a substance. `curated` are label names known for its CAS
 * (CURATED_ALIASES, label/INCI name first), considered only by the fallback.
 */
export function pickCanonical(
  names: string[],
  curated: readonly string[] = [],
): { canonical: string; abbrev: string | null } {
  // Prefer the shortest name that ends in a parenthesised abbreviation.
  let best: string | null = null;
  let bestAbbrev: string | null = null;
  for (const n of names) {
    const m = n.match(ABBREV_RE);
    if (!m) continue;
    if (!best || n.length < best.length) {
      best = n;
      bestAbbrev = m[1] ?? null;
    }
  }
  if (best) return { canonical: best, abbrev: bestAbbrev };
  // Fallback: the most readable source name (mixed case, then all caps,
  // then abbreviations; shortest within a rank), or the curated label name
  // when it ranks at least as well and is no longer (it replaces systematic
  // names and source typos).
  const mostReadable = (list: readonly string[]) =>
    [...list].sort((a, b) => readabilityRank(a) - readabilityRank(b) || a.length - b.length)[0];
  const source = mostReadable(names);
  // Curated lists put the label (INCI) name first: keep that order within a rank.
  const topRank = Math.min(...curated.map(readabilityRank));
  const label = curated.find((n) => readabilityRank(n) === topRank);
  if (
    label &&
    (!source ||
      readabilityRank(label) < readabilityRank(source) ||
      (readabilityRank(label) === readabilityRank(source) && label.length <= source.length))
  ) {
    return { canonical: label, abbrev: null };
  }
  return { canonical: source ?? "", abbrev: null };
}

function maxTier(a: ListId, b: ListId): ListId {
  // Lowest list number = highest evidence; "min" of the list ids per spec.
  return Math.min(a, b) as ListId;
}

export function dedupe(rows: RawAssessmentRow[]): Substance[] {
  const groups = new Map<string, RawAssessmentRow[]>();
  for (const row of rows) {
    const cas = normaliseCas(row.casNumber);
    const key = cas ? `cas:${cas}` : `name:${normalise(row.name)}`;
    if (!key.endsWith(":")) {
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
  }
  const substances: Substance[] = [];
  for (const [key, group] of groups) {
    const first = group[0];
    if (!first) continue;
    const cas = normaliseCas(first.casNumber);
    const ec = group.find((r) => r.ecNumber)?.ecNumber ?? null;
    const allNames = Array.from(new Set(group.map((r) => r.name).filter(Boolean)));
    // Pick the display name from the individual synonyms, so
    // "Butyl 4-hydroxybenzoate; Butylparaben" displays as "Butylparaben".
    const parts = allNames.flatMap((n) => {
      const split = splitNames(n);
      return split.length > 0 ? split : [n];
    });
    const { canonical, abbrev } = pickCanonical(parts, cas ? CURATED_ALIASES[cas] : []);
    let tier: ListId = first.listId;
    let health = false;
    let env = false;
    const assessments: Assessment[] = [];
    for (const r of group) {
      tier = maxTier(tier, r.listId);
      if (r.healthEffects) health = true;
      if (r.envEffects) env = true;
      assessments.push({
        listId: r.listId,
        status: r.status,
        regulatoryField: r.regulatoryField,
        year: r.year,
      });
    }
    const aliases: string[] = [];
    if (abbrev) aliases.push(abbrev);
    for (const n of [...allNames, ...parts]) {
      aliases.push(...expandName(n));
      // Strip trailing "(ABBR)" from aliases too.
      if (isCompoundName(n)) continue;
      const stripped = n.replace(ABBREV_RE, "").trim();
      if (stripped) aliases.push(stripped);
    }
    if (cas) aliases.push(...(CURATED_ALIASES[cas] ?? []));
    substances.push({
      id: substanceId(key),
      casNumber: cas,
      ecNumber: ec,
      canonicalName: canonical,
      evidenceTier: tier,
      healthEffects: health,
      envEffects: env,
      assessments,
      aliases: dedupeAliases(aliases),
      inciName: null,
    });
  }
  return substances;
}
