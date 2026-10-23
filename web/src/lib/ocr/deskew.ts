// Automatic straightening of a cropped ingredient list before OCR.
//
// The recogniser reads one axis-aligned strip per detected line. On a long
// line even a 1-2 degree tilt drifts by a full text height from one end to
// the other, so the strip catches half of the neighbouring line and the
// result is garbage. Phone photos are never perfectly level, so we estimate
// the skew with a projection profile: rotate a small copy through a range
// of angles and keep the one where the text edges fall into the sharpest
// rows (highest sum of squared row totals). Pure 2D-canvas, so it runs in the
// OCR worker and in Node tests alike.

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): Context2D | null;
}

type Context2D = Pick<
  CanvasRenderingContext2D,
  | "drawImage"
  | "fillRect"
  | "getImageData"
  | "rotate"
  | "setTransform"
  | "translate"
  | "fillStyle"
  | "imageSmoothingQuality"
>;

export type CanvasFactory = (width: number, height: number) => CanvasLike;

const ANALYSIS_SIDE = 600;
const MAX_ANGLE = 15;
const MIN_CORRECTION = 0.3;
const EDGE_STEP = 40;

function ctx2d(c: CanvasLike): Context2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return ctx;
}

/** Median luminance of a canvas, used as the "paper" colour. */
function backgroundLuma(data: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    hist[((data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000) | 0]!++;
  }
  const half = data.length / 8;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= half) return v;
  }
  return 255;
}

function profileScore(small: CanvasLike, work: CanvasLike, angleDeg: number, fill: string): number {
  const ctx = ctx2d(work);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.translate(work.width / 2, work.height / 2);
  ctx.rotate((-angleDeg * Math.PI) / 180);
  ctx.drawImage(small as unknown as CanvasImageSource, -small.width / 2, -small.height / 2);
  const { data } = ctx.getImageData(0, 0, work.width, work.height);
  // Count edge pixels (sharp luminance steps) per row rather than "dark"
  // pixels: text strokes are dense in edges whatever the label's colours,
  // while large flat regions such as the table behind a bottle add none.
  const w = work.width;
  const h = work.height;
  const luma = new Float32Array(w * h);
  for (let p = 0, i = 0; p < luma.length; p++, i += 4) {
    luma[p] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
  }
  let score = 0;
  for (let y = 1; y < h; y++) {
    let row = 0;
    for (let x = 1, p = y * w + 1; x < w; x++, p++) {
      const l = luma[p]!;
      if (Math.abs(l - luma[p - 1]!) > EDGE_STEP || Math.abs(l - luma[p - w]!) > EDGE_STEP) row++;
    }
    score += row * row;
  }
  return score;
}

/** Estimated clockwise tilt of the text, in degrees (positive = rotated clockwise). */
export function estimateSkew(source: CanvasLike, createCanvas: CanvasFactory): number {
  const scale = Math.min(1, ANALYSIS_SIDE / Math.max(source.width, source.height));
  const sw = Math.max(1, Math.round(source.width * scale));
  const sh = Math.max(1, Math.round(source.height * scale));
  const small = createCanvas(sw, sh);
  const sctx = ctx2d(small);
  sctx.drawImage(source as unknown as CanvasImageSource, 0, 0, sw, sh);
  const paper = backgroundLuma(sctx.getImageData(0, 0, sw, sh).data);
  const fill = `rgb(${paper},${paper},${paper})`;
  // Square work canvas large enough for any rotation of `small`.
  const side = Math.ceil(Math.hypot(sw, sh));
  const work = createCanvas(side, side);

  const search = (from: number, to: number, step: number) => {
    let best = 0;
    let bestScore = -1;
    for (let a = from; a <= to + 1e-9; a += step) {
      const s = profileScore(small, work, a, fill);
      if (s > bestScore) {
        bestScore = s;
        best = a;
      }
    }
    return best;
  };

  const coarse = search(-MAX_ANGLE, MAX_ANGLE, 1);
  return search(coarse - 1, coarse + 1, 0.2);
}

/**
 * Returns a levelled copy of `source` (or `source` itself when it is
 * already straight enough), padded with the paper colour.
 */
export function deskew<C extends CanvasLike>(
  source: C,
  createCanvas: (width: number, height: number) => C,
): { canvas: C; angle: number } {
  const angle = estimateSkew(source, createCanvas);
  if (Math.abs(angle) < MIN_CORRECTION) return { canvas: source, angle: 0 };
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = Math.ceil(source.width * cos + source.height * sin);
  const h = Math.ceil(source.width * sin + source.height * cos);
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  const paper = backgroundLuma(ctx2d(source).getImageData(0, 0, source.width, source.height).data);
  ctx.fillStyle = `rgb(${paper},${paper},${paper})`;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-rad);
  ctx.drawImage(source as unknown as CanvasImageSource, -source.width / 2, -source.height / 2);
  return { canvas: out, angle };
}
