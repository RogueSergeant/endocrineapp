import type { Substance, SubstancesIndex } from "@/types";
import { parseIngredients } from "./ingredientParser";
import { normalise } from "./normaliser";
import { buildLookup, matchIngredients, boundedDistance } from "./matcher";

const SUBSTANCES: Substance[] = [
  {
    id: "s-bbp",
    casNumber: "85-68-7",
    ecNumber: "201-622-7",
    canonicalName: "Benzyl butyl phthalate (BBP)",
    evidenceTier: 1,
    healthEffects: true,
    envEffects: true,
    assessments: [],
    aliases: ["BBP", "Benzyl butyl phthalate"],
    inciName: null,
  },
  {
    id: "s-dehp",
    casNumber: "117-81-7",
    ecNumber: "204-211-0",
    canonicalName: "Bis(2-ethylhexyl) phthalate (DEHP)",
    evidenceTier: 1,
    healthEffects: true,
    envEffects: true,
    assessments: [],
    aliases: ["DEHP", "Bis(2-ethylhexyl) phthalate"],
    inciName: null,
  },
  {
    id: "s-butylparaben",
    casNumber: "94-26-8",
    ecNumber: "202-318-7",
    canonicalName: "Butylparaben",
    evidenceTier: 1,
    healthEffects: true,
    envEffects: false,
    assessments: [],
    aliases: ["Butylparaben", "Butyl paraben"],
    inciName: "Butylparaben",
  },
  {
    id: "s-bpa",
    casNumber: "80-05-7",
    ecNumber: "201-245-8",
    canonicalName: "Bisphenol A (BPA)",
    evidenceTier: 1,
    healthEffects: true,
    envEffects: true,
    assessments: [],
    aliases: ["BPA", "Bisphenol A"],
    inciName: null,
  },
];

function buildIndex(substances: Substance[]): SubstancesIndex {
  const idx: SubstancesIndex = {};
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
      if (!(k in idx)) idx[k] = s.id;
    }
    if (s.casNumber) idx[`cas:${s.casNumber}`] = s.id;
  }
  return idx;
}

const INDEX = buildIndex(SUBSTANCES);
const LOOKUP = buildLookup(SUBSTANCES);

describe("normaliser", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalise("Éthylhéxyl")).toBe("ethylhexyl");
  });

  it("removes parenthesised content", () => {
    expect(normalise("Bis(2-ethylhexyl) phthalate")).toBe("bis phthalate");
  });

  it("collapses hyphens, underscores, and whitespace", () => {
    expect(normalise("Butyl-Paraben_Test")).toBe("butyl paraben test");
  });

  it("returns empty for empty input", () => {
    expect(normalise("")).toBe("");
    expect(normalise("   ")).toBe("");
  });
});

describe("parseIngredients", () => {
  it("splits a comma-separated INCI list", () => {
    const out = parseIngredients(
      "Ingredients: Aqua, Glycerin, Butylparaben, Phenoxyethanol.",
    );
    expect(out).toEqual(["Aqua", "Glycerin", "Butylparaben", "Phenoxyethanol"]);
  });

  it("works without an explicit header", () => {
    const out = parseIngredients("Aqua, Glycerin, Butylparaben");
    expect(out).toEqual(["Aqua", "Glycerin", "Butylparaben"]);
  });

  it("preserves commas inside numeric INCI names", () => {
    const out = parseIngredients("Ingredients: Aqua, 1,3-Butanediol, Glycerin");
    expect(out).toEqual(["Aqua", "1,3-Butanediol", "Glycerin"]);
  });

  it("handles multilingual headers", () => {
    expect(parseIngredients("Ingrédients: Eau, Glycérine, Butylparabène")).toEqual([
      "Eau",
      "Glycérine",
      "Butylparabène",
    ]);
    expect(parseIngredients("Ingredientes: Agua, Glicerina, Butilparabeno")).toEqual([
      "Agua",
      "Glicerina",
      "Butilparabeno",
    ]);
  });

  it("returns empty for empty input", () => {
    expect(parseIngredients("")).toEqual([]);
    expect(parseIngredients("    ")).toEqual([]);
  });
});

describe("boundedDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(boundedDistance("butylparaben", "butylparaben", 2)).toBe(0);
  });

  it("counts a substitution as 1", () => {
    expect(boundedDistance("butylparaben", "butylparahen", 2)).toBe(1);
  });

  it("counts an insertion as 1", () => {
    expect(boundedDistance("butylparaben", "butylparabens", 2)).toBe(1);
  });

  it("returns cap+1 when over the cap (early exit)", () => {
    expect(boundedDistance("abcde", "uvwxyz", 2)).toBe(3);
  });
});

describe("matchIngredients", () => {
  it("matches an exact INCI name", () => {
    const matches = matchIngredients(["Butylparaben"], INDEX, LOOKUP);
    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    expect(m.substance.id).toBe("s-butylparaben");
    expect(m.matchType).toBe("exact");
    expect(m.confidence).toBe(1);
  });

  it("matches by CAS number", () => {
    const matches = matchIngredients(["117-81-7"], INDEX, LOOKUP);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.substance.id).toBe("s-dehp");
    expect(matches[0]!.matchType).toBe("cas");
  });

  it("does fuzzy matching with a one-char OCR error", () => {
    const matches = matchIngredients(["butylparahen"], INDEX, LOOKUP);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.substance.id).toBe("s-butylparaben");
    expect(matches[0]!.matchType).toBe("fuzzy");
    expect(matches[0]!.confidence).toBeCloseTo(0.9);
  });

  it("strips parentheticals from input ingredients", () => {
    const matches = matchIngredients(["Butylparaben (preservative)"], INDEX, LOOKUP);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.substance.id).toBe("s-butylparaben");
    expect(matches[0]!.matchType).toBe("exact");
  });

  it("does NOT fuzzy match short tokens (no false positives on BHA)", () => {
    const matches = matchIngredients(["BHA"], INDEX, LOOKUP);
    expect(matches).toHaveLength(0);
  });

  it("returns no matches on common safe ingredients", () => {
    const matches = matchIngredients(
      ["Aqua", "Water", "Glycerin", "Sodium Chloride", "Tocopherol"],
      INDEX,
      LOOKUP,
    );
    expect(matches).toEqual([]);
  });

  it("handles empty and malformed input", () => {
    expect(matchIngredients([], INDEX, LOOKUP)).toEqual([]);
    expect(matchIngredients([""], INDEX, LOOKUP)).toEqual([]);
    expect(matchIngredients(["   ", "..."], INDEX, LOOKUP)).toEqual([]);
  });

  it("dedupes when the same substance is matched twice, keeping the best", () => {
    const matches = matchIngredients(
      ["butylparahen", "Butylparaben"],
      INDEX,
      LOOKUP,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchType).toBe("exact");
    expect(matches[0]!.confidence).toBe(1);
  });

  it("orders matches by evidence tier, then position", () => {
    const matches = matchIngredients(
      ["Aqua", "Butylparaben", "117-81-7"],
      INDEX,
      LOOKUP,
    );
    expect(matches.map((m) => m.substance.id)).toEqual(["s-butylparaben", "s-dehp"]);
  });

  it("end-to-end: parse → match against a realistic OCR string", () => {
    const ocr = "INGREDIENTS: Aqua, Glycerin, Butylparaben, 1,3-Butanediol, Phenoxyethanol.";
    const matches = matchIngredients(parseIngredients(ocr), INDEX, LOOKUP);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.substance.id).toBe("s-butylparaben");
    expect(matches[0]!.ingredientPosition).toBe(2);
  });
});
