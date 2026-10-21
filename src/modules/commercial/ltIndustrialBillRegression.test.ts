// src/modules/commercial/ltIndustrialBillRegression.test.ts
// Run with: npx tsx src/modules/commercial/ltIndustrialBillRegression.test.ts
//
// Pins one real MSEDCL LT-V B I bill (Oct-2026, photographed, 13.28 HP) whose
// extraction went wrong in four ways, and checks the deterministic guards:
//   1. "IF PAID AFTER" (8820) returned as the bill amount — must not be trusted.
//   2. TOD slot 06–09 h (printed at rate 0.0000, 88 units) returned as 0 —
//      must become "missing", not zero, because the slots no longer add up.
//   3. FAC (263.40) put in "other" — flagged, since it changes the energy rate.
//   4. Sized on the one current month (878 kWh × 365/30) although the bill
//      prints 12 kWh history months — "auto" now sizes on the history average,
//      which reproduces the office workbook (398.83 kWh/month → 6 panels, 3.6 kWp).
// Identity fields are synthetic; the figures are the bill's own.
import assert from "node:assert/strict";
import { sanitizeCommercialData, blankUnreadSlot } from "./commercialApi";
import { analyseCommercial } from "./consumptionSizing";
import { computeBillingStats, computeMeterDerived, computeTodUtilisation, computeValidationChecks, reconcileCharges, DEFAULT_SIZING } from "./commercialCalculations";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const close = (label: string, actual: number, expected: number, tol = 0.01) => check(label, Math.abs(actual - expected) <= tol, true);

const HISTORY = [
  ["Oct-2025", 256, 2064.23], ["Nov-2025", 160, 2025.72], ["Dec-2025", 246, 2767.86], ["Jan-2026", 106, 1581.61],
  ["Feb-2026", 128, 1796.65], ["Mar-2026", 124, 1781.32], ["Apr-2026", 390, 4163.07], ["May-2026", 1130, 11345.97],
  ["Jun-2026", 1659, 15940.45], ["Jul-2026", 466, 5146.52], ["Aug-2026", 72, 1374.15], ["Sep-2026", 49, 1169.28],
].map(([monthLabel, units, billAmount]) => ({ monthLabel, units, billAmount }));

/** What the model should return for this bill (correct reading). */
const modelOutput = (over: Record<string, unknown> = {}) => ({
  consumerNo: "100000000001", consumerName: "SAMPLE INDUSTRIAL CONSUMER", connectionType: "LT", category: "Industrial",
  contractDemand: 13, fixedCharges: 0, sanctionedLoad: 13.28, sanctionedLoadUnit: "HP", connectedLoad: 13.28, connectedLoadUnit: "HP",
  prevReading: 3315.78, currReading: 4193.4, kvahPrevReading: 3935.15, kvahCurrReading: 4892.01, multiplyingFactor: 1,
  activeKwh: 878, kvahReading: 956.86, recordedMD: 8.85, recordedMdKw: 8.04, readingFrom: "31/08/2026", readingTo: "30/09/2026",
  energyCharges: 5496.28, todCharges: 71.99, demandCharges: 650, fac: 263.4, ed: 591.49, tose: 244.96, wheelingCharges: 1404.8,
  otherCharges: 0, currentBillTotal: 8722.92, billAmount: 8720, amountAfterDue: 8820, billingMonth: "Oct-2026",
  billingHistory: HISTORY, billingHistoryUnit: "kWh",
  todSlots: [{ slot: "A", units: 173 }, { slot: "B", units: 88 }, { slot: "C", units: 285 }, { slot: "D", units: 331 }],
  hasSolar: false, solarSourceField: "lt_nameplate", confidence: 95,
  ...over,
});

// ── 1. Bill amount vs amount payable after the due date ──
const good = sanitizeCommercialData(modelOutput());
check("bill amount kept when distinct from after-due", [good.billAmount, good.amountAfterDue], [8720, 8820]);
const misread = sanitizeCommercialData(modelOutput({ billAmount: 8820 }));
check("after-due figure in billAmount → left blank for review", [misread.billAmount, misread.amountAfterDue], ["", 8820]);
check("the bill's own month is never added to the history", misread.billingHistory.some((r) => r.monthLabel === "Oct-2026"), false);
const misreadChecks = computeValidationChecks(computeBillingStats(misread.billingHistory, ""), computeTodUtilisation(misread.todSlots), computeMeterDerived(misread), reconcileCharges(misread), misread);
check("blank bill amount asks for the rounded total", misreadChecks.some((c) => c.label.startsWith("BILL AMOUNT BLANK")), true);
const typedWrong = { ...good, billAmount: 8820 as number | "" };
const typedChecks = computeValidationChecks(computeBillingStats(good.billingHistory, ""), computeTodUtilisation(good.todSlots), computeMeterDerived(good), reconcileCharges(typedWrong), typedWrong);
check("after-due amount entered as bill amount → error", typedChecks.some((c) => c.status === "err" && c.label.startsWith("BILL AMOUNT = AMOUNT PAYABLE AFTER")), true);

// ── 2. Reconciliation (current charges vs payable are separate figures) ──
const recon = reconcileCharges(good);
check("Σ charge lines = printed TOTAL CURRENT BILL", [recon.currentCharges, recon.currentOk], [8722.92, true]);
check("rounded bill reconciled", [recon.reconstructedTotal, recon.withinTolerance], [8720, true]);

// ── 3. TOD slots: missing is not zero ──
const slotB0 = sanitizeCommercialData(modelOutput({ todSlots: [{ slot: "A", units: 173 }, { slot: "B", units: 0 }, { slot: "C", units: 285 }, { slot: "D", units: 331 }] }));
check("unread slot B (sum 789 ≠ 878 kWh) → blank", slotB0.todSlots.map((s) => s.units), [173, "", 285, 331]);
const todMissing = computeTodUtilisation(slotB0.todSlots);
check("no TOD proxy from an incomplete table", [todMissing.utilisableFraction, todMissing.missing], [0, ["B"]]);
check("full table read → all kept (877 vs 878 is rounding)", good.todSlots.map((s) => s.units), [173, 88, 285, 331]);
close("TOD B+C share = office workbook M15", computeTodUtilisation(good.todSlots).utilisableFraction, 0.425313569, 1e-6);
check("a genuine 0 slot is kept when the slots add up", blankUnreadSlot([173, 0, 374, 331], 1, 878, 956.86), 0);
check("non-TOD bill (all 0) stays 0", blankUnreadSlot([0, 0, 0, 0], 1, 878, 956.86), 0);
check("no kWh/kVAh to compare against → kept as read", blankUnreadSlot([173, 0, 285, 331], 1, 0, 0), 0);

// ── 4. FAC mis-assigned to "other" ──
const facInOther = { ...good, fac: "" as number | "", otherCharges: 263.4 as number | "" };
const facChecks = computeValidationChecks(computeBillingStats(good.billingHistory, ""), computeTodUtilisation(good.todSlots), computeMeterDerived(good), reconcileCharges(facInOther), facInOther);
check("FAC blank + other set → flagged", facChecks.some((c) => c.label.startsWith("FAC BLANK BUT OTHER")), true);

// ── 5. Sizing baseline ──
const auto = analyseCommercial([{ data: good, sourceId: "bill.pdf" }], DEFAULT_SIZING);
check("auto picks the 12 kWh history months", [auto.baseline?.source, auto.baseline?.periods], ["history", 12]);
close("history average = office workbook D23 (current month excluded)", auto.baseline!.avgMonthlyKwh, 398.8333, 1e-3);
check("calculated capacity = office workbook D27/D28 (6 panels, 3.6 kWp, 10 % margin)", [auto.pipeline.fullPanels, auto.pipeline.fullKwp], [6, 3.6]);
// Recommended = TOD consideration × calculated capacity (Metal Junction workbook K24–K29): 0.4253 × 1.1 × 3.7604 = 1.759 kWp → 3 panels.
check("recommended = TOD-based: 3 panels / 1.8 kWp", [auto.pipeline.recommendedBasis, auto.pipeline.recommendedPanels, auto.pipeline.recommendedKwp], ["tod", 3, 1.8]);
check("history = the 12 printed months only (Oct-2026 not added)", good.billingHistory.length, 12);

const meter = analyseCommercial([{ data: good, sourceId: "bill.pdf" }], { ...DEFAULT_SIZING, baseline: "meter" });
check("meter baseline = 878 kWh over 30 reading days", [meter.baseline?.source, meter.baseline?.totalDays, Math.round(meter.baseline!.annualKwh)], ["meter", 30, 10682]);
check("meter option, 10 % margin: 10682 × 1.1 ÷ 1400 = 8.39 kWp → 14 panels", [meter.pipeline.fullPanels, meter.pipeline.fullKwp], [14, 8.4]);

const kvahBill = { ...good, billingHistoryUnit: "kVAh" as const };
check("kVAh history is averaged as printed, like the office workbook (auto → history)", analyseCommercial([{ data: kvahBill, sourceId: "b" }], DEFAULT_SIZING).baseline?.source, "history");
const forced = analyseCommercial([{ data: kvahBill, sourceId: "b" }], { ...DEFAULT_SIZING, baseline: "history" });
check("history chosen on kVAh → the printed months", [forced.baseline?.periods, forced.baselineIssue], [12, null]);

const fewMonths = { ...good, billingHistory: good.billingHistory.slice(-4) };
check("auto needs 6+ history months (4 here) → meter", analyseCommercial([{ data: fewMonths, sourceId: "b" }], DEFAULT_SIZING).baseline?.source, "meter");

const gap = { ...good, billingHistory: good.billingHistory.map((r) => (r.monthLabel === "Jan-2026" ? { ...r, units: "" as number | "" } : r)) };
const gapBase = analyseCommercial([{ data: gap, sourceId: "b" }], DEFAULT_SIZING).baseline!;
check("unread history month is left out and named, not counted as 0", [gapBase.periods, gapBase.notes.some((n) => n.includes("Jan-2026"))], [11, true]);

check("older saved settings without a baseline behave as auto", analyseCommercial([{ data: good, sourceId: "b" }], { ...DEFAULT_SIZING, baseline: undefined }).baseline?.source, "history");

console.log(`\n${passed} passed`);
