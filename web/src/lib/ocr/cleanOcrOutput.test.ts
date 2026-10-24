import { cleanOcrOutput } from "./cleanOcrOutput";
import { prepareOcrText } from "./textRecognition";

describe("cleanOcrOutput", () => {
  it("closes up a stray space after a hyphen before a number", () => {
    expect(cleanOcrOutput("Silica, Isoceteth- 10, Benzyl Salicylate")).toBe(
      "Silica, Isoceteth-10, Benzyl Salicylate",
    );
  });

  it("still joins a word hyphenated across a line break", () => {
    expect(cleanOcrOutput("Buty-\nlparaben")).toBe("Butylparaben");
  });
});

describe("prepareOcrText", () => {
  it("repairs a misread name part on a real wrapped label", () => {
    expect(prepareOcrText("Dimethicone Vinvl Dimethicone Crosspolymer")).toBe(
      "Dimethicone Vinyl Dimethicone Crosspolymer",
    );
  });
});
