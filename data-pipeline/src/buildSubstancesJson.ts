import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Substance, SubstancesFile, SubstancesIndex } from "./types.ts";
import { normalise } from "./normaliser.ts";

const APP_DATA_DIR = join(process.cwd(), "..", "app", "src", "data");

function buildIndex(substances: Substance[]): SubstancesIndex {
  const entries: Record<string, string> = {};
  for (const sub of substances) {
    for (const alias of sub.aliases) {
      const n = normalise(alias);
      if (!n) continue;
      if (!(n in entries)) entries[n] = sub.id;
    }
    if (sub.casNumber) entries[sub.casNumber] = sub.id;
  }
  return { version: new Date().toISOString().slice(0, 10), entries };
}

export async function writeSubstancesJson(
  substances: Substance[],
  sourceLastUpdated: string,
): Promise<void> {
  await mkdir(APP_DATA_DIR, { recursive: true });

  const file: SubstancesFile = {
    version: new Date().toISOString().slice(0, 10),
    source: "edlists.org",
    sourceLastUpdated,
    substanceCount: substances.length,
    substances,
  };
  await writeFile(
    join(APP_DATA_DIR, "substances.json"),
    JSON.stringify(file, null, 2),
  );

  const index = buildIndex(substances);
  await writeFile(
    join(APP_DATA_DIR, "substances-index.json"),
    JSON.stringify(index, null, 2),
  );

  console.log(
    `[build] wrote ${substances.length} substances, ${Object.keys(index.entries).length} alias entries`,
  );
}
