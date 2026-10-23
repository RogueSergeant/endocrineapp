// Downloads the PaddleOCR models into public/models so the site serves
// them from its own origin (required for cross-origin isolation and for
// offline use). Files are pinned by SHA-256; a file that already
// matches is left alone, so repeat runs are instant.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// PP-OCRv5 mobile detection + English recognition, Apache-2.0, converted
// to ORT format by ppu-paddle-ocr-models. Pinned to a commit so the hashes
// below stay valid.
const MODEL_COMMIT = "384182c7187c12d4ea181ae3b97c8b7e12089d9d";
const MEDIA = `https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/${MODEL_COMMIT}`;
const RAW = `https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/${MODEL_COMMIT}`;

// Versioned directory: the service worker caches models cache-first, so a
// model change must change the URL. Keep in sync with src/lib/ocr/ocrWorker.ts.
const MODEL_DIR = "ppocrv5-en";

const MODELS = [
  {
    file: "det.ort",
    url: `${MEDIA}/detection/PP-OCRv5_mobile_det_infer.ort`,
    sha256: "30acfc4e21f2a23669d01a75aaeb92190f96874613108a0f7086bed264420abc",
  },
  {
    file: "rec.ort",
    url: `${MEDIA}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort`,
    sha256: "74ff9e508379375b5149a3c7764221fa9ba7680b7e2f2e458f26b7c7993a89b0",
  },
  {
    file: "dict.txt",
    url: `${RAW}/recognition/multi/en/v5/ppocrv5_en_dict.txt`,
    sha256: "c60d46e9e01d500ed6388fe8681051eac9cf6692e0d57238315be171927a0a1b",
  },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function existingMatches(path, expected) {
  try {
    return sha256(await readFile(path)) === expected;
  } catch {
    return false;
  }
}

async function fetchModel({ file, url, sha256: expected }) {
  const dest = join(root, "public", "models", MODEL_DIR, file);
  if (await existingMatches(dest, expected)) return;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const got = sha256(buf);
      if (got !== expected) throw new Error(`hash mismatch (got ${got})`);
      await writeFile(dest, buf);
      console.log(`models: fetched ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
  throw new Error(`models: failed to fetch ${file} from ${url}: ${lastErr}`);
}

async function main() {
  await mkdir(join(root, "public", "models", MODEL_DIR), { recursive: true });
  await Promise.all(MODELS.map(fetchModel));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
