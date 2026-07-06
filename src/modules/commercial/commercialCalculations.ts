// Pure formula engine for Commercial Bill Analysis — ported 1:1 from the
// <script> block in bill-analysis-v3.html (renderBill / setTODMode /
// cbaRenderTOD / cbaCalcMeter / cbaRun), so the dashboard math is preserved
// exactly. Used by both CommercialBillAnalysis.tsx (live display) and
// commercialWorksheetModel.ts (Excel export) as the single source of truth —
// same pattern as src/worksheetModel.ts is for Residential.
import { CommercialBillingHistoryRow, CommercialTodSlotReading, TodSlotId } from "./types";

export type TodMode = "LT" | "HT";

export function detectTodMode(connectionType: string): TodMode {
  return connectionType === "HT" ? "HT" : "LT";
}

function n(v: number | "" | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function roundUp05(x: number): number {
  return Math.ceil(x * 2) / 2;
}

// ─── §02 Billing-history table ─────────────────────────────────────────────
const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Builds N blank rows — month stays blank until real OCR data fills it in.
// Never pre-fills a guessed calendar range (no fabricated month labels).
export function buildBlankBillingRows(count = 12): CommercialBillingHistoryRow[] {
  return Array.from({ length: count }, () => ({ monthLabel: "", units: "", billAmount: "" }));
}

// Parses "Jan-2026" / "Jan-26" into a sortable (year*12 + monthIndex) key.
// Returns null when the label doesn't carry a recognizable month + year, so
// callers can fall back to the model's own emitted order instead of
// misordering rows.
export function parseMonthLabelKey(label: string): number | null {
  if (!label) return null;
  const match = label.trim().match(/([A-Za-z]+)-?(\d{2,4})/);
  if (!match) return null;
  const monthIdx = MONTH_NAME_TO_INDEX[match[1].toLowerCase().slice(0, 3)];
  if (monthIdx === undefined) return null;
  let year = Number(match[2]);
  if (!Number.isFinite(year)) return null;
  if (year < 100) year += 2000; // 2-digit year fallback (e.g. "Jan-26")
  return year * 12 + monthIdx;
}

// De-duplicates by monthLabel (last occurrence wins), sorts oldest -> newest
// when every label is parseable, and keeps only the most recent `windowSize`
// entries — left-padding with blank rows if fewer than `windowSize` exist, so
// the most recent entry always lands in the LAST row (matching the "current
// month" = last-row convention used throughout the dashboard).
export function buildBillingHistoryWindow(
  ocrHistory: CommercialBillingHistoryRow[],
  windowSize = 12
): CommercialBillingHistoryRow[] {
  const byMonth = new Map<string, CommercialBillingHistoryRow>();
  ocrHistory.forEach((row) => {
    if (!row.monthLabel || !row.monthLabel.trim()) return;
    byMonth.set(row.monthLabel.trim(), { ...row, monthLabel: row.monthLabel.trim() });
  });

  let rows = Array.from(byMonth.values());
  const keyed = rows.map((row) => ({ row, key: parseMonthLabelKey(row.monthLabel) }));
  if (keyed.length > 0 && keyed.every((k) => k.key !== null)) {
    keyed.sort((a, b) => (a.key as number) - (b.key as number));
    rows = keyed.map((k) => k.row);
  }

  if (rows.length > windowSize) {
    rows = rows.slice(rows.length - windowSize);
  } else if (rows.length < windowSize) {
    rows = [...buildBlankBillingRows(windowSize - rows.length), ...rows];
  }

  return rows;
}

// ─── §02 Billing history stats ─────────────────────────────────────────────
export interface BillRowFlags {
  units: number;
  billAmount: number;
  unitCost: number | null; // (billAmount - fixedCharges) / units
  isZero: boolean;
  isDemandOnly: boolean; // zero units but a bill amount printed
  isOutlier: boolean; // units > mean + 2*stddev (only flagged once >= 4 non-zero months exist)
}

export interface BillingStats {
  rows: BillRowFlags[];
  validCount: number; // months excluded from zero/outlier
  avgUnits: number;
  avgBillAmount: number;
  avgUnitCost: number;
  avgUnitCostRoundUp: number;
}

export function computeBillingStats(
  bRows: CommercialBillingHistoryRow[],
  fixedCharges: number | ""
): BillingStats {
  const fc = n(fixedCharges);
  const rawUnits = bRows.map((r) => n(r.units));
  const nonZero = rawUnits.filter((u) => u > 0);
  const mean = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  const variance =
    nonZero.length > 1
      ? nonZero.reduce((s, u) => s + Math.pow(u - mean, 2), 0) / nonZero.length
      : 0;
  const stddev = Math.sqrt(variance);
  const threshold = mean + 2 * stddev;

  const rows: BillRowFlags[] = bRows.map((r) => {
    const units = n(r.units);
    const billAmount = n(r.billAmount);
    const isZero = units === 0;
    const isDemandOnly = units === 0 && billAmount > 0;
    const isOutlier = units > 0 && units > threshold && nonZero.length >= 4;
    const unitCost = units > 0 && billAmount > 0 && fc >= 0 ? (billAmount - fc) / units : null;
    return { units, billAmount, unitCost, isZero, isDemandOnly, isOutlier };
  });

  const valid = rows.filter((r) => !r.isZero && !r.isOutlier);
  const avgUnits = valid.length > 0 ? valid.reduce((s, r) => s + r.units, 0) / valid.length : 0;

  const billed = valid.filter((r) => r.billAmount > 0);
  const avgBillAmount = billed.length > 0 ? billed.reduce((s, r) => s + r.billAmount, 0) / billed.length : 0;

  const costed = billed.filter((r) => r.units > 0);
  const avgUnitCost =
    costed.length > 0
      ? costed.reduce((s, r) => s + (r.billAmount - fc) / r.units, 0) / costed.length
      : 0;
  const avgUnitCostRoundUp = roundUp05(avgUnitCost);

  return { rows, validCount: valid.length, avgUnits, avgBillAmount, avgUnitCost, avgUnitCostRoundUp };
}

// ─── §04 TOD utilisation ────────────────────────────────────────────────────
export type TodRule = "FULL" | "DIV7" | "NONE";

export interface TodSlotResult {
  slot: TodSlotId;
  units: number;
  pctShare: number; // 0..1
  rule: TodRule;
  utilisable: number; // 0..1 fraction of total, before buffer
}

export interface TodUtilisation {
  slots: TodSlotResult[];
  totalUnits: number;
  utilisableFraction: number; // sum of per-slot utilisable, before buffer
  bufferedFraction: number; // LT: *1.1 buffer, HT: same as utilisableFraction
}

function todRule(slot: TodSlotId, mode: TodMode): TodRule {
  if (slot === "A") return "NONE";
  if (slot === "B" || slot === "C") return "FULL";
  // slot D
  return mode === "LT" ? "DIV7" : "NONE";
}

export function computeTodUtilisation(todSlots: CommercialTodSlotReading[], mode: TodMode): TodUtilisation {
  const totalUnits = todSlots.reduce((s, sl) => s + n(sl.units), 0);

  const slots: TodSlotResult[] = todSlots.map((sl) => {
    const units = n(sl.units);
    const pctShare = totalUnits > 0 ? units / totalUnits : 0;
    const rule = todRule(sl.slot, mode);
    const utilisable = rule === "FULL" ? pctShare : rule === "DIV7" ? pctShare / 7 : 0;
    return { slot: sl.slot, units, pctShare, rule, utilisable };
  });

  const utilisableFraction = slots.reduce((s, sl) => s + sl.utilisable, 0);
  const bufferedFraction = mode === "LT" ? utilisableFraction * 1.1 : utilisableFraction;

  return { slots, totalUnits, utilisableFraction, bufferedFraction };
}

// ─── §03 Meter readings ─────────────────────────────────────────────────────
export interface MeterDerived {
  assessedUnits: number | null;
  powerFactor: number | null;
  billedDemand: number | null; // MAX(recordedMD, 0.75 * contractDemand)
}

export function computeMeterDerived(
  prevReading: number | "",
  currReading: number | "",
  multiplyingFactor: number | "",
  kvahReading: number | "",
  recordedMD: number | "",
  contractDemand: number | ""
): MeterDerived {
  const prev = n(prevReading);
  const curr = n(currReading);
  const mf = n(multiplyingFactor) || 1;
  const kvah = n(kvahReading);
  const assessed = (curr - prev) * mf;
  const assessedUnits = assessed > 0 ? assessed : null;
  const powerFactor = assessed > 0 && kvah > 0 ? assessed / kvah : null;

  const md = n(recordedMD);
  const cd = n(contractDemand);
  const billedDemand = cd > 0 ? Math.max(md, 0.75 * cd) : md > 0 ? md : null;

  return { assessedUnits, powerFactor, billedDemand };
}

// ─── §03 Charge reconciliation ──────────────────────────────────────────────
export interface ChargeComponents {
  energyCharges: number | "";
  demandCharges: number | "";
  fac: number | "";
  ed: number | "";
  tose: number | "";
  wheelingCharges: number | "";
  delayedPayment: number | "";
  arrears: number | "";
  creditAdjustment: number | "";
  otherCharges: number | "";
  billAmount: number | ""; // printed bill amount
}

export interface ChargeReconciliation {
  reconstructedTotal: number; // ROUND(sum, -1)
  printedAmount: number;
  diff: number;
  withinTolerance: boolean; // diff <= 10
}

export function reconcileCharges(c: ChargeComponents): ChargeReconciliation {
  const rawSum =
    n(c.energyCharges) +
    n(c.demandCharges) +
    n(c.fac) +
    n(c.ed) +
    n(c.tose) +
    n(c.wheelingCharges) +
    n(c.delayedPayment) +
    n(c.arrears) +
    n(c.otherCharges) -
    n(c.creditAdjustment);
  const reconstructedTotal = Math.round(rawSum / 10) * 10;
  const printedAmount = n(c.billAmount);
  const diff = Math.abs(reconstructedTotal - printedAmount);
  return { reconstructedTotal, printedAmount, diff, withinTolerance: diff <= 10 };
}

// ─── §05 Solar sizing pipeline ──────────────────────────────────────────────
export interface SizingPipeline {
  solarCapacityRawKwp: number; // (avgUnits * 12 * buffer) / sunHours
  fullPanels: number;
  fullKwp: number;
  todSolarCapacityKwp: number; // utilisableFraction(buffered) * solarCapacityRawKwp
  todPanels: number;
  todKwp: number;
  solarGenPerYearKwh: number; // todKwp * sunHours
  annualSavingAvgRate: number; // solarGen * avgUnitCost
  annualSavingRoundUpRate: number; // solarGen * avgUnitCostRoundUp
  simplePaybackYears: number | null; // systemCost / annualSavingAvgRate
}

export function computeSizingPipeline(
  avgUnits: number,
  avgUnitCost: number,
  avgUnitCostRoundUp: number,
  bufferedTodFraction: number,
  panelWattage: number,
  sunHoursPerYear: number,
  buffer: number,
  systemCost: number
): SizingPipeline {
  const panW = panelWattage > 0 ? panelWattage : 600;
  const sunH = sunHoursPerYear > 0 ? sunHoursPerYear : 1400;
  const buf = buffer > 0 ? buffer : 1.1;

  const solarCapacityRawKwp = (avgUnits * 12 * buf) / sunH;
  const fullPanelsRaw = (solarCapacityRawKwp / panW) * 1000;
  const fullPanels = Math.round(fullPanelsRaw);
  const fullKwp = (fullPanels * panW) / 1000;

  const todSolarCapacityKwp = bufferedTodFraction * solarCapacityRawKwp;
  const todPanelsRaw = (todSolarCapacityKwp / panW) * 1000;
  const todPanels = Math.round(todPanelsRaw);
  const todKwp = (todPanels * panW) / 1000;

  const solarGenPerYearKwh = todKwp * sunH;
  const annualSavingAvgRate = solarGenPerYearKwh * avgUnitCost;
  const annualSavingRoundUpRate = solarGenPerYearKwh * avgUnitCostRoundUp;
  const simplePaybackYears =
    systemCost > 0 && annualSavingAvgRate > 0 ? systemCost / annualSavingAvgRate : null;

  return {
    solarCapacityRawKwp,
    fullPanels,
    fullKwp,
    todSolarCapacityKwp,
    todPanels,
    todKwp,
    solarGenPerYearKwh,
    annualSavingAvgRate,
    annualSavingRoundUpRate,
    simplePaybackYears,
  };
}

// ─── §06 Validation checklist ───────────────────────────────────────────────
export interface ValidationCheck {
  label: string;
  status: "ok" | "warn" | "err";
}

export function computeValidationChecks(
  stats: BillingStats,
  tod: TodUtilisation,
  meter: MeterDerived,
  recon: ChargeReconciliation
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  checks.push({
    label: `${stats.validCount} VALID MONTHS`,
    status: stats.validCount >= 6 ? "ok" : stats.validCount >= 3 ? "warn" : "err",
  });

  const hasOutlier = stats.rows.some((r) => r.isOutlier);
  checks.push({ label: hasOutlier ? "OUTLIER DETECTED" : "NO OUTLIERS", status: hasOutlier ? "warn" : "ok" });

  if (tod.totalUnits > 0 && meter.assessedUnits) {
    const d = Math.abs(tod.totalUnits - meter.assessedUnits) / meter.assessedUnits;
    checks.push({ label: d <= 0.01 ? "TOD UNITS RECONCILED" : `TOD MISMATCH ${(d * 100).toFixed(1)}%`, status: d <= 0.01 ? "ok" : "warn" });
  }

  if (meter.powerFactor) {
    const pf = meter.powerFactor;
    checks.push({ label: `PF ${pf.toFixed(3)}`, status: pf >= 0.95 ? "ok" : pf >= 0.9 ? "warn" : "err" });
  }

  if (recon.printedAmount > 0) {
    checks.push({
      label: recon.withinTolerance ? "BILL RECONCILED" : `BILL MISMATCH ₹${recon.diff}`,
      status: recon.withinTolerance ? "ok" : "err",
    });
  }

  checks.push({
    label: tod.utilisableFraction > 0 ? `TOD FRACTION: ${(tod.utilisableFraction * 100).toFixed(2)}%` : "NO TOD DATA",
    status: tod.utilisableFraction > 0 ? "ok" : "warn",
  });

  return checks;
}
