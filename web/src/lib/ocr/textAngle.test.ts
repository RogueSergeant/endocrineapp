import { textAngleFromMap } from "./textAngle";

/** A fake probability map: `lines` rows of word blobs tilted by `angle` degrees. */
function fakeMap(angle: number, { w = 480, h = 320, lines = 6, wordGap = 10 } = {}) {
  const map = new Float32Array(w * h);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let line = 0; line < lines; line++) {
    const y0 = -110 + line * 40;
    let x0 = -200;
    while (x0 < 190) {
      const len = 30 + rand() * 60;
      // Rasterise a len x 10 word box rotated about the image centre.
      for (let u = x0; u < x0 + len; u += 0.5) {
        for (let v = y0; v < y0 + 10; v += 0.5) {
          const x = Math.round(w / 2 + u * cos - v * sin);
          const y = Math.round(h / 2 + u * sin + v * cos);
          if (x >= 0 && x < w && y >= 0 && y < h) map[y * w + x] = 0.9;
        }
      }
      x0 += len + wordGap;
    }
  }
  return { map, w, h };
}

describe("textAngleFromMap", () => {
  it.each([-10, -5, -1.5, 0, 0.8, 3, 7])("recovers a %s degree tilt", (angle) => {
    const { map, w, h } = fakeMap(angle);
    expect(Math.abs(textAngleFromMap(map, w, h)! - angle)).toBeLessThanOrEqual(0.3);
  });

  it("reads whole-line blobs the same as word blobs", () => {
    const { map, w, h } = fakeMap(4, { wordGap: 0 });
    expect(Math.abs(textAngleFromMap(map, w, h)! - 4)).toBeLessThanOrEqual(0.3);
  });

  it("ignores a large non-text blob", () => {
    const { map, w, h } = fakeMap(-3);
    // A solid square (e.g. a logo the detector half-scored as text).
    for (let y = 250; y < 310; y++) for (let x = 20; x < 80; x++) map[y * w + x] = 0.9;
    expect(Math.abs(textAngleFromMap(map, w, h)! + 3)).toBeLessThanOrEqual(0.3);
  });

  it("returns null when there is too little text", () => {
    const w = 100;
    const h = 100;
    expect(textAngleFromMap(new Float32Array(w * h), w, h)).toBeNull();
  });
});
