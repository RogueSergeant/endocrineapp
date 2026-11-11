import { linesAreCurved, straightenLine, traceLines } from "./curvedLines";

const W = 400;
const H = 200;

/** A smile-shaped line's centre at column x: `bow` pixels lower in the middle than at the ends. */
const arc = (x: number, y: number, bow: number) => y + bow * (1 - ((x - W / 2) / (W / 2)) ** 2);

/**
 * A detection map with one band per entry, `thickness` pixels thick,
 * following `centre`; `gaps` are column ranges left empty (spaces
 * between words).
 */
function fakeMap(
  lines: { centre: (x: number) => number; x0?: number; x1?: number; gaps?: [number, number][] }[],
  thickness = 6,
): Float32Array {
  const map = new Float32Array(W * H);
  for (const { centre, x0 = 20, x1 = W - 20, gaps = [] } of lines) {
    for (let x = x0; x < x1; x++) {
      if (gaps.some(([a, b]) => x >= a && x < b)) continue;
      const c = centre(x);
      for (let y = Math.round(c - thickness / 2); y < Math.round(c + thickness / 2); y++) {
        if (y >= 0 && y < H) map[y * W + x] = 0.9;
      }
    }
  }
  return map;
}

describe("traceLines", () => {
  it("follows each bowed line along its own path, top to bottom", () => {
    const map = fakeMap(
      [0, 1, 2, 3].map((i) => ({ centre: (x: number) => arc(x, 30 + i * 22, 30) })),
    );
    const lines = traceLines(map, W, H);
    expect(lines).toHaveLength(4);
    lines.forEach((l, i) => {
      for (const x of [40, 120, 200, 280, 360]) {
        expect(l.centres[x - l.x0]!).toBeCloseTo(arc(x, 30 + i * 22, 30), 0);
      }
      expect(l.spacing).toBeCloseTo(22, 0);
    });
  });

  it("stays on a steep curve right to the line's ends", () => {
    // Where the next word is joined on, so a centre flattened at the ends
    // would miss it.
    const [line] = traceLines(fakeMap([{ centre: (x) => arc(x, 30, 70) }]), W, H);
    expect(Math.abs(line!.centres[0]! - arc(20, 30, 70))).toBeLessThan(1);
    expect(Math.abs(line!.centres.at(-1)! - arc(W - 21, 30, 70))).toBeLessThan(1);
  });

  it("joins the words of a line across the spaces between them", () => {
    const map = fakeMap([
      {
        centre: (x) => arc(x, 40, 30),
        gaps: [
          [100, 110],
          [220, 232],
        ],
      },
      { centre: (x) => arc(x, 62, 30), gaps: [[150, 160]] },
    ]);
    const lines = traceLines(map, W, H);
    expect(lines.map((l) => [l.x0, l.x1])).toEqual([
      [20, W - 20],
      [20, W - 20],
    ]);
    // Across the space, the centre carries on along the curve.
    expect(lines[0]!.centres[105 - 20]!).toBeCloseTo(arc(105, 40, 30), 0);
  });

  it("joins a thin fragment at the steep end of a line to the rest of it", () => {
    const map = new Float32Array(W * H);
    const draw = (x0: number, x1: number, t: number) => {
      for (let x = x0; x < x1; x++) {
        const c = arc(x, 60, 40);
        for (let y = Math.round(c - t / 2); y < Math.round(c + t / 2); y++) map[y * W + x] = 0.9;
      }
    };
    draw(20, 34, 2);
    draw(37, W - 20, 7);
    const lines = traceLines(map, W, H);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.x0).toBe(20);
  });

  it("orders a short line at the end of a curve by where it meets the line above", () => {
    // On a smile-shaped label the line ends sit higher than the middle, so
    // the middle of a short last line at the left is higher up the page
    // than the middle of the long line above it.
    const map = fakeMap([
      { centre: (x) => arc(x, 40, 40) },
      { centre: (x) => arc(x, 62, 40), x1: 80 },
    ]);
    const lines = traceLines(map, W, H);
    expect(lines.map((l) => l.x1)).toEqual([W - 20, 80]);
  });

  it("drops a sliver the detector split off a longer line", () => {
    const map = fakeMap([{ centre: (x) => arc(x, 40, 20) }], 8);
    // A thin piece just under the line, joined to nothing.
    for (let x = 150; x < 190; x++) map[Math.round(arc(x, 40, 20) + 6) * W + x] = 0.9;
    for (let x = 150; x < 190; x++) map[Math.round(arc(x, 40, 20) + 5) * W + x] = 0;
    const lines = traceLines(map, W, H);
    expect(lines).toHaveLength(1);
  });
});

describe("linesAreCurved", () => {
  const traced = (bow: number, slope = 0) =>
    traceLines(
      fakeMap(
        [0, 1, 2, 3].map((i) => ({ centre: (x: number) => arc(x, 30 + i * 22, bow) + slope * x })),
      ),
      W,
      H,
    );

  it("is false for level lines", () => {
    expect(linesAreCurved(traced(0))).toBe(false);
  });

  it("is false for a slight bow that upright boxes cope with", () => {
    expect(linesAreCurved(traced(3))).toBe(false);
  });

  it("is true for lines that bow round a jar", () => {
    expect(linesAreCurved(traced(20))).toBe(true);
  });

  it("is true for straight lines still sloping by more than their thickness", () => {
    expect(linesAreCurved(traced(0, 0.05))).toBe(true);
  });
});

describe("straightenLine", () => {
  it("cuts a bowed line out of the photo as a level strip", () => {
    // A photo (here at map scale 0.5) with one dark bowed stroke on white.
    const scale = 0.5;
    const pw = W / scale;
    const ph = H / scale;
    const data = new Uint8ClampedArray(pw * ph * 4).fill(255);
    for (let x = 0; x < pw; x++) {
      const c = arc(x * scale, 60, 30) / scale;
      for (let y = Math.round(c - 4); y < Math.round(c + 4); y++) {
        const o = (y * pw + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = 0;
      }
    }
    const [line] = traceLines(fakeMap([{ centre: (x) => arc(x, 60, 30) }], 5), W, H);
    const flat = straightenLine({ data, width: pw, height: ph }, line!, scale)!;
    expect(flat.height).toBeGreaterThan(16);
    const mid = Math.floor(flat.height / 2);
    // The stroke runs along the middle row the whole way, and the top and
    // bottom rows are clear of it.
    for (let x = 0; x < flat.width; x += 20) {
      expect(flat.data[(mid * flat.width + x) * 4]).toBeLessThan(80);
      expect(flat.data[x * 4]).toBe(255);
      expect(flat.data[((flat.height - 1) * flat.width + x) * 4]).toBe(255);
    }
  });

  it("keeps the strip shorter than the line spacing on tightly set lists", () => {
    const lines = traceLines(
      fakeMap(
        [0, 1, 2].map((i) => ({ centre: (x: number) => arc(x, 40 + i * 14, 20) })),
        8,
      ),
      W,
      H,
    );
    const src = { data: new Uint8ClampedArray(W * H * 4), width: W, height: H };
    const flat = straightenLine(src, lines[1]!, 1)!;
    expect(flat.height).toBeLessThanOrEqual(Math.round(14 * 1.1));
  });
});
