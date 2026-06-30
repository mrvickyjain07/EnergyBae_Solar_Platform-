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
}

export const WORKSHEET_DIVISOR = 106.060606;

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

  const history = slot1Data.history || [];

  // Populate months data row 9 to 20 — no fabricated fallback numbers, blank when unknown
  for (let i = 0; i < 12; i++) {
    const h = history[i] || { month: "", units: "", billAmount: "", unitCost: "" };
    const row = 9 + i;
    const srNoLabel = 2 + i;

    set(`B${row}`, srNoLabel);
    set(`C${row}`, h.month || "");
    set(`D${row}`, h.units === "" || h.units === undefined ? null : Number(h.units));
    set(`E${row}`, h.billAmount === "" || h.billAmount === undefined ? null : Number(h.billAmount));
    set(`F${row}`, h.unitCost === "" || h.unitCost === undefined ? null : Number(h.unitCost));
  }

  // Row 21 is a blank divider

  const validUnits = history.filter((x) => typeof x.units === "number");
  const avgUnits = validUnits.length > 0
    ? validUnits.reduce((acc, cur) => acc + (cur.units as number), 0) / validUnits.length
    : 0;

  const validBills = history.filter((x) => typeof x.billAmount === "number" && (x.billAmount as number) > 0);
  const avgBill = validBills.length > 0
    ? validBills.reduce((acc, cur) => acc + (cur.billAmount as number), 0) / validBills.length
    : 0;

  const validCosts = history.filter((x) => typeof x.unitCost === "number" && (x.unitCost as number) > 0);
  const avgCost = validCosts.length > 0
    ? validCosts.reduce((acc, cur) => acc + (cur.unitCost as number), 0) / validCosts.length
    : 0;

  const kwVal = avgUnits / WORKSHEET_DIVISOR;
  const panelsFraction = kwVal > 0 ? (kwVal * 1000) / sUsed : 0;
  const panelsInt = panelsFraction > 0 ? Math.ceil(panelsFraction) : 0;
  const capacity = (panelsInt * sUsed) / 1000;

  // --- Calculated Summation Rows 22 to 26 ---
  set("B22", "Average");
  set("D22", validUnits.length > 0 ? avgUnits : null, "AVERAGE(D9:D20)");
  set("E22", avgBill > 0 ? avgBill : null, "AVERAGE(E9:E20)");
  set("F22", avgCost > 0 ? avgCost : null, "AVERAGE(F9:F20)");

  set("B23", "kW");
  set("D23", kwVal, "D22/106.060606");

  set("B24", "Solar Panels");
  set("D24", panelsFraction, "D23*1000/C7");

  set("B25", "Solar capacity");
  set("D25", capacity, "D26*C7/1000");

  set("B26", "Number of Panels");
  set("D26", panelsInt, "ROUNDUP(D24,0)");

  // Row 29/30 (Totals — single consumer, mirrors capacity/panels above)
  set("C29", "Total solar capacity");
  set("D29", capacity, "D25");

  set("C30", "Number of solar panels");
  set("D30", panelsInt, "D26");

  return {
    sheetTitle: "Pranay HOME",
    cells,
    colWidths: [4, 18, 22, 15, 15, 15],
  };
}
