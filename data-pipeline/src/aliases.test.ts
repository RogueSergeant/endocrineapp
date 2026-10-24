import { describe, expect, it } from "vitest";
import {
  ABBREVIATION_RE,
  preferCommonName,
  readabilityRank,
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

describe("readabilityRank", () => {
  it.each(["Butylparaben", "3-Benzylidene Camphor", "alkyl 4-hydroxybenzoates"])(
    "%s is mixed case (0)",
    (s) => expect(readabilityRank(s)).toBe(0),
  );

  it.each(["TRICLOSAN", "PHENOL, 4-NONYL-"])("%s is long all caps (1)", (s) =>
    expect(readabilityRank(s)).toBe(1),
  );

  it.each(["BHT", "TDCIPP", "TBBPAE", "PFOSA", "BADGE", "ATRAZINE", "3-BC", "BP-3", "D5"])(
    "%s is a short all-caps token (2)",
    (s) => expect(readabilityRank(s)).toBe(2),
  );
});

describe("preferCommonName", () => {
  const hhcb = "1,3,4,6,7,8-hexahydro-4,6,6,7,8,8-hexamethylindeno[5,6-c]pyran (HHCB)";

  it("uses a source or curated plain name, keeping the abbreviation", () => {
    expect(
      preferCommonName("2-tert-butyl-4-methoxyphenol (BHA)", ["BHA", "Butylated Hydroxyanisole"]),
    ).toBe("Butylated Hydroxyanisole (BHA)");
  });

  it("falls back to the first PubChem name made of the same chemistry, not a trade name", () => {
    expect(preferCommonName(hhcb, ["HHCB"], ["Galaxolide", "Abbalide", "hexamethylindanopyran"])).toBe(
      "Hexamethylindanopyran (HHCB)",
    );
    expect(
      preferCommonName("2,2,6,6-tetrabromo-4,4-isopropylidenediphenol", [], [
        "Tetrabromobisphenol A",
        "Bromdian",
      ]),
    ).toBe("Tetrabromobisphenol A");
  });

  it("keeps the systematic name when no plain name shares its chemistry", () => {
    expect(preferCommonName(hhcb, ["HHCB"], ["Galaxolide", "Abbalide"])).toBe(hhcb);
  });

  it("leaves readable names alone", () => {
    expect(preferCommonName("Triclosan", [], ["Irgasan"])).toBe("Triclosan");
    expect(preferCommonName("butylated hydroxytoluene (BHT)", [], ["Ionol"])).toBe(
      "butylated hydroxytoluene (BHT)",
    );
  });

  it("only takes a PubChem name for a complex systematic name", () => {
    expect(preferCommonName("4-tert-butylphenol", [], ["Butylphen"])).toBe("4-tert-butylphenol");
  });
});
