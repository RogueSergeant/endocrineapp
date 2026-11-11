// Reading lines that bow round a jar, tub or bottle. The detector's
// probability map shows each printed line as its own band even when the
// line curves, but ppu-paddle-ocr turns every band into an upright box.
// On a curved label that box is as tall as the line's bow, so it takes in
// two or three lines at once and the recogniser reads nothing useful.
// Here each band is followed column by column instead: its centreline is
// traced from the map, bands that are words of one line are chained
// together, and the line is then cut out of the photo along that path,
// column by column, into a flat strip the recogniser reads like any other.

export interface TracedLine {
  /** First and one-past-last map column the line covers. */
  x0: number;
  x1: number;
  /** Centre of the line in each column from x0, in map pixels. */
  centres: Float32Array;
  /** Thickness of the detector's band (the shrunk core of the letters), in map pixels. */
  thickness: number;
  /**
   * Distance to the nearest line above or below, centre to centre, in map
   * pixels; Infinity when the line has no neighbour.
   */
  spacing: number;
}

export interface TraceOptions {
  /** Probability above which a map pixel counts as text. */
  threshold?: number;
  /** Ignore bands smaller than this many map pixels. */
  minPixels?: number;
  /** Most gap between two words of one line, in band thicknesses. */
  wordGap?: number;
  /** Most step between two words of one line, in band thicknesses. */
  step?: number;
}

const DEFAULTS: Required<TraceOptions> = {
  threshold: 0.3,
  minPixels: 12,
  wordGap: 3,
  step: 0.6,
};

interface Band {
  x0: number;
  x1: number;
  /** Centre per column (NaN where the column has no pixels). */
  centres: Float32Array;
  thickness: number;
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!;
};

/** Fills NaN gaps by joining their neighbours with a straight line. */
function fillGaps(values: Float32Array): void {
  let last = -1;
  for (let i = 0; i < values.length; i++) {
    if (Number.isNaN(values[i]!)) continue;
    if (last < 0) values.fill(values[i]!, 0, i);
    else if (i - last > 1) {
      const a = values[last]!;
      const b = values[i]!;
      for (let k = last + 1; k < i; k++) values[k] = a + ((b - a) * (k - last)) / (i - last);
    }
    last = i;
  }
  if (last >= 0) values.fill(values[last]!, last + 1);
}

/**
 * Moving average over `radius` columns either side, narrowing towards the
 * ends so the window stays centred: a one-sided window would flatten the
 * slope at the ends, and the ends are where the next word is joined on.
 */
function smooth(values: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(values.length);
  const last = values.length - 1;
  for (let i = 0; i <= last; i++) {
    const r = Math.min(radius, i, last - i);
    let s = 0;
    for (let j = i - r; j <= i + r; j++) s += values[j]!;
    out[i] = s / (2 * r + 1);
  }
  return out;
}

/** Every 4-connected band of the map, with its centre in each column. */
function findBands(
  prob: ArrayLike<number>,
  width: number,
  height: number,
  threshold: number,
  minPixels: number,
): Band[] {
  const label = new Int32Array(width * height).fill(-1);
  const stack = new Int32Array(width * height);
  const bands: Band[] = [];
  let next = 0;
  for (let start = 0; start < width * height; start++) {
    if (label[start]! >= 0 || prob[start]! <= threshold) continue;
    const id = next++;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    let n = 0;
    let x0 = width;
    let x1 = -1;
    const members: number[] = [];
    while (top > 0) {
      const p = stack[--top]!;
      members.push(p);
      const x = p % width;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      const push = (q: number) => {
        if (label[q]! < 0 && prob[q]! > threshold) {
          label[q] = id;
          stack[top++] = q;
        }
      };
      const y = (p - x) / width;
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (y > 0) push(p - width);
      if (y < height - 1) push(p + width);
    }
    if (n < minPixels) continue;
    const cols = x1 - x0 + 1;
    const sum = new Float64Array(cols);
    const count = new Int32Array(cols);
    for (const p of members) {
      const x = p % width;
      const c = x - x0;
      sum[c] = sum[c]! + (p - x) / width;
      count[c] = count[c]! + 1;
    }
    const centres = new Float32Array(cols);
    const counts: number[] = [];
    for (let c = 0; c < cols; c++) {
      centres[c] = count[c]! > 0 ? sum[c]! / count[c]! + 0.5 : NaN;
      if (count[c]! > 0) counts.push(count[c]!);
    }
    const thickness = Math.max(1, median(counts));
    fillGaps(centres);
    bands.push({
      x0,
      x1: x1 + 1,
      centres: smooth(centres, Math.max(1, Math.round(thickness))),
      thickness,
    });
  }
  return bands;
}

/** Where a band's centreline would be at column `x`, carried on straight past its ends. */
function centreAt(band: Band, x: number): number {
  const c = band.centres;
  const i = x - band.x0;
  if (i >= 0 && i < c.length) return c[i]!;
  // Extend along the slope of the last few columns.
  const span = Math.min(c.length - 1, Math.max(1, Math.round(band.thickness * 2)));
  if (span < 1) return c[0]!;
  if (i < 0) return c[0]! + ((c[0]! - c[span]!) / span) * -i;
  const end = c.length - 1;
  return c[end]! + ((c[end]! - c[end - span]!) / span) * (i - end);
}

/**
 * The text lines in a detection probability map, each followed along its
 * own centreline however it curves, top to bottom.
 */
export function traceLines(
  prob: ArrayLike<number>,
  width: number,
  height: number,
  options: TraceOptions = {},
): TracedLine[] {
  const opts = { ...DEFAULTS, ...options };
  const bands = findBands(prob, width, height, opts.threshold, opts.minPixels).sort(
    (a, b) => a.x0 - b.x0,
  );
  // Chain each band to the nearest band that carries on from its right
  // end at the same height: the next word of the same line.
  const nextOf = new Array<number>(bands.length).fill(-1);
  const taken = new Array<boolean>(bands.length).fill(false);
  bands.forEach((a, i) => {
    let best = -1;
    let bestCost = Infinity;
    bands.forEach((b, j) => {
      if (j === i || taken[j]) return;
      // A short word at the edge of a curve, seen side on, can show as a
      // band half as thick as the rest of its line, and a fragment of one
      // (a letter or two the detector split off) thinner still.
      const t = Math.max(a.thickness, b.thickness);
      const thinner = a.thickness < b.thickness ? a : b;
      const fragment = thinner.x1 - thinner.x0 < t * 3;
      if (!fragment && t > thinner.thickness * 2.5) return;
      const gap = b.x0 - a.x1;
      if (gap < -t || gap > t * opts.wordGap) return;
      // Compare the two where the gap is, each carried on along its slope.
      const meet = Math.round((a.x1 - 1 + b.x0) / 2);
      const step = Math.abs(centreAt(a, meet) - centreAt(b, meet));
      if (step > t * opts.step) return;
      const cost = Math.max(0, gap) + step * 4;
      if (cost < bestCost) {
        bestCost = cost;
        best = j;
      }
    });
    if (best >= 0) {
      nextOf[i] = best;
      taken[best] = true;
    }
  });

  const lines: TracedLine[] = [];
  bands.forEach((first, i) => {
    if (taken[i]) return;
    const chain: Band[] = [first];
    for (let k = nextOf[i]!; k >= 0; k = nextOf[k]!) chain.push(bands[k]!);
    const x0 = chain[0]!.x0;
    const x1 = Math.max(...chain.map((b) => b.x1));
    const centres = new Float32Array(x1 - x0).fill(NaN);
    for (const b of chain) {
      for (let x = b.x0; x < b.x1; x++) {
        // Where two words overlap, keep the first's centre.
        if (Number.isNaN(centres[x - x0]!)) centres[x - x0] = b.centres[x - b.x0]!;
      }
    }
    fillGaps(centres);
    const thickness = median(chain.map((b) => b.thickness));
    lines.push({ x0, x1, centres, thickness, spacing: Infinity });
  });
  const kept = dropSplinters(lines).sort(readingOrder);
  measureSpacing(kept);
  return kept;
}

/**
 * Sets each line's spacing: the median, over the columns it shares with
 * another line, of the distance to the nearest line above or below there.
 */
function measureSpacing(lines: TracedLine[]): void {
  for (const l of lines) {
    const gaps: number[] = [];
    const stride = Math.max(1, Math.round(l.thickness));
    for (let x = l.x0; x < l.x1; x += stride) {
      const y = l.centres[x - l.x0]!;
      let nearest = Infinity;
      for (const m of lines) {
        if (m === l || x < m.x0 || x >= m.x1) continue;
        const d = Math.abs(m.centres[x - m.x0]! - y);
        // A line closer than its own thickness is a sliver of this one.
        if (d >= l.thickness && d < nearest) nearest = d;
      }
      if (Number.isFinite(nearest)) gaps.push(nearest);
    }
    l.spacing = gaps.length > 0 ? median(gaps) : Infinity;
  }
}

/**
 * Lines that lie along part of a longer line, within its thickness: the
 * detector sometimes splits a sliver off a band (where a crop edge cuts
 * the letters, say), and the longer line's strip already holds it.
 */
function dropSplinters(lines: TracedLine[]): TracedLine[] {
  const at = (l: TracedLine, x: number) =>
    l.centres[Math.max(0, Math.min(l.centres.length - 1, x - l.x0))]!;
  return lines.filter((l) => {
    const length = l.x1 - l.x0;
    return !lines.some((m) => {
      if (m === l || m.x1 - m.x0 <= length) return false;
      const lo = Math.max(l.x0, m.x0);
      const hi = Math.min(l.x1, m.x1);
      if (hi - lo < length * 0.8) return false;
      const x = Math.floor((lo + hi) / 2);
      return Math.abs(at(l, x) - at(m, x)) < Math.max(l.thickness, m.thickness);
    });
  });
}

/**
 * Top to bottom. On a curve a short line at one end sits higher or lower
 * than a long line's middle, so lines that overlap are compared where they
 * overlap; lines side by side are compared by their middles.
 */
function readingOrder(a: TracedLine, b: TracedLine): number {
  const lo = Math.max(a.x0, b.x0);
  const hi = Math.min(a.x1, b.x1);
  const at = (l: TracedLine, x: number) => l.centres[Math.min(l.centres.length - 1, x - l.x0)]!;
  if (hi > lo) {
    const x = Math.floor((lo + hi) / 2);
    return at(a, x) - at(b, x) || a.x0 - b.x0;
  }
  const mid = (l: TracedLine) => l.centres[Math.floor(l.centres.length / 2)]!;
  return mid(a) - mid(b) || a.x0 - b.x0;
}

/**
 * Whether the lines bow or slope enough that upright boxes round them
 * would take in their neighbours: a quarter or more of the long lines
 * bow by more than their own thickness, or still slope by half as much
 * again after deskewing (perspective gives each line its own slope).
 */
export function linesAreCurved(lines: readonly TracedLine[]): boolean {
  const long = lines.filter((l) => l.x1 - l.x0 >= l.thickness * 10);
  if (long.length < 2) return false;
  // The bow is measured from the straight line between the ends, apart
  // from any slope.
  const bowed = long.filter((l) => {
    const c = l.centres;
    const n = c.length - 1;
    let most = 0;
    for (let i = 0; i <= n; i++) {
      const chord = c[0]! + ((c[n]! - c[0]!) * i) / n;
      most = Math.max(most, Math.abs(c[i]! - chord));
    }
    const tilt = Math.abs(c[n]! - c[0]!);
    return most > l.thickness || tilt > l.thickness * 1.5;
  });
  return bowed.length * 4 >= long.length;
}

/** The pixels of an image, RGBA as ImageData has them. */
export interface Pixels {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

export interface StraightenOptions {
  /** Strip height, in band thicknesses: the band is a shrunk core of the letters. */
  heightRatio?: number;
  /**
   * Most strip height, in line spacings: on tightly set lists a strip any
   * taller takes in the lines either side.
   */
  spacingRatio?: number;
  /** Margin added at each end, in band thicknesses. */
  endMargin?: number;
}

/**
 * `line` (traced on a map `scale` times the size of `src`) cut out of
 * `src` along its centreline into a level strip, or null if it is too
 * small to read. Each column is shifted on its own, sampled between rows.
 */
export function straightenLine(
  src: { data: ArrayLike<number>; width: number; height: number },
  line: TracedLine,
  scale: number,
  { heightRatio = 3, spacingRatio = 1.1, endMargin = 1 }: StraightenOptions = {},
): Pixels | null {
  const thick = line.thickness / scale;
  const h = Math.max(
    8,
    Math.round(Math.min(thick * heightRatio, (line.spacing / scale) * spacingRatio)),
  );
  const margin = thick * endMargin;
  const left = Math.max(0, Math.floor(line.x0 / scale - margin));
  const right = Math.min(src.width, Math.ceil(line.x1 / scale + margin));
  const w = right - left;
  if (w < 8) return null;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let x = 0; x < w; x++) {
    const sx = left + x;
    // The map column covering this photo column.
    const mx = (sx + 0.5) * scale - 0.5;
    const m0 = Math.floor(mx);
    const f = mx - m0;
    const cy = (centreAt(line, m0) * (1 - f) + centreAt(line, m0 + 1) * f) / scale;
    const top = cy - h / 2;
    for (let y = 0; y < h; y++) {
      const fy = top + y;
      const y0 = Math.floor(fy);
      const t = fy - y0;
      const o = (y * w + x) * 4;
      const ya = Math.min(src.height - 1, Math.max(0, y0));
      const yb = Math.min(src.height - 1, Math.max(0, y0 + 1));
      const ia = (ya * src.width + sx) * 4;
      const ib = (yb * src.width + sx) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = src.data[ia + k]! * (1 - t) + src.data[ib + k]! * t;
    }
  }
  return { data, width: w, height: h };
}
