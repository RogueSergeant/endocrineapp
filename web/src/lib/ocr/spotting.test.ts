import { createSpotter } from "./spotting";

const CLASSES = [
  "",
  ..."0123456789",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  " ",
  "-",
  ",",
  ".",
];
const C = CLASSES.length;
const idx = (ch: string) => CLASSES.indexOf(ch);

/**
 * Fake recogniser output for `text`: per character a frame peaked on it
 * then a blank frame. `alts` gives, per character index, a runner-up and
 * the probability the model gave it.
 */
function fakeOutput(text: string, alts: Record<number, [string, number]> = {}) {
  const frames: number[][] = [];
  const peaked = (main: number, mainP: number, alt?: [number, number]) => {
    const row = new Array<number>(C).fill(0);
    const rest = 1 - mainP - (alt?.[1] ?? 0);
    for (let c = 0; c < C; c++) row[c] = rest / C;
    row[main] = mainP + rest / C;
    if (alt) row[alt[0]] = alt[1] + rest / C;
    return row;
  };
  [...text].forEach((ch, i) => {
    const alt = alts[i];
    frames.push(peaked(idx(ch), alt ? 0.6 : 0.95, alt ? [idx(alt[0]), alt[1]] : undefined));
    frames.push(peaked(0, 0.95));
  });
  return { probs: Float32Array.from(frames.flat()), frames: frames.length };
}

const KEYS = [
  "propylparaben",
  "butylparaben",
  "butylated hydroxyanisole",
  "benzophenone 3",
  "triclosan",
];
const spotter = createSpotter(KEYS, CLASSES);
const scoreOf = (text: string, key: string, alts?: Record<number, [string, number]>) => {
  const { probs, frames } = fakeOutput(text, alts);
  return spotter.spot(probs, frames).find((h) => h.key === key)?.score ?? 0;
};

describe("createSpotter", () => {
  it("scores a cleanly read name at (nearly) 1, ignoring case", () => {
    expect(scoreOf("Aqua, PROPYLPARABEN, Parfum", "propylparaben")).toBeGreaterThan(0.97);
  });

  it("finds a name glued to its neighbours", () => {
    expect(scoreOf("WaterPropylparabenParfum", "propylparaben")).toBeGreaterThan(0.97);
  });

  it("keeps a high score when the right letter was the runner-up", () => {
    // Read as "Propytparaben" (index 5), with "l" a close second.
    const s = scoreOf("Propytparaben", "propylparaben", { 5: ["l", 0.3] });
    expect(s).toBeGreaterThan(0.85);
  });

  it("scores much lower when the letter was never considered", () => {
    const runnerUp = scoreOf("Propytparaben", "propylparaben", { 5: ["l", 0.3] });
    const absent = scoreOf("Propytparaben", "propylparaben");
    expect(absent).toBeLessThan(runnerUp - 0.2);
  });

  it("matches multi-word names with a space, a hyphen or no gap", () => {
    expect(scoreOf("Butylated Hydroxyanisole", "butylated hydroxyanisole")).toBeGreaterThan(0.97);
    expect(scoreOf("ButylatedHydroxyanisole", "butylated hydroxyanisole")).toBeGreaterThan(0.97);
    expect(scoreOf("Benzophenone-3", "benzophenone 3")).toBeGreaterThan(0.97);
  });

  it("finds nothing in a line without any of the names", () => {
    const { probs, frames } = fakeOutput("Aqua, Glycerin, Sodium Benzoate, Citric Acid");
    expect(spotter.spot(probs, frames).filter((h) => h.score > 0.6)).toEqual([]);
  });

  it("does not confuse butylparaben with propylparaben", () => {
    expect(scoreOf("Butylparaben", "propylparaben")).toBeLessThan(0.6);
  });
});
