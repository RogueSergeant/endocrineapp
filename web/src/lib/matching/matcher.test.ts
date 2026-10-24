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
    edlistsUrl: null,
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
    edlistsUrl: null,
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
    edlistsUrl: null,
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
    edlistsUrl: null,
  },
  {
    id: "s-bp1",
    casNumber: "131-56-6",
    ecNumber: null,
    canonicalName: "Benzophenone-1 (BP-1)",
    evidenceTier: 2,
    healthEffects: true,
    envEffects: false,
    assessments: [],
    aliases: ["BP-1", "Benzophenone-1"],
    inciName: null,
    edlistsUrl: null,
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

  it("drops a bracketed note after a space", () => {
    expect(normalise("WHOLEGRAIN OATS (10%)")).toBe("wholegrain oats");
    expect(normalise("Benzophenone-3 (BP-3)")).toBe("benzophenone 3");
  });

  it("keeps a bracket glued to a word as part of the chemical name", () => {
    expect(normalise("Bis(2-ethylhexyl) phthalate")).toBe("bis 2 ethylhexyl phthalate");
    expect(normalise("Tris(2-ethylhexyl) phosphate")).toBe("tris 2 ethylhexyl phosphate");
  });

  it("drops a glued bracket holding only capitals, a trademark or similar mark", () => {
    expect(normalise("Triton(TM) X-114")).toBe("triton x 114");
    expect(normalise("IGEPAL(R) CA-630")).toBe("igepal ca 630");
  });

  it("collapses hyphens, underscores, and whitespace", () => {
    expect(normalise("Butyl-Paraben_Test")).toBe("butyl paraben test");
  });

  it("returns empty for empty input", () => {
    expect(normalise("")).toBe("");
    expect(normalise("   ")).toBe("");
  });

  it("strips zero-width joiners and bidi marks", () => {
    expect(normalise("buty\u200blparaben")).toBe("butylparaben");
    expect(normalise("\u202ebutylparaben\u202c")).toBe("butylparaben");
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

  it("tolerates OCR confusions in the header (INGREDlENTS, 1NGREDIENTS)", () => {
    expect(
      parseIngredients("INGREDlENTS: Aqua, Glycerin, Butylparaben"),
    ).toEqual(["Aqua", "Glycerin", "Butylparaben"]);
    expect(
      parseIngredients("1NGREDIENTS: Aqua, Glycerin, Butylparaben"),
    ).toEqual(["Aqua", "Glycerin", "Butylparaben"]);
  });

  it("doesn't split on newlines when commas are the real separator", () => {
    const out = parseIngredients(
      "Ingredients: Aqua, Sodium Benzoate, Potassium\nSorbate, Parfum, Citric Acid",
    );
    expect(out).toContain("Potassium Sorbate");
    expect(out).not.toContain("Potassium");
    expect(out).not.toContain("Sorbate");
  });

  it("still splits on newlines when there are no commas", () => {
    const out = parseIngredients(
      "Ingredients:\nAqua\nGlycerin\nButylparaben",
    );
    expect(out).toEqual(["Aqua", "Glycerin", "Butylparaben"]);
  });

  it("stops at warning / direction markers after the ingredient list", () => {
    const out = parseIngredients(
      "INGREDIENTS: Aqua, Glycerin, Butylparaben. CAUTION: avoid eyes. Do not use on broken skin.",
    );
    expect(out).toEqual(["Aqua", "Glycerin", "Butylparaben"]);
  });

  it("recovers a heavily OCR-mangled header (NGEDENTS)", () => {
    // Real OCR output from a dry-shampoo can scan: "INGREDIENTS"
    // arrived as "NGEDENTS" (lost I, R, I).
    const out = parseIngredients(
      "Marketing copy here. NGEDENTS: Butane, Isobutane, Propane, Alcohol Denat., Parfum",
    );
    expect(out).toContain("Butane");
    expect(out).toContain("Parfum");
    expect(out).not.toContain("Marketing copy here");
  });

  it("filters sentence-like tokens that aren't ingredients", () => {
    const out = parseIngredients(
      "INGREDIENTS: Aqua, Glycerin, Tolerance tested under dermatological control",
    );
    expect(out).toEqual(["Aqua", "Glycerin"]);
  });

  it("cleans OCR artifacts (leading $, doubled initial caps, pipe→l)", () => {
    const out = parseIngredients(
      "INGREDIENTS: Aqua, $ Sodium BBenzoate, Linaly| Acetate, Methy|paraben",
    );
    expect(out).toEqual([
      "Aqua",
      "Sodium Benzoate",
      "Linalyl Acetate",
      "Methylparaben",
    ]);
  });

  it("splits on period+space to peel off trailing non-ingredient text", () => {
    const out = parseIngredients(
      "INGREDIENTS: Aqua, Citric Acid, Linalyl Acetate. HYGIENE WIPES ULTIMATE",
    );
    expect(out).toContain("Aqua");
    expect(out).toContain("Citric Acid");
    expect(out).toContain("Linalyl Acetate");
    expect(out).not.toContain("Linalyl Acetate. HYGIENE WIPES ULTIMATE");
  });

  it("splits on a full stop between two words, as OCR misreads a comma", () => {
    const out = parseIngredients("Water.WHOLEGRAIN OATS (10%), Rapeseed Oil, Butylparaben.Parfum");
    expect(out).toContain("Water");
    expect(out).toContain("WHOLEGRAIN OATS (10%)");
    expect(out).toContain("Butylparaben");
    expect(out).toContain("Parfum");
  });

  it("keeps slash-joined INCI names whole, splitting only on a spaced slash", () => {
    const out = parseIngredients(
      "Aqua / Water, Caprylic/Capric Triglyceride, Lauric/Myristic/Palmitic/Stearic Glycerides",
    );
    expect(out).toEqual([
      "Aqua",
      "Water",
      "Caprylic/Capric Triglyceride",
      "Lauric/Myristic/Palmitic/Stearic Glycerides",
    ]);
  });

  it("keeps abbreviations like C.I. together", () => {
    const out = parseIngredients("Aqua, Mica, C.I. 77891, Talc");
    expect(out.some((i) => i.includes("77891"))).toBe(true);
    expect(out).not.toContain("I");
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

  it("does not fuzzy-match a different number in the same chemical family", () => {
    // "benzophenone 3" is one edit from "benzophenone 1" but a different substance.
    expect(matchIngredients(["Benzophenone-3"], INDEX, LOOKUP)).toEqual([]);
  });

  it("still fuzzy-matches an OCR digit slip in a name without digits", () => {
    const matches = matchIngredients(["Buty1paraben"], INDEX, LOOKUP);
    expect(matches.map((m) => m.substance.id)).toEqual(["s-butylparaben"]);
    expect(matches[0]!.matchType).toBe("fuzzy");
  });

  it("fuzzy-matches an OCR slip inside a word of a numbered name", () => {
    const matches = matchIngredients(["Benzophen0ne-1"], INDEX, LOOKUP);
    expect(matches.map((m) => m.substance.id)).toEqual(["s-bp1"]);
    expect(matches[0]!.matchType).toBe("fuzzy");
  });

  it("keeps numbered names apart even with an OCR slip inside a word", () => {
    expect(matchIngredients(["Benzophen0ne-3"], INDEX, LOOKUP)).toEqual([]);
  });
});
