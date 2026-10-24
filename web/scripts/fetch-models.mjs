// Downloads the PaddleOCR models into public/models so the site serves
// them from its own origin (required for cross-origin isolation and for
// offline use). Files are pinned by SHA-256; a file that already
// matches is left alone, so repeat runs are instant.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Text detection from PP-OCRv6 tiny with English recognition from
// PP-OCRv5 mobile, Apache-2.0, in ORT format from ppu-paddle-ocr-models.
// On our label test set this pair reads as well as v5 for both (and a
// little better on low-contrast and light-on-dark print) with a detector
// a third the size: about 3 MB less to download. v6's own recogniser was
// clearly worse on ingredient lists, and v6 small, though the strongest
// before word repair, is twice the download for no gain after it.
// Each source is pinned to a commit so the hashes below stay valid.
const V5_COMMIT = "384182c7187c12d4ea181ae3b97c8b7e12089d9d";
const V5_MEDIA = `https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/${V5_COMMIT}`;
const V5_RAW = `https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/${V5_COMMIT}`;
// The v6 files are only on the Hugging Face mirror of the same repo.
const V6_REVISION = "bf1d5edb0335d3262be7caf13f766ba274b4cadd";
const V6_HF = `https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/${V6_REVISION}`;

const MODEL_DIR = "ppocr";

const MODELS = [
  {
    file: "det.ort",
    url: `${V6_HF}/detection/ort/PP-OCRv6_tiny_det.ort`,
    sha256: "2816e82d26a09d6af722492f80f3059d458377c084eca88f34d84ddf9b385580",
  },
  {
    file: "rec.ort",
    url: `${V5_MEDIA}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort`,
    sha256: "74ff9e508379375b5149a3c7764221fa9ba7680b7e2f2e458f26b7c7993a89b0",
  },
  {
    file: "dict.txt",
    url: `${V5_RAW}/recognition/multi/en/v5/ppocrv5_en_dict.txt`,
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
