// Splits the OCR models and WASM runtime into small chunks so a phone on a
// patchy connection can download them in steps. Cloudflare's static assets
// ignore Range requests, so resuming a half-finished download needs the
// pieces to be separate files. Each file is gzipped first (Cloudflare would
// otherwise have compressed the WASM, ~14 MB down to ~3.7 MB) and the
// compressed bytes split into chunks named by their SHA-256, so a chunk URL
// never changes content and unchanged chunks are reused across builds.
// Run after fetch-models.mjs; src/lib/ocr/chunkedDownload.ts reads the output.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "chunks");
const manifestPath = join(root, "public", "chunks.json");

// Small enough that a dropped connection loses little, large enough that
// the ~15 MB total is about 60 requests.
const CHUNK_BYTES = 256 * 1024;

// The WASM must be the build the onnxruntime-web bundle expects, which is
// the one shipped alongside it in the same package.
const FILES = {
  det: "public/models/ppocrv5-en/det.ort",
  rec: "public/models/ppocrv5-en/rec.ort",
  dict: "public/models/ppocrv5-en/dict.txt",
  wasm: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

await mkdir(outDir, { recursive: true });
const manifest = { version: 1, files: {} };
const keep = new Set();

for (const [name, path] of Object.entries(FILES)) {
  const raw = await readFile(join(root, path));
  // Node's gzip header has no timestamp, so the output is deterministic.
  const gz = gzipSync(raw, { level: 9 });
  const chunks = [];
  for (let offset = 0; offset < gz.length; offset += CHUNK_BYTES) {
    const piece = gz.subarray(offset, offset + CHUNK_BYTES);
    const hash = sha256(piece);
    const file = `${hash}.bin`;
    keep.add(file);
    const target = join(outDir, file);
    if (!existsSync(target)) await writeFile(target, piece);
    chunks.push({ url: `/chunks/${file}`, bytes: piece.length, sha256: hash });
  }
  manifest.files[name] = {
    bytes: raw.length,
    sha256: sha256(raw),
    gzipBytes: gz.length,
    chunks,
  };
  console.log(`${name}: ${raw.length} bytes, ${gz.length} gzipped, ${chunks.length} chunks`);
}

for (const file of await readdir(outDir)) {
  if (file.endsWith(".bin") && !keep.has(file)) await unlink(join(outDir, file));
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
