import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "undici";
import pLimit from "p-limit";
import type { Substance } from "./types.ts";
import { looksLikeCas } from "./normaliser.ts";

const CACHE_DIR = join(process.cwd(), "data", "cache", "pubchem");
const MAX_SYNONYMS = 20;
const MAX_LENGTH = 80;
const REQUESTS_PER_SECOND = 5;

interface PubchemResponse {
  InformationList?: {
    Information?: Array<{ Synonym?: string[] }>;
  };
}

function cleanSynonyms(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > MAX_LENGTH) continue;
    if (looksLikeCas(s)) continue;
    if (!/[a-zA-Z]/.test(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_SYNONYMS) break;
  }
  return out;
}

async function readCache(cas: string): Promise<string[] | null> {
  try {
    const text = await readFile(join(CACHE_DIR, `${cas}.json`), "utf8");
    const parsed = JSON.parse(text) as { synonyms: string[] };
    return parsed.synonyms;
  } catch {
    return null;
  }
}

async function writeCache(cas: string, synonyms: string[]): Promise<void> {
  await writeFile(
    join(CACHE_DIR, `${cas}.json`),
    JSON.stringify({ cas, fetchedAt: new Date().toISOString(), synonyms }, null, 2),
  );
}

async function fetchSynonyms(cas: string): Promise<string[]> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/synonyms/JSON`;
  const { statusCode, body } = await request(url, {
    headers: { accept: "application/json", "user-agent": "ed-scanner-etl/0.1" },
  });
  if (statusCode === 404) return [];
  if (statusCode !== 200) {
    console.warn(`[pubchem] ${cas} HTTP ${statusCode}`);
    return [];
  }
  const data = (await body.json()) as PubchemResponse;
  const raw = data.InformationList?.Information?.[0]?.Synonym ?? [];
  return cleanSynonyms(raw);
}

export async function enrichWithPubchem(substances: Substance[]): Promise<Substance[]> {
  await mkdir(CACHE_DIR, { recursive: true });
  const limiter = pLimit(REQUESTS_PER_SECOND);
  let cached = 0;
  let fetched = 0;
  let missed = 0;

  await Promise.all(
    substances.map((sub) =>
      limiter(async () => {
        if (!sub.casNumber) return;
        const cas = sub.casNumber;
        const fromCache = await readCache(cas);
        let synonyms: string[];
        if (fromCache) {
          synonyms = fromCache;
          cached += 1;
        } else {
          try {
            synonyms = await fetchSynonyms(cas);
            await writeCache(cas, synonyms);
            await new Promise((r) => setTimeout(r, 1000 / REQUESTS_PER_SECOND));
            fetched += 1;
          } catch (err) {
            console.warn(`[pubchem] ${cas} failed:`, err);
            missed += 1;
            return;
          }
        }
        const aliases = new Set(sub.aliases);
        for (const s of synonyms) aliases.add(s);
        sub.aliases = [...aliases];
      }),
    ),
  );
  console.log(`[pubchem] cached=${cached} fetched=${fetched} missed=${missed}`);
  return substances;
}
