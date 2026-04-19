import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Substance } from "./types.ts";

interface CosingEntry {
  inciName: string;
  cas: string | null;
  synonyms: string[];
}

function parseCsv(text: string): string[][] {
  // Lightweight CSV parser that handles quoted fields with commas/newlines.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // skip
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function loadCosingDump(cosingDir: string): Promise<CosingEntry[]> {
  let files: string[] = [];
  try {
    files = (await readdir(cosingDir)).filter((f) => f.toLowerCase().endsWith(".csv"));
  } catch {
    return [];
  }
  if (files.length === 0) return [];
  const entries: CosingEntry[] = [];
  for (const file of files) {
    const text = await readFile(join(cosingDir, file), "utf8");
    const rows = parseCsv(text);
    if (rows.length < 2) continue;
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const inciIdx = header.findIndex(
      (h) => h === "inci name" || h === "inci_name" || h === "inci",
    );
    const casIdx = header.findIndex((h) => h.includes("cas"));
    const synIdx = header.findIndex(
      (h) => h.includes("synonym") || h.includes("chem/iupac") || h === "chem name",
    );
    if (inciIdx < 0) continue;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const inci = (row[inciIdx] ?? "").trim();
      if (!inci) continue;
      const cas = casIdx >= 0 ? (row[casIdx] ?? "").trim() : "";
      const syns = synIdx >= 0 ? (row[synIdx] ?? "").trim() : "";
      entries.push({
        inciName: inci,
        cas: cas || null,
        synonyms: syns ? syns.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
      });
    }
  }
  return entries;
}

export async function enrichCosing(
  substances: Substance[],
  cosingDir: string,
): Promise<{ matched: number; entriesLoaded: number }> {
  const entries = await loadCosingDump(cosingDir);
  if (entries.length === 0) {
    return { matched: 0, entriesLoaded: 0 };
  }
  const byCas = new Map<string, CosingEntry>();
  for (const e of entries) {
    if (e.cas && /^\d{2,7}-\d{2}-\d$/.test(e.cas)) {
      // First write wins; CosIng often has multiple entries per CAS — pick the
      // first which is usually the simplest INCI name.
      if (!byCas.has(e.cas)) byCas.set(e.cas, e);
    }
  }
  let matched = 0;
  for (const s of substances) {
    if (!s.casNumber) continue;
    const hit = byCas.get(s.casNumber);
    if (!hit) continue;
    matched++;
    s.inciName = hit.inciName;
    const merged = new Set<string>(s.aliases.map((a) => a.toLowerCase()));
    for (const candidate of [hit.inciName, ...hit.synonyms]) {
      const k = candidate.toLowerCase();
      if (k && !merged.has(k)) {
        merged.add(k);
        s.aliases.push(candidate);
      }
    }
  }
  return { matched, entriesLoaded: entries.length };
}
