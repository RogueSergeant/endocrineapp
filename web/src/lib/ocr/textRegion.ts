// Where the ingredient list probably is, from the detector's probability
// map, so the crop page can start its corners there instead of in a fixed
// box. Text blobs (see textAngle.ts) are straightened by the text's tilt,
// grouped into blocks of similar-sized lines set close together, and the
// blocks scored: an ingredient list is a long run of small print over
// several lines, unlike a brand name, a headline or a stray word. The
// worker can raise a block's score further when its first line reads
// "Ingredients".
import type { Quad } from "@/lib/perspective";
import { angleFromBlobs, textBlobs } from "./textAngle";

export interface TextRegionOptions {
  /** Probability above which a pixel counts as text. */
  threshold?: number;
  /** Ignore specks smaller than this many map pixels. */
  minPixels?: number;
  /** Fewer lines than this and a block isn't a list. */
  minLines?: number;
  /** Most gap between two lines of one block, in line heights. */
  lineGap?: number;
  /** Most gap between two words of one line, in line heights. */
  wordGap?: number;
  /** Most ratio between the heights of two blobs in one block. */
  heightRatio?: number;
  /** Margin added round a block, in line heights. */
  padding?: number;
}

const DEFAULTS: Required<TextRegionOptions> = {
  threshold: 0.3,
  minPixels: 12,
  minLines: 3,
  // The detector marks a shrunk core of each line, so the gap between two
  // blobs is wider than the leading printed on the pack: on PP-OCRv6 tiny
  // about twice a core's height within a paragraph, and six or more times
  // it between paragraphs.
  lineGap: 3,
  wordGap: 2.5,
  heightRatio: 1.8,
  // And the core is smaller than the letters, so the margin makes up for it.
  padding: 1.2,
};

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextRegion {
  /** Top-left, top-right, bottom-right, bottom-left, in map pixels. */
  corners: Quad;
  /** Higher is more list-like; only comparable within one map. */
  score: number;
  lineCount: number;
  /** An upright box round the block's first line, in map pixels. */
  topLine: Box;
}

/** A blob in the text's own frame: u along the lines, v down the page. */
interface Line {
  u: number;
  v: number;
  /** Half length and half height. */
  hu: number;
  hv: number;
  n: number;
}

/** Candidate blocks of text in the map, most list-like first. */
export function findTextRegions(
  prob: ArrayLike<number>,
  width: number,
  height: number,
  options: TextRegionOptions = {},
): TextRegion[] {
  const opts = { ...DEFAULTS, ...options };
  const blobs = textBlobs(prob, width, height, opts);
  if (blobs.length === 0) return [];
  const rad = ((angleFromBlobs(blobs) ?? 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Spread along a direction from the covariance; a filled bar of length L
  // has variance L^2 / 12, so its half length is sqrt(3 * variance).
  const lines: Line[] = blobs.map((b) => ({
    u: b.mx * c + b.my * s,
    v: -b.mx * s + b.my * c,
    hu: Math.sqrt(3 * Math.max(0, b.cxx * c * c + 2 * b.cxy * c * s + b.cyy * s * s)),
    hv: Math.max(
      0.5,
      Math.sqrt(3 * Math.max(0, b.cxx * s * s - 2 * b.cxy * c * s + b.cyy * c * c)),
    ),
    n: b.n,
  }));

  // Union-find over blobs that sit close enough to belong together.
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i]!;
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j]!;
      const h = Math.min(a.hv, b.hv) * 2;
      if (Math.max(a.hv, b.hv) * 2 > h * opts.heightRatio) continue;
      const gapV = Math.abs(a.v - b.v) - a.hv - b.hv;
      const gapU = Math.abs(a.u - b.u) - a.hu - b.hu;
      // Words of one line, or lines of one paragraph that overlap sideways.
      const sameLine = gapV < 0 && gapU <= h * opts.wordGap;
      const nextLine = gapU <= 0 && gapV <= h * opts.lineGap;
      if (sameLine || nextLine) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Line[]>();
  lines.forEach((l, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(l);
    else groups.set(root, [l]);
  });

  const toMap = (u: number, v: number) => ({ x: u * c - v * s, y: u * s + v * c });
  const clampPt = (p: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(width, p.x)),
    y: Math.max(0, Math.min(height, p.y)),
  });
  const halfDiagonal = Math.hypot(width, height) / 2;
  const regions: TextRegion[] = [];
  for (const group of groups.values()) {
    const heights = group.map((l) => l.hv * 2).sort((a, b) => a - b);
    const lineH = heights[Math.floor(heights.length / 2)]!;
    // Count lines by stepping down the blob centres.
    const vs = group.map((l) => l.v).sort((a, b) => a - b);
    let lineCount = 1;
    let lineV = vs[0]!;
    for (const v of vs) {
      if (v - lineV > lineH * 0.6) {
        lineCount++;
        lineV = v;
      }
    }
    if (lineCount < opts.minLines) continue;

    const pad = lineH * opts.padding;
    const u0 = Math.min(...group.map((l) => l.u - l.hu)) - pad;
    const u1 = Math.max(...group.map((l) => l.u + l.hu)) + pad;
    const v0 = Math.min(...group.map((l) => l.v - l.hv)) - pad;
    const v1 = Math.max(...group.map((l) => l.v + l.hv)) + pad;
    const corners = [toMap(u0, v0), toMap(u1, v0), toMap(u1, v1), toMap(u0, v1)].map(
      clampPt,
    ) as unknown as Quad;

    // Total length of text, so big type doesn't outscore small print.
    const textLength = group.reduce((sum, l) => sum + l.n, 0) / lineH;
    const centre = toMap((u0 + u1) / 2, (v0 + v1) / 2);
    const offCentre = Math.hypot(centre.x - width / 2, centre.y - height / 2) / halfDiagonal;
    const score = textLength * Math.sqrt(lineCount) * (1 - 0.3 * Math.min(1, offCentre));

    const first = group.filter((l) => l.v - vs[0]! <= lineH * 0.6);
    const topCorners = [
      toMap(Math.min(...first.map((l) => l.u - l.hu)) - pad, vs[0]! - lineH / 2 - pad),
      toMap(Math.max(...first.map((l) => l.u + l.hu)) + pad, vs[0]! + lineH / 2 + pad),
      toMap(Math.min(...first.map((l) => l.u - l.hu)) - pad, vs[0]! + lineH / 2 + pad),
      toMap(Math.max(...first.map((l) => l.u + l.hu)) + pad, vs[0]! - lineH / 2 - pad),
    ].map(clampPt);
    const tx = Math.min(...topCorners.map((p) => p.x));
    const ty = Math.min(...topCorners.map((p) => p.y));
    const topLine = {
      x: tx,
      y: ty,
      width: Math.max(...topCorners.map((p) => p.x)) - tx,
      height: Math.max(...topCorners.map((p) => p.y)) - ty,
    };

    regions.push({ corners, score, lineCount, topLine });
  }
  return regions.sort((a, b) => b.score - a.score);
}

// A first line that reads like the start of an ingredient list.
const HEADING = /ingr[eé]d|inci|zutaten|composi[tc]/i;

/** Whether a line of OCR text looks like an ingredient list's heading. */
export const isListHeading = (text: string): boolean => HEADING.test(text);

/** How much a heading multiplies a block's score: enough to beat a bigger block. */
const HEADING_BONUS = 3;

/** `regions` re-ranked with the bonus for each whose first line is a heading. */
export function rankWithHeadings(
  regions: readonly TextRegion[],
  headed: readonly boolean[],
): TextRegion[] {
  return regions
    .map((r, i) => (headed[i] ? { ...r, score: r.score * HEADING_BONUS } : r))
    .sort((a, b) => b.score - a.score);
}
