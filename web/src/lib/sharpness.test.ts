import { createCanvas } from "@napi-rs/canvas";
import { sharpness } from "./sharpness";

function label(blur: number) {
  const c = createCanvas(240, 120);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f3efe7";
  ctx.fillRect(0, 0, 240, 120);
  ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
  ctx.fillStyle = "#222";
  ctx.font = "16px sans-serif";
  ["Aqua, Glycerin, Parfum,", "Propylparaben, Citric Acid", "Butylparaben, Limonene."].forEach(
    (t, i) => ctx.fillText(t, 10, 30 + i * 30),
  );
  const { data } = ctx.getImageData(0, 0, 240, 120);
  return sharpness(data as unknown as Uint8ClampedArray, 240, 120);
}

describe("sharpness", () => {
  it("ranks a sharp frame above progressively blurrier ones", () => {
    const scores = [0, 0.8, 1.6, 3].map(label);
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeLessThan(scores[i - 1]!);
  });

  it("is zero for a flat image", () => {
    expect(sharpness(new Uint8ClampedArray(10 * 10 * 4).fill(128), 10, 10)).toBe(0);
  });
});
