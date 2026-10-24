/**
 * Focus measure: variance of the Laplacian of the luminance. A sharp image
 * has strong, abrupt second derivatives at its edges; blur (from focus or
 * a shaking hand) smears them out and the variance falls. Only comparable
 * between frames of the same scene, which is how the camera uses it.
 */
export function sharpness(data: Uint8ClampedArray, width: number, height: number): number {
  const luma = new Float32Array(width * height);
  for (let p = 0, i = 0; p < luma.length; p++, i += 4) {
    luma[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1, p = y * width + 1; x < width - 1; x++, p++) {
      const lap = luma[p - 1]! + luma[p + 1]! + luma[p - width]! + luma[p + width]! - 4 * luma[p]!;
      n++;
      sum += lap;
      sumSq += lap * lap;
    }
  }
  return n > 0 ? sumSq / n - (sum / n) ** 2 : 0;
}
