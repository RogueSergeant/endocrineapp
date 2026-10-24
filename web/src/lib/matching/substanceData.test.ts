// Regression tests against the real bundled database: label spellings of
// the substances people most often look for must match the right entry.
import { parseIngredients } from "./ingredientParser";
import { matchIngredients } from "./matcher";
import { isKnownWord } from "@/lib/ocr/ocrVocabulary";
import { substanceDb } from "@/lib/store/scanStore";

function matchOne(word: string) {
  const matches = matchIngredients([word], substanceDb.index, substanceDb.lookup);
  return matches.map((m) => ({ name: m.substance.canonicalName, cas: m.substance.casNumber }));
}

describe("bundled substance data", () => {
  it.each([
    ["BUTYLPARABEN", "94-26-8"],
    ["Propylparaben", "94-13-3"],
    ["Methylparaben", "99-76-3"],
    ["Isobutylparaben", "4247-02-3"],
    ["Bisphenol A", "80-05-7"],
    ["BPA", "80-05-7"],
    ["BHT", "128-37-0"],
    ["Butylated Hydroxytoluene", "128-37-0"],
    ["Benzophenone-3", "131-57-7"],
    ["Oxybenzone", "131-57-7"],
    ["Cyclopentasiloxane", "541-02-6"],
    ["Cyclotetrasiloxane", "556-67-2"],
    ["Butyl Methoxydibenzoylmethane", "70356-09-1"],
    ["Butylphenyl Methylpropional", "80-54-6"],
    ["Triclosan", "3380-34-5"],
    // OCR letter/digit slips inside names that also carry a real number.
    ["4-Methy1benzylidene Camphor", "36861-47-9"],
    ["Benzophen0ne-3", "131-57-7"],
    ["Buty1paraben", "94-26-8"],
    // Food additive E-numbers, in the spellings labels use.
    ["E321", "128-37-0"],
    ["E-321", "128-37-0"],
    ["E 218", "99-76-3"],
    ["E216", "94-13-3"],
  ])("matches %s to CAS %s", (word, cas) => {
    expect(matchOne(word).map((m) => m.cas)).toEqual([cas]);
  });

  it.each(["Butylated Hydroxyanisole", "BHA", "E320", "E-320"])(
    "matches %s to BHA, which the source lists without a CAS number",
    (word) => {
      expect(matchOne(word).map((m) => m.name)).toEqual(["2-tert-butyl-4-methoxyphenol (BHA)"]);
    },
  );

  it.each(["Sodium Chloride", "Triphosphates", "Diphosphates", "Potassium Phosphates"])(
    "does not fuzzy-match the correctly spelled ingredient %s to something else",
    (word) => {
      const m = matchIngredients([word], substanceDb.index, substanceDb.lookup, isKnownWord);
      expect(m.map((x) => x.substance.canonicalName)).toEqual([]);
    },
  );

  it.each([
    ["Propytparaben", "94-13-3"],
    ["Butylparaben", "94-26-8"],
    ["Buty1paraben", "94-26-8"],
    ["Triclosam", "3380-34-5"],
  ])("still fuzzy-matches the misread %s with the vocabulary in use", (word, cas) => {
    const m = matchIngredients([word], substanceDb.index, substanceDb.lookup, isKnownWord);
    expect(m.map((x) => x.substance.casNumber)).toEqual([cas]);
  });

  it("matches a chemical name whose brackets are part of it", () => {
    expect(matchOne("Bis(2-ethylhexyl) phthalate").map((m) => m.name)).toEqual([
      "Bis(2-ethylhexyl) phthalate (DEHP)",
    ]);
  });

  it("has no aliases that still pack several names into one", () => {
    const joined = Object.keys(substanceDb.index).filter((k) => k.includes(";"));
    expect(joined).toEqual([]);
  });

  it("flags the expected substances in a realistic sunscreen label", () => {
    const label =
      "INGREDIENTS: AQUA, HOMOSALATE, BENZOPHENONE-3, BUTYL METHOXYDIBENZOYLMETHANE, " +
      "CYCLOPENTASILOXANE, GLYCERIN, PROPYLPARABEN, METHYLPARABEN, BHT, PARFUM.";
    const matches = matchIngredients(parseIngredients(label), substanceDb.index, substanceDb.lookup);
    expect(matches.map((m) => m.substance.casNumber).sort()).toEqual(
      ["131-57-7", "70356-09-1", "541-02-6", "94-13-3", "99-76-3", "128-37-0"].sort(),
    );
  });
});
