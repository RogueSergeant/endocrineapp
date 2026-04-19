import { describe, expect, it } from "@jest/globals";
import { parseIngredients } from "./ingredientParser";
import { matchIngredients } from "./matcher";
import { normalise } from "./normaliser";
import type { Substance } from "../../types";

const fixtures: Substance[] = [
  {
    id: "sub-butylparaben",
    casNumber: "94-26-8",
    ecNumber: "202-318-7",
    canonicalName: "Butylparaben",
    evidenceTier: 1,
    healthEffects: true,
    envEffects: false,
    assessments: [{ listId: 1, status: "ED", regulatoryField: "Cosmetics", year: 2020 }],
    aliases: ["Butylparaben", "Butyl paraben", "Butyl 4-hydroxybenzoate"],
    inciName: "Butylparaben",
  },
  {
    id: "sub-dehp",
    casNumber: "117-81-7",
    ecNumber: "204-211-0",
    canonicalName: "Di(2-ethylhexyl) phthalate (DEHP)",
    evidenceTier: 1,
    healthEffects: true,
    envEffects: true,
    assessments: [{ listId: 1, status: "ED", regulatoryField: "REACH", year: 2014 }],
    aliases: ["DEHP", "Di(2-ethylhexyl) phthalate", "117-81-7"],
    inciName: null,
  },
  {
    id: "sub-oxybenzone",
    casNumber: "131-57-7",
    ecNumber: null,
    canonicalName: "Benzophenone-3 (Oxybenzone)",
    evidenceTier: 2,
    healthEffects: true,
    envEffects: true,
    assessments: [{ listId: 2, status: "Under review", regulatoryField: "Cosmetics", year: 2021 }],
    aliases: ["Benzophenone-3", "Oxybenzone", "BP-3"],
    inciName: "Benzophenone-3",
  },
];

function buildIndex(subs: Substance[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sub of subs) {
    for (const alias of sub.aliases) {
      const n = normalise(alias);
      if (!n) continue;
      if (!(n in out)) out[n] = sub.id;
    }
    if (sub.casNumber) out[sub.casNumber] = sub.id;
  }
  return out;
}

const INDEX = buildIndex(fixtures);
const BY_ID = Object.fromEntries(fixtures.map((s) => [s.id, s]));

function match(ingredients: string[]) {
  return matchIngredients({ ingredients, index: INDEX, substances: BY_ID });
}

describe("parseIngredients", () => {
  it("splits on commas with an Ingredients: header", () => {
    expect(
      parseIngredients("Ingredients: water, glycerin, butylparaben, parfum."),
    ).toEqual(["water", "glycerin", "butylparaben", "parfum"]);
  });

  it("handles the French header", () => {
    expect(
      parseIngredients("Ingrédients: Aqua, Glycerin, Butylparaben."),
    ).toEqual(["Aqua", "Glycerin", "Butylparaben"]);
  });

  it("keeps 1,3-butanediol intact", () => {
    const parsed = parseIngredients("Ingredients: aqua, 1,3-butanediol, glycerin");
    expect(parsed).toEqual(["aqua", "1,3-butanediol", "glycerin"]);
  });

  it("splits on newlines when no header", () => {
    expect(parseIngredients("Water\nGlycerin\nButylparaben")).toEqual([
      "Water",
      "Glycerin",
      "Butylparaben",
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseIngredients("")).toEqual([]);
  });
});

describe("matchIngredients", () => {
  it("exact INCI match on butylparaben", () => {
    const result = match(["water", "butylparaben", "glycerin"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.substance.id).toBe("sub-butylparaben");
    expect(result[0]!.matchType).toBe("exact");
    expect(result[0]!.confidence).toBe(1);
  });

  it("CAS number match maps to DEHP", () => {
    const result = match(["water", "117-81-7"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.substance.id).toBe("sub-dehp");
    expect(result[0]!.matchType).toBe("cas");
  });

  it("fuzzy match with a one-char OCR error", () => {
    const result = match(["butylparahen"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.substance.id).toBe("sub-butylparaben");
    expect(result[0]!.matchType).toBe("fuzzy");
    expect(result[0]!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result[0]!.confidence).toBeLessThan(1);
  });

  it("strips parentheticals from the ingredient string", () => {
    const result = match(["butylparaben (preservative)"]);
    expect(result[0]!.substance.id).toBe("sub-butylparaben");
    expect(result[0]!.matchType).toBe("exact");
  });

  it("no false positives on safe staples", () => {
    const result = match(["water", "aqua", "glycerin", "sodium chloride", "parfum"]);
    expect(result).toEqual([]);
  });

  it("handles empty and malformed inputs", () => {
    expect(match([])).toEqual([]);
    expect(match([""])).toEqual([]);
    expect(match(["   "])).toEqual([]);
  });

  it("deduplicates the same substance matched twice, keeps highest confidence", () => {
    const result = match(["butylparahen", "butylparaben"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.matchType).toBe("exact");
    expect(result[0]!.confidence).toBe(1);
  });

  it("sorts by evidence tier then position", () => {
    const result = match(["oxybenzone", "butylparaben"]);
    expect(result.map((m) => m.substance.id)).toEqual([
      "sub-butylparaben",
      "sub-oxybenzone",
    ]);
  });

  it("does not fuzzy-match short strings like 'BHA'", () => {
    const result = match(["bha"]);
    expect(result).toEqual([]);
  });
});
