// scripts/extractBoqFixtures.ts
// Run with: npx tsx scripts/extractBoqFixtures.ts [path/to/source_boqs]
//
// Freezes the real BOQ workbooks into JSON golden fixtures
// (src/modules/boqEngine/fixtures/workbooks/*.json), one per BOQ sheet.
// Fixtures hold RAW CELLS only — formula text (when the cell has one) and the
// cached value Google Sheets saved — with no interpretation. Mapping cells to
// engine inputs and to BOQ lines is done in code (workbookGolden.ts) so it is
// reviewable and tested. Re-run only when the source workbooks change; the
// fixtures are committed so tests never need the .xlsx files.
import * as XLSX from "xlsx";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SRC = process.argv[2] ?? "../EnergyBae_ClaudeCode_6_Files/source_boqs";
const OUT = "src/modules/boqEngine/fixtures/workbooks";

type Cell = { f?: string; v: string | number | boolean | null };
const cell = (ws: XLSX.WorkSheet, addr: string): Cell | undefined => {
  const c = ws[addr] as XLSX.CellObject | undefined;
  if (!c || (c.v === undefined && !c.f)) return undefined;
  const out: Cell = { v: (c.v as any) ?? null };
  if (c.f) out.f = "=" + c.f;
  return out;
};
const A = (col: number, row: number) => XLSX.utils.encode_cell({ c: col - 1, r: row - 1 });
const text = (c?: Cell) => (c && typeof c.v === "string" ? c.v.trim() : "");

const slug = (s: string) => s.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

mkdirSync(OUT, { recursive: true });
let written = 0;
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".xlsx")).sort()) {
  const wb = XLSX.read(readFileSync(join(SRC, file)), { cellFormula: true }); // readFile is not exported in the ESM build
  for (const sheet of wb.SheetNames) {
    if (sheet === "Sheet2" || sheet === "Sheet3") continue;
    const ws = wb.Sheets[sheet];

    const params: Record<string, { row: number; B?: Cell; C?: Cell }> = {};
    for (let r = 1; r <= 75; r++) {
      const label = text(cell(ws, A(1, r)));
      if (label) params[label] = { row: r, B: cell(ws, A(2, r)), C: cell(ws, A(3, r)) };
    }

    let header = 0;
    for (let r = 1; r <= 40 && !header; r++) for (let c = 5; c <= 14; c++) if (["Qty.", "Qty"].includes(text(cell(ws, A(c, r))))) header = r;
    if (!header) throw new Error(`${file} / ${sheet}: no "Qty." header row`);

    const lines: any[] = [];
    const commercial: any[] = [];
    let material = "";
    for (let r = header + 1; r <= header + 75; r++) {
      const [F, G, H, I, J, K, L, M, N] = [6, 7, 8, 9, 10, 11, 12, 13, 14].map((c) => cell(ws, A(c, r)));
      if (text(F)) material = text(F);
      if (!F && !G && !H) {
        if (I || J || K || L || M || N) commercial.push({ row: r, I, J, K, L, M, N });
        continue;
      }
      lines.push({ row: r, material, material_cell: F, spec: G, make: H, unit: I, qty: J, note: K, rate: L, price: M, extra: N });
    }

    const header_cells: Record<string, Cell> = {};
    for (let r = 1; r <= 8; r++) for (let c = 5; c <= 10; c++) { const x = cell(ws, A(c, r)); if (x) header_cells[A(c, r)] = x; }
    const side: Record<string, Cell> = {};
    for (let r = 1; r <= 90; r++) for (let c = 15; c <= 23; c++) { const x = cell(ws, A(c, r)); if (x) side[A(c, r)] = x; }

    const fixture = { source: { workbook: file, sheet: sheet.trim(), headerRow: header }, params, lines, commercial, header: header_cells, side };
    writeFileSync(join(OUT, `${slug(basename(file, ".xlsx").split(" ")[0])}--${slug(sheet)}.json`), JSON.stringify(fixture, null, 1) + "\n");
    written++;
  }
}
console.log(`wrote ${written} fixtures to ${OUT}`);
