import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEnrichment, readSnapshot, writeSnapshot, type Snapshot } from "./snapshot.ts";
import type { Substance } from "./types.ts";

function substance(cas: string | null, aliases: string[], inciName: string | null = null): Substance {
  return {
    id: `id-${cas}`,
    casNumber: cas,
    ecNumber: null,
    canonicalName: aliases[0] ?? "x",
    evidenceTier: 1,
    healthEffects: true,
    envEffects: false,
    assessments: [],
    aliases: [...aliases],
    inciName,
  };
}

const SNAPSHOT: Snapshot = {
  "94-26-8": { synonyms: ["Butyl paraben", "n-Butyl 4-hydroxybenzoate"], inciName: "Butylparaben" },
  "80-05-7": { synonyms: ["BPA", "Bisphenol A"], inciName: null },
};

describe("applyEnrichment", () => {
  it("uses live synonyms and records them in the new snapshot", () => {
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const live = new Map([["94-26-8", ["Butyl p-hydroxybenzoate"]]]);
    const r = applyEnrichment(subs, SNAPSHOT, live);
    expect(subs[0]!.aliases).toEqual(["Butylparaben", "Butyl p-hydroxybenzoate"]);
    expect(r.snapshot["94-26-8"]).toEqual({
      synonyms: ["Butyl p-hydroxybenzoate"],
      inciName: "Butylparaben",
    });
    expect(r.fromSnapshot).toBe(0);
  });

  it("falls back to the snapshot only for a lookup that failed", () => {
    const subs = [substance("94-26-8", ["Butylparaben"]), substance("80-05-7", ["Bisphenol A"])];
    // 80-05-7 is missing from the live result: its lookup errored.
    const live = new Map([["94-26-8", []]]);
    const r = applyEnrichment(subs, SNAPSHOT, live);
    expect(subs[0]!.aliases).toEqual(["Butylparaben"]);
    expect(subs[1]!.aliases).toEqual(["Bisphenol A", "BPA"]);
    expect(r.fromSnapshot).toBe(1);
    expect(r.snapshot["80-05-7"]!.synonyms).toEqual(["BPA", "Bisphenol A"]);
  });

  it("uses the snapshot for every substance when PubChem was unreachable", () => {
    const subs = [substance("94-26-8", ["Butylparaben"]), substance("80-05-7", ["Bisphenol A"])];
    const r = applyEnrichment(subs, SNAPSHOT, null);
    expect(r.fromSnapshot).toBe(2);
    expect(subs[0]!.aliases).toContain("n-Butyl 4-hydroxybenzoate");
  });

  it("never brings back an alias that is no longer derived (removed curated name)", () => {
    // Previously published aliases are not an input at all: only the
    // derived aliases plus PubChem synonyms make it through.
    const subs = [substance("131-57-7", ["Oxybenzone"])];
    applyEnrichment(subs, {}, null);
    expect(subs[0]!.aliases).toEqual(["Oxybenzone"]);
  });

  it("re-cleans snapshot synonyms, so filter changes apply to them", () => {
    const dirty: Snapshot = {
      "94-26-8": {
        synonyms: ["94-26-8", "12345", "Butyl paraben", "x".repeat(200), "butyl PARABEN"],
        inciName: null,
      },
    };
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const r = applyEnrichment(subs, dirty, null);
    expect(subs[0]!.aliases).toEqual(["Butylparaben", "Butyl paraben"]);
    expect(r.snapshot["94-26-8"]!.synonyms).toEqual(["Butyl paraben"]);
  });

  it("caps snapshot synonyms at 20", () => {
    const many: Snapshot = {
      "94-26-8": { synonyms: Array.from({ length: 30 }, (_, i) => `Synonym ${i}`), inciName: null },
    };
    const subs = [substance("94-26-8", ["Butylparaben"])];
    applyEnrichment(subs, many, null);
    expect(subs[0]!.aliases).toHaveLength(21);
  });

  it("fills a missing INCI name from the snapshot but keeps a fresh CosIng one", () => {
    const missing = [substance("94-26-8", ["Butylparaben"])];
    applyEnrichment(missing, SNAPSHOT, null);
    expect(missing[0]!.inciName).toBe("Butylparaben");

    const fresh = [substance("94-26-8", ["Butylparaben"], "BUTYLPARABEN")];
    const r = applyEnrichment(fresh, SNAPSHOT, null);
    expect(fresh[0]!.inciName).toBe("BUTYLPARABEN");
    expect(r.snapshot["94-26-8"]!.inciName).toBe("BUTYLPARABEN");
  });

  it("skips substances without a CAS and omits empty entries", () => {
    const subs = [substance(null, ["Mystery"]), substance("1-11-1", ["Plain"])];
    const r = applyEnrichment(subs, {}, new Map([["1-11-1", []]]));
    expect(r.snapshot).toEqual({});
    expect(subs[0]!.aliases).toEqual(["Mystery"]);
  });

  it("counts only aliases that are actually new", () => {
    const subs = [substance("80-05-7", ["Bisphenol A", "BPA"])];
    expect(applyEnrichment(subs, SNAPSHOT, null).synonymsAdded).toBe(0);
  });
});

describe("readSnapshot / writeSnapshot", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "snapshot-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns an empty snapshot when the file is missing", async () => {
    expect(await readSnapshot(join(dir, "missing.json"))).toEqual({});
  });

  it("round-trips, sorted by CAS, with identical bytes on rewrite", async () => {
    const path = join(dir, "s.json");
    await writeSnapshot(path, { "94-26-8": SNAPSHOT["94-26-8"]!, "80-05-7": SNAPSHOT["80-05-7"]! });
    const first = await readFile(path, "utf8");
    expect(Object.keys(JSON.parse(first))).toEqual(["80-05-7", "94-26-8"]);
    await writeSnapshot(path, await readSnapshot(path));
    expect(await readFile(path, "utf8")).toBe(first);
  });
});
