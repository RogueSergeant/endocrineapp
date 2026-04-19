#!/usr/bin/env node
// Standalone generator — no tsx/deps needed. Reads the seed list by re-exporting
// its JSON form (kept in sync with src/seed/seedSubstances.ts) and writes
// app/src/data/substances{,-index}.json using the same normaliser as runtime.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

function normalise(s) {
  if (!s) return "";
  let out = s.toLowerCase();
  out = out.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  out = out.replace(/\([^)]*\)/g, " ");
  out = out.replace(/[-_]/g, " ");
  out = out.replace(/[^a-z0-9 ]+/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

async function loadSeed() {
  // Mirror of src/seed/seedSubstances.ts — keep the two in sync when editing the
  // hand-curated seed. The TypeScript one is authoritative; this is a boot-strap.
  const path = join(__dirname, "seedSubstances.json");
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

async function main() {
  const substances = await loadSeed();
  const outDir = join(ROOT, "app", "src", "data");
  await mkdir(outDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const file = {
    version: today,
    source: "edlists.org",
    sourceLastUpdated: "2025-12",
    substanceCount: substances.length,
    substances,
  };
  await writeFile(join(outDir, "substances.json"), JSON.stringify(file, null, 2));

  const entries = {};
  for (const sub of substances) {
    for (const alias of sub.aliases) {
      const n = normalise(alias);
      if (!n) continue;
      if (!(n in entries)) entries[n] = sub.id;
    }
    if (sub.casNumber) entries[sub.casNumber] = sub.id;
  }
  const index = { version: today, entries };
  await writeFile(join(outDir, "substances-index.json"), JSON.stringify(index, null, 2));

  console.log(
    `[seed] wrote ${substances.length} substances, ${Object.keys(entries).length} alias entries`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
