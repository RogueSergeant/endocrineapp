import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { request } from "undici";
import type { Substance } from "./types.ts";

const ENDPOINT = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name";
const MAX_SYNONYMS = 20;
const MAX_LEN = 80;
const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

interface CacheEntry {
  cas: string;
  fetchedAt: string;
  synonyms: string[];
  notFound?: boolean;
}

async function readCache(cacheDir: string, cas: string): Promise<CacheEntry | null> {
  try {
    const text = await readFile(join(cacheDir, `${cas}.json`), "utf8");
    return JSON.parse(text) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(cacheDir: string, entry: CacheEntry): Promise<void> {
  await writeFile(join(cacheDir, `${entry.cas}.json`), JSON.stringify(entry, null, 2));
}

async function fetchSynonyms(cas: string): Promise<string[] | null> {
  const url = `${ENDPOINT}/${encodeURIComponent(cas)}/synonyms/JSON`;
  const res = await request(url, {
    method: "GET",
    headers: { "user-agent": "ed-scanner-data-pipeline/0.1" },
  });
  if (res.statusCode === 404) return null;
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`PubChem ${cas}: HTTP ${res.statusCode}`);
  }
  const json = (await res.body.json()) as {
    InformationList?: { Information?: { Synonym?: string[] }[] };
  };
  return json.InformationList?.Information?.[0]?.Synonym ?? [];
}

function cleanSynonyms(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s) continue;
    const t = s.trim();
    if (!t || t.length > MAX_LEN) continue;
    if (CAS_RE.test(t)) continue;
    if (!/[a-z]/i.test(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_SYNONYMS) break;
  }
  return out;
}

export interface PubchemStats {
  fromCache: number;
  fetched: number;
  notFound: number;
  errors: number;
  synonymsAdded: number;
}

export async function enrichPubchem(
  substances: Substance[],
  cacheDir: string,
  rateLimitPerSec: number,
): Promise<PubchemStats> {
  await mkdir(cacheDir, { recursive: true });
  const limit = pLimit(Math.max(1, Math.floor(rateLimitPerSec)));
  const stats: PubchemStats = {
    fromCache: 0,
    fetched: 0,
    notFound: 0,
    errors: 0,
    synonymsAdded: 0,
  };
  let lastTickAt = 0;
  const minIntervalMs = 1000 / Math.max(1, rateLimitPerSec);

  const tasks = substances
    .filter((s) => s.casNumber !== null)
    .map((s) =>
      limit(async () => {
        const cas = s.casNumber as string;
        const cached = await readCache(cacheDir, cas);
        let synonyms: string[] = [];
        if (cached) {
          stats.fromCache++;
          if (cached.notFound) {
            stats.notFound++;
          } else {
            synonyms = cached.synonyms;
          }
        } else {
          const wait = Math.max(0, lastTickAt + minIntervalMs - Date.now());
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          lastTickAt = Date.now();
          try {
            const fetched = await fetchSynonyms(cas);
            if (fetched === null) {
              stats.notFound++;
              await writeCache(cacheDir, {
                cas,
                fetchedAt: new Date().toISOString(),
                synonyms: [],
                notFound: true,
              });
            } else {
              synonyms = cleanSynonyms(fetched);
              stats.fetched++;
              await writeCache(cacheDir, {
                cas,
                fetchedAt: new Date().toISOString(),
                synonyms,
              });
            }
          } catch (err) {
            stats.errors++;
            process.stderr.write(`  ! PubChem error for ${cas}: ${(err as Error).message}\n`);
          }
        }
        if (synonyms.length === 0) return;
        const seen = new Set(s.aliases.map((a) => a.toLowerCase()));
        for (const syn of synonyms) {
          const k = syn.toLowerCase();
          if (!seen.has(k)) {
            seen.add(k);
            s.aliases.push(syn);
            stats.synonymsAdded++;
          }
        }
      }),
    );
  await Promise.all(tasks);
  return stats;
}
