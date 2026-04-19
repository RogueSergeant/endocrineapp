import ExcelJS from "exceljs";
import type { ListId, RawAssessmentRow } from "./types.ts";

const HEADER_ALIASES: Record<keyof Omit<RawAssessmentRow, "listId">, string[]> = {
  name: ["name and abbreviation", "name", "substance"],
  casNumber: ["cas no.", "cas number", "cas"],
  ecNumber: ["ec / list no.", "ec number", "ec / list", "ec"],
  healthEffects: ["health effects", "health"],
  envEffects: ["environmental effects", "environment", "environmental"],
  status: ["status"],
  year: ["year"],
  regulatoryField: ["regulatory field", "regulatory"],
};

function indexHeaderRow(row: ExcelJS.Row): Map<keyof RawAssessmentRow, number> {
  const headerByCol = new Map<string, number>();
  row.eachCell((cell, col) => {
    const text = String(cell.value ?? "")
      .trim()
      .toLowerCase();
    if (text) headerByCol.set(text, col);
  });
  const map = new Map<keyof RawAssessmentRow, number>();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof Omit<RawAssessmentRow, "listId">,
    string[],
  ][]) {
    for (const alias of aliases) {
      const col = headerByCol.get(alias);
      if (col !== undefined) {
        map.set(key, col);
        break;
      }
    }
  }
  return map;
}

function readCell(row: ExcelJS.Row, col: number | undefined): string {
  if (col === undefined) return "";
  const value = row.getCell(col).value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null && "text" in value) {
    // Rich text cell
    return String((value as { text: string }).text).trim();
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return String((value as { result: unknown }).result ?? "").trim();
  }
  return String(value).trim();
}

function parseFlag(s: string): boolean | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (["x", "yes", "y", "true", "1", "✓"].includes(t)) return true;
  if (["", "no", "n", "false", "0", "-"].includes(t)) return false;
  return null;
}

function parseYear(s: string): number | null {
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  // The first row containing a cell that matches a known header.
  const limit = Math.min(sheet.rowCount, 10);
  for (let r = 1; r <= limit; r++) {
    const row = sheet.getRow(r);
    let hasName = false;
    let hasCas = false;
    row.eachCell((cell) => {
      const t = String(cell.value ?? "")
        .trim()
        .toLowerCase();
      if (HEADER_ALIASES.name.includes(t)) hasName = true;
      if (HEADER_ALIASES.casNumber.includes(t)) hasCas = true;
    });
    if (hasName && hasCas) return r;
  }
  return 1;
}

export async function parseListFile(
  filePath: string,
  listId: ListId,
): Promise<RawAssessmentRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const headerRowNum = findHeaderRow(sheet);
  const headerRow = sheet.getRow(headerRowNum);
  const cols = indexHeaderRow(headerRow);
  const rows: RawAssessmentRow[] = [];
  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = readCell(row, cols.get("name"));
    if (!name) continue;
    rows.push({
      name,
      casNumber: readCell(row, cols.get("casNumber")) || null,
      ecNumber: readCell(row, cols.get("ecNumber")) || null,
      healthEffects: parseFlag(readCell(row, cols.get("healthEffects"))),
      envEffects: parseFlag(readCell(row, cols.get("envEffects"))),
      status: readCell(row, cols.get("status")),
      year: parseYear(readCell(row, cols.get("year"))),
      regulatoryField: readCell(row, cols.get("regulatoryField")) || null,
      listId,
    });
  }
  return rows;
}
