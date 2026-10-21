// src/billingHistoryAverage.test.ts
// Run with: npx tsx src/billingHistoryAverage.test.ts
// Rule for ALL bills (Home, Society, C&I — decided 2026-10-21): the averages use
// exactly the months printed in the bill's BILLING HISTORY table (12, 13, any
// count) and the bill's own month is never added. Pinned on the office workbook
// for METAL JUNCTION (Sep-2026 bill, 13 printed months, Fixed = Demand ₹31,080):
// Average units 52330.62, bill 5,71,900.57, unit cost 10.42.
import assert from "node:assert/strict";
import { summariseHistory, buildWorksheetModel } from "./worksheetModel";
import { computeBillingStats, monthlyFixedOf, DEFAULT_SIZING } from "./modules/commercial/commercialCalculations";
import { analyseCommercial } from "./modules/commercial/consumptionSizing";
import { sanitizeCommercialData } from "./modules/commercial/commercialApi";

let passed = 0;
function close(label: string, actual: number | null, expected: number, tol = 0.005) {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const printed: [string, number, number][] = [
  ["Aug-2025", 42080, 466874.6], ["Sep-2025", 31920, 368695.7], ["Oct-2025", 31920, 351538.7],
  ["Nov-2025", 170295, 1718368.78], ["Dec-2025", 43391, 467981.16], ["Jan-2026", 42465, 469740.92],
  ["Feb-2026", 38500, 432095.03], ["Mar-2026", 37298, 412530.66], ["Apr-2026", 34428, 406598.76],
  ["May-2026", 49749, 558864.17], ["Jun-2026", 53557, 599136.79], ["Jul-2026", 50632, 576426.96],
  ["Aug-2026", 54063, 605855.14],
];

// Home / Society worksheet
const slot = { fixedCharges: 31080, history: printed.map(([month, units, billAmount]) => ({ month, units, billAmount, unitCost: "" as const })) };
const home = summariseHistory(slot, 600);
close("Home/Society: average units over all 13 printed months", home.avgUnits, 52330.62);
close("Home/Society: average bill amount", home.avgBill, 571900.57);
close("Home/Society: first month unit cost = (bill − fixed) ÷ units", home.unitCosts[0], 10.36);
close("Home/Society: average unit cost", home.avgCost, 10.42);
const model = buildWorksheetModel(slot, 600);
const cell = (ref: string) => model.cells.find((c) => c.ref === ref)?.value as number;
close("export: 13th month on row 21, Average row moves to 23", cell("D23"), 52330.62);
const withBlank = summariseHistory({ ...slot, history: [...slot.history, { month: "Sep-2026", units: "" as const, billAmount: "" as const, unitCost: "" as const }] }, 600);
close("an unread month is left out, not averaged as 0", withBlank.avgUnits, 52330.62);

// C&I: the sanitizer keeps the printed months only (Sep-2026, the bill's own month, is not added)
const ci = sanitizeCommercialData({
  consumerNo: "176081689475", connectionType: "LT", billingMonth: "Sep-2026", billingHistoryUnit: "kVAh",
  activeKwh: 38487, kvahReading: 41151, billAmount: 481240, demandCharges: 31080, todSlots: [],
  billingHistory: printed.map(([monthLabel, units, billAmount]) => ({ monthLabel, units, billAmount })),
});
assert.equal(ci.billingHistory.length, 13); passed++;
console.log("  ok — C&I: 13 printed months, own month not added");
const stats = computeBillingStats(ci.billingHistory, monthlyFixedOf(ci));
close("C&I: average units", stats.avgUnits, 52330.62);
close("C&I: average bill amount", stats.avgBillAmount, 571900.57);
close("C&I: average unit cost with Fixed = Demand ₹31,080", stats.avgUnitCost, 10.42);

// C&I sizing = the workbook's formula (September sheet, D26 / K24 / K26 / K28 / K29):
// 52330.62 × 12 × 1.1 ÷ 1400 = 493.40 kWp; TOD (4515+13633)/41151 × 1.1 = 0.4851;
// × 493.40 = 239.36 kWp → ROUND(398.93) = 399 panels → 239.4 kWp.
const withTod = { ...ci, todSlots: [{ slot: "A" as const, units: 11074 }, { slot: "B" as const, units: 4515 }, { slot: "C" as const, units: 13633 }, { slot: "D" as const, units: 11929 }] };
const sized = analyseCommercial([{ data: withTod, sourceId: "metal-junction.pdf" }], DEFAULT_SIZING);
close("C&I: sized on the printed-history average (billed kVAh, as printed)", sized.baseline?.avgMonthlyKwh ?? null, 52330.62);
close("C&I: Calculated Solar Capacity (D26)", sized.pipeline.solarCapacityRawKwp, 493.403, 0.001);
close("C&I: TOD Consideration (K24)", sized.pipeline.todConsideration, 0.48511, 0.00001);
close("C&I: TOD capacity (K26)", sized.pipeline.todSolarCapacityKwp, 239.355, 0.001);
close("C&I: Number of Panels (K29)", sized.pipeline.recommendedPanels, 399, 0);
close("C&I: Actual Solar capacity (K28)", sized.pipeline.recommendedKwp, 239.4, 1e-9);

console.log(`\n${passed} checks passed.`);
