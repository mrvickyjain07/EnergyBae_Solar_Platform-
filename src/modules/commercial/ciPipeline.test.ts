// src/modules/commercial/ciPipeline.test.ts
// Run with: npx tsx src/modules/commercial/ciPipeline.test.ts
//
// The C&I scan pipeline end to end, with MOCKED model responses (no Gemini call):
//   model JSON → sanitizeCommercialData (server) → billFromExtraction (page)
//   → reconcile / TOD / checks / analyseCommercial (sizing + savings).
// Fixtures:
//   A. The Oct-2026 MSEDCL LT-V B I bill read correctly as printed lines (identity synthetic).
//   B. The same bill as actually mis-read on 2026-10-21 (shifted charge column, misread
//      registers, TOD 0/172/331/0, history unit "kVAh") — every error must surface as a
//      check or an unavailable result, never as a confident number.
//   C. A different synthetic HT bill: kVAh billing, explicit Fixed Charges, other labels,
//      no TOD, 6-month history, kW loads — nothing from A may leak into it.
// Bill figures live here only; production code has no bill-specific values.
import assert from "node:assert/strict";
import { sanitizeCommercialData, historyUnitFrom } from "./commercialApi";
import { billFromExtraction, extractionVersionError, EXTRACTION_VERSION } from "./extractionResult";
import { categorize, chargeSuggestions, todSuggestions, duplicateAmounts, mapChargeLines, slotOf, toChargeLines } from "./chargeMapping";
import { analyseCommercial } from "./consumptionSizing";
import { loadFromPrintedText, normalizeLoad } from "./billUnits";
import {
  computeBillingStats, monthlyFixedOf, computeMeterDerived, computeTodUtilisation, computeValidationChecks, reconcileCharges, todTotalsOf, DEFAULT_SIZING,
} from "./commercialCalculations";
import type { CommercialBillData } from "./types";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const close = (label: string, actual: number, expected: number, tol = 0.01) => check(label, Math.abs(actual - expected) <= tol, true);
/** Server sanitizer, then the page's fresh-scan builder — the real response path. */
const scan = (raw: Record<string, unknown>, file = "bill.pdf") => billFromExtraction(sanitizeCommercialData(raw), file);
const checksOf = (d: CommercialBillData) =>
  computeValidationChecks(computeBillingStats(d.billingHistory, d.fixedCharges), computeTodUtilisation(d.todSlots, undefined, todTotalsOf(d)), computeMeterDerived(d), reconcileCharges(d), d);
const hasCheck = (d: CommercialBillData, start: string) => checksOf(d).some((c) => c.label.startsWith(start));

// ── Fixture A: as printed ──────────────────────────────────────────────
const HISTORY_A = [
  ["Oct-2025", 256, 2064.23], ["Nov-2025", 160, 2025.72], ["Dec-2025", 246, 2767.86], ["Jan-2026", 106, 1581.61],
  ["Feb-2026", 128, 1796.65], ["Mar-2026", 124, 1781.32], ["Apr-2026", 390, 4163.07], ["May-2026", 1130, 11345.97],
  ["Jun-2026", 1659, 15940.45], ["Jul-2026", 466, 5146.52], ["Aug-2026", 72, 1374.15], ["Sep-2026", 49, 1169.28],
].map(([monthLabel, units, billAmount]) => ({ monthLabel, units, billAmount }));
const LINES_A = [
  ["Demand Charges", 650], ["Wheeling Charges @1.60", 1404.8], ["Energy Charges", 5496.28], ["TOD Tariff EC", 71.99],
  ["FAC @ 0.30 Ps/U", 263.4], ["Electricity Duty", 591.49], ["Other Charges", 0], ["Tax on Sale @ 27.90 Ps/U", 244.96],
  ["P.F. Penal Charges / P.F. Incentive", 0], ["Charges For Excess Demand", 0], ["BILL AS PER MERC", 8722.92],
  ["Debit Bill Adjustment", 0], ["TOTAL CURRENT BILL", 8722.92], ["Current Interest", 0], ["Principal Arrears 29/09/2026", -6.98],
  ["Interest Arrears", 0], ["Total Bill Amount (Rounded) Rs.", 8720], ["Delayed Payment Charges Rs.", 109.04],
  ["Amount (Rounded) Payable After 23/10/2026", 8820],
].map(([label, amount]) => ({ label, amount }));
const TOD_A = [
  { timeRange: "00:00 Hrs - 06:00 Hrs", units: 173, rate: 0, charge: 0 },
  { timeRange: "06:00 Hrs - 09:00 Hrs", units: 88, rate: 0, charge: 0 },
  { timeRange: "09:00 Hrs - 17:00 Hrs", units: 285, rate: -1.565, charge: -446.03 },
  { timeRange: "17:00 Hrs - 24:00 Hrs", units: 331, rate: 1.565, charge: 518.02 },
];
const rawA = (over: Record<string, unknown> = {}) => ({
  consumerNo: "100000000001", consumerName: "SAMPLE LT INDUSTRIAL", connectionType: "LT", category: "Industrial",
  contractDemand: 13, sanctionedLoad: 13.28, sanctionedLoadUnit: "HP", connectedLoad: 13.28, connectedLoadUnit: "HP",
  prevReading: 3315.78, currReading: 4193.4, kvahPrevReading: 3935.15, kvahCurrReading: 4892.01, multiplyingFactor: 1,
  activeKwh: 878, kvahReading: 956.86, readingFrom: "31/08/2026", readingTo: "30/09/2026",
  chargeLines: LINES_A, billedUnits: 878, todRows: TOD_A, billingMonth: "Oct-2026",
  billingHistory: HISTORY_A, billingHistoryUnit: "kVAh", // the model's wrong guess — the billed units decide
  hasSolar: false, solarSourceField: "lt_nameplate", confidence: 95,
  ...over,
});

console.log("A. reference bill, read as printed lines");
const A = scan(rawA());
check("charges classified from labels", [A.energyCharges, A.todCharges, A.demandCharges, A.fixedCharges, A.fac, A.ed, A.tose, A.wheelingCharges, A.otherCharges],
  [5496.28, 71.99, 650, "", 263.4, 591.49, 244.96, 1404.8, 0]);
check("fixed stays missing (no such line); demand is its own field", [A.fixedCharges, A.demandCharges], ["", 650]);
check("four amounts kept apart", [A.currentBillTotal, A.billAmount, A.amountAfterDue, A.delayedPayment], [8722.92, 8720, 8820, ""]);
check("negative principal arrears = a ₹6.98 credit", [A.arrears, A.creditAdjustment], [0, 6.98]);
const rA = reconcileCharges(A);
check("Σ lines = TOTAL CURRENT BILL ₹8722.92", [rA.currentCharges, rA.currentOk], [8722.92, true]);
check("rounded bill reconciles (8722.92 − 6.98 → 8720)", [rA.reconstructedTotal, rA.withinTolerance], [8720, true]);
check("history unit from billed units 878 = kWh (model said kVAh)", A.billingHistoryUnit, "kWh");
check("TOD slots by printed time band", A.todSlots.map((s) => s.units), [173, 88, 285, 331]);
const todA = computeTodUtilisation(A.todSlots, undefined, todTotalsOf(A));
close("TOD B+C share = 373/877 (workbook M15)", todA.utilisableFraction, 0.425313569, 1e-6);
check("TOD reconciles with kWh", todA.unreconciled, false);
check("no warnings beyond the expected ones", checksOf(A).filter((c) => c.status === "err").map((c) => c.label), []);
const meterA = computeMeterDerived(A);
check("register differences as printed (877.62 kWh, 956.86 kVAh)", [meterA.assessedUnits, meterA.kvahFromRegisters], [877.62, 956.86]);
const hp = normalizeLoad(A.sanctionedLoad, "HP");
check("13.28 HP kept as printed and converted once", [hp.originalValue, hp.originalUnit, hp.kw], [13.28, "HP", 9.907]);

const aAuto = analyseCommercial([{ data: A, sourceId: "a.pdf" }], DEFAULT_SIZING);
check("sized on the 12 previous kWh months", [aAuto.baseline?.source, aAuto.baseline?.periods], ["history", 12]);
close("monthly average 398.83 kWh (current month excluded)", aAuto.baseline!.avgMonthlyKwh, 398.8333, 1e-3);
close("annual use 4786 kWh", aAuto.baseline!.annualKwh, 4786, 0.5);
close("capacity before margin 3.419 kWp", aAuto.pipeline.theoreticalKwp, 3.419, 0.001);
check("6 panels / 3.6 kWp before TOD (default 10 % margin)", [aAuto.pipeline.fullPanels, aAuto.pipeline.fullKwp], [6, 3.6]);
const aWorkbook = aAuto; // the default IS the workbook formula now (10 % margin)
close("with the workbook's 10 % margin: 3.760 kWp", aWorkbook.pipeline.solarCapacityRawKwp, 3.7604, 0.001);
check("still 6 panels / 3.6 kWp (workbook D27/D28)", [aWorkbook.pipeline.fullPanels, aWorkbook.pipeline.fullKwp], [6, 3.6]);
close("variable-charge rate = ₹8072.92 / 878 kWh", aAuto.energyRate, 8072.92 / 878, 1e-6);
check("savings available", [aAuto.rateIssue, aAuto.pipeline.annualSavingAvgRate > 0], [null, true]);
const aMeter = analyseCommercial([{ data: A, sourceId: "a.pdf" }], { ...DEFAULT_SIZING, baseline: "meter" });
check("current-month scenario still available, labelled meter (10 % margin)", [aMeter.baseline?.source, aMeter.pipeline.fullPanels], ["meter", 14]);

// ── Fixture B: the mis-read of 2026-10-21 ──────────────────────────────
console.log("B. the same bill as actually mis-read");
const B = scan(rawA({
  prevReading: 3515.78, activeKwh: 678, kvahPrevReading: 3935.19, kvahCurrReading: 4882.01, kvahReading: 946.82,
  sanctionedLoadUnit: "kW", connectedLoadUnit: "kW",
  chargeLines: undefined, todRows: undefined, billedUnits: 878, // old-style response: flat fields only
  energyCharges: 5496.28, todCharges: 0, demandCharges: 650, fac: 71.99, ed: 591.49, tose: 591.49, wheelingCharges: 1404.8, otherCharges: 244.98,
  currentBillTotal: 8722.92, billAmount: 8820, amountAfterDue: 0,
  todSlots: [{ slot: "A", units: 0 }, { slot: "B", units: 172 }, { slot: "C", units: 331 }, { slot: "D", units: 0 }],
}));
const rB = reconcileCharges(B);
check("shifted charges don't add up → flagged, not trusted", [rB.currentCharges, rB.currentOk], [9051.03, false]);
check("billed units 878 vs kWh 678 → history unit unknown, not guessed", B.billingHistoryUnit, "unknown");
check("…and flagged as a meter-table problem", hasCheck(B, "BILLED UNITS 878 MATCH NEITHER"), true);
check("unread TOD zeros (sum 503 ≠ 678 / 946.82) → blank", B.todSlots.map((s) => s.units), ["", 172, 331, ""]);
const todB = computeTodUtilisation(B.todSlots, undefined, todTotalsOf(B));
check("no TOD % from it (was 100 %)", [todB.utilisableFraction, todB.missing], [0, ["A", "D"]]);
// Same TOD values arriving as zeros (an old server / a saved analysis): the engine itself refuses the share.
const todZeros = computeTodUtilisation([{ slot: "A", units: 0 }, { slot: "B", units: 172 }, { slot: "C", units: 331 }, { slot: "D", units: 0 }], undefined, todTotalsOf(B));
check("complete-looking table that doesn't add up → unreconciled, 0 %", [todZeros.unreconciled, todZeros.utilisableFraction], [true, 0]);
const bAuto = analyseCommercial([{ data: B, sourceId: "b.pdf" }], DEFAULT_SIZING);
check("printed history months are averaged as printed, even with the unit unconfirmed", bAuto.baseline?.source, "history");
check("savings unavailable with the reason", bAuto.rateIssue?.startsWith("The charge lines add up to ₹9,051.03"), true);
const bHist = analyseCommercial([{ data: B, sourceId: "b.pdf" }], { ...DEFAULT_SIZING, baseline: "history" });
check("history chosen → the printed months, no issue", [bHist.baseline?.source, bHist.pipeline.fullPanels > 0, bHist.baselineIssue], ["history", true, null]);
check("same ₹591.49 in ED and ToSE is not in the lines path — but the sum check caught it", hasCheck(B, "CHARGES ≠ TOTAL CURRENT BILL"), true);

// ── Fixture C: a different bill ────────────────────────────────────────
console.log("C. a different synthetic HT bill");
const C = scan(rawA({
  consumerNo: "200000000002", consumerName: "SAMPLE HT COMMERCIAL", connectionType: "HT", category: "Commercial",
  contractDemand: 250, sanctionedLoad: 300, sanctionedLoadUnit: "kW", connectedLoad: 320, connectedLoadUnit: "kVA",
  prevReading: 100000, currReading: 101000, kvahPrevReading: 110000, kvahCurrReading: 111050, multiplyingFactor: 40,
  activeKwh: 40000, kvahReading: 42000, billedUnits: 42000, readingFrom: "2026-08-01", readingTo: "2026-08-31",
  chargeLines: [
    { label: "Fixed Charges", amount: 15120 }, { label: "Energy Charges", amount: 357000 }, { label: "Fuel Cost Adjustment", amount: 8400 },
    { label: "Electricity Duty @ 9.3%", amount: 35700 }, { label: "PF Incentive", amount: -4200 }, { label: "ToD Rebate", amount: -2100 },
    { label: "Meter Rent", amount: 500 }, { label: "Govt Subsidy", amount: -1500 }, { label: "Green Energy Cess", amount: 420 },
    { label: "Total Current Bill", amount: 410420 }, { label: "Net Bill Amount", amount: 408920 }, { label: "If paid after 15/09/2026", amount: 415000 },
  ],
  todRows: [], todSlots: [], billingMonth: "Sep-2026",
  billingHistory: [["Mar-2026", 41000, 400000], ["Apr-2026", 43000, 410000], ["May-2026", 45000, 420000], ["Jun-2026", 0, 15120], ["Jul-2026", 42000, 405000], ["Aug-2026", 40000, 395000]]
    .map(([monthLabel, units, billAmount]) => ({ monthLabel, units, billAmount })),
}), "c.pdf");
check("explicit fixed charge kept, no demand line", [C.fixedCharges, C.demandCharges], [15120, ""]);
check("credits signed as credits, rebate on TOD line", [C.otherCharges, C.todCharges, C.creditAdjustment], [-3700, -2100, 1500]);
check("unknown label left unmapped (not forced into a category)", C.chargeLines.find((l) => l.label === "Green Energy Cess")?.category, "unmapped");
check("unmapped line flagged for review", hasCheck(C, "UNRECOGNISED CHARGE LINE"), true);
check("bill amount vs after-due kept apart", [C.billAmount, C.amountAfterDue], [408920, 415000]);
check("kVAh billing → kVAh history", C.billingHistoryUnit, "kVAh");
check("no TOD table → no slots, no proxy", [C.todSlots.map((s) => s.units), computeTodUtilisation(C.todSlots).utilisableFraction], [["", "", "", ""], 0]);
check("kVA connected load is never converted to kW", normalizeLoad(C.connectedLoad, "kVA").kw, null);
const cAuto = analyseCommercial([{ data: C, sourceId: "c.pdf" }], DEFAULT_SIZING);
check("kVAh history → sized on the meter kWh", [cAuto.baseline?.source, cAuto.baseline?.totalKwh], ["meter", 40000]);

console.log("Isolation and re-scan");
check("a re-scan starts blank: A's values don't leak into C", [C.consumerName, C.fac, C.wheelingCharges, C.amountAfterDue], ["SAMPLE HT COMMERCIAL", 8400, "", 415000]);
const emptyScan = billFromExtraction({ consumerNo: "300000000003" }, "d.pdf");
check("fields a scan didn't return stay blank (never the previous bill's)", [emptyScan.billAmount, emptyScan.todSlots.map((s) => s.units), emptyScan.billingHistory], ["", ["", "", "", ""], []]);
const two = analyseCommercial([{ data: A, sourceId: "a.pdf" }, { data: C, sourceId: "c.pdf" }], DEFAULT_SIZING);
check("two consumers are never merged", two.histories.map((h) => h.connectionId).sort(), ["100000000001", "200000000002"]);
check("a stale server is reported, not shown as a fresh scan", [extractionVersionError({ extractionVersion: EXTRACTION_VERSION }), typeof extractionVersionError({})], [null, "string"]);

console.log("Mapping rules");
check("labels", ["FAC @ 0.30 Ps/U", "Fuel Adjustment Charge", "E.D. on (Rs.)", "S.D. Interest", "Interest Arrears", "Prompt Payment Discount", "Delayed Payment Charges Rs."].map(categorize),
  ["fac", "fac", "subtotal", "credit", "interest", "conditional", "lateFeeIfLate"]);
check("time bands", ["00:00 Hrs - 06:00 Hrs", "06:00-09:00", "9:00 to 17:00", "17:00 Hrs – 24:00 Hrs", "22:00 - 06:00", "18:30-22:00"].map(slotOf), ["A", "B", "C", "D", null, null]);
check("same amount on two kinds of line is flagged", duplicateAmounts(toChargeLines([{ label: "Electricity Duty", amount: 591.49 }, { label: "Tax on Sale", amount: 591.49 }])).length, 1);
check("printed zero line = 0, absent line = missing", [mapChargeLines(toChargeLines([{ label: "Other Charges", amount: 0 }])).otherCharges, mapChargeLines([]).otherCharges], [0, ""]);
check("history unit: matches both (PF≈1) → the model's claim", historyUnitFrom(1000, 1000, 1002, "kVAh"), "kVAh");
check("history unit: no billed units → the model's claim", historyUnitFrom(0, 878, 956, "kWh"), "kWh");

console.log("Load units from the printed row");
check("trailing unit wins over the label's (KW)", [loadFromPrintedText("Sanctioned Load : 13.28 HP"), loadFromPrintedText("Connected Load (KW): 13.28 HP")],
  [{ value: 13.28, unit: "HP" }, { value: 13.28, unit: "HP" }]);
check("no unit after the number → the label's unit", loadFromPrintedText("Sanctioned Load (kW): 40.78"), { value: 40.78, unit: "kW" });
check("no unit anywhere → unknown (asked, not assumed)", loadFromPrintedText("Sanctioned Load : 13.28")?.unit, "unknown");
const hpScan = scan(rawA({ sanctionedLoadUnit: "kW", connectedLoadUnit: "kW", sanctionedLoadText: "Sanctioned Load : 13.28 HP", connectedLoadText: "Connected Load (KW): 13.28 HP" }));
check("model said kW, printed text says HP → HP", [hpScan.sanctionedLoad, hpScan.sanctionedLoadUnit, hpScan.connectedLoadUnit], [13.28, "HP", "HP"]);

console.log("Fix suggestions");
// The 2026-10-21 re-scan: FAC line read as 0, ToSE as 244.98 → lines ₹263.38 short of ₹8722.92.
const facZero = toChargeLines(LINES_A.map((l) => (String(l.label).startsWith("FAC") ? { ...l, amount: 0 } : String(l.label).startsWith("Tax on Sale") ? { ...l, amount: 244.98 } : l)));
const fz = scan(rawA({ chargeLines: facZero }));
const rFz = reconcileCharges(fz);
const sug = chargeSuggestions(fz.chargeLines, fz, 878, rFz.printedCurrentTotal - rFz.currentCharges);
check("FAC 0 → suggest ₹263.40 (0.30 × 878), which closes the ₹263.38 gap", sug.map((s) => [s.field, s.value]), [["fac", 263.4]]);
check("applying it reconciles", reconcileCharges({ ...fz, fac: 263.4 }).currentOk, true);
check("nothing suggested when the lines already add up", chargeSuggestions(A.chargeLines, A, 878, 0), []);
check("nothing suggested when no rate × units closes the gap", chargeSuggestions(A.chargeLines, A, 878, 500), []);

console.log("Fixed / demand in the history unit cost");
check("fixed + demand = ₹650 here (no fixed line, demand ₹650)", monthlyFixedOf(A), 650);
close("Oct-2025 (bill − 650) ÷ units = workbook F9", computeBillingStats(HISTORY_A as any, monthlyFixedOf(A)).rows[0].unitCost!, 5.524335938, 1e-6);
check("neither printed → none deducted", monthlyFixedOf({ fixedCharges: "", demandCharges: "" }), "");

console.log("TOD fix suggestions");
// The 2026-10-21 scan: A 172 (173), B 0 (88), C 289 (285), D 331 — sum 792 against 878 kWh.
const todScan = scan(rawA({ todRows: [
  { timeRange: "00:00 Hrs - 06:00 Hrs", units: 172, rate: 0, charge: 0 },
  { timeRange: "06:00 Hrs - 09:00 Hrs", units: 0, rate: 0, charge: 0 },
  { timeRange: "09:00 Hrs - 17:00 Hrs", units: 289, rate: -1.565, charge: -446.03 },
  { timeRange: "17:00 Hrs - 24:00 Hrs", units: 331, rate: 1.565, charge: 518.02 },
] }));
const tf = todSuggestions(todScan.todRows, todScan.todSlots, todTotalsOf(todScan));
check("C corrected exactly from its own row (−446.03 ÷ −1.565 = 285)", tf.find((s) => s.slot === "C"), { slot: "C", value: 285, exact: true, reason: "printed charge ₹-446.03 ÷ rate -1.565 = 285 units" });
check("D already agrees with 518.02 ÷ 1.565 → no suggestion", tf.some((s) => s.slot === "D"), false);
check("B (a 0.0000-rate band) estimated from the total, marked as an estimate", tf.filter((s) => s.slot === "B").map((s) => [s.value, s.exact]), [[90, false]]);
check("a table that adds up gets no suggestions", todSuggestions(A.todRows, A.todSlots, todTotalsOf(A)), []);

console.log(`\n${passed} passed`);
