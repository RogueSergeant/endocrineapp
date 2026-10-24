// Joining several photos of one ingredient list. On a small round bottle
// the list wraps round the curve and no single photo shows it all, so the
// user turns the bottle and takes a few overlapping photos. Each reading
// has the same lines, each showing a window of them: the end of a line in
// one photo repeats at the start of the same line in the next. Both
// readings garble the overlap near their own edges, where the label curves
// away, so the overlap is found by fuzzy alignment (as overlapping DNA
// reads are assembled) and the join is made in its middle, taking each
// side from the photo that saw it nearer its centre.

/** Characters compare case-insensitively, and punctuation and spaces all alike. */
function key(c: string): string {
  return /[\p{L}\p{N}]/u.test(c) ? c.toLowerCase() : " ";
}

const MATCH = 1;
const MISMATCH = -1;
const GAP = -1;
/**
 * An overlap must net at least this many matching characters to count. It
 * is low because the edges are garbled and the pairing of lines (below)
 * weighs every overlap against the others in the same two photos: a chance
 * match between unrelated lines can't outweigh the true pairs around it.
 */
const MIN_OVERLAP_SCORE = 3;
/**
 * Characters at the very edge of a photo (the end of `a`'s line, the start
 * of `b`'s) that may be skipped free: the word cut off by the photo's edge
 * or curving out of view is usually garbled ("Silica Siyaa").
 */
const EDGE = 10;

export interface Overlap {
  score: number;
  /** Join point: `a` up to here, then `b` from `bCut`. */
  aCut: number;
  bCut: number;
}

/**
 * The best overlap of the end of `a` with the start of `b` (a semi-global
 * alignment: free to start anywhere in `a`, free to end anywhere in `b`,
 * and free to skip a garbled edge of either), or null when there is none
 * worth trusting.
 */
export function findOverlap(a: string, b: string): Overlap | null {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return null;
  const ka = [...a].map(key);
  const kb = [...b].map(key);
  // dp[i][j]: best score of an alignment ending at a[i-1], b[j-1] whose
  // start in `a` is free; b must be aligned from its first character.
  const dp: Float64Array[] = [];
  const from: Uint8Array[] = []; // 1 diagonal, 2 up (gap in b), 3 left (gap in a)
  for (let i = 0; i <= n; i++) {
    dp.push(new Float64Array(m + 1));
    from.push(new Uint8Array(m + 1));
  }
  for (let j = 1; j <= m; j++) {
    dp[0]![j] = j <= EDGE ? 0 : (j - EDGE) * GAP;
    from[0]![j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1]![j - 1]! + (ka[i - 1] === kb[j - 1] ? MATCH : MISMATCH);
      const up = dp[i - 1]![j]! + GAP;
      const left = dp[i]![j - 1]! + GAP;
      const best = Math.max(diag, up, left);
      dp[i]![j] = best;
      from[i]![j] = best === diag ? 1 : best === up ? 2 : 3;
    }
  }
  // `a` is used to its end, bar a garbled edge; `b` may carry on past the
  // overlap.
  let bestI = n;
  let bestJ = 0;
  for (let i = Math.max(1, n - EDGE); i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (dp[i]![j]! > dp[bestI]![bestJ]! || bestJ === 0) {
        bestI = i;
        bestJ = j;
      }
    }
  }
  const score = dp[bestI]![bestJ]!;
  if (bestJ === 0 || score < MIN_OVERLAP_SCORE) return null;
  // Trace back to the aligned pairs, then cut at the middle one.
  const path: [number, number][] = [];
  let i = bestI;
  let j = bestJ;
  while (j > 0 && i > 0) {
    const f = from[i]![j];
    if (f === 1) path.push([i - 1, j - 1]);
    if (f === 1 || f === 2) i--;
    if (f === 1 || f === 3) j--;
    // Column 0 means the alignment started at a[i]: stop.
  }
  path.reverse();
  if (path.length === 0) return null;
  const [ai, bj] = path[Math.floor(path.length / 2)]!;
  return { score, aCut: ai, bCut: bj };
}

/** Join two readings of one line, or null when they don't overlap. */
export function joinLine(a: string, b: string): { text: string; score: number } | null {
  const o = findOverlap(a, b);
  if (!o) return null;
  return { text: (a.slice(0, o.aCut) + b.slice(o.bCut)).replace(/\s{2,}/g, " "), score: o.score };
}

/**
 * Join two multi-line readings: pair their lines in order (a line may have
 * no partner, when one photo caught a line the other cut off), choosing
 * the pairing with the strongest overlaps, and join each pair.
 */
function mergeTwo(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const joins = a.map((la) => b.map((lb) => joinLine(la, lb)));
  // Best monotonic pairing of lines (like aligning two sequences of lines).
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const pair = joins[i]![j] ? joins[i]![j]!.score + best[i + 1]![j + 1]! : -Infinity;
      best[i]![j] = Math.max(pair, best[i + 1]![j]!, best[i]![j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m) {
      const join = joins[i]![j];
      if (join && join.score + best[i + 1]![j + 1]! === best[i]![j]!) {
        out.push(join.text);
        i++;
        j++;
        continue;
      }
      if (best[i + 1]![j]! >= best[i]![j + 1]!) out.push(a[i++]!);
      else out.push(b[j++]!);
    } else if (i < n) {
      out.push(a[i++]!);
    } else {
      out.push(b[j++]!);
    }
  }
  return out;
}

/**
 * One reading from several overlapping photos of the same list, taken left
 * to right. Each reading is the OCR text of one photo, a line per line.
 */
export function mergeReadings(readings: readonly string[]): string {
  const lines = readings.map((r) => r.split("\n").filter((l) => l.trim()));
  let merged = lines[0] ?? [];
  for (const next of lines.slice(1)) merged = mergeTwo(merged, next);
  return merged.join("\n");
}
