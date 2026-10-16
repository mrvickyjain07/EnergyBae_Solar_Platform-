// src/modules/proposal/parseSpreadsheet.ts
// Shared Excel/CSV parser for wire-price uploads. xlsx.read() handles both
// formats from a single buffer, so no separate CSV library is needed.
import * as XLSX from "xlsx";

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

export function parseSpreadsheetBuffer(buffer: Buffer): ParsedSpreadsheet {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" })[0] ?? [];
  const headers = headerRow.map((h) => String(h));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return { headers, rows };
}
