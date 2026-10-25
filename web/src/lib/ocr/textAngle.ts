// Text tilt from the detector's probability map. The detection model
// marks each word or line as a bright blob, and a blob of text is long
// and thin along its baseline, so its orientation (from second moments)
// is the text's angle. Unlike edge-based deskew this ignores packaging
// graphics, barcodes and the photo's background, which the detector
// already scores as not-text, and it reads light-on-dark text the same as
// dark-on-light.

export interface TextAngleOptions {
  /** Probability above which a pixel counts as text (the DB default). */
  threshold?: number;
  /** Ignore specks smaller than this many map pixels. */
  minPixels?: number;
  /** Major/minor axis variance ratio a blob needs to have a direction. */
  minElongation?: number;
  /** Fewer usable blobs than this and the estimate is too weak to trust. */
  minBlobs?: number;
}

const DEFAULTS: Required<TextAngleOptions> = {
  threshold: 0.3,
  minPixels: 20,
  minElongation: 6,
  minBlobs: 3,
};

// Steeper blobs are vertical text, rules or noise rather than tilted lines.
const MAX_ANGLE = 20;

/** One connected blob of text pixels: its size and second moments. */
export interface TextBlob {
  /** Pixel count. */
  n: number;
  /** Centroid. */
  mx: number;
  my: number;
  /** Covariance of the blob's pixel positions. */
  cxx: number;
  cyy: number;
  cxy: number;
}

/** Every 4-connected blob above `threshold` with at least `minPixels` pixels. */
export function textBlobs(
  prob: ArrayLike<number>,
  width: number,
  height: number,
  { threshold = DEFAULTS.threshold, minPixels = DEFAULTS.minPixels } = {},
): TextBlob[] {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const blobs: TextBlob[] = [];

  for (let start = 0; start < width * height; start++) {
    if (seen[start] || prob[start]! <= threshold) continue;
    // Flood fill one 4-connected blob, accumulating its moments.
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    while (top > 0) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      const push = (q: number) => {
        if (!seen[q] && prob[q]! > threshold) {
          seen[q] = 1;
          stack[top++] = q;
        }
      };
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (y > 0) push(p - width);
      if (y < height - 1) push(p + width);
    }
    if (n < minPixels) continue;
    const mx = sx / n;
    const my = sy / n;
    blobs.push({
      n,
      mx,
      my,
      cxx: sxx / n - mx * mx,
      cyy: syy / n - my * my,
      cxy: sxy / n - mx * my,
    });
  }
  return blobs;
}

/**
 * The text's tilt from its blobs, as textAngleFromMap, or null when too
 * few of them are long and thin enough to have a direction.
 */
export function angleFromBlobs(
  blobs: readonly TextBlob[],
  { minElongation = DEFAULTS.minElongation, minBlobs = DEFAULTS.minBlobs } = {},
): number | null {
  const angles: { angle: number; weight: number }[] = [];
  for (const { cxx, cyy, cxy } of blobs) {
    // Eigenvalues of the covariance matrix: spread along and across the blob.
    const mid = (cxx + cyy) / 2;
    const half = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy);
    const major = mid + half;
    const minor = Math.max(mid - half, 1e-6);
    if (major / minor < minElongation) continue;
    const angle = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI;
    if (Math.abs(angle) > MAX_ANGLE) continue;
    // Longer blobs pin the angle down better.
    angles.push({ angle, weight: Math.sqrt(major) });
  }

  if (angles.length < minBlobs) return null;
  // Weighted median: robust to a few blobs that merged across lines or
  // belong to a curved edge of the pack.
  angles.sort((a, b) => a.angle - b.angle);
  const total = angles.reduce((s, b) => s + b.weight, 0);
  let acc = 0;
  for (const b of angles) {
    acc += b.weight;
    if (acc >= total / 2) return b.angle;
  }
  return angles[angles.length - 1]!.angle;
}

/**
 * Clockwise tilt in degrees (positive = text runs down to the right, the
 * convention deskew uses), or null when the map holds too little text.
 */
export function textAngleFromMap(
  prob: ArrayLike<number>,
  width: number,
  height: number,
  options: TextAngleOptions = {},
): number | null {
  const opts = { ...DEFAULTS, ...options };
  return angleFromBlobs(textBlobs(prob, width, height, opts), opts);
}
