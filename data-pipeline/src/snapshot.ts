/**
 * Committed record of the enrichment that needs the network or files that
 * aren't committed: PubChem synonyms, and CosIng INCI names and synonyms,
 * keyed by CAS.
 *
 * Each source's latest answer wins. When a PubChem lookup fails, or the run
 * is offline, the substance gets its PubChem synonyms from here; when there
 * is no CosIng dump (always, on CI), its CosIng data comes from here. When a
 * source does answer, its answer replaces the snapshot's, so an INCI name or
 * synonym the source dropped disappears. The pipeline never reads its own
 * previous output back, so an alias removed from the curated list or the
 * source data really disappears, and PubChem synonyms taken from here are
 * cleaned again so filter changes apply to them too.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dedupeAliases } from "./aliases.ts";
import type { CosingHit } from "./enrichCosing.ts";
import { cleanSynonyms } from "./enrichPubchem.ts";
import type { Substance } from "./types.ts";

export interface SnapshotEntry {
  /** PubChem synonyms. */
  synonyms: string[];
  /** CosIng INCI name. */
  inciName: string | null;
  /** CosIng synonyms. */
  cosingSynonyms: string[];
}

export type Snapshot = Record<string, SnapshotEntry>;

/**
 * A missing file is an empty snapshot (first run). Anything else, such as a
 * merge-conflicted or truncated file, fails the run: carrying on would
 * strip every substance's synonyms and then overwrite the snapshot.
 */
export async function readSnapshot(path: string): Promise<Snapshot> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not valid JSON (${(err as Error).message}); fix or restore it`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must be an object keyed by CAS number`);
  }
  for (const [cas, entry] of Object.entries(parsed)) {
    const problem = entryProblem(entry);
    if (problem) throw new Error(`${path}: entry ${cas} ${problem}; fix or restore it`);
  }
  return parsed as Snapshot;
}

const isStringArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

function entryProblem(entry: unknown): string | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "is not an object";
  const e = entry as Record<string, unknown>;
  if (!isStringArray(e.synonyms)) return "has synonyms that aren't a list of strings";
  if (e.inciName !== null && typeof e.inciName !== "string") return "has an inciName that isn't a string or null";
  // Optional: entries written before CosIng synonyms were recorded lack it.
  if (e.cosingSynonyms !== undefined && !isStringArray(e.cosingSynonyms)) {
    return "has cosingSynonyms that aren't a list of strings";
  }
  return null;
}

/** Sorted by CAS, so re-running without changes rewrites identical bytes. */
export async function writeSnapshot(path: string, snapshot: Snapshot): Promise<void> {
  const sorted: Snapshot = {};
  for (const cas of Object.keys(snapshot).sort()) sorted[cas] = snapshot[cas]!;
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

export interface EnrichmentResult {
  snapshot: Snapshot;
  /** Substances whose PubChem synonyms came from the snapshot rather than a live lookup. */
  fromSnapshot: number;
  synonymsAdded: number;
}

/**
 * Enrich each substance with a CAS from CosIng then PubChem, using each
 * source's live answer when there is one and the snapshot's otherwise.
 * `pubchem` is null when PubChem wasn't reachable at all (a CAS missing
 * from it means that lookup failed); `cosing` is null when there is no
 * CosIng dump (a CAS missing from it means CosIng has no entry).
 * Returns the snapshot to commit: entries for this run's substances are
 * replaced, and entries for any other CAS are kept. A run can see fewer
 * substances than it should without failing (the seed fallback, a renamed
 * spreadsheet column, a list that parsed empty), and must not erase the
 * rest. Entries only ever apply to a CAS that is listed, so one left over
 * from a substance that has left the lists is harmless; delete it by hand.
 */
export function applyEnrichment(
  substances: Substance[],
  snapshot: Snapshot,
  pubchem: ReadonlyMap<string, string[]> | null,
  cosing: ReadonlyMap<string, CosingHit> | null = null,
): EnrichmentResult {
  const next: Snapshot = { ...snapshot };
  let fromSnapshot = 0;
  let synonymsAdded = 0;
  for (const s of substances) {
    if (!s.casNumber) continue;
    const saved = snapshot[s.casNumber];

    const cos = cosing
      ? (cosing.get(s.casNumber) ?? { inciName: null, synonyms: [] })
      : { inciName: saved?.inciName ?? null, synonyms: saved?.cosingSynonyms ?? [] };

    let synonyms = pubchem?.get(s.casNumber);
    if (!synonyms) {
      synonyms = cleanSynonyms(saved?.synonyms ?? []);
      if (saved) fromSnapshot++;
    }

    const before = s.aliases.length;
    const extra = [...(cos.inciName ? [cos.inciName] : []), ...cos.synonyms, ...synonyms];
    s.aliases = dedupeAliases([...s.aliases, ...extra]);
    synonymsAdded += s.aliases.length - before;
    s.inciName = cos.inciName;

    if (synonyms.length > 0 || cos.inciName || cos.synonyms.length > 0) {
      next[s.casNumber] = {
        synonyms,
        inciName: cos.inciName,
        cosingSynonyms: cos.synonyms,
      };
    } else {
      delete next[s.casNumber];
    }
  }
  return { snapshot: next, fromSnapshot, synonymsAdded };
}
