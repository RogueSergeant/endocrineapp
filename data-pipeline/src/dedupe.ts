import { createHash } from "node:crypto";
import type { Assessment, RawAssessmentRow, Substance } from "./types.ts";
import { normalise } from "./normaliser.ts";

function stableId(key: string): string {
  const h = createHash("sha1").update(key).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join("-");
}

/**
 * Split names like "Benzyl butyl phthalate (BBP)" into { name, aliases }.
 * Abbreviations found in trailing parentheses are extracted as priority aliases.
 */
export function splitNameAndAbbr(raw: string): { name: string; abbrs: string[] } {
  const abbrs: string[] = [];
  let name = raw;
  const re = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const inside = match[1]?.trim();
    if (inside && /^[A-Z0-9][A-Z0-9\-+]{1,10}$/.test(inside)) {
      abbrs.push(inside);
    }
  }
  name = name.replace(/\s*\([^)]+\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return { name, abbrs };
}

function pickCanonicalName(rows: RawAssessmentRow[]): { name: string; abbrs: string[] } {
  const parsed = rows.map((r) => splitNameAndAbbr(r.name));
  const withAbbr = parsed.filter((p) => p.abbrs.length > 0);
  if (withAbbr.length > 0) {
    withAbbr.sort((a, b) => a.name.length - b.name.length);
    return withAbbr[0]!;
  }
  parsed.sort((a, b) => a.name.length - b.name.length);
  return parsed[0]!;
}

export function dedupe(rows: RawAssessmentRow[]): Substance[] {
  const buckets = new Map<string, RawAssessmentRow[]>();
  for (const r of rows) {
    const key = r.casNumber?.trim()
      ? `cas:${r.casNumber.trim()}`
      : `name:${normalise(r.name)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const substances: Substance[] = [];
  for (const [key, bucket] of buckets) {
    const { name: canonicalName, abbrs } = pickCanonicalName(bucket);
    const listIds = new Set(bucket.map((b) => b.listId));
    const evidenceTier = (Math.min(...listIds) as 1 | 2 | 3);
    const healthEffects = bucket.some((b) => b.healthEffects === true);
    const envEffects = bucket.some((b) => b.envEffects === true);

    const assessments: Assessment[] = bucket.map((b) => ({
      listId: b.listId,
      status: b.status,
      regulatoryField: b.regulatoryField,
      year: b.year,
    }));

    const aliases = new Set<string>();
    aliases.add(canonicalName);
    for (const a of abbrs) aliases.add(a);
    for (const b of bucket) aliases.add(b.name);

    substances.push({
      id: stableId(key),
      casNumber: bucket.find((b) => b.casNumber)?.casNumber ?? null,
      ecNumber: bucket.find((b) => b.ecNumber)?.ecNumber ?? null,
      canonicalName,
      evidenceTier,
      healthEffects,
      envEffects,
      assessments,
      aliases: [...aliases],
      inciName: null,
    });
  }

  substances.sort((a, b) =>
    a.evidenceTier - b.evidenceTier ||
    a.canonicalName.localeCompare(b.canonicalName),
  );
  return substances;
}
