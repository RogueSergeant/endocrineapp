import { findOverlap, joinLine, mergeReadings } from "./mergeReadings";
import { prepareOcrText } from "./textRecognition";

// OCR of four overlapping photos of a hair powder label that wraps round
// the bottle, as the worker read them: each photo's edges are garbled
// where the label curves out of view.
const BOTTLE = [
  "NGREDIENTS: Aqua (W ater). Silica Siyaa\nsenzoate, Parfum (Fragrance). Citric Acid, Si\n Citrus Limon Peel Oil. Geraniol, Hexyl Citte",
  "ic Silylate DimethiconeVinyl Dimethicone\nitic Acid, Silica Isoceteth-10 Benzyl Sali\niol, Hexyl Cinnamal Limonene. Linalool, Lira",
  "hy Dimethicone Crosspolymer, Phenaxetatd\nBenzyl Salicylate, Citral. Citronellol, Cts\nLnalol, Linalyl Acetate, Pinene, Terpned",
  "Easspolymer, Phenoxvethanol. Sodium\nCitral, Citronellol. Citrus Aurantium Peel\nFikcetate, Pinene, Terpineol.",
];

const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

describe("mergeReadings", () => {
  it("joins four real photos of a wrapped label into the whole list, in order", () => {
    const merged = mergeReadings(BOTTLE);
    expect(merged.split("\n")).toHaveLength(3);
    // Every ingredient on the label, in the label's order, once the merged
    // reading is cleaned and word-repaired as the app does. (The first
    // photo cut off the "Oil" after "Citrus Aurantium Peel".)
    const label =
      "Aqua Water Silica Silylate Dimethicone Vinyl Dimethicone Crosspolymer Phenoxyethanol " +
      "Sodium Benzoate Parfum Fragrance Citric Acid Silica Isoceteth 10 Benzyl Salicylate Citral " +
      "Citronellol Citrus Aurantium Peel Citrus Limon Peel Oil Geraniol Hexyl Cinnamal " +
      "Limonene Linalool Linalyl Acetate Pinene Terpineol";
    const got = words(prepareOcrText(merged));
    let at = 0;
    for (const w of words(label)) {
      const next = got.indexOf(w, at);
      expect(next, `"${w}" missing or out of order`).toBeGreaterThanOrEqual(0);
      at = next + 1;
    }
  });

  it("returns a single reading unchanged", () => {
    expect(mergeReadings(["Aqua, Glycerin\nParfum"])).toBe("Aqua, Glycerin\nParfum");
  });

  it("keeps lines that only one photo caught", () => {
    const merged = mergeReadings([
      "Ingredients: Aqua, Glycerin, Propyl\nParfum, Citric Acid, Lim",
      "lycerin, Propylparaben, Sodium\nCitric Acid, Limonene, Linalool\nMay contain traces",
    ]);
    expect(merged).toContain("Propylparaben");
    expect(merged).toContain("Limonene, Linalool");
    expect(merged.split("\n").at(-1)).toBe("May contain traces");
  });
});

describe("joinLine", () => {
  it("joins at the overlap despite garbled edges", () => {
    const j = joinLine("Aqua, Glycerin, Cetearyl Alcoh0x", "lycerin, Cetearyl Alcohol, Parfum");
    expect(j?.text).toBe("Aqua, Glycerin, Cetearyl Alcohol, Parfum");
  });

  it("finds no overlap between unrelated text", () => {
    expect(findOverlap("Aqua, Glycerin, Parfum", "Sodium Benzoate, Citric")).toBeNull();
  });
});
