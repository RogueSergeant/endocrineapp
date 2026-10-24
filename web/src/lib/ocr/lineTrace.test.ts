import { traceCentreline } from "./lineTrace";

/** Three bowed text lines (bands of high probability) on a 300 x 90 map. */
function bowedLines(bow: number) {
  const w = 300;
  const h = 90;
  const map = new Float32Array(w * h);
  const centreOf = (line: number, x: number) => 20 + line * 25 + bow * ((x - 150) / 150) ** 2;
  for (let line = 0; line < 3; line++) {
    for (let x = 10; x < 290; x++) {
      if (x % 40 > 34) continue; // gaps between words
      const c = centreOf(line, x);
      for (let y = Math.round(c - 7); y <= Math.round(c + 7); y++)
        if (y >= 0 && y < h) map[y * w + x] = 0.9;
    }
  }
  return { map, w, h, centreOf };
}

describe("traceCentreline", () => {
  it("follows the middle line along its curve, not its neighbours", () => {
    const { map, w, h, centreOf } = bowedLines(10);
    // The middle line's upright box, which takes in parts of the others.
    const box = { x0: 10, y0: 38, x1: 290, y1: 62 + 10 };
    const trace = traceCentreline(map, w, h, box, 15)!;
    expect(trace).not.toBeNull();
    trace.centres.forEach((c, k) => {
      const x = box.x0 + (k + 0.5) * trace.strip;
      expect(Math.abs(c - centreOf(1, Math.min(x, 289)))).toBeLessThanOrEqual(2);
    });
  });

  it("returns a level trace for a straight line", () => {
    const { map, w, h } = bowedLines(0);
    const trace = traceCentreline(map, w, h, { x0: 10, y0: 36, x1: 290, y1: 54 }, 15)!;
    for (const c of trace.centres) expect(Math.abs(c - 45)).toBeLessThanOrEqual(1);
  });

  it("returns null where the map shows no text", () => {
    expect(
      traceCentreline(new Float32Array(100 * 50), 100, 50, { x0: 0, y0: 10, x1: 100, y1: 30 }, 12),
    ).toBeNull();
  });
});
