import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  "94-26-8": { synonyms: ["Butyl paraben", "n-Butyl 4-hydroxybenzoate"], inciName: "Butylparaben", cosingSynonyms: [] },
  "80-05-7": { synonyms: ["BPA", "Bisphenol A"], inciName: null, cosingSynonyms: [] },
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
      cosingSynonyms: [],
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
        cosingSynonyms: [],
      },
    };
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const r = applyEnrichment(subs, dirty, null);
    expect(subs[0]!.aliases).toEqual(["Butylparaben", "Butyl paraben"]);
    expect(r.snapshot["94-26-8"]!.synonyms).toEqual(["Butyl paraben"]);
  });

  it("caps snapshot synonyms at 20", () => {
    const many: Snapshot = {
      "94-26-8": { synonyms: Array.from({ length: 30 }, (_, i) => `Synonym ${i}`), inciName: null, cosingSynonyms: [] },
    };
    const subs = [substance("94-26-8", ["Butylparaben"])];
    applyEnrichment(subs, many, null);
    expect(subs[0]!.aliases).toHaveLength(21);
  });

  it("takes INCI data from the snapshot when there is no CosIng dump", () => {
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const snap: Snapshot = {
      "94-26-8": { synonyms: [], inciName: "BUTYLPARABEN", cosingSynonyms: ["Butyl parahydroxybenzoate"] },
    };
    const r = applyEnrichment(subs, snap, new Map([["94-26-8", []]]), null);
    expect(subs[0]!.inciName).toBe("BUTYLPARABEN");
    expect(subs[0]!.aliases).toEqual(["Butylparaben", "Butyl parahydroxybenzoate"]);
    expect(r.snapshot["94-26-8"]).toEqual(snap["94-26-8"]);
  });

  it("records CosIng synonyms, so a later run without the dump keeps them", () => {
    const withDump = [substance("94-26-8", ["Butylparaben"])];
    const cosing = new Map([
      ["94-26-8", { inciName: "BUTYLPARABEN", synonyms: ["Butyl parahydroxybenzoate"] }],
    ]);
    const first = applyEnrichment(withDump, {}, new Map(), cosing);

    const withoutDump = [substance("94-26-8", ["Butylparaben"])];
    applyEnrichment(withoutDump, first.snapshot, new Map(), null);
    expect(withoutDump[0]!.aliases).toEqual(withDump[0]!.aliases);
    expect(withoutDump[0]!.inciName).toBe("BUTYLPARABEN");
  });

  it("lets a CosIng dump remove an INCI name the snapshot still has", () => {
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const snap: Snapshot = {
      "94-26-8": { synonyms: [], inciName: "OLD NAME", cosingSynonyms: ["Old synonym"] },
    };
    const r = applyEnrichment(subs, snap, new Map([["94-26-8", []]]), new Map());
    expect(subs[0]!.inciName).toBeNull();
    expect(subs[0]!.aliases).toEqual(["Butylparaben"]);
    expect(r.snapshot).toEqual({});
  });

  it("keeps entries for substances a seed-fallback run didn't see", () => {
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const live = new Map([["94-26-8", ["Butyl paraben"]]]);
    const r = applyEnrichment(subs, SNAPSHOT, live, null, { partial: true });
    expect(r.snapshot["80-05-7"]).toEqual(SNAPSHOT["80-05-7"]);
    expect(r.snapshot["94-26-8"]!.synonyms).toEqual(["Butyl paraben"]);
  });

  it("drops entries for CAS numbers that have left the full lists", () => {
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const r = applyEnrichment(subs, SNAPSHOT, new Map([["94-26-8", ["Butyl paraben"]]]));
    expect(Object.keys(r.snapshot)).toEqual(["94-26-8"]);
  });

  it("reads older snapshot entries that have no cosingSynonyms", () => {
    const subs = [substance("94-26-8", ["Butylparaben"])];
    const legacy = { "94-26-8": { synonyms: ["Butyl paraben"], inciName: null } } as unknown as Snapshot;
    const r = applyEnrichment(subs, legacy, null);
    expect(subs[0]!.aliases).toEqual(["Butylparaben", "Butyl paraben"]);
    expect(r.snapshot["94-26-8"]!.cosingSynonyms).toEqual([]);
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

  it("fails on a corrupt snapshot instead of treating it as empty", async () => {
    const path = join(dir, "bad.json");
    await writeFile(path, '{\n<<<<<<< HEAD\n  "94-26-8": {}\n');
    await expect(readSnapshot(path)).rejects.toThrow(/not valid JSON/);
    await writeFile(path, "[]");
    await expect(readSnapshot(path)).rejects.toThrow(/keyed by CAS/);
  });

  it.each([
    ['{"94-26-8": null}', /94-26-8 is not an object/],
    ['{"94-26-8": {"synonyms": "Butyl paraben", "inciName": null}}', /94-26-8 has synonyms/],
    ['{"94-26-8": {"synonyms": [], "inciName": 5}}', /94-26-8 has an inciName/],
    ['{"94-26-8": {"synonyms": [], "inciName": null, "cosingSynonyms": "x"}}', /cosingSynonyms/],
  ])("fails clearly on a malformed entry: %s", async (text, message) => {
    const path = join(dir, "entry.json");
    await writeFile(path, text);
    await expect(readSnapshot(path)).rejects.toThrow(message);
  });

  it("accepts an older entry without cosingSynonyms", async () => {
    const path = join(dir, "old.json");
    await writeFile(path, '{"94-26-8": {"synonyms": ["Butyl paraben"], "inciName": null}}');
    expect(await readSnapshot(path)).toEqual({
      "94-26-8": { synonyms: ["Butyl paraben"], inciName: null },
    });
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
