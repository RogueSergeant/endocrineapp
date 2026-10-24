import { describe, expect, it } from "vitest";
import { dedupe, pickCanonical } from "./dedupe.ts";
import type { RawAssessmentRow } from "./types.ts";

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

describe("pickCanonical", () => {
  it("prefers the shortest name ending in a bracketed abbreviation", () => {
    expect(
      pickCanonical(["Butylated hydroxytoluene (BHT)", "2,6-di-tert-butyl-p-cresol"]),
    ).toEqual({ canonical: "Butylated hydroxytoluene (BHT)", abbrev: "BHT" });
  });

  it("falls back to the shortest readable name, not a bare abbreviation", () => {
    const names = ["1,7,7-trimethyl-3-(phenylmethylene)bicyclo[2.2.1]heptan-2-one", "3-BC"];
    expect(pickCanonical(names).canonical).toBe(names[0]);
  });

  it("uses the curated label name when it is no longer than the source names", () => {
    const names = ["1,7,7-trimethyl-3-(phenylmethylene)bicyclo[2.2.1]heptan-2-one", "3-BC"];
    expect(pickCanonical(names, ["3-Benzylidene Camphor"]).canonical).toBe(
      "3-Benzylidene Camphor",
    );
    // Fixes the source's "propianol" typo at equal length.
    expect(
      pickCanonical(["Butylphenyl methylpropianol"], ["Butylphenyl Methylpropional", "Lilial"])
        .canonical,
    ).toBe("Butylphenyl Methylpropional");
  });

  it("uses the curated label name (listed first), not a shorter trade name", () => {
    expect(
      pickCanonical(["Isopentyl p-methoxycinnamate"], ["Isoamyl p-Methoxycinnamate", "Amiloxate"])
        .canonical,
    ).toBe("Isoamyl p-Methoxycinnamate");
  });

  it("keeps a shorter source name over a longer curated one", () => {
    expect(pickCanonical(["Oxybenzone"], ["Benzophenone-3"]).canonical).toBe("Oxybenzone");
  });

  it("ignores curated abbreviations", () => {
    expect(pickCanonical(["Bisphenol A"], ["BPA"]).canonical).toBe("Bisphenol A");
  });

  it("prefers a full name over a 6-8 letter all-caps abbreviation", () => {
    expect(
      pickCanonical(["TDCIPP", "Tris(1,3-dichloro-2-propyl) phosphate"]).canonical,
    ).toBe("Tris(1,3-dichloro-2-propyl) phosphate");
    // A short all-caps word can't be told apart from an abbreviation, so a
    // mixed-case name wins; it is still used when it is the only name.
    expect(pickCanonical(["PARABENS", "alkyl 4-hydroxybenzoates"]).canonical).toBe(
      "alkyl 4-hydroxybenzoates",
    );
    expect(pickCanonical(["PARABENS"]).canonical).toBe("PARABENS");
  });

  it("uses an abbreviation only when nothing else is left", () => {
    expect(pickCanonical(["BHT"]).canonical).toBe("BHT");
  });
});

describe("dedupe", () => {
  it("merges rows by CAS, keeps the strongest tier and derives label aliases", () => {
    const [s, ...rest] = dedupe([
      row("Butyl 4-hydroxybenzoate; Butylparaben", "94-26-8", 2),
      row("Butylparaben", "94-26-8", 1),
    ]);
    expect(rest).toEqual([]);
    expect(s).toMatchObject({ casNumber: "94-26-8", evidenceTier: 1, canonicalName: "Butylparaben" });
    expect(s!.aliases).toEqual(expect.arrayContaining(["Butylparaben", "Butyl 4-hydroxybenzoate"]));
    expect(s!.aliases.some((a) => a.includes(";"))).toBe(false);
  });

  it("drops comma-joined cells and adds curated label names by CAS", () => {
    const [s] = dedupe([row("4,4'-sulphonyldiphenol, Bisphenol S (BPS)", "80-09-1")]);
    expect(s!.aliases).toEqual(expect.arrayContaining(["4,4'-sulphonyldiphenol", "Bisphenol S", "BPS"]));
    expect(s!.aliases.some((a) => /, [A-Z]/.test(a))).toBe(false);

    const [bp3] = dedupe([row("Oxybenzone", "131-57-7")]);
    expect(bp3!.aliases).toContain("Benzophenone-3");
  });

  it("gives the 3-BC row a readable display name", () => {
    const [s] = dedupe([
      row("1,7,7-trimethyl-3-(phenylmethylene)bicyclo[2.2.1]heptan-2-one; 3-BC", "15087-24-8"),
    ]);
    expect(s!.canonicalName).toBe("3-Benzylidene Camphor");
    expect(s!.aliases).toContain("3-BC");
  });

  it("produces stable ids across runs", () => {
    const a = dedupe([row("Butylparaben", "94-26-8")]);
    const b = dedupe([row("Butylparaben", "94-26-8")]);
    expect(a[0]!.id).toBe(b[0]!.id);
  });
});
