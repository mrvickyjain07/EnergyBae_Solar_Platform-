// src/modules/commercial/julyBillRegression.test.ts
// Run with: npx tsx src/modules/commercial/julyBillRegression.test.ts
// Regression fixture: one MSEDCL LT-V industrial TOD bill (Jul-2026), the bill
// whose screen showed a register reading as kVAh, PF 3.6446, demand charges as
// fixed charges, a derived 139.5 kVA billed demand and a hidden TOD ×1.1.
// Values are what the bill prints; the consumer number is replaced and no name,
// address, PAN or GSTIN is stored. Production code never sees these numbers —
// they enter only through sanitizeCommercialData, like a real extraction.
import assert from "node:assert/strict";
import { sanitizeCommercialData } from "./commercialApi";
import { analyseCommercial } from "./consumptionSizing";
import { normalizeLoad } from "./billUnits";
import { computeBillingStats, computeMeterDerived, computeTodUtilisation, computeValidationChecks, DEFAULT_SIZING, reconcileCharges } from "./commercialCalculations";
import { validateBillAnalysis } from "../projects/billAnalysisRules";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const r2 = (x: number) => Math.round(x * 100) / 100;

// What a correct extraction of the July bill returns (model JSON, before the sanitizer).
const RAW = {
  consumerNo: "100000000001", connectionType: "LT", category: "Industrial",
  sanctionedLoad: 200, sanctionedLoadUnit: "HP", connectedLoad: 200, connectedLoadUnit: "HP", contractDemand: 186, fixedCharges: 0,
  prevReading: 10689.57, currReading: 11874.77, kvahPrevReading: 11742.08, kvahCurrReading: 13007.89, multiplyingFactor: 40,
  activeKwh: 47408, kvahReading: 50632, readingFrom: "30/06/2026", readingTo: "31/07/2026",
  recordedMdKw: 111, recordedMD: 115, billedDemand: 75, billedDemandUnit: "", avgPowerFactor: 0.978, billedPowerFactor: 0.936,
  energyCharges: 387841.12, todCharges: 9888.29, demandCharges: 31500, fac: 17721.2, ed: 39293.34, tose: 13222.37, wheelingCharges: 76960.64,
  otherCharges: 0, delayedPayment: 0, arrears: 0, creditAdjustment: 2.43, currentBillTotal: 576426.96, billAmount: 576420,
  billingMonth: "Jul-2026", billingHistoryUnit: "kVAh",
  billingHistory: [
    { monthLabel: "Jan-2026", units: 34428, billAmount: 469740.92 },
    { monthLabel: "Feb-2026", units: 37298, billAmount: 432095.03 },
    { monthLabel: "Mar-2026", units: 49749, billAmount: 412530.66 },
    { monthLabel: "Apr-2026", units: 38500, billAmount: 406598.76 },
    { monthLabel: "May-2026", units: 53557, billAmount: 558864.17 },
    { monthLabel: "Jun-2026", units: 170295, billAmount: 599136.79 }, // an outlier the history table can hold
  ],
  todSlots: [{ slot: "A", units: 14033 }, { slot: "B", units: 5685 }, { slot: "C", units: 16094 }, { slot: "D", units: 14820 }],
};
const bill = { ...sanitizeCommercialData(RAW), filename: "jul.pdf" };
const a = analyseCommercial([{ data: bill, sourceId: "jul.pdf" }], DEFAULT_SIZING);
const meter = computeMeterDerived(bill);
const recon = reconcileCharges(bill);
const tod = computeTodUtilisation(bill.todSlots);
const checks = computeValidationChecks(computeBillingStats(bill.billingHistory, bill.fixedCharges), tod, meter, recon, bill);
const labels = checks.map((c) => c.label);
const statusOf = (prefix: string) => checks.find((c) => c.label.startsWith(prefix))?.status;

// 1–2. Loads: HP converted with its original kept; kW passes; kVA is never treated as HP.
check("1. sanctioned 200 HP → 149.2 kW, original kept", [a.sanctioned.originalValue, a.sanctioned.originalUnit, a.sanctioned.kw, a.sanctioned.method], [200, "HP", 149.2, "HP × 0.746"]);
check("1. connected 200 HP → 149.2 kW", [a.connected.originalUnit, a.connected.kw], ["HP", 149.2]);
check("1. contract demand stays 186 kVA", bill.contractDemand, 186);
check("2. kW passes unchanged; kVA not converted", [normalizeLoad(150, "kW").kw, normalizeLoad(186, "kVA").kw], [150, null]);

// 3–4. Registers vs period consumption are distinct fields; the registers only cross-check.
check("3. KWH registers", [bill.prevReading, bill.currReading], [10689.57, 11874.77]);
check("3. KVAH registers", [bill.kvahPrevReading, bill.kvahCurrReading], [11742.08, 13007.89]);
check("4. period consumption 47,408 kWh and 50,632 kVAh", [bill.activeKwh, bill.kvahReading], [47408, 50632]);
check("4. (11,874.770 − 10,689.570) × 40 = 47,408", meter.assessedUnits, 47408);
check("4. (13,007.890 − 11,742.080) × 40 ≈ 50,632 (printed precision)", Math.round(meter.kvahFromRegisters!), 50632);
check("4. both register checks pass", [statusOf("KWH REGISTERS"), statusOf("KVAH REGISTERS")], ["ok", "ok"]);
const misread = sanitizeCommercialData({ ...RAW, kvahReading: 13007.89 });
check("4. a kVAh 'consumption' equal to the register reading is blanked, not shown", misread.kvahReading, "");
check("4. …and the active kWh is untouched", misread.activeKwh, 47408);

// 5. PF only as printed — never computed from registers.
check("5. PFs as printed", [bill.avgPowerFactor, bill.billedPowerFactor], [0.978, 0.936]);
check("5. labelled by source", [labels.includes("AVG PF 0.978"), labels.includes("BILLED PF 0.936")], [true, true]);
check("5. no derived PF on the meter result", "powerFactor" in meter, false);
const badPf = sanitizeCommercialData({ ...RAW, avgPowerFactor: 3.6446 });
check("5. impossible PF kept as read (not clamped) and flagged", [badPf.avgPowerFactor, computeValidationChecks(computeBillingStats([], ""), tod, meter, recon, badPf).find((c) => c.label.startsWith("AVG PF"))?.status], [3.6446, "err"]);

// 6. Billed demand from the bill stays; the 75 % rule is only a labelled screening value.
check("6. billed demand stays 75 (not 139.5)", bill.billedDemand, 75);
check("6. MD kW / kVA kept apart", [bill.recordedMdKw, bill.recordedMD], [111, 115]);
check("6. 75 % × 186 = 139.5 kVA kept separately", meter.demandFloorKva, 139.5);
check("6. conflict is a warning, not an override", statusOf("BILLED DEMAND 75 BELOW"), "warn");

// 7. Demand charges are not fixed charges.
check("7. demand ₹31,500 stays demand; fixed blank", [bill.demandCharges, bill.fixedCharges], [31500, ""]);

// 8. Components reconcile to the printed totals (rule documented in reconcileCharges).
check("8. Σ components = TOTAL CURRENT BILL ₹576,426.96", [recon.currentCharges, recon.currentOk], [576426.96, true]);
check("8. ROUND(576,426.96 − 2.43, −10) = ₹576,420", [recon.reconstructedTotal, recon.withinTolerance], [576420, true]);
check("8. TOD EC kept apart from energy charges", [bill.energyCharges, bill.todCharges], [387841.12, 9888.29]);
const doubled = reconcileCharges({ ...bill, energyCharges: 387841.12 + 9888.29 });
check("8. TOD folded into energy AND kept separately is caught (double count)", doubled.currentOk, false);
check("8. a TOD rebate keeps its sign", sanitizeCommercialData({ ...RAW, todCharges: -1200.5 }).todCharges, -1200.5);

// 9. Dates → actual-day annualisation.
check("9. reading dates as ISO", [bill.readingFrom, bill.readingTo], ["2026-06-30", "2026-07-31"]);
check("9. 31 days, annual = 47,408 × 365 ÷ 31 ≈ 558,191", [a.baseline!.totalDays, Math.round(a.baseline!.annualKwh)], [31, 558191]);
check("9. at 1,400 kWh/kWp/yr, 100 % → ≈398.7 kWp theoretical", r2(a.pipeline.theoreticalKwp), r2((47408 * 365) / 31 / 1400));
check("9. ≈398.7", Math.round(a.pipeline.theoreticalKwp * 10) / 10, 398.7);

// 10. kVAh history is reference only.
check("10. baseline = this bill's kWh only", [a.baseline!.periods, a.baseline!.totalKwh], [1, 47408]);
check("10. history months are history-only, never used", a.history!.months.filter((m) => m.status !== "used").every((m) => m.status === "history-only"), true);
check("10. no history month counted as a valid kWh period", a.history!.months.filter((m) => m.status === "used").length, 1);
check("10. history labelled reference-only", labels.some((l) => l.includes("HISTORY MONTHS (kVAh) · REFERENCE ONLY")), true);
check("10. outlier disclosed", labels.includes("OUTLIER IN HISTORY — REVIEW (SHOWN, NOT SIZED)"), true);

// 11. Energy rate = variable charges ÷ active kWh — not a bill total ÷ kVAh.
const variable = 387841.12 + 9888.29 + 17721.2 + 76960.64 + 39293.34 + 13222.37;
check("11. rate = (energy + TOD + FAC + wheeling + ED + ToSE) ÷ kWh", r2(a.energyRate), r2(variable / 47408));
check("11. a bill whose charges don't add up is left out of the rate", analyseCommercial([{ data: { ...bill, todCharges: -20587.78 }, sourceId: "x" }], DEFAULT_SIZING).energyRate, 0);
check("11. saving uses that rate", r2(a.pipeline.annualSavingAvgRate), r2(a.pipeline.solarGenPerYearKwh * a.energyRate));

// 12–13. No hidden multiplier; theoretical and TOD proxy stay separate.
check("12. 0 % margin: raw size = theoretical", [a.pipeline.marginKwp, a.pipeline.solarCapacityRawKwp === a.pipeline.theoreticalKwp], [0, true]);
check("12. TOD proxy = B+C share 43.01 %, no ×1.1", r2(tod.utilisableFraction * 100), r2(((5685 + 16094) / 50632) * 100));
check("12. TOD proxy capacity = theoretical × share, unbuffered", a.pipeline.todSolarCapacityKwp, tod.utilisableFraction * a.pipeline.theoreticalKwp);
check("12. TOD proxy flagged low confidence", statusOf("TOD BAND PROXY"), "warn");
check("13. primary size 665 × 600 W = 399 kWp; proxy 171.6 kWp kept apart", [a.pipeline.fullKwp, a.pipeline.todKwp], [399, 171.6]);
const saved = validateBillAnalysis({ category: "commercial", data: { data: bill, ...DEFAULT_SIZING } }) as any;
check("13. saved recommendation = theoretical size, never the TOD proxy", saved.value.recommended_kw, 399);
check("13. saved sanctioned load in kW", saved.value.sanctioned_load_kw, 149.2);
check("13. new fields survive the save", [saved.value.data.data.kvahCurrReading, saved.value.data.data.billedDemand, saved.value.data.data.todCharges, saved.value.data.data.avgPowerFactor], [13007.89, 75, 9888.29, 0.978]);

// 14. Edits recalculate — Single bill (one bill) and Several bills (same engine).
const edited = analyseCommercial([{ data: { ...bill, activeKwh: 40000 }, sourceId: "jul.pdf" }], DEFAULT_SIZING);
check("14. single: edited kWh re-sizes", Math.round(edited.baseline!.annualKwh), Math.round((40000 * 365) / 31));
const jun = { ...bill, consumerNo: "100000000009", billingMonth: "Jun-2026", activeKwh: 48248, kvahReading: 53557, readingFrom: "2026-05-31", readingTo: "2026-06-30", filename: "jun.pdf" };
const apart = analyseCommercial([{ data: bill, sourceId: "jul.pdf" }, { data: jun, sourceId: "jun.pdf" }], DEFAULT_SIZING);
const joined = analyseCommercial([{ data: bill, sourceId: "jul.pdf" }, { data: { ...jun, consumerNo: bill.consumerNo }, sourceId: "jun.pdf" }], DEFAULT_SIZING);
check("14. several: a misread consumer number keeps bills apart", apart.histories.length, 2);
check("14. several: correcting it consolidates and re-sizes", [joined.histories.length, joined.baseline!.periods, joined.baseline!.totalDays], [1, 2, 61]);

console.log(`\n${passed} checks passed.`);
