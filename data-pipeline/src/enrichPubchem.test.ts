import { describe, expect, it } from "vitest";
import { cleanSynonyms, looksLikeIdentifier } from "./enrichPubchem.ts";

describe("looksLikeIdentifier", () => {
  it.each([
    "DTXSID0021414",
    "DTXCID801414",
    "MFCD00009491",
    "NSC 407921",
    "CCRIS 615",
    "RefChem:191857",
    "SCHEMBL980192",
    "NS00134365",
    "EINECS 201-116-6",
    "CAS-78-42-2",
    "BQC0BKB72S",
  ])("treats %s as an identifier", (id) => {
    expect(looksLikeIdentifier(id)).toBe(true);
  });

  it.each([
    "Butylparaben",
    "BP-3",
    "4-MBC",
    "BHT",
    "D5",
    "E320",
    "E 321",
    "Triton X-100",
    "Igepal CA-630",
    "Benzophenone-3",
    "Bis(2-ethylhexyl) phthalate",
    "TEHP",
  ])("keeps the name %s", (name) => {
    expect(looksLikeIdentifier(name)).toBe(false);
  });
});

describe("cleanSynonyms", () => {
  it("drops identifiers but keeps the names", () => {
    expect(cleanSynonyms(["DTXSID0021414", "Triclosan", "NSC 407921", "Irgasan"])).toEqual([
      "Triclosan",
      "Irgasan",
    ]);
  });
});
