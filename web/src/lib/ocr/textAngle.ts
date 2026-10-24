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
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const blobs: { angle: number; weight: number }[] = [];

  for (let start = 0; start < width * height; start++) {
    if (seen[start] || prob[start]! <= opts.threshold) continue;
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
        if (!seen[q] && prob[q]! > opts.threshold) {
          seen[q] = 1;
          stack[top++] = q;
        }
      };
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (y > 0) push(p - width);
      if (y < height - 1) push(p + width);
    }
    if (n < opts.minPixels) continue;
    const mx = sx / n;
    const my = sy / n;
    const cxx = sxx / n - mx * mx;
    const cyy = syy / n - my * my;
    const cxy = sxy / n - mx * my;
    // Eigenvalues of the covariance matrix: spread along and across the blob.
    const mid = (cxx + cyy) / 2;
    const half = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy);
    const major = mid + half;
    const minor = Math.max(mid - half, 1e-6);
    if (major / minor < opts.minElongation) continue;
    const angle = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI;
    if (Math.abs(angle) > MAX_ANGLE) continue;
    // Longer blobs pin the angle down better.
    blobs.push({ angle, weight: Math.sqrt(major) });
  }

  if (blobs.length < opts.minBlobs) return null;
  // Weighted median: robust to a few blobs that merged across lines or
  // belong to a curved edge of the pack.
  blobs.sort((a, b) => a.angle - b.angle);
  const total = blobs.reduce((s, b) => s + b.weight, 0);
  let acc = 0;
  for (const b of blobs) {
    acc += b.weight;
    if (acc >= total / 2) return b.angle;
  }
  return blobs[blobs.length - 1]!.angle;
}
