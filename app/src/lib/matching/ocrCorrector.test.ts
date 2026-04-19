import { parseIngredients } from "./ingredientParser";
import { correctIngredient, correctIngredients } from "./ocrCorrector";

describe("cleanToken deterministic fixes", () => {
  it("rewrites I/l/| adjacent to digits as 1", () => {
    const out = parseIngredients(
      "INGREDIENTS: Aqua, PPG-I5 Stearyl Ether, PEG-l00 Stearate",
    );
    expect(out).toContain("PPG-15 Stearyl Ether");
    expect(out).toContain("PEG-100 Stearate");
  });

  it("strips a stray leading '(' when the token has no closing paren", () => {
    const out = parseIngredients(
      "INGREDIENTS: Aqua, Aluminum (hlorohydrate, Glycerin",
    );
    expect(out).toContain("Aluminum hlorohydrate");
  });

  it("keeps legitimate parentheticals intact", () => {
    const out = parseIngredients(
      "INGREDIENTS: Bisphenol A (BPA), Glycerin",
    );
    expect(out).toContain("Bisphenol A (BPA)");
  });

  it("doesn't rewrite I/l in words that have no digits", () => {
    const out = parseIngredients("INGREDIENTS: Island Clay, Lanolin");
    expect(out).toContain("Island Clay");
    expect(out).toContain("Lanolin");
  });
});

describe("correctIngredient (dictionary)", () => {
  it("canonicalises an exact match to title case", () => {
    expect(correctIngredient("GLYCERIN")).toBe("Glycerin");
    expect(correctIngredient("aqua")).toBe("Aqua");
  });

  it("fixes a single-character substitution in a phrase", () => {
    expect(correctIngredient("Caprylyl Giycol")).toBe("Caprylyl Glycol");
    expect(correctIngredient("Patfum")).toBe("Parfum");
  });

  it("recovers a missing C at the start of a word", () => {
    expect(correctIngredient("Aluminum hlorohydrate")).toBe(
      "Aluminum Chlorohydrate",
    );
  });

  it("strips OCR noise prefix from a long phrase", () => {
    expect(correctIngredient("AN PPG-15 Stearyl Ether")).toBe(
      "PPG-15 Stearyl Ether",
    );
  });

  it("falls back to per-word correction when the phrase is too mangled", () => {
    expect(correctIngredient("alcium ww Siliate")).toBe("Calcium Silicate");
  });

  it("leaves unknown ingredients alone", () => {
    expect(correctIngredient("Quillaja Saponaria Bark Extract")).toBe(
      "Quillaja Saponaria Bark Extract",
    );
  });

  it("doesn't corrupt short all-caps tokens", () => {
    expect(correctIngredient("EDTA")).toBe("EDTA");
  });
});

describe("correctIngredients (list-level)", () => {
  it("dedupes after canonicalisation", () => {
    expect(
      correctIngredients(["Glycerin", "glycerin", "GLYCERIN"]),
    ).toEqual(["Glycerin"]);
  });

  it("corrects the full deodorant label from the user screenshot", () => {
    const parsed = parseIngredients(
      "INGREDIENTS: Aqua, Aluminum (hlorohydrate, AN PPG-I5 Stearyl Ether, Steareth-2, Glycerin, Steareth-21, Patfum, Caprylyl Giycol, alcium ww Siliate, Lactose, Whey Protein.",
    );
    const corrected = correctIngredients(parsed);
    expect(corrected).toEqual([
      "Aqua",
      "Aluminum Chlorohydrate",
      "PPG-15 Stearyl Ether",
      "Steareth-2",
      "Glycerin",
      "Steareth-21",
      "Parfum",
      "Caprylyl Glycol",
      "Calcium Silicate",
      "Lactose",
      "Whey Protein",
    ]);
  });
});
