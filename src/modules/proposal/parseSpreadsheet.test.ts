// src/modules/proposal/parseSpreadsheet.test.ts
// Run with: npx tsx src/modules/proposal/parseSpreadsheet.test.ts
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseSpreadsheetBuffer } from "./parseSpreadsheet";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

// Build a real .xlsx buffer in-memory (same XLSX.utils used by exportExcel.ts)
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ["Wire Name", "Size (sqmm)", "Price/m"],
  ["DC Cable 4sqmm Cu", 4, "18.5"],
  ["AC Cable 6sqmm Cu", 6, "27"],
]);
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
const xlsxBuffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

const xlsxResult = parseSpreadsheetBuffer(xlsxBuffer);
check("xlsx headers", xlsxResult.headers, ["Wire Name", "Size (sqmm)", "Price/m"]);
check("xlsx row count", xlsxResult.rows.length, 2);
check("xlsx first row", xlsxResult.rows[0], { "Wire Name": "DC Cable 4sqmm Cu", "Size (sqmm)": 4, "Price/m": "18.5" });

// CSV buffer
const csvBuffer = Buffer.from("Name,Size,Price\nEarth Cable 6sqmm,6,15.2\n", "utf-8");
const csvResult = parseSpreadsheetBuffer(csvBuffer);
check("csv headers", csvResult.headers, ["Name", "Size", "Price"]);
check("csv row count", csvResult.rows.length, 1);
check("csv first row", csvResult.rows[0], { Name: "Earth Cable 6sqmm", Size: 6, Price: 15.2 });

// Empty sheet (header row only)
const wbEmpty = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbEmpty, XLSX.utils.aoa_to_sheet([["A", "B"]]), "Sheet1");
const emptyResult = parseSpreadsheetBuffer(XLSX.write(wbEmpty, { type: "buffer", bookType: "xlsx" }));
check("empty-body headers", emptyResult.headers, ["A", "B"]);
check("empty-body rows", emptyResult.rows, []);

console.log(`\n${passed} checks passed.`);
