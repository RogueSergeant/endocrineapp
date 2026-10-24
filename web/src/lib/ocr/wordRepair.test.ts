import { createWordRepair } from "./wordRepair";

const repair = createWordRepair([
  "water",
  "wholegrain",
  "oats",
  "dimethicone",
  "propylparaben",
  "butylparaben",
  "ethylparaben",
  "methylparaben",
  "sea",
  "salt",
  "phosphates",
  "allergy",
  "advice",
]);

describe("createWordRepair", () => {
  it("joins a word split by a stray space, keeping its case", () => {
    expect(repair("Water, W HOLEGRAIN OATS (10%)")).toBe("Water, WHOLEGRAIN OATS (10%)");
    expect(repair("Aqua, Dim ethicone,")).toBe("Aqua, Dimethicone,");
  });

  it("joins a word split twice", () => {
    expect(repair("Dim eth icone")).toBe("Dimethicone");
  });

  it("joins a split word straight after an ordinary one", () => {
    expect(repair("Sea Dim eth icone Salt")).toBe("Sea Dimethicone Salt");
  });

  it("leaves two real words alone even if their join is a word", () => {
    const r = createWordRepair(["sea", "salt", "seasalt"]);
    expect(r("Sea Salt")).toBe("Sea Salt");
  });

  it("corrects an unambiguous misread letter", () => {
    expect(repair("Propytparaben, Butyloaraben")).toBe("Propylparaben, Butylparaben");
  });

  it("leaves a word alone when two corrections are equally close", () => {
    // One edit from both "ethylparaben" and "methylparaben".
    expect(repair("xethylparaben")).toBe("xethylparaben");
  });

  it("does not touch short or known words", () => {
    expect(repair("Sea Salt, Vit D")).toBe("Sea Salt, Vit D");
    expect(repair("ALLERGY ADVICE")).toBe("ALLERGY ADVICE");
  });

  it("splits words glued where a separator was lost, then repairs each", () => {
    const r = createWordRepair(["parfum", "alpha", "pinene", "butylparaben", "citral"]);
    expect(r("PorfumAlpho-pinene")).toBe("Parfum Alpha-pinene");
    expect(r("CitralButylporaben")).toBe("Citral Butylparaben");
  });

  it("leaves short mixed-case words alone", () => {
    expect(repair("pH, McDonald")).toBe("pH, McDonald");
  });

  it("works line by line", () => {
    expect(repair("W HOLEGRAIN\nPhosphatss")).toBe("WHOLEGRAIN\nPhosphates");
  });
});
