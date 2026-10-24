/**
 * Committed record of the enrichment that needs the network or files that
 * aren't committed: PubChem synonyms and CosIng INCI names, keyed by CAS.
 *
 * When a PubChem lookup fails, or the whole run is offline, the substance
 * gets its synonyms from here instead of losing them. The pipeline never
 * reads its own previous output back, so an alias removed from the curated
 * list or the source data really disappears, and synonyms taken from here
 * are cleaned again so filter changes apply to them too.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dedupeAliases } from "./aliases.ts";
import { cleanSynonyms } from "./enrichPubchem.ts";
import type { Substance } from "./types.ts";

export interface SnapshotEntry {
  synonyms: string[];
  inciName: string | null;
}

export type Snapshot = Record<string, SnapshotEntry>;

export async function readSnapshot(path: string): Promise<Snapshot> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Snapshot;
  } catch {
    return {};
  }
}

/** Sorted by CAS, so re-running without changes rewrites identical bytes. */
export async function writeSnapshot(path: string, snapshot: Snapshot): Promise<void> {
  const sorted: Snapshot = {};
  for (const cas of Object.keys(snapshot).sort()) sorted[cas] = snapshot[cas]!;
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

export interface EnrichmentResult {
  snapshot: Snapshot;
  /** Substances whose synonyms came from the snapshot rather than a live lookup. */
  fromSnapshot: number;
  synonymsAdded: number;
}

/**
 * Add synonyms to each substance with a CAS: the live PubChem result when
 * there is one (`live`, null when PubChem wasn't reachable at all),
 * otherwise the snapshot's. Fills a missing INCI name from the snapshot.
 * Returns the snapshot to commit: live results replace old entries, and
 * failed lookups keep theirs.
 */
export function applyEnrichment(
  substances: Substance[],
  snapshot: Snapshot,
  live: ReadonlyMap<string, string[]> | null,
): EnrichmentResult {
  const next: Snapshot = {};
  let fromSnapshot = 0;
  let synonymsAdded = 0;
  for (const s of substances) {
    if (!s.casNumber) continue;
    const saved = snapshot[s.casNumber];
    const fetched = live?.get(s.casNumber);
    let synonyms: string[];
    if (fetched) {
      synonyms = fetched;
    } else {
      synonyms = cleanSynonyms(saved?.synonyms ?? []);
      if (saved) fromSnapshot++;
    }
    const before = s.aliases.length;
    s.aliases = dedupeAliases([...s.aliases, ...synonyms]);
    synonymsAdded += s.aliases.length - before;
    s.inciName ??= saved?.inciName ?? null;
    if (synonyms.length > 0 || s.inciName) {
      next[s.casNumber] = { synonyms, inciName: s.inciName };
    }
  }
  return { snapshot: next, fromSnapshot, synonymsAdded };
}
