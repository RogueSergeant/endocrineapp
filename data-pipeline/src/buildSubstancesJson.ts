import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalise } from "./normalise.ts";
import type {
  Substance,
  SubstancesFile,
  SubstancesIndex,
} from "./types.ts";

export interface BuildOptions {
  outDir: string;
  sourceLastUpdated: string;
}

export async function writeSubstancesJson(
  substances: Substance[],
  opts: BuildOptions,
): Promise<{ jsonPath: string; indexPath: string }> {
  await mkdir(opts.outDir, { recursive: true });
  const file: SubstancesFile = {
    version: new Date().toISOString().slice(0, 10),
    source: "edlists.org",
    sourceLastUpdated: opts.sourceLastUpdated,
    substanceCount: substances.length,
    substances: substances
      .slice()
      .sort((a, b) =>
        a.evidenceTier - b.evidenceTier ||
        a.canonicalName.localeCompare(b.canonicalName),
      ),
  };
  const jsonPath = join(opts.outDir, "substances.json");
  await writeFile(jsonPath, JSON.stringify(file, null, 2));

  const index: SubstancesIndex = {};
  for (const s of substances) {
    const candidates = new Set<string>();
    candidates.add(s.canonicalName);
    if (s.inciName) candidates.add(s.inciName);
    for (const a of s.aliases) candidates.add(a);
    if (s.casNumber) candidates.add(s.casNumber);
    if (s.ecNumber) candidates.add(s.ecNumber);
    for (const c of candidates) {
      const k = normalise(c);
      if (!k) continue;
      // First-write-wins preserves the lowest-tier substance for an alias clash.
      if (!(k in index)) index[k] = s.id;
    }
    if (s.casNumber) {
      // Also store the raw CAS so the runtime CAS branch can hit it directly.
      const casKey = `cas:${s.casNumber}`;
      index[casKey] = s.id;
    }
  }
  const indexPath = join(opts.outDir, "substances-index.json");
  await writeFile(indexPath, JSON.stringify(index, null, 2));
  return { jsonPath, indexPath };
}
