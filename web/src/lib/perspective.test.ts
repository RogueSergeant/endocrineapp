import {
  apply,
  flattenedSize,
  homography,
  isConvex,
  warpQuad,
  type Pixels,
  type Quad,
} from "./perspective";

/** A test image whose pixel (x, y) is (x, y, x + y, 255), so positions can be read back. */
function gradient(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set([x, y, (x + y) % 256, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const rect = (x: number, y: number, w: number, h: number): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe("homography", () => {
  it("maps each corner onto its target", () => {
    const from = rect(0, 0, 100, 50);
    const to: Quad = [
      { x: 10, y: 5 },
      { x: 120, y: 20 },
      { x: 110, y: 90 },
      { x: 0, y: 70 },
    ];
    const h = homography(from, to);
    from.forEach((p, i) => {
      const q = apply(h, p);
      expect(q.x).toBeCloseTo(to[i]!.x, 6);
      expect(q.y).toBeCloseTo(to[i]!.y, 6);
    });
  });
});

describe("warpQuad", () => {
  it("copies an axis-aligned selection exactly, like a plain crop", () => {
    const src = gradient(64, 48);
    const out = warpQuad(src, rect(10, 7, 30, 20), 30, 20);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 30; x++) {
        const o = (y * 30 + x) * 4;
        expect([out.data[o], out.data[o + 1]]).toEqual([x + 10, y + 7]);
      }
    }
  });

  it("straightens a selection taken at an angle", () => {
    // Corners of a 40 x 20 region rotated 10 degrees about (50, 40).
    const a = (10 * Math.PI) / 180;
    const rot = (x: number, y: number) => ({
      x: 50 + x * Math.cos(a) - y * Math.sin(a),
      y: 40 + x * Math.sin(a) + y * Math.cos(a),
    });
    const quad: Quad = [rot(-20, -10), rot(20, -10), rot(20, 10), rot(-20, 10)];
    const out = warpQuad(gradient(100, 80), quad, 40, 20);
    // The output's centre samples the region's centre.
    const o = (10 * 40 + 20) * 4;
    expect(Math.abs(out.data[o]! - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(out.data[o + 1]! - 40)).toBeLessThanOrEqual(1);
  });
});

describe("flattenedSize", () => {
  it("uses the longer of each pair of opposite sides", () => {
    const trapezium: Quad = [
      { x: 20, y: 0 },
      { x: 80, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    expect(flattenedSize(trapezium)).toEqual({ width: 100, height: 54 });
  });
});

describe("isConvex", () => {
  it("accepts a rectangle and a trapezium", () => {
    expect(isConvex(rect(0, 0, 10, 5))).toBe(true);
    expect(
      isConvex([
        { x: 2, y: 0 },
        { x: 8, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ]),
    ).toBe(true);
  });

  it("rejects a selection folded over itself", () => {
    expect(
      isConvex([
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
      ]),
    ).toBe(false);
  });
});
