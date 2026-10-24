// End-to-end: source rows -> dedupe -> snapshot enrichment (offline) ->
// written JSON + index. The second test runs the committed spreadsheets
// and snapshot and checks they reproduce the data bundled with the website.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeSubstancesJson } from "./buildSubstancesJson.ts";
import { dedupe } from "./dedupe.ts";
import { normalise } from "./normalise.ts";
import { parseListFile } from "./parseLists.ts";
import { applyEnrichment, readSnapshot, type Snapshot } from "./snapshot.ts";
import type { RawAssessmentRow, SubstancesFile, SubstancesIndex } from "./types.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function row(name: string, casNumber: string | null, listId: 1 | 2 | 3 = 1): RawAssessmentRow {
  return {
    name,
    casNumber,
    ecNumber: null,
    healthEffects: true,
    envEffects: null,
    status: "Identified",
    year: 2020,
    regulatoryField: null,
    listId,
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pipeline-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function build(rows: RawAssessmentRow[], snapshot: Snapshot) {
  const substances = dedupe(rows);
  applyEnrichment(substances, snapshot, null);
  await writeSubstancesJson(substances, { outDir: dir, sourceLastUpdated: "test" });
  const file = JSON.parse(await readFile(join(dir, "substances.json"), "utf8")) as SubstancesFile;
  const index = JSON.parse(
    await readFile(join(dir, "substances-index.json"), "utf8"),
  ) as SubstancesIndex;
  return { file, index };
}

describe("pipeline", () => {
  it("turns packed source cells into index keys a label can hit", async () => {
    const { file, index } = await build(
      [
        row("Butyl 4-hydroxybenzoate; Butylparaben", "94-26-8"),
        row("4,4'-sulphonyldiphenol, Bisphenol S (BPS)", "80-09-1", 2),
        row("1,7,7-trimethyl-3-(phenylmethylene)bicyclo[2.2.1]heptan-2-one; 3-BC", "15087-24-8"),
        row("Oxybenzone", "131-57-7"),
      ],
      { "94-26-8": { synonyms: ["Butyl paraben"], inciName: null } },
    );
    const keys = Object.keys(index);
    expect(keys.filter((k) => k.includes(";"))).toEqual([]);
    expect(keys.filter((k) => /, [a-z]/.test(k) && !k.startsWith("cas:"))).toEqual([]);
    const idOf = (name: string) => index[normalise(name)];
    const byCas = new Map(file.substances.map((s) => [s.casNumber, s.id]));
    expect(idOf("Butylparaben")).toBe(byCas.get("94-26-8"));
    expect(idOf("Butyl paraben")).toBe(byCas.get("94-26-8"));
    expect(idOf("Bisphenol S")).toBe(byCas.get("80-09-1"));
    expect(idOf("BPS")).toBe(byCas.get("80-09-1"));
    expect(idOf("3-Benzylidene Camphor")).toBe(byCas.get("15087-24-8"));
    expect(idOf("Benzophenone-3")).toBe(byCas.get("131-57-7"));
    expect(index["cas:94-26-8"]).toBe(byCas.get("94-26-8"));
    expect(file.substances.find((s) => s.casNumber === "15087-24-8")?.canonicalName).toBe(
      "3-Benzylidene Camphor",
    );
  });

  it(
    "reproduces the bundled website data from the committed spreadsheets and snapshot",
    async () => {
      const rows: RawAssessmentRow[] = [];
      for (const listId of [1, 2, 3] as const) {
        rows.push(
          ...(await parseListFile(
            join(repoRoot, "data-pipeline", "data", "raw", `list${listId}.xlsx`),
            listId,
          )),
        );
      }
      const snapshot = await readSnapshot(
        join(repoRoot, "data-pipeline", "data", "pubchem-snapshot.json"),
      );
      const { file, index } = await build(rows, snapshot);
      const bundled = JSON.parse(
        await readFile(join(repoRoot, "web", "src", "data", "substances.json"), "utf8"),
      ) as SubstancesFile;
      const bundledIndex = JSON.parse(
        await readFile(join(repoRoot, "web", "src", "data", "substances-index.json"), "utf8"),
      ) as SubstancesIndex;
      expect(file.substances).toEqual(bundled.substances);
      expect(index).toEqual(bundledIndex);
    },
    60_000,
  );
});
