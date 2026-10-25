import type { Point, Quad } from "@/lib/perspective";
import { findTextRegions, isListHeading, rankWithHeadings } from "./textRegion";

interface Bar {
  /** Left edge and top edge before tilting, about the map centre. */
  u: number;
  v: number;
  len: number;
  h: number;
}

/** A fake probability map of word blobs, tilted `angle` degrees about the centre. */
function paint(bars: Bar[], { w = 480, h = 640, angle = 0 } = {}) {
  const map = new Float32Array(w * h);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pixels = new Map<Bar, Point[]>();
  for (const bar of bars) {
    const pts: Point[] = [];
    for (let u = bar.u; u < bar.u + bar.len; u += 0.5) {
      for (let v = bar.v; v < bar.v + bar.h; v += 0.5) {
        const x = Math.round(w / 2 + u * cos - v * sin);
        const y = Math.round(h / 2 + u * sin + v * cos);
        if (x >= 0 && x < w && y >= 0 && y < h) {
          map[y * w + x] = 0.9;
          pts.push({ x, y });
        }
      }
    }
    pixels.set(bar, pts);
  }
  return { map, w, h, pixels };
}

/**
 * `lines` rows of small-print words from u0 to u1, starting at v0. The
 * height and pitch are what the real detector gives for 30px print in a
 * photo shrunk to 960px: a thin core for each line, well apart.
 */
function paragraph(lines: number, v0: number, { u0 = -160, u1 = 160, h = 6, pitch = 18 } = {}) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bars: Bar[] = [];
  for (let line = 0; line < lines; line++) {
    let u = u0;
    while (u < u1) {
      const len = Math.min(20 + rand() * 50, u1 - u);
      bars.push({ u, v: v0 + line * pitch, len, h });
      u += len + 8;
    }
  }
  return bars;
}

/** Whether `p` lies inside the convex quad. */
function inside(q: Quad, p: Point): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

const headline: Bar = { u: -150, v: -260, len: 300, h: 26 };
const strays: Bar[] = [
  { u: -220, v: 280, len: 30, h: 6 },
  { u: 170, v: -150, len: 25, h: 6 },
];

function scene(angle = 0, list = paragraph(10, -20)) {
  return { list, ...paint([headline, ...strays, ...list], { angle }) };
}

describe("findTextRegions", () => {
  it.each([0, 6, -6])(
    "puts a %s degree list first, inside its corners, and leaves the rest out",
    (angle) => {
      const { list, map, w, h, pixels } = scene(angle);
      const [best] = findTextRegions(map, w, h);
      expect(best).toBeDefined();
      expect(best!.lineCount).toBe(10);
      for (const bar of list)
        for (const p of pixels.get(bar)!) expect(inside(best!.corners, p)).toBe(true);
      for (const bar of [headline, ...strays])
        for (const p of pixels.get(bar)!) expect(inside(best!.corners, p)).toBe(false);
    },
  );

  it("fits snugly: a little margin, not the whole photo", () => {
    const { map, w, h } = scene();
    const [best] = findTextRegions(map, w, h);
    const xs = best!.corners.map((p) => p.x);
    const ys = best!.corners.map((p) => p.y);
    // The list spans 320 x 168 map pixels.
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(345);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(190);
  });

  it("keeps a list that runs off the edge of the photo, clamped to it", () => {
    const list = paragraph(8, 0, { u0: 0, u1: 320 });
    const { map, w, h, pixels } = scene(0, list);
    const [best] = findTextRegions(map, w, h);
    for (const p of best!.corners) expect(p.x).toBeLessThanOrEqual(w);
    for (const bar of list)
      for (const p of pixels.get(bar)!) expect(inside(best!.corners, p)).toBe(true);
  });

  it("returns the first line's box, for the heading check", () => {
    const { map, w, h } = scene();
    const [best] = findTextRegions(map, w, h);
    // The first line runs across the middle of the map at v = -20..-14.
    expect(best!.topLine.y).toBeLessThan(h / 2 - 20);
    expect(best!.topLine.y + best!.topLine.height).toBeGreaterThan(h / 2 - 14);
    expect(best!.topLine.height).toBeLessThan(30);
    expect(best!.topLine.width).toBeGreaterThan(300);
  });

  it("finds nothing in an empty map or among a few stray words", () => {
    const empty = new Float32Array(100 * 100);
    expect(findTextRegions(empty, 100, 100)).toEqual([]);
    const { map, w, h } = paint(strays);
    expect(findTextRegions(map, w, h)).toEqual([]);
  });
});

describe("rankWithHeadings", () => {
  it("lets a smaller block whose first line is a heading win", () => {
    const big = paragraph(8, -280);
    const small = paragraph(5, 100, { u0: -100, u1: 100 });
    const { map, w, h } = paint([...big, ...small]);
    const regions = findTextRegions(map, w, h);
    expect(regions).toHaveLength(2);
    expect(regions[0]!.lineCount).toBe(8);
    const ranked = rankWithHeadings(regions, [false, true]);
    expect(ranked[0]!.lineCount).toBe(5);
  });
});

describe("isListHeading", () => {
  it.each(["INGREDIENTS: AQUA", "Ingrédients", "Ingredienti: aqua", "INCI:", "Zutaten"])(
    "accepts %s",
    (text) => expect(isListHeading(text)).toBe(true),
  );
  it.each(["Directions for use", "Aqua, Glycerin", ""])("rejects %s", (text) =>
    expect(isListHeading(text)).toBe(false),
  );
});
