// Pure formula engine for Commercial Bill Analysis — ported 1:1 from the
// <script> block in bill-analysis-v3.html (renderBill / setTODMode /
// cbaRenderTOD / cbaCalcMeter / cbaRun), so the dashboard math is preserved
// exactly. Used by both CommercialBillAnalysis.tsx (live display) and
// commercialWorksheetModel.ts (Excel export) as the single source of truth —
// same pattern as src/worksheetModel.ts is for Residential.
import { CommercialBillData, CommercialBillingHistoryRow, CommercialTodSlotReading, TodSlotId } from "./types";

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

// De-duplicates by monthLabel (last occurrence wins) and sorts oldest -> newest
// when every label is parseable. Row count matches the bill exactly — 13
// months on the bill means 13 rows, 12 means 12, 5 means 5. No padding to a
// minimum, no truncation to a cap; the table is exactly what was extracted.
export function buildBillingHistoryWindow(
  ocrHistory: CommercialBillingHistoryRow[]
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

  return rows;
}

// ─── §02 Billing history stats ─────────────────────────────────────────────
export interface BillRowFlags {
  units: number;
  billAmount: number;
  /** (billAmount − printed fixed charges) ÷ history units: an all-in bill ratio, NOT an energy rate
   *  (the amount includes demand charges, duty and taxes; MSEDCL units are kVAh). Display only. */
  unitCost: number | null;
  isZero: boolean;
  isDemandOnly: boolean; // zero units but a bill amount printed
  isOutlier: boolean; // units > mean + 2*stddev (only flagged once >= 4 non-zero months exist)
}

export interface BillingStats {
  rows: BillRowFlags[];
  validCount: number; // non-zero months (isOutlier is a label only — it does NOT exclude from averages)
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

  // isOutlier stays a Status-column label (matches the reference spreadsheet's
  // methodology) — it must NOT exclude the month from the average, only zero
  // months are excluded.
  const valid = rows.filter((r) => !r.isZero);
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
// utilisableFraction = (Slot B + Slot C) / (A+B+C+D), the 06:00–17:00 tariff
// bands (formula of "TOD E-bill analysis (1).xlsx", I38). It is a TARIFF-BAND
// DISTRIBUTION PROXY in the bill's billed unit (kVAh on MSEDCL LT-V), not a
// measured daytime load share. Decided 2026-10-15: the workbook's LT ×1.1 on
// top of it (K38) is no longer applied anywhere — no hidden multipliers; the
// only margin is the visible, optional "additional sizing margin".
export type TodRule = "FULL" | "NONE";

export interface TodSlotResult {
  slot: TodSlotId;
  units: number;
  pctShare: number; // 0..1
  rule: TodRule;
  utilisable: number; // 0..1 fraction of total (B and C only)
}

export interface TodUtilisation {
  slots: TodSlotResult[];
  totalUnits: number;
  utilisableFraction: number; // B+C share of all TOD units ("TOD Consideration") — a low-confidence proxy
}

function todRule(slot: TodSlotId): TodRule {
  return slot === "B" || slot === "C" ? "FULL" : "NONE";
}

export function computeTodUtilisation(todSlots: CommercialTodSlotReading[], _mode?: TodMode): TodUtilisation {
  const totalUnits = todSlots.reduce((s, sl) => s + n(sl.units), 0);

  const slots: TodSlotResult[] = todSlots.map((sl) => {
    const units = n(sl.units);
    const pctShare = totalUnits > 0 ? units / totalUnits : 0;
    const rule = todRule(sl.slot);
    const utilisable = rule === "FULL" ? pctShare : 0;
    return { slot: sl.slot, units, pctShare, rule, utilisable };
  });

  const utilisableFraction = slots.reduce((s, sl) => s + sl.utilisable, 0);
  return { slots, totalUnits, utilisableFraction };
}

// ─── §03 Meter readings ─────────────────────────────────────────────────────
// Register readings are cumulative counters; consumption = (curr − prev) × MF.
// These are CHECKS against the printed "Total Consumption" — never a PF source
// (a PF computed from a register reading gave 3.64 on a real bill). PF comes
// only from the bill's own printed PF fields.
export interface MeterDerived {
  /** (KWH curr − prev) × MF — cross-check for the printed active energy. */
  assessedUnits: number | null;
  /** (KVAH curr − prev) × MF — cross-check for the printed apparent energy. */
  kvahFromRegisters: number | null;
  /** 75 % × contract demand. A SCREENING figure only: the tariff rule is not verified per customer and it never replaces the bill's billed demand. */
  demandFloorKva: number | null;
}

type MeterFields = Pick<CommercialBillData, "prevReading" | "currReading" | "multiplyingFactor" | "kvahPrevReading" | "kvahCurrReading" | "contractDemand">;

export function computeMeterDerived(d: MeterFields): MeterDerived {
  const mf = n(d.multiplyingFactor) || 1;
  const diff = (prev: number | "" | undefined, curr: number | "" | undefined) => {
    const x = (n(curr) - n(prev)) * mf;
    return n(curr) > 0 && x > 0 ? Math.round(x * 100) / 100 : null;
  };
  const cd = n(d.contractDemand);
  return {
    assessedUnits: diff(d.prevReading, d.currReading),
    kvahFromRegisters: diff(d.kvahPrevReading, d.kvahCurrReading),
    demandFloorKva: cd > 0 ? 0.75 * cd : null,
  };
}

// ─── §03 Charge reconciliation ──────────────────────────────────────────────
export interface ChargeComponents {
  energyCharges: number | "";
  todCharges?: number | ""; // signed
  demandCharges: number | "";
  fac: number | "";
  ed: number | "";
  tose: number | "";
  wheelingCharges: number | "";
  delayedPayment: number | "";
  arrears: number | "";
  creditAdjustment: number | "";
  otherCharges: number | "";
  currentBillTotal?: number | ""; // printed "TOTAL CURRENT BILL"
  billAmount: number | ""; // printed rounded bill amount
}

// Rounding rule (MSEDCL, printed on the bill: "Amount Rounded to Nearest Rs. 10/-"):
//   current charges  = energy + TOD EC + demand + FAC + ED + ToSE + wheeling + other
//                      → must equal "TOTAL CURRENT BILL" within ₹1 (paise rounding per line)
//   rounded amount   = ROUND(current + delayed + arrears − credits, −1)
//                      → must equal "Total Bill Amount (Rounded)" within ₹10
export interface ChargeReconciliation {
  currentCharges: number; // Σ this period's charge lines
  printedCurrentTotal: number; // 0 when not printed
  currentDiff: number;
  currentOk: boolean | null; // null when the bill's current total is not known
  reconstructedTotal: number; // ROUND(current + delayed + arrears − credit, −1)
  printedAmount: number;
  diff: number;
  withinTolerance: boolean; // diff <= 10
}

export function reconcileCharges(c: ChargeComponents): ChargeReconciliation {
  const tod = typeof c.todCharges === "number" && Number.isFinite(c.todCharges) ? c.todCharges : 0; // may be negative
  const currentCharges = Math.round((n(c.energyCharges) + tod + n(c.demandCharges) + n(c.fac) + n(c.ed) + n(c.tose) + n(c.wheelingCharges) + n(c.otherCharges)) * 100) / 100;
  const printedCurrentTotal = n(c.currentBillTotal);
  const currentDiff = Math.round(Math.abs(currentCharges - printedCurrentTotal) * 100) / 100;
  const rawSum = currentCharges + n(c.delayedPayment) + n(c.arrears) - n(c.creditAdjustment);
  const reconstructedTotal = Math.round(rawSum / 10) * 10;
  const printedAmount = n(c.billAmount);
  const diff = Math.round(Math.abs(reconstructedTotal - printedAmount) * 100) / 100;
  return {
    currentCharges, printedCurrentTotal, currentDiff, currentOk: printedCurrentTotal > 0 ? currentDiff <= 1 : null,
    reconstructedTotal, printedAmount, diff, withinTolerance: diff <= 10,
  };
}

// ─── §05 Solar sizing pipeline ──────────────────────────────────────────────
// Sized on ACTIVE energy (kWh) from the meter table only — never the billing-
// history "Units", which are billed kVAh on MSEDCL industrial bills. Decided
// 2026-10-15: no hidden multipliers. The optional, visible "additional sizing
// margin" (default 0 %) is applied exactly once, kept separate from the
// energy-offset target; the specific yield is an editable assumption.
// The primary output is the theoretical energy-based size (fullKwp). The TOD
// figure is a separate, low-confidence tariff-band proxy, never the recommendation.
export interface SizingParams {
  annualKwh: number; // annualised active energy (consumptionSizing.energyBaseline)
  offsetPct: number; // share of annual consumption to offset, e.g. 100
  marginPct: number; // optional additional sizing margin, default 0
  specificYield: number; // kWh per kWp per year — assumption, site-specific
  todFraction: number; // B+C tariff-band share (0 when the bill has no TOD data) — proxy only
  panelWattage: number;
  /** ₹ per active kWh avoided — energyRatePerKwh(); 0 = unknown, no saving shown. */
  ratePerKwh: number;
  systemCost: number;
}

export interface SizingPipeline {
  targetKwh: number; // annualKwh × offset
  theoreticalKwp: number; // targetKwh ÷ yield — energy-based, before any margin
  marginKwp: number; // what the optional margin adds (0 by default)
  solarCapacityRawKwp: number; // theoreticalKwp + marginKwp
  fullPanels: number;
  fullKwp: number; // PRIMARY: theoretical energy-based size in whole panels — preliminary, not installable until surveyed
  todSolarCapacityKwp: number; // todFraction × solarCapacityRawKwp — tariff-band proxy, low confidence
  todPanels: number;
  todKwp: number;
  solarGenPerYearKwh: number; // fullKwp × yield
  annualSavingAvgRate: number; // indicative: generation × ratePerKwh
  annualSavingRoundUpRate: number; // generation × ROUNDUP(rate, 0.5)
  simplePaybackYears: number | null;
}

const ZERO_PIPELINE: SizingPipeline = {
  targetKwh: 0, theoreticalKwp: 0, marginKwp: 0, solarCapacityRawKwp: 0, fullPanels: 0, fullKwp: 0, todSolarCapacityKwp: 0,
  todPanels: 0, todKwp: 0, solarGenPerYearKwh: 0, annualSavingAvgRate: 0, annualSavingRoundUpRate: 0, simplePaybackYears: null,
};

export function computeSizingPipeline(p: SizingParams): SizingPipeline {
  // No yield or no energy → no size (never a hidden default).
  if (!(p.specificYield > 0) || !(p.annualKwh > 0)) return ZERO_PIPELINE;
  const panW = p.panelWattage > 0 ? p.panelWattage : 600;
  const offset = p.offsetPct > 0 ? p.offsetPct / 100 : 1;
  const margin = p.marginPct > 0 ? p.marginPct / 100 : 0;

  const targetKwh = p.annualKwh * offset;
  const theoreticalKwp = targetKwh / p.specificYield;
  const marginKwp = theoreticalKwp * margin;
  const solarCapacityRawKwp = theoreticalKwp + marginKwp;
  const fullPanels = Math.round((solarCapacityRawKwp / panW) * 1000);
  const fullKwp = (fullPanels * panW) / 1000;

  const todSolarCapacityKwp = (p.todFraction > 0 ? p.todFraction : 0) * solarCapacityRawKwp;
  const todPanels = Math.round((todSolarCapacityKwp / panW) * 1000);
  const todKwp = (todPanels * panW) / 1000;

  const rate = p.ratePerKwh > 0 ? p.ratePerKwh : 0;
  const solarGenPerYearKwh = fullKwp * p.specificYield;
  const annualSavingAvgRate = solarGenPerYearKwh * rate;
  const annualSavingRoundUpRate = solarGenPerYearKwh * roundUp05(rate);
  const simplePaybackYears = p.systemCost > 0 && annualSavingAvgRate > 0 ? p.systemCost / annualSavingAvgRate : null;

  return {
    targetKwh, theoreticalKwp, marginKwp, solarCapacityRawKwp, fullPanels, fullKwp, todSolarCapacityKwp, todPanels, todKwp,
    solarGenPerYearKwh, annualSavingAvgRate, annualSavingRoundUpRate, simplePaybackYears,
  };
}

type ChargeFields = Pick<CommercialBillData, "energyCharges" | "todCharges" | "fac" | "wheelingCharges" | "ed" | "tose">;

/** The bill lines that scale with consumption: energy, TOD EC (signed), FAC, wheeling, duty, ToSE. */
export function variableCharges(d: ChargeFields): number {
  const tod = typeof d.todCharges === "number" && Number.isFinite(d.todCharges) ? d.todCharges : 0;
  return n(d.energyCharges) + tod + n(d.fac) + n(d.wheelingCharges) + n(d.ed) + n(d.tose);
}

/** ₹ per active kWh = Σ variable charges ÷ Σ active kWh, over bills that have both and whose
 *  charges add up to their printed current total (a mis-assigned line would skew the rate).
 *  Demand/fixed charges, arrears and credits are left out — they don't fall when solar replaces kWh. 0 = unknown. */
export function energyRatePerKwh(bills: CommercialBillData[]): number {
  let rs = 0;
  let kwh = 0;
  for (const b of bills) {
    const k = n(b.activeKwh);
    const v = variableCharges(b);
    if (k > 0 && v > 0 && reconcileCharges(b).currentOk !== false) {
      rs += v;
      kwh += k;
    }
  }
  return kwh > 0 ? rs / kwh : 0;
}

/** Sizing settings shown on screen and saved with an analysis. */
export interface SizingSettings {
  panelWatt: number;
  specificYield: number; // kWh/kWp/yr
  offsetPct: number;
  marginPct: number;
  systemCost: number | "";
}
export const DEFAULT_SIZING: SizingSettings = { panelWatt: 600, specificYield: 1400, offsetPct: 100, marginPct: 0, systemCost: "" };

/** Sizing settings from a request body, each clamped to a sane range; missing → the on-screen default. */
export function sizingFrom(raw: any): SizingSettings {
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const x = Number(v);
    return v !== "" && v !== null && v !== undefined && Number.isFinite(x) && x >= lo && x <= hi ? x : d;
  };
  const cost = Number(raw?.systemCost);
  return {
    panelWatt: num(raw?.panelWatt, 50, 1000, DEFAULT_SIZING.panelWatt),
    specificYield: num(raw?.specificYield, 300, 3000, DEFAULT_SIZING.specificYield),
    offsetPct: num(raw?.offsetPct, 1, 300, DEFAULT_SIZING.offsetPct),
    marginPct: num(raw?.marginPct, 0, 100, DEFAULT_SIZING.marginPct),
    systemCost: Number.isFinite(cost) && cost > 0 ? cost : "",
  };
}

// ─── §06 Validation checklist ───────────────────────────────────────────────
export interface ValidationCheck {
  label: string;
  status: "ok" | "warn" | "err";
}

/** A printed PF must lie in (0, 1]; anything else is flagged, never clamped. */
export function pfCheck(name: string, v: number | ""): ValidationCheck | null {
  if (v === "") return null;
  if (!(v > 0 && v <= 1)) return { label: `${name} ${v} OUT OF RANGE (0–1) — CHECK THE BILL`, status: "err" };
  return { label: `${name} ${v.toFixed(3)}`, status: v >= 0.95 ? "ok" : v >= 0.9 ? "warn" : "err" };
}

// Printed totals vs register arithmetic: the bill rounds each line, so allow 0.5 % or 1 unit.
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.005);

export function computeValidationChecks(
  stats: BillingStats,
  tod: TodUtilisation,
  meter: MeterDerived,
  recon: ChargeReconciliation,
  d: CommercialBillData
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const kwh = n(d.activeKwh);
  const kvah = n(d.kvahReading);

  checks.push(kwh > 0 ? { label: `ACTIVE ENERGY ${Math.round(kwh).toLocaleString("en-IN")} kWh`, status: "ok" } : { label: "NO ACTIVE kWh — CANNOT SIZE", status: "err" });
  if (kwh > 0 && meter.assessedUnits !== null) {
    checks.push(near(meter.assessedUnits, kwh)
      ? { label: "KWH REGISTERS × MF = kWh TOTAL", status: "ok" }
      : { label: `KWH REGISTERS GIVE ${Math.round(meter.assessedUnits)} ≠ ${Math.round(kwh)} — CHECK`, status: "warn" });
  }
  if (kvah > 0 && meter.kvahFromRegisters !== null) {
    checks.push(near(meter.kvahFromRegisters, kvah)
      ? { label: "KVAH REGISTERS × MF = kVAh TOTAL", status: "ok" }
      : { label: `KVAH REGISTERS GIVE ${Math.round(meter.kvahFromRegisters)} ≠ ${Math.round(kvah)} — CHECK`, status: "warn" });
  }
  if (kwh > 0 && kvah > 0 && kvah < kwh) checks.push({ label: "kVAh BELOW kWh — IMPOSSIBLE, CHECK THE FIELDS", status: "err" });
  if (!d.readingFrom || !d.readingTo) checks.push({ label: "READING DATES MISSING — YEAR ESTIMATED AS 12 × MONTH", status: "warn" });

  for (const c of [pfCheck("AVG PF", d.avgPowerFactor), pfCheck("BILLED PF", d.billedPowerFactor)]) if (c) checks.push(c);

  // The 75 % floor is a screening rule, not verified per tariff: report a conflict, never override the bill.
  if (typeof d.billedDemand === "number" && meter.demandFloorKva !== null && d.billedDemand < meter.demandFloorKva - 0.5) {
    checks.push({ label: `BILLED DEMAND ${d.billedDemand} BELOW 75% CD SCREEN ${meter.demandFloorKva.toFixed(1)} — RULE NOT VERIFIED, BILL VALUE KEPT`, status: "warn" });
  }

  const hu = d.billingHistoryUnit === "unknown" ? "UNIT UNKNOWN" : d.billingHistoryUnit;
  checks.push({ label: `${stats.validCount} HISTORY MONTHS (${hu}) · REFERENCE ONLY, NOT SIZED`, status: stats.validCount > 0 ? "ok" : "warn" });
  if (stats.rows.some((r) => r.isOutlier)) checks.push({ label: "OUTLIER IN HISTORY — REVIEW (SHOWN, NOT SIZED)", status: "warn" });

  if (tod.totalUnits > 0) {
    const unit = kvah > 0 && near(tod.totalUnits, kvah) ? "kVAh" : kwh > 0 && near(tod.totalUnits, kwh) ? "kWh" : null;
    checks.push(unit ? { label: `TOD UNITS = ${unit} TOTAL`, status: "ok" } : { label: "TOD UNITS MATCH NEITHER kWh NOR kVAh TOTAL", status: "warn" });
  }

  if (recon.currentOk !== null) {
    checks.push({ label: recon.currentOk ? "CHARGES = TOTAL CURRENT BILL" : `CHARGES ≠ TOTAL CURRENT BILL (₹${recon.currentDiff})`, status: recon.currentOk ? "ok" : "err" });
  }
  if (recon.printedAmount > 0) {
    checks.push({ label: recon.withinTolerance ? "ROUNDED BILL RECONCILED" : `BILL MISMATCH ₹${recon.diff}`, status: recon.withinTolerance ? "ok" : "err" });
  }

  checks.push({
    label: tod.utilisableFraction > 0 ? `TOD BAND PROXY ${(tod.utilisableFraction * 100).toFixed(2)}% · LOW CONFIDENCE` : "NO TOD DATA",
    status: tod.utilisableFraction > 0 ? "warn" : "ok",
  });

  return checks;
}
