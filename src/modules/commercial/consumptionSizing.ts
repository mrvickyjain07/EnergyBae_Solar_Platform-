// src/modules/commercial/consumptionSizing.ts
// Multi-bill consumption history and deterministic solar sizing for C&I bills.
//
// Why a separate pure module: sizing must be arithmetic the code owns, not a
// figure the extraction model writes. Extraction produces one BillPeriod per
// uploaded bill; everything here is reproducible from those records.
//
// Rules this module enforces:
// - Two baselines (chooseBaseline): the uploaded bills' meter kWh, or the
//   printed billing-history months averaged as printed (kWh or billed kVAh —
//   the office workbook's method, 2026-10-21). One month annualised x12 is a
//   weak profile, so "auto" prefers 6+ printed months over fewer uploaded
//   bills. The two are never mixed, and the bill's own month is never added.
//   kVAh is never converted to kWh.
// - Bills are grouped by connection id only (never by similar names). A bill
//   with no id stays on its own until the user assigns it.
// - Missing is never zero: a month without a valid kWh is excluded and listed.
// - No yield, no capacity: the specific yield is an input; without one the
//   result says so instead of using a hidden default.

import type { CommercialBillData } from "./types";
import { normalizeLoad, type NormalizedLoad } from "./billUnits";
import {
  computeBillingStats, computeSizingPipeline, monthlyFixedOf, computeTodUtilisation, detectTodMode, energyRatePerKwh, reconcileCharges, todTotalsOf,
  type BaselineStrategy, type BillingStats, type SizingPipeline, type SizingSettings, type TodMode, type TodUtilisation,
} from "./commercialCalculations";

export interface HistoryRow {
  month: string; // "YYYY-MM"
  units: number | null;
  /** What the printed history column measures, if the bill says. MSEDCL industrial: "kVAh". */
  unitBasis: "kWh" | "kVAh" | "unknown";
}

export interface BillPeriod {
  sourceId: string; // file name or upload id
  fileHash?: string | null;
  connectionId: string | null; // consumer / connection number as verified
  billingMonth: string; // "YYYY-MM"
  readingFrom: string | null; // ISO date of the previous reading
  readingTo: string | null; // ISO date of the current reading
  activeKwh: number | null; // KWH "Total Consumption" of the meter table
  apparentKvah: number | null; // KVAH "Total Consumption"
  /** Where activeKwh came from: the printed KWH total, or (current − previous) × MF when only readings were read. */
  kwhSource?: "meter table" | "meter readings" | null;
  historyRows?: HistoryRow[];
}

export type MonthStatus = "used" | "duplicate" | "conflict" | "invalid" | "history-only";

export interface MonthRecord {
  month: string;
  status: MonthStatus;
  activeKwh: number | null;
  apparentKvah: number | null;
  days: number | null;
  sources: string[];
  note: string | null;
}

export interface ConnectionHistory {
  connectionId: string | null;
  months: MonthRecord[]; // sorted by month
  missingMonths: string[]; // gaps between the first and last uploaded month
  warnings: string[];
}

const DAY_MS = 86_400_000;
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const d = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : null;
}
function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
const validKwh = (v: number | null) => v !== null && Number.isFinite(v) && v > 0;

/** Group bills by connection and build each connection's month table. */
export function consolidateBills(bills: BillPeriod[]): ConnectionHistory[] {
  const groups = new Map<string, BillPeriod[]>();
  for (const b of bills) {
    const key = b.connectionId?.trim() ? `id:${b.connectionId.trim()}` : `unassigned:${b.sourceId}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.entries()].map(([key, group]) => buildHistory(key.startsWith("id:") ? key.slice(3) : null, group));
}

function buildHistory(connectionId: string | null, group: BillPeriod[]): ConnectionHistory {
  const warnings: string[] = [];
  if (connectionId === null) warnings.push(`${group[0].sourceId}: no connection number found — confirm which connection this bill belongs to.`);
  const months: MonthRecord[] = [];
  const seenHash = new Map<string, string>();
  const byMonth = new Map<string, BillPeriod[]>();

  for (const b of group) {
    if (b.fileHash && seenHash.has(b.fileHash)) {
      months.push(record(b, "duplicate", `Same file as ${seenHash.get(b.fileHash)}.`));
      continue;
    }
    if (b.fileHash) seenHash.set(b.fileHash, b.sourceId);
    if (!isMonth(b.billingMonth)) {
      months.push(record(b, "invalid", "Billing month not recognised."));
      continue;
    }
    byMonth.set(b.billingMonth, [...(byMonth.get(b.billingMonth) ?? []), b]);
  }

  for (const [month, list] of byMonth) {
    const [first, ...rest] = list;
    const sameAsFirst = (b: BillPeriod) => b.activeKwh === first.activeKwh && b.apparentKvah === first.apparentKvah;
    if (rest.some((b) => !sameAsFirst(b))) {
      // Two different readings for one month: neither is used until the user picks one.
      for (const b of list) months.push(record(b, "conflict", `Different readings for ${month} — choose the correct bill.`));
      warnings.push(`${month}: ${list.length} bills disagree; this month is left out until resolved.`);
      continue;
    }
    for (const b of rest) months.push(record(b, "duplicate", `Same readings as ${first.sourceId}.`));
    if (!validKwh(first.activeKwh)) {
      months.push(record(first, "invalid", "No valid active energy (kWh) — enter it from the meter table; it is not treated as 0."));
      continue;
    }
    let note: string | null = null;
    if (first.apparentKvah !== null && first.activeKwh! > first.apparentKvah * 1.001) note = "kWh is higher than kVAh — check the extraction.";
    if (daysBetween(first.readingFrom, first.readingTo) === null) note = [note, "Reading dates missing; period length unknown."].filter(Boolean).join(" ");
    months.push(record(first, "used", note));
  }

  // History-table months that no uploaded bill covers: shown for reference only.
  const uploaded = new Set(byMonth.keys());
  const refs = new Map<string, MonthRecord>();
  for (const b of group) for (const h of b.historyRows ?? []) {
    if (!isMonth(h.month) || uploaded.has(h.month) || refs.has(h.month)) continue;
    refs.set(h.month, {
      month: h.month, status: "history-only", activeKwh: h.unitBasis === "kWh" ? h.units : null, apparentKvah: h.unitBasis === "kVAh" ? h.units : null,
      days: null, sources: [b.sourceId], note: `From the billing-history table (${h.unitBasis === "unknown" ? "unit not stated" : h.unitBasis}); upload that month's bill to use it.`,
    });
  }
  months.push(...refs.values());
  months.sort((a, b) => a.month.localeCompare(b.month) || a.status.localeCompare(b.status));

  // Gaps and overlaps between uploaded periods
  const used = months.filter((m) => m.status === "used");
  const missingMonths: string[] = [];
  const all = [...uploaded].filter(isMonth).sort();
  if (all.length) for (let m = all[0]; m < all[all.length - 1]; m = nextMonth(m)) if (!uploaded.has(m)) missingMonths.push(m);
  if (missingMonths.length) warnings.push(`Missing months: ${missingMonths.join(", ")} — not counted as zero.`);
  const periods = used.map((m) => byMonth.get(m.month)![0]).filter((b) => b.readingFrom && b.readingTo).sort((a, b) => a.readingFrom!.localeCompare(b.readingFrom!));
  for (let i = 1; i < periods.length; i++) {
    if (Date.parse(periods[i].readingFrom!) < Date.parse(periods[i - 1].readingTo!)) warnings.push(`${periods[i - 1].billingMonth} and ${periods[i].billingMonth} reading periods overlap.`);
  }
  return { connectionId, months, missingMonths, warnings };
}

function record(b: BillPeriod, status: MonthStatus, note: string | null): MonthRecord {
  return { month: b.billingMonth, status, activeKwh: b.activeKwh, apparentKvah: b.apparentKvah, days: daysBetween(b.readingFrom, b.readingTo), sources: [b.sourceId], note };
}

// ───────────────────────── Baseline ─────────────────────────

export interface EnergyBaseline {
  periods: number;
  totalKwh: number;
  avgMonthlyKwh: number;
  minMonthlyKwh: number;
  maxMonthlyKwh: number;
  totalDays: number | null; // null when any used period lacks reading dates
  avgDailyKwh: number | null;
  annualKwh: number;
  annualBasis: "reading days" | "monthly average × 12";
  source: "meter" | "history";
  confidence: "high" | "medium" | "low";
  notes: string[];
}

/** Baseline from the "used" months only. Null when there is no valid month. */
export function energyBaseline(history: ConnectionHistory): EnergyBaseline | null {
  const used = history.months.filter((m) => m.status === "used");
  if (!used.length) return null;
  const kwh = used.map((m) => m.activeKwh!);
  const totalKwh = kwh.reduce((s, v) => s + v, 0);
  const allDays = used.every((m) => m.days !== null);
  const totalDays = allDays ? used.reduce((s, m) => s + m.days!, 0) : null;
  const avgDailyKwh = totalDays ? totalKwh / totalDays : null;
  const notes: string[] = [];
  if (!allDays) notes.push("Some reading dates are missing, so the year is estimated as the monthly average × 12.");
  if (used.length < 12) notes.push(`Based on ${used.length} month${used.length === 1 ? "" : "s"}; 12 months capture seasonal variation better.`);
  return {
    periods: used.length,
    totalKwh,
    avgMonthlyKwh: totalKwh / used.length,
    minMonthlyKwh: Math.min(...kwh),
    maxMonthlyKwh: Math.max(...kwh),
    totalDays,
    avgDailyKwh,
    annualKwh: avgDailyKwh !== null ? avgDailyKwh * 365 : (totalKwh / used.length) * 12,
    annualBasis: avgDailyKwh !== null ? "reading days" : "monthly average × 12",
    source: "meter",
    confidence: used.length >= 12 ? "high" : used.length >= 6 ? "medium" : "low",
    notes,
  };
}

/**
 * Baseline from the latest bill's printed billing-history table — every printed
 * month (12, 13 or any count), the bill's own month never added, units averaged
 * AS PRINTED (kWh, or billed kVAh on MSEDCL industrial bills — the office
 * workbook averages them as-is, decided 2026-10-21). Missing or zero months are
 * excluded and named; outliers are kept (flagged on screen).
 */
export function historyBaseline(latest: CommercialBillData | null): EnergyBaseline | null {
  if (!latest) return null;
  const rows = latest.billingHistory ?? [];
  const units = rows.map((r) => pos(r.units)).filter((v): v is number => v !== null);
  if (!units.length) return null;
  const unit = latest.billingHistoryUnit === "kVAh" ? "billed kVAh" : latest.billingHistoryUnit === "kWh" ? "kWh" : "units as printed";
  const skipped = rows.filter((r) => pos(r.units) === null).map((r) => r.monthLabel || "unlabelled row");
  const total = units.reduce((s, v) => s + v, 0);
  const notes = [`Sized on the average of ${units.length} printed billing-history month${units.length === 1 ? "" : "s"} (${unit}), as in the office workbook.`];
  if (skipped.length) notes.push(`Left out (no units printed or read): ${skipped.join(", ")} — not counted as zero.`);
  if (units.length < 12) notes.push(`Based on ${units.length} month${units.length === 1 ? "" : "s"}; 12 months capture seasonal variation better.`);
  return {
    periods: units.length, totalKwh: total, avgMonthlyKwh: total / units.length,
    minMonthlyKwh: Math.min(...units), maxMonthlyKwh: Math.max(...units),
    totalDays: null, avgDailyKwh: null,
    annualKwh: (total / units.length) * 12, annualBasis: "monthly average × 12", source: "history",
    confidence: units.length >= 12 ? "high" : units.length >= 6 ? "medium" : "low",
    notes,
  };
}

/** The baseline a strategy selects; "history" falls back to the meter (with a note) when the table isn't usable kWh. */
export function chooseBaseline(meter: EnergyBaseline | null, history: EnergyBaseline | null, strategy: BaselineStrategy): EnergyBaseline | null {
  if (strategy === "meter") return meter;
  if (strategy === "history") return history; // chosen explicitly: unavailable rather than silently the meter
  const historyWins = history !== null && history.periods >= 6 && (meter === null || meter.periods < history.periods);
  return historyWins ? history : meter;
}

function baselineIssueOf(strategy: BaselineStrategy, chosen: EnergyBaseline | null, latest: CommercialBillData | null): string | null {
  if (chosen) return null;
  if (strategy === "history") return "The billing history has no readable months.";
  return "No valid active energy (kWh) yet — enter the KWH total consumption in § 03.";
}

function rateIssueOf(rate: number, bills: CommercialBillData[]): string | null {
  if (rate > 0) return null;
  const b = bills.at(-1);
  if (!b || !(Number(b.activeKwh) > 0)) return "Needs this bill's active kWh (§ 03).";
  const r = reconcileCharges(b);
  if (r.currentOk === false) return `The charge lines add up to ₹${r.currentCharges.toLocaleString("en-IN")}, not the printed Total Current Bill ₹${r.printedCurrentTotal.toLocaleString("en-IN")} — fix the lines in § 03 first.`;
  return "Needs the energy charge lines (§ 03).";
}

// ───────────────────────── Sizing ─────────────────────────

export interface SizingInputs {
  /** kWh produced per kWp per year at this site, after losses. Required — no hidden default. */
  specificYieldKwhPerKwp: number | null;
  /** Fractions of annual consumption to offset, e.g. [0.5, 0.75, 1]. */
  offsets: number[];
  sanctionedLoadKw?: number | null; // after billUnits.normalizeLoad
  contractDemandKva?: number | null;
  existingSolarKw?: number | null;
}

export interface SizingScenario {
  offset: number;
  targetKwh: number;
  capacityKwp: number;
}

export interface SizingResult {
  status: "ok" | "needs-yield" | "no-baseline";
  scenarios: SizingScenario[];
  constraints: string[]; // screening facts and what still needs verifying — never applied as limits
}

export function sizeSolar(baseline: EnergyBaseline | null, inp: SizingInputs): SizingResult {
  const constraints: string[] = [];
  if (inp.sanctionedLoadKw != null) constraints.push(`Sanctioned load ${inp.sanctionedLoadKw} kW — screening only; the permitted solar capacity depends on the utility's interconnection rules, not verified here.`);
  if (inp.contractDemandKva != null) constraints.push(`Contract demand ${inp.contractDemandKva} kVA (kept in kVA, not converted).`);
  if (inp.existingSolarKw) constraints.push(`Existing solar ${inp.existingSolarKw} kW is already installed; consumption on these bills is net of its generation.`);
  constraints.push("Roof or ground area, shading, daytime load share and export rules are not on the bill and still need checking.");
  if (!baseline) return { status: "no-baseline", scenarios: [], constraints };
  const y = inp.specificYieldKwhPerKwp;
  if (y == null || !(y > 0)) return { status: "needs-yield", scenarios: [], constraints };
  const scenarios = inp.offsets.filter((o) => o > 0).map((offset) => {
    const targetKwh = baseline.annualKwh * offset;
    return { offset, targetKwh, capacityKwp: targetKwh / y };
  });
  return { status: "ok", scenarios, constraints };
}

// ───────────────────────── From an extracted bill ─────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "Sep-2026" / "Sep 2026" / "2026-09" → "2026-09"; "" when unreadable. */
export function toMonthKey(label: string): string {
  const t = String(label ?? "").trim();
  if (isMonth(t)) return t;
  const m = t.match(/^([A-Za-z]{3})[A-Za-z]*[\s\-/']*(\d{4}|\d{2})$/);
  if (!m) return "";
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return "";
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${y}-${String(mi + 1).padStart(2, "0")}`;
}

const pos = (v: number | "" | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const isoDate = (v: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) && Number.isFinite(Date.parse(String(v))) ? String(v) : null);

/**
 * One extracted C&I bill → one billing period. kWh is the printed KWH total;
 * if that wasn't read, it is inferred from (current − previous) × MF, which is
 * the same KWH meter (and labelled as such). kVAh is never used for kWh.
 */
export function billToPeriod(data: CommercialBillData, sourceId: string, fileHash?: string | null): BillPeriod {
  const printed = pos(data.activeKwh);
  const prev = pos(data.prevReading) ?? 0;
  const curr = pos(data.currReading);
  const fromReadings = curr !== null && curr > prev ? (curr - prev) * (pos(data.multiplyingFactor) ?? 1) : null;
  const activeKwh = printed ?? (fromReadings !== null ? Math.round(fromReadings * 100) / 100 : null);
  return {
    sourceId,
    fileHash: fileHash ?? null,
    connectionId: data.consumerNo?.trim() || null,
    billingMonth: toMonthKey(data.billingMonth),
    readingFrom: isoDate(data.readingFrom),
    readingTo: isoDate(data.readingTo),
    activeKwh,
    apparentKvah: pos(data.kvahReading),
    kwhSource: printed !== null ? "meter table" : activeKwh !== null ? "meter readings" : null,
    historyRows: (data.billingHistory ?? []).map((r) => ({ month: toMonthKey(r.monthLabel), units: pos(r.units), unitBasis: data.billingHistoryUnit ?? "unknown" })),
  };
}

/** The connection with the most usable months (the one a single analysis sizes). */
export function primaryHistory(histories: ConnectionHistory[]): ConnectionHistory | null {
  let best: ConnectionHistory | null = null;
  for (const h of histories) {
    const n = h.months.filter((m) => m.status === "used").length;
    if (!best || n > best.months.filter((m) => m.status === "used").length) best = h;
  }
  return best;
}

// ───────────────────────── One analysis, every consumer ─────────────────────────
// The screen (single and several bills), both Excel exports and the server's
// saved-analysis check all call this, so they cannot disagree.

export interface CiBill { data: CommercialBillData; sourceId: string; fileHash?: string | null }

export interface CiAnalysis {
  histories: ConnectionHistory[];
  history: ConnectionHistory | null; // the connection being sized
  baseline: EnergyBaseline | null; // the one sized on (chooseBaseline)
  meterBaseline: EnergyBaseline | null;
  historyBaseline: EnergyBaseline | null; // null unless the latest bill's history table is in kWh
  /** Why there is no sizing baseline, or why the rate is unknown — shown instead of a number. */
  baselineIssue: string | null;
  rateIssue: string | null;
  latest: CommercialBillData | null; // most recent used bill of that connection
  stats: BillingStats; // history-table statistics of the latest bill (reference only)
  /** ₹ per active kWh from the variable charges of the sized connection's bills (0 = unknown). */
  energyRate: number;
  todMode: TodMode;
  tod: TodUtilisation;
  pipeline: SizingPipeline;
  sanctioned: NormalizedLoad;
  connected: NormalizedLoad;
}

const unitOf = (u: CommercialBillData["sanctionedLoadUnit"] | undefined) => (u ? u : "unknown") as "HP" | "kW" | "kVA" | "unknown";

export function analyseCommercial(bills: CiBill[], s: SizingSettings): CiAnalysis {
  const periods = bills.map((b) => billToPeriod(b.data, b.sourceId, b.fileHash));
  const histories = consolidateBills(periods);
  const history = primaryHistory(histories);
  const meterBaseline = history ? energyBaseline(history) : null;
  const usedSources = new Set(history?.months.filter((m) => m.status === "used").flatMap((m) => m.sources) ?? []);
  const inHistory = bills.filter((b) => usedSources.has(b.sourceId));
  const pool = inHistory.length ? inHistory : bills;
  const latest = pool.length ? [...pool].sort((a, b) => toMonthKey(a.data.billingMonth).localeCompare(toMonthKey(b.data.billingMonth))).at(-1)!.data : null;
  const histBaseline = historyBaseline(latest);
  const baseline = chooseBaseline(meterBaseline, histBaseline, s.baseline ?? "auto");
  const todMode = detectTodMode(latest?.connectionType ?? "");
  const stats = computeBillingStats(latest?.billingHistory ?? [], latest ? monthlyFixedOf(latest) : "");
  const tod = computeTodUtilisation(latest?.todSlots ?? [], undefined, latest ? todTotalsOf(latest) : undefined);
  const energyRate = energyRatePerKwh(pool.map((b) => b.data));
  const pipeline = computeSizingPipeline({
    annualKwh: baseline?.annualKwh ?? 0,
    offsetPct: s.offsetPct,
    marginPct: s.marginPct,
    specificYield: s.specificYield,
    todFraction: tod.utilisableFraction,
    panelWattage: s.panelWatt,
    ratePerKwh: energyRate,
    systemCost: s.systemCost === "" ? 0 : s.systemCost,
  });
  return {
    histories, history, baseline, meterBaseline, historyBaseline: histBaseline, latest, baselineIssue: baselineIssueOf(s.baseline ?? "auto", baseline, latest), rateIssue: rateIssueOf(energyRate, pool.map((b) => b.data)), stats, energyRate, todMode, tod, pipeline,
    sanctioned: normalizeLoad(latest?.sanctionedLoad ?? "", unitOf(latest?.sanctionedLoadUnit)),
    connected: normalizeLoad(latest?.connectedLoad ?? "", unitOf(latest?.connectedLoadUnit)),
  };
}
