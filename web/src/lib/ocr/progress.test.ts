import { createProgress } from "./progress";

const FILES = [
  { name: "det", approxBytes: 400 },
  { name: "rec", approxBytes: 600 },
];

describe("createProgress", () => {
  it("counts every file in the total before any bytes arrive", () => {
    const p = createProgress(FILES);
    expect(p.update("det", 100, 0)).toEqual({ loaded: 100, total: 1000 });
  });

  it("never lowers the percentage when the second file starts", () => {
    const p = createProgress(FILES);
    const a = p.update("det", 320, 400);
    const b = p.update("rec", 10, 600);
    expect(a.total).toBe(b.total);
    expect(b.loaded / b.total).toBeGreaterThan(a.loaded / a.total);
  });

  it("replaces the estimate with the real Content-Length", () => {
    const p = createProgress(FILES);
    expect(p.update("rec", 50, 800)).toEqual({ loaded: 50, total: 1200 });
  });

  it("reaches loaded === total only when every file is complete", () => {
    const p = createProgress(FILES);
    const first = p.update("det", 400, 400);
    expect(first.loaded).toBeLessThan(first.total);
    expect(p.update("rec", 600, 600)).toEqual({ loaded: 1000, total: 1000 });
  });
});
