import { createCanvas } from "@napi-rs/canvas";
import { deskew, estimateSkew, type CanvasLike } from "./deskew";

const factory = (w: number, h: number) => createCanvas(w, h) as unknown as CanvasLike;

/** A paragraph of fake "words" (dark dashes) on a label, tilted by `angle` degrees. */
function fakeLabel(angle: number, ink = "#222", paper = "#f4efe6"): CanvasLike {
  const c = createCanvas(900, 500);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3a3f47";
  ctx.fillRect(0, 0, 900, 500);
  ctx.translate(450, 250);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.fillStyle = paper;
  ctx.fillRect(-400, -200, 800, 400);
  ctx.fillStyle = ink;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let line = 0; line < 8; line++) {
    let x = -370;
    const y = -170 + line * 42;
    while (x < 360) {
      const w = 20 + rand() * 70;
      ctx.fillRect(x, y, Math.min(w, 370 - x), 16);
      x += w + 10;
    }
  }
  return c as unknown as CanvasLike;
}

/**
 * A tight crop of a tilted label: a dark heading bar runs off the top
 * edge and text lines run off the bottom and sides, so the crop's own
 * border cuts through ink. That border is level whatever the text's tilt.
 */
function tightCrop(angle: number): CanvasLike {
  const c = createCanvas(480, 300);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e8e4dc";
  ctx.fillRect(0, 0, 480, 300);
  ctx.translate(240, 150);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.fillStyle = "#2a2d33";
  ctx.fillRect(-400, -175, 800, 45);
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let line = 0; line < 8; line++) {
    let x = -300;
    const y = -105 + line * 32;
    while (x < 300) {
      const w = 15 + rand() * 50;
      ctx.fillRect(x, y, w, 13);
      x += w + 8;
    }
  }
  return c as unknown as CanvasLike;
}

describe("estimateSkew", () => {
  it.each([-4, 3, 5])("ignores the crop border on a tight %s degree crop", (angle) => {
    expect(Math.abs(estimateSkew(tightCrop(angle), factory) - angle)).toBeLessThanOrEqual(0.5);
  });

  it.each([-8, -4, -1.5, 0.6, 2, 5, 10])("recovers a %s degree tilt", (angle) => {
    expect(Math.abs(estimateSkew(fakeLabel(angle), factory) - angle)).toBeLessThanOrEqual(0.3);
  });

  it("works for light text on a dark label", () => {
    expect(
      Math.abs(estimateSkew(fakeLabel(3, "#eee", "#1a1a1a"), factory) - 3),
    ).toBeLessThanOrEqual(0.3);
  });
});

describe("deskew", () => {
  it("leaves a level image untouched", () => {
    const src = fakeLabel(0);
    const { canvas, angle } = deskew(src, factory);
    expect(angle).toBe(0);
    expect(canvas).toBe(src);
  });

  it("returns a larger, levelled canvas for a tilted image", () => {
    const src = fakeLabel(4);
    const { canvas, angle } = deskew(src, factory);
    expect(angle).toBeCloseTo(4, 0);
    expect(canvas.width).toBeGreaterThan(src.width);
    expect(Math.abs(estimateSkew(canvas, factory))).toBeLessThanOrEqual(0.3);
  });

  it("pads the rotated corners with the paper colour", () => {
    const { canvas } = deskew(fakeLabel(6), factory);
    const [r, g, b] = canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data;
    // Paper #f4efe6 has luminance 239; the padding is that grey.
    for (const c of [r, g, b]) expect(Math.abs(c! - 239)).toBeLessThanOrEqual(2);
  });
});
