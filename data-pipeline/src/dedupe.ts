import { v5 as uuidv5 } from "uuid";
import type {
  Assessment,
  ListId,
  RawAssessmentRow,
  Substance,
} from "./types.ts";
import { normalise } from "./normalise.ts";

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

function pickCanonical(names: string[]): { canonical: string; abbrev: string | null } {
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
  // Fallback: shortest name.
  const sorted = [...names].sort((a, b) => a.length - b.length);
  return { canonical: sorted[0] ?? "", abbrev: null };
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
    const { canonical, abbrev } = pickCanonical(allNames);
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
    for (const n of allNames) {
      // Strip trailing "(ABBR)" from aliases too.
      const stripped = n.replace(ABBREV_RE, "").trim();
      if (stripped) aliases.push(stripped);
      aliases.push(n);
    }
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

function dedupeAliases(aliases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of aliases) {
    const k = a.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a.trim());
  }
  return out;
}
