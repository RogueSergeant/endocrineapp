import { describe, expect, it } from "vitest";
import {
  ABBREVIATION_RE,
  isBareAbbreviation,
  bracketedNames,
  dedupeAliases,
  expandName,
  isCompoundName,
  splitNames,
} from "./aliases.ts";

describe("splitNames", () => {
  it("splits on semicolons", () => {
    expect(splitNames("Butyl 4-hydroxybenzoate; Butylparaben")).toEqual([
      "Butyl 4-hydroxybenzoate",
      "Butylparaben",
    ]);
  });

  it("splits on ': ' and on ', <Capital>'", () => {
    expect(splitNames("Bisphenol S: 4,4'-sulphonyldiphenol")).toEqual([
      "Bisphenol S",
      "4,4'-sulphonyldiphenol",
    ]);
    expect(splitNames("4,4'-sulphonyldiphenol, Bisphenol S")).toEqual([
      "4,4'-sulphonyldiphenol",
      "Bisphenol S",
    ]);
  });

  it("keeps commas that are part of a systematic name", () => {
    expect(splitNames("Phenol, 4-nonyl-, branched")).toEqual(["Phenol, 4-nonyl-, branched"]);
  });

  it("drops fragments and 'and ...' tails", () => {
    expect(splitNames("Triclosan; X; and its salts")).toEqual(["Triclosan"]);
  });
});

describe("isCompoundName", () => {
  it.each([
    ["Butyl 4-hydroxybenzoate; Butylparaben", true],
    ["Bisphenol S: 4,4'-sulphonyldiphenol", true],
    ["4,4'-sulphonyldiphenol, Bisphenol S", true],
    ["Phenol, 4-nonyl-, branched", false],
    ["Butylparaben", false],
  ])("%s -> %s", (name, expected) => {
    expect(isCompoundName(name)).toBe(expected);
  });

  it("always agrees with splitNames", () => {
    for (const name of [
      "A; B",
      "Alpha, Beta",
      "alpha, beta",
      "Triclosan; and its salts",
      "Ratio (3:1) mixture",
    ]) {
      expect(isCompoundName(name)).toBe(splitNames(name).length > 1);
    }
  });
});

describe("bracketedNames", () => {
  it("keeps abbreviations and common names", () => {
    expect(bracketedNames("Butylated hydroxytoluene (BHT)")).toEqual(["BHT"]);
    expect(bracketedNames("Decamethylcyclopentasiloxane (D5)")).toEqual(["D5"]);
    expect(bracketedNames("Methyl 4-hydroxybenzoate (Methylparaben)")).toEqual(["Methylparaben"]);
  });

  it("skips descriptions and brackets inside systematic names", () => {
    expect(bracketedNames("Nonylphenol ethoxylate (8-EO)")).toEqual([]);
    expect(bracketedNames("Some resin (polymer)")).toEqual([]);
    expect(bracketedNames("4-(heptan-2-yl)phenol")).toEqual([]);
  });
});

describe("expandName", () => {
  it("replaces a compound cell with its parts", () => {
    expect(expandName("Butyl 4-hydroxybenzoate; Butylparaben")).toEqual([
      "Butyl 4-hydroxybenzoate",
      "Butylparaben",
    ]);
  });

  it("drops the comma-joined original, which no label can contain", () => {
    const out = expandName("4,4'-sulphonyldiphenol, Bisphenol S (BPS)");
    expect(out).not.toContain("4,4'-sulphonyldiphenol, Bisphenol S (BPS)");
    expect(out).toEqual(["4,4'-sulphonyldiphenol", "Bisphenol S (BPS)", "BPS"]);
  });

  it("keeps a single name and adds its bracketed abbreviation", () => {
    // The name also comes back as its own only part; dedupeAliases removes repeats.
    expect(dedupeAliases(expandName("Butylated hydroxytoluene (BHT)"))).toEqual([
      "Butylated hydroxytoluene (BHT)",
      "BHT",
    ]);
  });
});

describe("ABBREVIATION_RE", () => {
  it.each(["BHT", "BP-3", "D5", "4-MBC", "3-BC"])("matches %s", (s) => {
    expect(ABBREVIATION_RE.test(s)).toBe(true);
  });

  it.each(["Butylparaben", "Bisphenol A", "3-Benzylidene Camphor", "B"])("rejects %s", (s) => {
    expect(ABBREVIATION_RE.test(s)).toBe(false);
  });
});

describe("dedupeAliases", () => {
  it("removes case-insensitive duplicates, keeping the first spelling", () => {
    expect(dedupeAliases(["BHT", "bht", " Butylparaben ", "", "butylparaben"])).toEqual([
      "BHT",
      "Butylparaben",
    ]);
  });
});

describe("isBareAbbreviation", () => {
  it.each(["BHT", "DEHP", "PFOA", "TDCIPP", "TBBPAE", "3-BC", "BP-3", "4-MBC", "D5"])(
    "%s is bare",
    (s) => {
      expect(isBareAbbreviation(s)).toBe(true);
    },
  );

  it.each(["TRICLOSAN", "Butylparaben", "Bisphenol A"])("%s is readable", (s) => {
    expect(isBareAbbreviation(s)).toBe(false);
  });
});
