import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Substance } from "./types.ts";

const RAW_DIR = join(process.cwd(), "data", "raw");
const COSING_FILENAME = "cosing.csv";

interface CosingRow {
  inciName: string;
  cas: string | null;
  ec: string | null;
  synonyms: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

async function loadCosingCsv(): Promise<CosingRow[]> {
  const path = join(RAW_DIR, COSING_FILENAME);
  try {
    await access(path);
  } catch {
    console.warn(
      `[cosing] ${path} missing — skipping INCI enrichment. ` +
        "Download the CosIng CSV from the EU Commission site and place it there to enrich.",
    );
    return [];
  }
  const text = await readFile(path, "utf8");
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const idxInci = header.findIndex((h) => h.includes("inci name"));
  const idxCas = header.findIndex((h) => h === "cas no." || h === "cas");
  const idxEc = header.findIndex((h) => h.includes("ec "));
  const idxSyn = header.findIndex((h) => h.includes("chem/iupac") || h.includes("synonym"));
  const rows: CosingRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const cols = splitCsvLine(line);
    const inci = idxInci >= 0 ? cols[idxInci] : "";
    if (!inci) continue;
    rows.push({
      inciName: inci ?? "",
      cas: idxCas >= 0 ? cols[idxCas] || null : null,
      ec: idxEc >= 0 ? cols[idxEc] || null : null,
      synonyms: idxSyn >= 0 && cols[idxSyn]
        ? cols[idxSyn]!.split(/;|\|/).map((s) => s.trim()).filter(Boolean)
        : [],
    });
  }
  console.log(`[cosing] loaded ${rows.length} rows`);
  return rows;
}

export async function enrichWithCosing(substances: Substance[]): Promise<Substance[]> {
  const rows = await loadCosingCsv();
  if (rows.length === 0) return substances;

  const byCas = new Map<string, CosingRow>();
  for (const r of rows) {
    if (r.cas) byCas.set(r.cas, r);
  }

  let hits = 0;
  for (const sub of substances) {
    if (!sub.casNumber) continue;
    const row = byCas.get(sub.casNumber);
    if (!row) continue;
    sub.inciName = row.inciName;
    const aliases = new Set(sub.aliases);
    aliases.add(row.inciName);
    for (const s of row.synonyms) aliases.add(s);
    sub.aliases = [...aliases];
    hits += 1;
  }
  console.log(`[cosing] matched ${hits}/${substances.length} substances`);
  return substances;
}
