// Automatic straightening of a cropped ingredient list before OCR.
//
// The recogniser reads one axis-aligned strip per detected line. On a long
// line even a 1-2 degree tilt drifts by a full text height from one end to
// the other, so the strip catches half of the neighbouring line and the
// result is garbage. Phone photos are never perfectly level, so we estimate
// the skew with a projection profile: rotate a small copy through a range
// of angles and keep the one where the text edges fall into the sharpest
// rows (highest variance of per-row edge energy). Pure 2D-canvas, so it runs in the
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
  | "imageSmoothingEnabled"
  | "imageSmoothingQuality"
>;

export type CanvasFactory = (width: number, height: number) => CanvasLike;

const ANALYSIS_SIDE = 600;
const MAX_ANGLE = 15;
const MIN_CORRECTION = 0.3;
// Pixels; covers the anti-aliased image edge plus the neighbour each step reads.
const BORDER_MARGIN = 3;

function ctx2d(c: CanvasLike): Context2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return ctx;
}

/** Median luminance of pixel data, used as the "paper" colour. */
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

/** `luma` is a reusable buffer of work.width * work.height, so a search allocates it once. */
function profileScore(
  small: CanvasLike,
  work: CanvasLike,
  luma: Float32Array,
  angleDeg: number,
  fill: string,
): number {
  const ctx = ctx2d(work);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.translate(work.width / 2, work.height / 2);
  ctx.rotate((-angleDeg * Math.PI) / 180);
  ctx.drawImage(small as unknown as CanvasImageSource, -small.width / 2, -small.height / 2);
  const { data } = ctx.getImageData(0, 0, work.width, work.height);
  // Score how strongly the edge energy (luminance steps, so dark-on-light
  // and light-on-dark both count, and flat regions add nothing) is
  // concentrated into rows: when the text is level, rows through a line
  // are full of strokes and rows between lines are empty. Summing step
  // sizes rather than counting steps over a threshold matters on dim,
  // low-contrast photos, where a threshold sits right at the text's
  // contrast and small resampling differences flip pixels across it.
  const w = work.width;
  const h = work.height;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    luma[p] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
  }
  // Only pixels well inside the rotated image count. Where the image meets
  // the padding there is a step all along its border, and at 0 degrees the
  // top and bottom borders are level rows of edges that can outscore the
  // text on a tight crop.
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const halfW = small.width / 2 - BORDER_MARGIN;
  const halfH = small.height / 2 - BORDER_MARGIN;
  const cx = w / 2;
  const cy = h / 2;
  const minPixels = Math.max(4, small.width * 0.1);
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = 1; y < h; y++) {
    let energy = 0;
    let pixels = 0;
    const dy = y - cy;
    for (let x = 1, p = y * w + 1; x < w; x++, p++) {
      // Inverse of the drawing rotation: this pixel's position in `small`.
      const dx = x - cx;
      const u = dx * cos - dy * sin;
      const v = dx * sin + dy * cos;
      if (u <= -halfW || u >= halfW || v <= -halfH || v >= halfH) continue;
      const l = luma[p]!;
      energy += Math.abs(l - luma[p - 1]!) + Math.abs(l - luma[p - w]!);
      pixels++;
    }
    // Per-pixel mean, so rows clipped short by the rotated corners compare
    // fairly with full-width ones.
    if (pixels < minPixels) continue;
    const mean = energy / pixels;
    n++;
    sum += mean;
    sumSq += mean * mean;
  }
  // Variance of the row means.
  return n > 1 ? sumSq / n - (sum / n) ** 2 : 0;
}

/**
 * Paper luminance from a nearest-neighbour sample of the source. A smoothed
 * downscale blends text into the paper and reads too dark, and reading the
 * full-resolution image costs megabytes; sampling keeps real pixel values.
 */
function paperLuma(source: CanvasLike, sw: number, sh: number, createCanvas: CanvasFactory) {
  const sample = createCanvas(sw, sh);
  const ctx = ctx2d(sample);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source as unknown as CanvasImageSource, 0, 0, sw, sh);
  return backgroundLuma(ctx.getImageData(0, 0, sw, sh).data);
}

/** Tilt plus the paper luminance, measured on downscaled copies. */
function estimate(
  source: CanvasLike,
  createCanvas: CanvasFactory,
): { angle: number; paper: number } {
  const scale = Math.min(1, ANALYSIS_SIDE / Math.max(source.width, source.height));
  const sw = Math.max(1, Math.round(source.width * scale));
  const sh = Math.max(1, Math.round(source.height * scale));
  const small = createCanvas(sw, sh);
  const sctx = ctx2d(small);
  sctx.drawImage(source as unknown as CanvasImageSource, 0, 0, sw, sh);
  const paper = paperLuma(source, sw, sh, createCanvas);
  const fill = `rgb(${paper},${paper},${paper})`;
  // Square work canvas large enough for any rotation of `small`.
  const side = Math.ceil(Math.hypot(sw, sh));
  const work = createCanvas(side, side);
  const luma = new Float32Array(side * side);

  const search = (from: number, to: number, step: number) => {
    let best = 0;
    let bestScore = -1;
    for (let a = from; a <= to + 1e-9; a += step) {
      const s = profileScore(small, work, luma, a, fill);
      if (s > bestScore) {
        bestScore = s;
        best = a;
      }
    }
    return best;
  };

  const coarse = search(-MAX_ANGLE, MAX_ANGLE, 1);
  return { angle: search(coarse - 1, coarse + 1, 0.2), paper };
}

function paperOf(source: CanvasLike, createCanvas: CanvasFactory): number {
  const scale = Math.min(1, ANALYSIS_SIDE / Math.max(source.width, source.height));
  const sw = Math.max(1, Math.round(source.width * scale));
  const sh = Math.max(1, Math.round(source.height * scale));
  return paperLuma(source, sw, sh, createCanvas);
}

/** Estimated clockwise tilt of the text, in degrees (positive = rotated clockwise). */
export function estimateSkew(source: CanvasLike, createCanvas: CanvasFactory): number {
  return estimate(source, createCanvas).angle;
}

/**
 * Returns a levelled copy of `source` (or `source` itself when it is
 * already straight enough), padded with the paper colour. `knownAngle`
 * skips the estimate, e.g. when the text detector has measured the tilt.
 */
export function deskew<C extends CanvasLike>(
  source: C,
  createCanvas: (width: number, height: number) => C,
  knownAngle?: number,
): { canvas: C; angle: number } {
  const { angle, paper } =
    knownAngle === undefined
      ? estimate(source, createCanvas)
      : { angle: knownAngle, paper: paperOf(source, createCanvas) };
  if (Math.abs(angle) < MIN_CORRECTION) return { canvas: source, angle: 0 };
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = Math.ceil(source.width * cos + source.height * sin);
  const h = Math.ceil(source.width * sin + source.height * cos);
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  ctx.fillStyle = `rgb(${paper},${paper},${paper})`;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-rad);
  ctx.drawImage(source as unknown as CanvasImageSource, -source.width / 2, -source.height / 2);
  return { canvas: out, angle };
}
