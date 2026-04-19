import { mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEdLists } from "./fetchEdLists.ts";
import { parseListFile } from "./parseLists.ts";
import { dedupe } from "./dedupe.ts";
import { enrichCosing } from "./enrichCosing.ts";
import { enrichPubchem } from "./enrichPubchem.ts";
import { writeSubstancesJson } from "./buildSubstancesJson.ts";
import { SEED_ROWS } from "./seed.ts";
import type { ListId, PipelineConfig, RawAssessmentRow } from "./types.ts";

const USE_SEED = process.env.ED_USE_SEED === "1";
const NETWORK_ENABLED = process.env.ED_NETWORK !== "0";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const config: PipelineConfig = {
  rawDir: join(repoRoot, "data-pipeline", "data", "raw"),
  cacheDir: join(repoRoot, "data-pipeline", "data", "cache"),
  cosingDir: join(repoRoot, "data-pipeline", "data", "cosing"),
  outDir: join(repoRoot, "app", "src", "data"),
  pubchemRateLimitPerSec: 5,
  fuzzyEnrichmentEnabled: false,
  sourceLastUpdated: process.env.ED_SOURCE_LAST_UPDATED ?? "2025-12",
};

function log(step: string, msg: string): void {
  process.stdout.write(`[${step}] ${msg}\n`);
}

async function main(): Promise<void> {
  await mkdir(config.outDir, { recursive: true });

  const allRows: RawAssessmentRow[] = [];
  let usedSeed = false;

  if (USE_SEED) {
    log("seed", `using curated seed dataset (${SEED_ROWS.length} rows)`);
    allRows.push(...SEED_ROWS);
    usedSeed = true;
  } else {
    // Prefer pre-downloaded XLSX files checked into the repo. edlists.org
    // sits behind a WAF that 403s non-browser clients, so we can't always
    // fetch programmatically; committing the three spreadsheets to
    // data-pipeline/data/raw/ lets the pipeline run fully offline.
    const preDownloaded: { path: string; listId: ListId }[] = [];
    for (const listId of [1, 2, 3] as ListId[]) {
      const candidates = [
        join(config.rawDir, `list-${listId}.xlsx`),
        join(config.rawDir, `list${listId}.xlsx`),
      ];
      for (const p of candidates) {
        try {
          const s = await stat(p);
          if (s.isFile() && s.size > 0) {
            preDownloaded.push({ path: p, listId });
            break;
          }
        } catch {
          // try next candidate
        }
      }
    }

    if (preDownloaded.length === 3) {
      log("raw", `using ${preDownloaded.length} XLSX files in ${config.rawDir}`);
      for (const f of preDownloaded) {
        const rows = await parseListFile(f.path, f.listId);
        log("parse", `list ${f.listId}: ${rows.length} rows`);
        allRows.push(...rows);
      }
    } else {
      try {
        log("fetch", "downloading edlists.org spreadsheets");
        const fetched = await fetchEdLists(config.rawDir);
        for (const f of fetched) {
          log("fetch", `list ${f.listId}: ${f.bytes} bytes → ${f.filePath}`);
        }
        log("parse", "parsing XLSX files");
        for (const f of fetched) {
          const rows = await parseListFile(f.filePath, f.listId as ListId);
          log("parse", `list ${f.listId}: ${rows.length} rows`);
          allRows.push(...rows);
        }
      } catch (err) {
        log("fetch", `failed: ${(err as Error).message}`);
        log(
          "fetch",
          "if edlists.org is blocking the runner, download the three XLSX files by hand and commit them to data-pipeline/data/raw/list-{1,2,3}.xlsx",
        );
        log("seed", "falling back to curated seed dataset");
        allRows.push(...SEED_ROWS);
        usedSeed = true;
      }
    }
  }

  log("dedupe", `merging ${allRows.length} rows`);
  const substances = dedupe(allRows);
  log("dedupe", `→ ${substances.length} unique substances`);

  log("cosing", "matching CAS → INCI from CosIng dump");
  const cos = await enrichCosing(substances, config.cosingDir);
  log("cosing", `loaded ${cos.entriesLoaded} CosIng rows, matched ${cos.matched} substances`);
  if (cos.entriesLoaded === 0) {
    log("cosing", "no CosIng CSV found in data-pipeline/data/cosing — skipping INCI enrichment");
  }

  if (NETWORK_ENABLED) {
    log("pubchem", "fetching synonyms (cached on disk)");
    try {
      const stats = await enrichPubchem(
        substances,
        config.cacheDir,
        config.pubchemRateLimitPerSec,
      );
      log(
        "pubchem",
        `cached: ${stats.fromCache}, fetched: ${stats.fetched}, not-found: ${stats.notFound}, errors: ${stats.errors}, +${stats.synonymsAdded} aliases`,
      );
    } catch (err) {
      log("pubchem", `skipped: ${(err as Error).message}`);
    }
  } else {
    log("pubchem", "skipped (ED_NETWORK=0)");
  }

  log("build", "writing substances.json");
  const { jsonPath, indexPath } = await writeSubstancesJson(substances, {
    outDir: config.outDir,
    sourceLastUpdated: config.sourceLastUpdated,
  });
  log("build", `wrote ${jsonPath}`);
  log("build", `wrote ${indexPath}`);

  log("done", `${substances.length} substances ready for app bundle${usedSeed ? " (seed)" : ""}`);
}

main().catch((err: unknown) => {
  process.stderr.write(`pipeline failed: ${(err as Error).stack ?? err}\n`);
  process.exitCode = 1;
});
