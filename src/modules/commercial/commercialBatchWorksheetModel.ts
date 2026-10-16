// Batch Bill Analysis — stacks N bills onto ONE worksheet.
//
// The per-bill detail blocks are produced by calling buildCommercialWorksheetModel
// (the exact function single-bill export uses) at increasing startRow offsets and
// splicing its cells in UNCHANGED. Nothing about a bill's layout, labels, ordering
// or values is re-derived here — if it were, batch output could drift from
// single-bill output. The only thing this file owns is what sits BETWEEN blocks:
// the summary table, separator rows and processing totals.
import { WorksheetCell } from "../../worksheetModel";
import { CommercialBillData } from "./types";
import { buildCommercialWorksheetModel, CommercialSizingInputs } from "./commercialWorksheetModel";
import { computeBillingStats } from "./commercialCalculations";
import { analyseCommercial } from "./consumptionSizing";

export const BATCH_SHEET_TITLE = "Batch Bill Analysis";
const GAP_ROWS = 2; // blank rows between one bill's block and the next

export type BatchBillStatus = "Completed" | "Partially Extracted" | "Failed" | "Quota Blocked";

export interface BatchBillEntry {
  sourceFile: string;
  status: BatchBillStatus;
  data?: CommercialBillData; // absent for Failed / Quota Blocked
  error?: string;
}

// Presentation-only extras. Kept local rather than pushed onto the shared
// WorksheetCell so the single-bill/Sheets path keeps its plain {ref,value} shape.
export interface BatchCell extends WorksheetCell {
  bold?: boolean;
  fill?: string; // ARGB
  link?: string; // internal target, e.g. "#'Batch Bill Analysis'!A42"
}

export interface BatchWorksheetModel {
  sheetTitle: string;
  cells: BatchCell[];
  colWidths: number[];
  endRow: number;
}

// Exported so the writer knows which band needs light-on-dark text.
export const BATCH_HEADER_FILL = "FF1F4E78";
const HEADER_FILL = BATCH_HEADER_FILL;
const SEPARATOR_FILL = "FFDCE6F1";
const TOTALS_FILL = "FFF2F6FA";

const SUMMARY_HEADERS = [
  "Sr.No",
  "Source File",
  "Consumer No",
  "Consumer Name",
  "Category",
  "Active Energy (kWh, this bill)",
  "Avg Bill Amount (Rs)",
  "Energy-based kWp (this bill alone)",
  "Status",
];

const COL = (i: number) => String.fromCharCode(65 + i); // 0 -> A

const hasData = (e: BatchBillEntry): e is BatchBillEntry & { data: CommercialBillData } =>
  e.data !== undefined && (e.status === "Completed" || e.status === "Partially Extracted");

// Re-uses the same pure calculators the dashboard and single-bill export use, so
// a summary-row figure can never disagree with the detail block below it.
function summaryFigures(data: CommercialBillData, sizing: CommercialSizingInputs) {
  const stats = computeBillingStats(data.billingHistory, data.fixedCharges);
  const { pipeline, baseline } = analyseCommercial([{ data, sourceId: data.filename || "bill" }], sizing);
  return {
    activeKwh: baseline ? baseline.totalKwh : null,
    avgBillAmount: stats.avgBillAmount > 0 ? Number(stats.avgBillAmount.toFixed(2)) : null,
    solarKwp: pipeline.fullKwp > 0 ? Number(pipeline.fullKwp.toFixed(1)) : null,
    billAmount: typeof data.billAmount === "number" ? data.billAmount : 0,
  };
}

export function buildCommercialBatchWorksheetModel(
  entries: BatchBillEntry[],
  sizing: CommercialSizingInputs,
  today = new Date()
): BatchWorksheetModel {
  const cells: BatchCell[] = [];
  const set = (ref: string, value: string | number | null, extra: Partial<BatchCell> = {}) =>
    cells.push({ ref, value, ...extra });

  let row = 1;

  // ── Title ────────────────────────────────────────────────────────────────
  set(`A${row}`, `COMMERCIAL BATCH BILL ANALYSIS — ${today.toISOString().slice(0, 10)}`, { bold: true });
  row += 2;

  // ── Batch summary table (doubles as a table of contents) ────────────────
  set(`A${row}`, "BATCH SUMMARY", { bold: true });
  row += 1;
  SUMMARY_HEADERS.forEach((h, i) => set(`${COL(i)}${row}`, h, { bold: true, fill: HEADER_FILL }));
  row += 1;

  const summaryFirstRow = row;
  row += entries.length; // reserved; filled in on the second pass below

  // ── Detail blocks ────────────────────────────────────────────────────────
  // Two passes: the summary hyperlinks need each block's start row, and block
  // heights vary per bill, so blocks are laid out first and the reserved
  // summary rows are back-filled afterwards.
  const blockStartByIndex = new Map<number, number>();
  row += 1; // one spacer between the summary table and the first block

  entries.forEach((entry, idx) => {
    if (!hasData(entry)) return; // Failed / Quota Blocked: summary row only

    const separatorRow = row;
    const name = entry.data.consumerName || "Unnamed";
    set(
      `A${separatorRow}`,
      `BILL ${idx + 1} — ${entry.sourceFile} — ${name} — Status: ${entry.status}`,
      { bold: true, fill: SEPARATOR_FILL }
    );
    // Shade the rest of the separator row so it reads as one band across A..F.
    for (let c = 1; c < 6; c++) set(`${COL(c)}${separatorRow}`, null, { fill: SEPARATOR_FILL });
    blockStartByIndex.set(idx, separatorRow);
    row += 1;

    const model = buildCommercialWorksheetModel(entry.data, sizing, row);
    // Spliced in verbatim — this is the single-bill layout, unmodified.
    model.cells.forEach((c) => cells.push(c));
    row = (model.endRow ?? row) + 1 + GAP_ROWS;
  });

  // ── Back-fill the reserved summary rows ─────────────────────────────────
  let totalBillAmount = 0;

  entries.forEach((entry, idx) => {
    const r = summaryFirstRow + idx;
    const target = blockStartByIndex.get(idx);
    set(`A${r}`, idx + 1, target ? { link: `#'${BATCH_SHEET_TITLE}'!A${target}` } : {});
    set(`B${r}`, entry.sourceFile, target ? { link: `#'${BATCH_SHEET_TITLE}'!A${target}` } : {});

    if (hasData(entry)) {
      const f = summaryFigures(entry.data, sizing);
      totalBillAmount += f.billAmount;
      set(`C${r}`, entry.data.consumerNo || null);
      set(`D${r}`, entry.data.consumerName || null);
      set(`E${r}`, entry.data.category || null);
      set(`F${r}`, f.activeKwh);
      set(`G${r}`, f.avgBillAmount);
      set(`H${r}`, f.solarKwp);
      set(`I${r}`, entry.status);
    } else {
      set(`C${r}`, null);
      set(`D${r}`, null);
      set(`E${r}`, null);
      set(`F${r}`, null);
      set(`G${r}`, null);
      set(`H${r}`, null);
      set(`I${r}`, entry.error ? `${entry.status} — ${entry.error}` : entry.status);
    }
  });

  // ── Processing summary ───────────────────────────────────────────────────
  const count = (s: BatchBillStatus) => entries.filter((e) => e.status === s).length;
  set(`A${row}`, "PROCESSING SUMMARY", { bold: true, fill: TOTALS_FILL });
  for (let c = 1; c < 6; c++) set(`${COL(c)}${row}`, null, { fill: TOTALS_FILL });
  row += 1;

  const kv = (label: string, value: string | number | null) => {
    set(`A${row}`, label);
    set(`B${row}`, value);
    row += 1;
  };
  kv("Total files", entries.length);
  kv("Successfully processed", count("Completed"));
  kv("Partially processed", count("Partially Extracted"));
  kv("Failed", count("Failed"));
  kv("Quota blocked", count("Quota Blocked"));
  kv("Total bill amount (Rs)", totalBillAmount > 0 ? Number(totalBillAmount.toFixed(2)) : null);
  row += 1;

  // ── Consolidated history: all bills of a connection together, duplicates and
  //    history-table months shown but not counted (consumptionSizing.ts) ──
  const ok = entries.filter(hasData);
  const all = analyseCommercial(ok.map((e, i) => ({ data: e.data, sourceId: `${i + 1}. ${e.sourceFile}` })), sizing);
  set(`A${row}`, "CONSOLIDATED HISTORY (active energy, kWh)", { bold: true, fill: TOTALS_FILL });
  for (let c = 1; c < 6; c++) set(`${COL(c)}${row}`, null, { fill: TOTALS_FILL });
  row += 1;
  for (const h of all.histories) {
    set(`A${row}`, `Connection ${h.connectionId ?? "not identified — confirm"}`, { bold: true });
    row += 1;
    ["Month", "Status", "Active (kWh)", "Apparent (kVAh)", "Days", "Source / note"].forEach((t, i) => set(`${COL(i)}${row}`, t, { bold: true }));
    row += 1;
    for (const m of h.months) {
      set(`A${row}`, m.month); set(`B${row}`, m.status); set(`C${row}`, m.activeKwh); set(`D${row}`, m.apparentKvah); set(`E${row}`, m.days);
      set(`F${row}`, [m.sources.join(", "), m.note].filter(Boolean).join(" — "));
      row += 1;
    }
    for (const w of h.warnings) kv("Warning", w);
  }
  const b = all.baseline;
  kv("Connection sized", all.history?.connectionId ?? null);
  kv("Valid periods", b ? b.periods : null);
  kv("Total active energy (kWh)", b ? b.totalKwh : null);
  kv("Average per month (kWh)", b ? Number(b.avgMonthlyKwh.toFixed(0)) : null);
  kv(`Annual active energy (kWh, ${b?.annualBasis ?? "-"})`, b ? Number(b.annualKwh.toFixed(0)) : null);
  kv("Assumed annual specific yield (kWh/kWp/yr)", sizing.specificYield);
  kv("Energy offset target (%)", sizing.offsetPct);
  kv("Additional sizing margin (%)", sizing.marginPct);
  kv("Theoretical energy-based capacity (kWp)", all.pipeline.fullKwp > 0 ? Number(all.pipeline.fullKwp.toFixed(1)) : null);
  kv("TOD tariff-band proxy capacity (kWp, low confidence)", all.pipeline.todKwp > 0 ? Number(all.pipeline.todKwp.toFixed(1)) : null);
  kv("Note", "Preliminary only, not an installable capacity: confirm daytime load, site yield, roof area and the utility's interconnection/export limits before quoting.");

  return {
    sheetTitle: BATCH_SHEET_TITLE,
    cells,
    // A..F inherit the single-bill widths so stacked blocks look identical to a
    // single-bill export; G..I are only used by the summary table.
    colWidths: [34, 22, 16, 16, 16, 14, 20, 20, 26],
    endRow: row - 1,
  };
}
