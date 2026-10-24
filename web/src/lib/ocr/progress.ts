export interface ProgressFile {
  name: string;
  approxBytes: number;
}

/**
 * Combined download progress over several files fetched in parallel.
 * Every file counts towards the total from the start (with its approximate
 * size until the real Content-Length is known), so the percentage doesn't
 * jump back when a second file starts.
 */
export function createProgress(files: readonly ProgressFile[]) {
  const loaded = new Map(files.map((f) => [f.name, 0]));
  const totals = new Map(files.map((f) => [f.name, f.approxBytes]));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    update(name: string, fileLoaded: number, fileTotal: number) {
      loaded.set(name, fileLoaded);
      if (fileTotal > 0) totals.set(name, fileTotal);
      return { loaded: sum(loaded), total: sum(totals) };
    },
  };
}
