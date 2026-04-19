import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import type { RawAssessmentRow } from "./types.ts";

const RAW_DIR = join(process.cwd(), "data", "raw");

const HEADER_ALIASES: Record<keyof RawAssessmentRow, string[]> = {
  name: ["name and abbreviation", "name", "substance"],
  casNumber: ["cas no.", "cas no", "cas number", "cas"],
  ecNumber: ["ec / list no.", "ec/list no", "ec no.", "ec number"],
  healthEffects: ["health effects", "human health"],
  envEffects: ["environmental effects", "environment"],
  status: ["status"],
  year: ["year"],
  regulatoryField: ["regulatory field", "regulation"],
  listId: [],
};

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, " ").trim();
}

function findColumn(
  headers: string[],
  field: keyof RawAssessmentRow,
): number | null {
  const aliases = HEADER_ALIASES[field];
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i];
    if (!h) continue;
    if (aliases.some((a) => h.includes(a))) return i;
  }
  return null;
}

function parseBoolish(value: ExcelJS.CellValue): boolean | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (s === "") return null;
  if (["x", "yes", "true", "1", "✓", "tick"].includes(s)) return true;
  if (["no", "false", "0", "-"].includes(s)) return false;
  return true;
}

function parseYear(value: ExcelJS.CellValue): number | null {
  if (value == null) return null;
  if (typeof value === "number" && value > 1900 && value < 2100) return value;
  const s = String(value).match(/\b(19|20)\d{2}\b/);
  return s ? Number(s[0]) : null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  if (typeof value === "object" && value !== null && "richText" in value) {
    return (value as { richText: Array<{ text: string }> }).richText
      .map((r) => r.text)
      .join("")
      .trim();
  }
  return String(value).trim();
}

export async function parseList(
  listId: 1 | 2 | 3,
): Promise<RawAssessmentRow[]> {
  const path = join(RAW_DIR, `list-${listId}.xlsx`);
  const buf = await readFile(path);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error(`list ${listId} has no sheets`);

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normaliseHeader(cellText(cell.value));
  });

  const cols: Partial<Record<keyof RawAssessmentRow, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as (keyof RawAssessmentRow)[]) {
    const idx = findColumn(headers, field);
    if (idx != null) cols[field] = idx;
  }

  const rows: RawAssessmentRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (field: keyof RawAssessmentRow): ExcelJS.CellValue => {
      const idx = cols[field];
      if (idx == null) return null;
      return row.getCell(idx + 1).value;
    };
    const name = cellText(get("name"));
    if (!name) return;
    rows.push({
      name,
      casNumber: cellText(get("casNumber")) || null,
      ecNumber: cellText(get("ecNumber")) || null,
      healthEffects: parseBoolish(get("healthEffects")),
      envEffects: parseBoolish(get("envEffects")),
      status: cellText(get("status")),
      year: parseYear(get("year")),
      regulatoryField: cellText(get("regulatoryField")) || null,
      listId,
    });
  });
  console.log(`[parse] list ${listId}: ${rows.length} rows`);
  return rows;
}

export async function parseAllLists(): Promise<RawAssessmentRow[]> {
  const all: RawAssessmentRow[] = [];
  for (const id of [1, 2, 3] as const) {
    const rows = await parseList(id);
    all.push(...rows);
  }
  return all;
}
