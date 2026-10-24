// Following a text line across a curved surface. On a jar or bottle the
// lines bow, so the upright box around one takes in the bottom of the
// line above and the top of the line below, and the recogniser, shown
// half of three lines, reads nothing. The detector's probability map
// still shows the line as its own band: this traces the band's centre,
// strip by strip, so the line can be cut out along its own path.

export interface MapBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Centreline {
  /** Width of each strip, in map pixels. */
  strip: number;
  /** Centre of the line in each strip, left to right, in map pixels. */
  centres: number[];
}

/** Rows of `map` inside `box` where the line could be, summed per strip and lightly smoothed. */
function stripProfile(
  map: ArrayLike<number>,
  width: number,
  x0: number,
  x1: number,
  top: number,
  bottom: number,
  smooth: number,
): number[] {
  const rows: number[] = [];
  for (let y = top; y < bottom; y++) {
    let s = 0;
    for (let x = x0; x < x1; x++) s += map[y * width + x]!;
    rows.push(s);
  }
  return rows.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - smooth); j <= Math.min(rows.length - 1, i + smooth); j++) {
      s += rows[j]!;
      n++;
    }
    return s / n;
  });
}

/**
 * The bands of a profile, as the weighted centre (row offset) of each run
 * of rows at least half as strong as the strongest: a line shows as a
 * flat-topped band, so its centre, not a peak, is where the line runs.
 */
function bands(profile: number[]): number[] {
  const max = Math.max(...profile);
  if (max <= 0) return [];
  const out: number[] = [];
  let mass = 0;
  let moment = 0;
  profile.forEach((v, i) => {
    if (v >= 0.5 * max) {
      mass += v;
      moment += v * i;
    } else if (mass > 0) {
      out.push(moment / mass);
      mass = 0;
      moment = 0;
    }
  });
  if (mass > 0) out.push(moment / mass);
  return out;
}

/**
 * The centre of the text line in `box`, or null when the map shows no
 * clear line there. `textHeight` is a typical line's height in map pixels.
 */
export function traceCentreline(
  map: ArrayLike<number>,
  width: number,
  height: number,
  box: MapBox,
  textHeight: number,
): Centreline | null {
  const strip = Math.max(3, Math.round(textHeight / 2));
  const reach = textHeight * 0.6;
  const top = Math.max(0, Math.floor(box.y0 - textHeight * 0.25));
  const bottom = Math.min(height, Math.ceil(box.y1 + textHeight * 0.25));
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(width, Math.ceil(box.x1));
  if (bottom - top < 3 || x1 - x0 < strip) return null;
  const smooth = Math.max(1, Math.round(textHeight / 6));
  const candidates: number[][] = [];
  for (let sx = x0; sx < x1; sx += strip) {
    const p = stripProfile(map, width, sx, Math.min(x1, sx + strip), top, bottom, smooth);
    candidates.push(bands(p).map((i) => top + i));
  }
  // Start where a band sits closest to the box's centre: the strip where
  // this line, not a neighbour, is surely what the box was drawn around.
  const centre = (box.y0 + box.y1) / 2;
  let start = -1;
  let startY = 0;
  candidates.forEach((ys, k) => {
    for (const y of ys) {
      if (start < 0 || Math.abs(y - centre) < Math.abs(startY - centre)) {
        start = k;
        startY = y;
      }
    }
  });
  if (start < 0 || Math.abs(startY - centre) > reach) return null;

  // Follow the nearest band outward, so the trace stays on its own band.
  const centres = new Array<number>(candidates.length).fill(NaN);
  centres[start] = startY;
  for (const dir of [-1, 1]) {
    let prev = startY;
    for (let k = start + dir; k >= 0 && k < candidates.length; k += dir) {
      let best = NaN;
      for (const y of candidates[k]!) {
        if (
          Math.abs(y - prev) <= reach &&
          (Number.isNaN(best) || Math.abs(y - prev) < Math.abs(best - prev))
        )
          best = y;
      }
      if (!Number.isNaN(best)) {
        centres[k] = best;
        prev = best;
      }
    }
  }
  // Strips with no clear band (gaps between words) take their neighbours' line.
  for (let k = 0; k < centres.length; k++) {
    if (!Number.isNaN(centres[k]!)) continue;
    let l = k - 1;
    while (l >= 0 && Number.isNaN(centres[l]!)) l--;
    let r = k + 1;
    while (r < centres.length && Number.isNaN(centres[r]!)) r++;
    const left = l >= 0 ? centres[l]! : NaN;
    const right = r < centres.length ? centres[r]! : NaN;
    centres[k] = Number.isNaN(left)
      ? right
      : Number.isNaN(right)
        ? left
        : left + ((right - left) * (k - l)) / (r - l);
  }
  return { strip, centres };
}
