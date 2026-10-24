// Resumable download of the OCR runtime and models over a patchy mobile
// connection. scripts/chunk-assets.mjs gzips each file and splits it into
// small content-addressed chunks (Cloudflare's static assets ignore Range
// requests, so this is the only way to resume). Each chunk is saved to
// Cache Storage as soon as it arrives, so a dropped connection costs only
// the chunk in flight and trying again carries on where it stopped.

export const MANIFEST_URL = "/chunks.json";

export interface ChunkRef {
  url: string;
  bytes: number;
  sha256: string;
}

export interface ChunkedFile {
  /** Size and hash of the file once reassembled and decompressed. */
  bytes: number;
  sha256: string;
  gzipBytes: number;
  chunks: ChunkRef[];
}

export interface ChunkManifest {
  version: 1;
  files: Record<string, ChunkedFile>;
}

export interface ChunkStore {
  get(url: string): Promise<ArrayBuffer | undefined>;
  put(url: string, data: ArrayBuffer): Promise<void>;
  delete(url: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface DownloadOptions {
  store: ChunkStore;
  fetch?: typeof fetch;
  /**
   * Gzipped bytes of this file saved so far, chunks already cached
   * included. Also called before each retry, so the page can tell a
   * download that is retrying from one that has stalled.
   */
  onBytes?: (loaded: number) => void;
  attempts?: number;
  /** Per chunk. 256 KiB in 30s still gets through at ~9 KB/s. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Every attempt at a chunk failed; the chunks saved so far are kept. */
export class DownloadInterruptedError extends Error {
  constructor(cause: unknown) {
    super(`Download interrupted: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "DownloadInterruptedError";
  }
}

const DEFAULTS = { attempts: 5, timeoutMs: 30_000 };
// Browsers reject fetch called as a method of another object.
const defaultFetch: typeof fetch = (input, init) => fetch(input, init);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

class HttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`Couldn't download ${url} (HTTP ${status})`);
  }
}

async function fetchOnce(
  url: string,
  opts: Required<Pick<DownloadOptions, "fetch" | "timeoutMs">>,
  init: RequestInit = {},
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  // Covers the body as well as the headers: a mobile connection can stop
  // sending mid-body without the request ever erroring.
  const timer = setTimeout(
    () => controller.abort(new Error(`Timed out downloading ${url}`)),
    opts.timeoutMs,
  );
  try {
    const res = await opts.fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new HttpError(url, res.status);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

async function withRetries<T>(
  attempt: () => Promise<T>,
  opts: Required<Pick<DownloadOptions, "attempts" | "sleep">> & { beforeRetry?: () => void },
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      // A 4xx won't fix itself (e.g. a stale manifest after a deploy).
      const permanent = err instanceof HttpError && err.status >= 400 && err.status < 500;
      if (permanent || i >= opts.attempts) throw new DownloadInterruptedError(err);
      opts.beforeRetry?.();
      await opts.sleep(Math.min(1000 * 2 ** (i - 1), 8000));
    }
  }
}

async function getChunk(
  ref: ChunkRef,
  opts: Required<Omit<DownloadOptions, "onBytes">> & { beforeRetry: () => void },
): Promise<ArrayBuffer> {
  const cached = await opts.store.get(ref.url);
  if (cached && cached.byteLength === ref.bytes) return cached;
  const data = await withRetries(async () => {
    const buf = await fetchOnce(ref.url, opts);
    if (buf.byteLength !== ref.bytes || (await sha256Hex(buf)) !== ref.sha256) {
      throw new Error(`Corrupted download of ${ref.url}`);
    }
    return buf;
  }, opts);
  // Out of storage only costs the ability to resume, not the download.
  await opts.store.put(ref.url, data).catch(() => undefined);
  return data;
}

/** Download (or read from the cache) every chunk of a file, then reassemble it. */
export async function downloadChunkedFile(
  file: ChunkedFile,
  options: DownloadOptions,
): Promise<ArrayBuffer> {
  const opts = {
    fetch: options.fetch ?? defaultFetch,
    sleep: options.sleep ?? defaultSleep,
    attempts: options.attempts ?? DEFAULTS.attempts,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
    store: options.store,
  };
  const parts: ArrayBuffer[] = [];
  let loaded = 0;
  const beforeRetry = () => options.onBytes?.(loaded);
  for (const ref of file.chunks) {
    parts.push(await getChunk(ref, { ...opts, beforeRetry }));
    loaded += ref.bytes;
    options.onBytes?.(loaded);
  }
  const stream = new Blob(parts).stream().pipeThrough(new DecompressionStream("gzip"));
  const out = await new Response(stream).arrayBuffer();
  if (out.byteLength !== file.bytes || (await sha256Hex(out)) !== file.sha256) {
    // Every chunk passed its own check, so this is a bad cache entry or a
    // bad build; start this file afresh next time.
    await Promise.all(file.chunks.map((c) => opts.store.delete(c.url)));
    throw new Error("The downloaded text reader was corrupted. Try again to download it afresh.");
  }
  return out;
}

/**
 * The manifest of the current build, or the last one saved when offline,
 * so a phone that has everything cached still works without signal.
 */
export async function loadManifest(
  options: Pick<DownloadOptions, "store" | "fetch" | "attempts" | "timeoutMs" | "sleep">,
): Promise<ChunkManifest> {
  const opts = {
    fetch: options.fetch ?? defaultFetch,
    sleep: options.sleep ?? defaultSleep,
    attempts: options.attempts ?? DEFAULTS.attempts,
    timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
  };
  const get = () => fetchOnce(MANIFEST_URL, opts, { cache: "no-cache" });
  let buf: ArrayBuffer;
  try {
    buf = await get();
  } catch (err) {
    const cached = await options.store.get(MANIFEST_URL);
    if (cached) return parseManifest(cached);
    if (err instanceof HttpError) throw err;
    buf = await withRetries(get, opts);
  }
  const manifest = parseManifest(buf);
  await options.store.put(MANIFEST_URL, buf);
  return manifest;
}

function parseManifest(buf: ArrayBuffer): ChunkManifest {
  const manifest = JSON.parse(new TextDecoder().decode(buf)) as ChunkManifest;
  if (manifest.version !== 1) throw new Error("Unsupported text reader manifest");
  return manifest;
}

/** Drop chunks no longer in the manifest, e.g. after a model update. */
export async function pruneStore(store: ChunkStore, manifest: ChunkManifest): Promise<void> {
  const wanted = new Set([MANIFEST_URL]);
  for (const f of Object.values(manifest.files)) for (const c of f.chunks) wanted.add(c.url);
  const stale = (await store.keys()).filter((k) => !wanted.has(k));
  await Promise.all(stale.map((k) => store.delete(k)));
}

export function memoryStore(): ChunkStore {
  const m = new Map<string, ArrayBuffer>();
  return {
    get: async (url) => m.get(url),
    put: async (url, data) => void m.set(url, data),
    delete: async (url) => void m.delete(url),
    keys: async () => [...m.keys()],
  };
}

/**
 * Cache Storage, keyed by path. Falls back to memory where Cache Storage
 * is unavailable (some private browsing modes): the download still works,
 * it just can't resume after the page closes.
 */
export async function openChunkStore(name: string): Promise<ChunkStore> {
  let cache: Cache;
  try {
    cache = await caches.open(name);
  } catch {
    return memoryStore();
  }
  return {
    async get(url) {
      const res = await cache.match(url);
      return res ? res.arrayBuffer() : undefined;
    },
    put: (url, data) => cache.put(url, new Response(data)),
    delete: async (url) => void (await cache.delete(url)),
    keys: async () => (await cache.keys()).map((r) => new URL(r.url).pathname),
  };
}
