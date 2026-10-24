import { createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  DownloadInterruptedError,
  MANIFEST_URL,
  downloadChunkedFile,
  loadManifest,
  memoryStore,
  pruneStore,
  type ChunkManifest,
  type ChunkedFile,
} from "./chunkedDownload";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const toBuffer = (b: Uint8Array) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const noSleep = () => Promise.resolve();
const chunkAt = (file: ChunkedFile, i: number) => {
  const c = file.chunks[i];
  if (!c) throw new Error(`no chunk ${i}`);
  return c;
};

/** Gzip and split `raw` the way scripts/chunk-assets.mjs does. */
function chunk(raw: Uint8Array, size: number) {
  const gz = gzipSync(raw);
  const bodies = new Map<string, Uint8Array>();
  const file: ChunkedFile = {
    bytes: raw.length,
    sha256: sha256(raw),
    gzipBytes: gz.length,
    chunks: [],
  };
  for (let o = 0; o < gz.length; o += size) {
    const piece = gz.subarray(o, o + size);
    const url = `/chunks/${sha256(piece)}.bin`;
    bodies.set(url, piece);
    file.chunks.push({ url, bytes: piece.length, sha256: sha256(piece) });
  }
  return { file, bodies };
}

// Incompressible, so it splits into several chunks.
const RAW = new Uint8Array(randomBytes(8192));

function server(bodies: Map<string, Uint8Array>, failures: Record<string, number> = {}) {
  const requests: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (failures[url]) {
      failures[url]--;
      throw new TypeError("Error in input stream");
    }
    const body = bodies.get(url);
    return body ? new Response(toBuffer(body)) : new Response("missing", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, requests };
}

describe("downloadChunkedFile", () => {
  it("reassembles and decompresses the original file", async () => {
    const { file, bodies } = chunk(RAW, 1024);
    expect(file.chunks.length).toBeGreaterThan(2);
    const { fetchFn } = server(bodies);
    const out = await downloadChunkedFile(file, { store: memoryStore(), fetch: fetchFn });
    expect(new Uint8Array(out)).toEqual(RAW);
  });

  it("retries a chunk whose connection dropped", async () => {
    const { file, bodies } = chunk(RAW, 1024);
    const flaky = chunkAt(file, 1).url;
    const { fetchFn, requests } = server(bodies, { [flaky]: 2 });
    const out = await downloadChunkedFile(file, {
      store: memoryStore(),
      fetch: fetchFn,
      sleep: noSleep,
    });
    expect(new Uint8Array(out)).toEqual(RAW);
    expect(requests.filter((u) => u === flaky)).toHaveLength(3);
  });

  it("keeps saved chunks when it gives up, and resumes from them", async () => {
    const { file, bodies } = chunk(RAW, 1024);
    const store = memoryStore();
    const dead = chunkAt(file, 2).url;
    const first = server(bodies, { [dead]: 99 });
    const progress: number[] = [];
    await expect(
      downloadChunkedFile(file, {
        store,
        fetch: first.fetchFn,
        sleep: noSleep,
        attempts: 3,
        onBytes: (l) => progress.push(l),
      }),
    ).rejects.toBeInstanceOf(DownloadInterruptedError);
    const savedBytes = chunkAt(file, 0).bytes + chunkAt(file, 1).bytes;
    // Retries report progress too, so the page knows the worker is alive.
    expect(progress.filter((l) => l === savedBytes).length).toBeGreaterThan(1);

    const second = server(bodies);
    const out = await downloadChunkedFile(file, { store, fetch: second.fetchFn });
    expect(new Uint8Array(out)).toEqual(RAW);
    expect(second.requests).not.toContain(chunkAt(file, 0).url);
    expect(second.requests).not.toContain(chunkAt(file, 1).url);
    expect(second.requests[0]).toBe(dead);
  });

  it("refetches a chunk that arrives corrupted", async () => {
    const { file, bodies } = chunk(RAW, 1024);
    const target = chunkAt(file, 0).url;
    const good = bodies.get(target)!;
    let served = 0;
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === target && served++ === 0) return new Response(toBuffer(good.map((b) => b ^ 1)));
      return new Response(toBuffer(bodies.get(url)!));
    }) as typeof fetch;
    const out = await downloadChunkedFile(file, {
      store: memoryStore(),
      fetch: fetchFn,
      sleep: noSleep,
    });
    expect(new Uint8Array(out)).toEqual(RAW);
    expect(served).toBe(2);
  });

  it("times out a chunk whose body stops arriving", async () => {
    const { file, bodies } = chunk(RAW, 1024);
    let calls = 0;
    const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (calls++ === 0) {
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)),
        );
      }
      return Promise.resolve(new Response(toBuffer(bodies.get(String(input))!)));
    }) as typeof fetch;
    const out = await downloadChunkedFile(file, {
      store: memoryStore(),
      fetch: fetchFn,
      sleep: noSleep,
      timeoutMs: 20,
    });
    expect(new Uint8Array(out)).toEqual(RAW);
  });

  it("gives up straight away on a missing chunk", async () => {
    const { file } = chunk(RAW, 1024);
    const { fetchFn, requests } = server(new Map());
    await expect(
      downloadChunkedFile(file, { store: memoryStore(), fetch: fetchFn, sleep: noSleep }),
    ).rejects.toThrow("HTTP 404");
    expect(requests).toHaveLength(1);
  });
});

describe("loadManifest", () => {
  const manifest: ChunkManifest = { version: 1, files: {} };
  const body = () => new Response(JSON.stringify(manifest));

  it("falls back to the saved manifest when offline", async () => {
    const store = memoryStore();
    await loadManifest({ store, fetch: (async () => body()) as typeof fetch });
    const offline = (async () => {
      throw new TypeError("NetworkError");
    }) as typeof fetch;
    await expect(loadManifest({ store, fetch: offline, sleep: noSleep })).resolves.toEqual(
      manifest,
    );
  });

  it("retries when offline with nothing saved", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      if (calls++ < 2) throw new TypeError("NetworkError");
      return body();
    }) as typeof fetch;
    await expect(
      loadManifest({ store: memoryStore(), fetch: fetchFn, sleep: noSleep }),
    ).resolves.toEqual(manifest);
  });
});

describe("pruneStore", () => {
  it("drops chunks the manifest no longer lists", async () => {
    const { file } = chunk(RAW, 1024);
    const store = memoryStore();
    const keep = chunkAt(file, 0).url;
    await store.put(keep, new ArrayBuffer(1));
    await store.put("/chunks/old.bin", new ArrayBuffer(1));
    await store.put(MANIFEST_URL, new ArrayBuffer(1));
    await pruneStore(store, { version: 1, files: { f: file } });
    expect((await store.keys()).sort()).toEqual([MANIFEST_URL, keep].sort());
  });
});
