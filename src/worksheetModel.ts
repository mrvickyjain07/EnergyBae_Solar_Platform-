// Pure, framework-agnostic builder for the solar-sizing worksheet layout.
// Used by server.ts (xlsx generation) and by the Google Sheets export flow,
// so both outputs are produced from one source of truth.

export interface BillHistoryRowLike {
  month?: string;
  units?: number | "";
  billAmount?: number | "";
  unitCost?: number | "";
}

export interface SlotDataLike {
  consumerName?: string;
  consumerNumber?: string;
  fixedCharges?: number | "";
  sanctionedLoadKw?: number | "";
  connectionType?: string;
  contractDemandKva?: string;
  history?: BillHistoryRowLike[];
}

export interface WorksheetCell {
  ref: string;
  value: string | number | null;
  formula?: string;
}

export interface WorksheetModel {
  sheetTitle: string;
  cells: WorksheetCell[];
  colWidths: number[]; // A..F, in "characters" (xlsx wch units)
  // Last row the model occupies. Block height is NOT fixed — billing history is
  // 0-12 rows and the validation list is dynamic — so a caller stacking several
  // models on one sheet cannot assume a stride and would otherwise have to
  // re-parse max row out of the cell refs.
  endRow?: number;
  /** Residential sizing figures (same numbers as the cells) — read these, not fixed cell refs. */
  summary?: HistorySummary;
}

export const WORKSHEET_DIVISOR = 106.060606;

export interface HistorySummary {
  /** (bill − fixed charges) ÷ units per month, as in the office workbook; null when units or bill is unknown. */
  unitCosts: (number | null)[];
  avgUnits: number | null;
  avgBill: number | null;
  avgCost: number | null;
  kw: number;
  panelsFraction: number;
  panels: number;
  capacity: number;
  /** Sheet rows: first/last month row and the Average row. */
  rows: { first: number; last: number; avg: number };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// THE Home/Society averages — the on-screen sheet, the KPI cards, the xlsx /
// Google Sheets export, society batch and saved bills all read this, so they
// cannot disagree (three hand-copied averages used to). Rules from the office
// workbook (2026-10-21): every printed month counts, the bill's own month is
// not added (server.ts), a month with no units / bill read is left out of that
// average rather than counted as 0, and unit cost = (bill − fixed charges) ÷ units.
export function summariseHistory(slot: SlotDataLike, solarPanelUsed: number): HistorySummary {
  const sUsed = solarPanelUsed || 600;
  const history = slot.history || [];
  const fixed = typeof slot.fixedCharges === "number" ? slot.fixedCharges : 0;
  const pos = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
  const unitCosts = history.map((h) => {
    const u = pos(h.units), b = pos(h.billAmount);
    return u !== null && b !== null ? (b - fixed) / u : null;
  });
  const avgUnits = mean(history.map((h) => pos(h.units)).filter((v): v is number => v !== null));
  const avgBill = mean(history.map((h) => pos(h.billAmount)).filter((v): v is number => v !== null));
  const avgCost = mean(unitCosts.filter((v): v is number => v !== null));
  const kw = (avgUnits ?? 0) / WORKSHEET_DIVISOR;
  const panelsFraction = kw > 0 ? (kw * 1000) / sUsed : 0;
  const panels = panelsFraction > 0 ? Math.ceil(panelsFraction) : 0;
  const last = 8 + Math.max(12, history.length);
  return { unitCosts, avgUnits, avgBill, avgCost, kw, panelsFraction, panels, capacity: (panels * sUsed) / 1000, rows: { first: 9, last, avg: last + 2 } };
}

export function buildWorksheetModel(slot1Data: SlotDataLike, solarPanelUsed: number): WorksheetModel {
  const sUsed = solarPanelUsed || 600;
  const cells: WorksheetCell[] = [];
  const set = (ref: string, value: string | number | null, formula?: string) => {
    cells.push(formula ? { ref, value, formula } : { ref, value });
  };

  // --- Header Section rows 1 to 7 ---
  set("B1", "Consumer Name");
  set("D1", slot1Data.consumerName || "");

  set("B2", "Consumer No");
  set("D2", slot1Data.consumerNumber || "");

  set("B3", "Fixed Charges");
  set("D3", typeof slot1Data.fixedCharges === "number" ? slot1Data.fixedCharges : null);

  set("B4", "Sanct. Load (kW)");
  const load = typeof slot1Data.sanctionedLoadKw === "number" ? slot1Data.sanctionedLoadKw : "";
  set("D4", load !== "" ? `${load}KW` : "");

  set("B5", "Connection Type");
  set("D5", slot1Data.connectionType || "");

  set("B6", "Contract Demand (KVA) :");
  set("D6", slot1Data.contractDemandKva || "");

  set("B7", "Solar Pannel used");
  set("C7", sUsed);

  // Table Column Labels (Row 8)
  set("B8", "Sr.No");
  set("C8", "Month");
  set("D8", "Units");
  set("E8", "Bill Amount");
  set("F8", "Unit Cost");

  const sum = summariseHistory(slot1Data, sUsed);
  const { first, last, avg } = sum.rows;
  const history = slot1Data.history || [];

  // One row per printed month (at least 12, so a 12-month bill keeps the
  // classic layout: data 9–20, Average 22) — no fabricated numbers, blank when unknown.
  for (let row = first; row <= last; row++) {
    const h = history[row - first] || {};
    const cost = sum.unitCosts[row - first] ?? null;
    set(`B${row}`, row - first + 1);
    set(`C${row}`, h.month || "");
    set(`D${row}`, typeof h.units === "number" ? h.units : null);
    set(`E${row}`, typeof h.billAmount === "number" ? h.billAmount : null);
    set(`F${row}`, cost, `IF(AND(N(D${row})>0,N(E${row})>0),(E${row}-N($D$3))/D${row},"")`);
  }

  // --- Summary rows (Average, kW, panels, capacity) right below the months ---
  set(`B${avg}`, "Average");
  set(`D${avg}`, sum.avgUnits, `AVERAGEIF(D${first}:D${last},">0")`);
  set(`E${avg}`, sum.avgBill, `AVERAGEIF(E${first}:E${last},">0")`);
  set(`F${avg}`, sum.avgCost, `AVERAGE(F${first}:F${last})`);

  set(`B${avg + 1}`, "kW");
  set(`D${avg + 1}`, sum.kw, `D${avg}/106.060606`);

  set(`B${avg + 2}`, "Solar Panels");
  set(`D${avg + 2}`, sum.panelsFraction, `D${avg + 1}*1000/C7`);

  set(`B${avg + 3}`, "Solar capacity");
  set(`D${avg + 3}`, sum.capacity, `D${avg + 4}*C7/1000`);

  set(`B${avg + 4}`, "Number of Panels");
  set(`D${avg + 4}`, sum.panels, `ROUNDUP(D${avg + 2},0)`);

  // Totals — single consumer, mirrors capacity/panels above
  set(`C${avg + 7}`, "Total solar capacity");
  set(`D${avg + 7}`, sum.capacity, `D${avg + 3}`);

  set(`C${avg + 8}`, "Number of solar panels");
  set(`D${avg + 8}`, sum.panels, `D${avg + 4}`);

  return {
    sheetTitle: "Pranay HOME",
    cells,
    summary: sum,
    colWidths: [4, 18, 22, 15, 15, 15],
  };
}
