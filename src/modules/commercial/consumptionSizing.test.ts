// src/modules/commercial/consumptionSizing.test.ts
// Run with: npx tsx src/modules/commercial/consumptionSizing.test.ts
// Regression fixture: six MSEDCL LT industrial bills (Apr–Sep 2026), values
// read from each bill's CURRENT CONSUMPTION DETAILS table. Redacted: the real
// consumer number, name, address, PAN and GSTIN are not stored here.
import assert from "node:assert/strict";
import { analyseCommercial, billToPeriod, consolidateBills, energyBaseline, sizeSolar, toMonthKey, type BillPeriod, type HistoryRow } from "./consumptionSizing";
import { normalizeLoad } from "./billUnits";
import { computeSizingPipeline, DEFAULT_SIZING, sizingFrom } from "./commercialCalculations";
import { buildBlankCommercialBillData, type CommercialBillData } from "./types";
import { isoDate, sanitizeCommercialData } from "./commercialApi";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const CONN = "CONN-REDACTED-1";
// Billing-history table printed on the September bill. On these bills its "Units" equal the KVAH consumption.
const SEP_HISTORY: HistoryRow[] = [
  ["2026-08", 54063], ["2026-07", 50632], ["2026-06", 53557], ["2026-05", 49749], ["2026-04", 34428], ["2026-03", 37298], ["2026-02", 38500],
  ["2026-01", 42465], ["2025-12", 43391], ["2025-11", 170295], ["2025-10", 31920], ["2025-09", 31920], ["2025-08", 42080],
].map(([month, units]) => ({ month: month as string, units: units as number, unitBasis: "kVAh" as const }));

const bill = (month: string, from: string, to: string, kwh: number, kvah: number, extra: Partial<BillPeriod> = {}): BillPeriod => ({
  sourceId: `bill-${month}.pdf`, fileHash: `hash-${month}`, connectionId: CONN, billingMonth: month, readingFrom: from, readingTo: to, activeKwh: kwh, apparentKvah: kvah, ...extra,
});
const SIX: BillPeriod[] = [
  bill("2026-04", "2026-03-31", "2026-04-30", 33962, 34428),
  bill("2026-05", "2026-04-30", "2026-05-31", 46681, 49749),
  bill("2026-06", "2026-05-31", "2026-06-30", 48248, 53557),
  bill("2026-07", "2026-06-30", "2026-07-31", 47408, 50632),
  bill("2026-08", "2026-07-31", "2026-08-31", 47738, 54063),
  bill("2026-09", "2026-08-31", "2026-09-30", 38487, 41151, { historyRows: SEP_HISTORY }),
];

// ── Six consecutive bills, one connection ──
const [h] = consolidateBills(SIX);
const used = h.months.filter((m) => m.status === "used");
check("one connection", consolidateBills(SIX).length, 1);
check("six months used, kWh from the meter table", used.map((m) => [m.month, m.activeKwh]), [
  ["2026-04", 33962], ["2026-05", 46681], ["2026-06", 48248], ["2026-07", 47408], ["2026-08", 47738], ["2026-09", 38487]]);
check("kVAh kept separately, never mixed in", used.map((m) => m.apparentKvah), [34428, 49749, 53557, 50632, 54063, 41151]);
check("reading days per period", used.map((m) => m.days), [30, 31, 30, 31, 31, 30]);
check("no gaps, no warnings", [h.missingMonths, h.warnings], [[], []]);
check("history-table months shown for reference only (8, kVAh)", h.months.filter((m) => m.status === "history-only").map((m) => [m.month, m.activeKwh, m.apparentKvah]), [
  ["2025-08", null, 42080], ["2025-09", null, 31920], ["2025-10", null, 31920], ["2025-11", null, 170295], ["2025-12", null, 43391],
  ["2026-01", null, 42465], ["2026-02", null, 38500], ["2026-03", null, 37298]]);

const base = energyBaseline(h)!;
check("total active energy 262,524 kWh (history kVAh not added)", base.totalKwh, 262524);
check("mean 43,754 kWh/month", base.avgMonthlyKwh, 43754);
check("min / max month", [base.minMonthlyKwh, base.maxMonthlyKwh], [33962, 48248]);
check("183 reading days", base.totalDays, 183);
check("annualised from reading days", [base.annualBasis, near(base.annualKwh, (262524 / 183) * 365)], ["reading days", true]);
check("six months → medium confidence", base.confidence, "medium");

// ── Sizing ──
const load = normalizeLoad(200, "HP");
check("sample bill 200 HP → 149.2 kW", load.kw, 149.2);
const sized = sizeSolar(base, { specificYieldKwhPerKwp: 1400, offsets: [0.5, 1], sanctionedLoadKw: load.kw, contractDemandKva: 186 });
check("capacity = annual × offset ÷ yield", sized.scenarios.map((s) => near(s.capacityKwp, (base.annualKwh * s.offset) / 1400)), [true, true]);
check("sanctioned load and contract demand reported, not enforced", [sized.status, sized.constraints.some((c) => c.includes("149.2 kW")), sized.constraints.some((c) => c.includes("186 kVA"))], ["ok", true, true]);
check("no yield → no capacity (no hidden default)", [sizeSolar(base, { specificYieldKwhPerKwp: null, offsets: [1] }).status, sizeSolar(base, { specificYieldKwhPerKwp: 0, offsets: [1] }).scenarios], ["needs-yield", []]);
check("no baseline → no capacity", sizeSolar(null, { specificYieldKwhPerKwp: 1400, offsets: [1] }).status, "no-baseline");
check("different yields give different sizes", near(sizeSolar(base, { specificYieldKwhPerKwp: 1200, offsets: [1] }).scenarios[0].capacityKwp * 1200, base.annualKwh), true);

// ── Duplicates ──
const dupFile = consolidateBills([...SIX, { ...SIX[4], sourceId: "copy.pdf" }])[0];
check("same file twice counted once", [energyBaseline(dupFile)!.totalKwh, dupFile.months.filter((m) => m.status === "duplicate").length], [262524, 1]);
const dupData = consolidateBills([...SIX, { ...SIX[4], sourceId: "rescan.pdf", fileHash: "other" }])[0];
check("same month, same readings, different file → duplicate", [energyBaseline(dupData)!.totalKwh, dupData.months.find((m) => m.sources[0] === "rescan.pdf")!.status], [262524, "duplicate"]);
const conflict = consolidateBills([...SIX, { ...SIX[4], sourceId: "edited.pdf", fileHash: "x", activeKwh: 47000 }])[0];
check("same month, different readings → both held back", [conflict.months.filter((m) => m.status === "conflict").length, energyBaseline(conflict)!.periods, conflict.warnings.length], [2, 5, 1]);

// ── Missing, invalid, overlapping ──
const gap = consolidateBills(SIX.filter((b) => b.billingMonth !== "2026-06"))[0];
check("missing month listed, not zero", [gap.missingMonths, energyBaseline(gap)!.periods, energyBaseline(gap)!.totalKwh], [["2026-06"], 5, 262524 - 48248]);
const noKwh = consolidateBills([...SIX.slice(0, 5), { ...SIX[5], activeKwh: null }])[0];
check("month without kWh excluded, not 0", [noKwh.months.find((m) => m.month === "2026-09" && m.status === "invalid") !== undefined, energyBaseline(noKwh)!.periods], [true, 5]);
const overlap = consolidateBills([SIX[0], { ...SIX[1], readingFrom: "2026-04-20" }])[0];
check("overlapping reading periods flagged", overlap.warnings.some((w) => w.includes("overlap")), true);
const noDates = consolidateBills(SIX.map((b) => ({ ...b, readingFrom: null })))[0];
check("no reading dates → annualised as monthly average × 12", [energyBaseline(noDates)!.annualBasis, energyBaseline(noDates)!.annualKwh], ["monthly average × 12", 43754 * 12]);
const kwhAboveKvah = consolidateBills([{ ...SIX[0], activeKwh: 40000 }])[0];
check("kWh > kVAh flagged for review", kwhAboveKvah.months[0].note?.includes("higher than kVAh"), true);

// ── Connections ──
const two = consolidateBills([...SIX, bill("2026-09", "2026-08-31", "2026-09-30", 1000, 1100, { connectionId: "CONN-REDACTED-2", sourceId: "other-site.pdf", fileHash: "h2" })]);
check("different connections kept apart", two.map((g) => [g.connectionId, energyBaseline(g)!.totalKwh]), [[CONN, 262524], ["CONN-REDACTED-2", 1000]]);
const unknown = consolidateBills([{ ...SIX[0], connectionId: null }, { ...SIX[1], connectionId: "  " }]);
check("bills without a connection number are never merged", [unknown.length, unknown.every((g) => g.connectionId === null && g.warnings.length === 1)], [2, true]);
check("one bill alone still gives a low-confidence baseline", [energyBaseline(consolidateBills([SIX[5]])[0])!.confidence, energyBaseline(consolidateBills([SIX[5]])[0])!.totalKwh], ["low", 38487]);
check("empty input", consolidateBills([]), []);

// ── Phase 2: the app's own pipeline on the six bills ──
const asBill = (b: BillPeriod, i: number): CommercialBillData => ({
  ...buildBlankCommercialBillData(), consumerNo: CONN, connectionType: "LT", billingMonth: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"][i] + "-2026",
  activeKwh: b.activeKwh!, kvahReading: b.apparentKvah!, readingFrom: b.readingFrom!, readingTo: b.readingTo!, sanctionedLoad: 200, sanctionedLoadUnit: "HP",
  contractDemand: 186, billingHistoryUnit: "kVAh", filename: b.sourceId,
  billingHistory: i === 5 ? SEP_HISTORY.map((h) => ({ monthLabel: h.month, units: h.units!, billAmount: 1 })) : [],
});
const BILLS = SIX.map(asBill);
// The meter-reading pipeline with no margin (the defaults — 10 % margin, history baseline — are checked separately).
const run = (over: Partial<typeof DEFAULT_SIZING> = {}) => analyseCommercial(BILLS.map((d) => ({ data: d, sourceId: d.filename })), { ...DEFAULT_SIZING, marginPct: 0, baseline: "meter", ...over });
const r0 = run();
const annual = (262524 / 183) * 365;
check("defaults = office workbook: 1,400 kWh/kWp/yr yield, 10 % margin, 100 % offset", [DEFAULT_SIZING.specificYield, DEFAULT_SIZING.marginPct, DEFAULT_SIZING.offsetPct], [1400, 10, 100]);
check("app pipeline: annualised from 183 reading days", [r0.baseline!.totalDays, near(r0.baseline!.annualKwh, annual)], [183, true]);
check("0 % margin: theoretical = annual ÷ 1400, margin adds nothing", [near(r0.pipeline.theoreticalKwp, annual / 1400), r0.pipeline.marginKwp, near(r0.pipeline.solarCapacityRawKwp, annual / 1400)], [true, 0, true]);
check("523,613 kWh ÷ 1400 = 374.0 kWp → 623 × 600 W = 373.8 kWp", [Math.round(r0.baseline!.annualKwh), Math.round(r0.pipeline.theoreticalKwp), r0.pipeline.fullPanels, r0.pipeline.fullKwp], [523613, 374, 623, 373.8]);
const r10 = run({ marginPct: 10 });
check("optional 10 % margin adds exactly 10 % and shows it", [near(r10.pipeline.marginKwp, r0.pipeline.theoreticalKwp * 0.1), near(r10.pipeline.solarCapacityRawKwp, r0.pipeline.theoreticalKwp * 1.1)], [true, true]);
check("margin does not change the energy target (offset kept separate)", r10.pipeline.targetKwh, r0.pipeline.targetKwh);
const r50 = run({ offsetPct: 50 });
check("offset changes the target, not the margin", [near(r50.pipeline.targetKwh, annual / 2), r50.pipeline.marginKwp], [true, 0]);
check("editable yield: 1200 sizes in proportion", near(run({ specificYield: 1200 }).pipeline.theoreticalKwp, annual / 1200), true);
check("yield 0 → no capacity, nothing silently defaulted", [run({ specificYield: 0 }).pipeline.fullKwp, run({ specificYield: 0 }).pipeline.todKwp], [0, 0]);
check("no TOD data → no TOD proxy capacity", r0.pipeline.todKwp, 0);
check("sanctioned 200 HP → 149.2 kW in the analysis", [r0.sanctioned.kw, r0.sanctioned.originalValue, r0.sanctioned.originalUnit], [149.2, 200, "HP"]);

// Strict kWh / kVAh separation
check("kVAh history (incl. Nov-2025 170,295) never enters the baseline", r0.baseline!.totalKwh, 262524);
const kvahOnly = analyseCommercial([{ data: { ...BILLS[0], activeKwh: "" }, sourceId: "x" }], DEFAULT_SIZING);
check("bill with only kVAh → no baseline, no size", [kvahOnly.baseline, kvahOnly.pipeline.fullKwp], [null, 0]);
const fromReadings = billToPeriod({ ...BILLS[0], activeKwh: "", prevReading: 13068.23, currReading: 14030.4, multiplyingFactor: 40 }, "s");
check("kWh inferred only from the KWH meter readings, labelled", [fromReadings.activeKwh, fromReadings.kwhSource], [38486.8, "meter readings"]);
check("month labels", ["Sep-2026", "Sept 2026", "2026-09", "Sep-26", "xx"].map(toMonthKey), ["2026-09", "2026-09", "2026-09", "2026-09", ""]);
check("dates: ISO kept, DD/MM/YYYY converted, junk blank", ["2026-09-30", "30/09/2026", "31/02/2026x", ""].map(isoDate), ["2026-09-30", "2026-09-30", "", ""]);

// Extraction sanitizer: units kept as printed; the history is the printed months only (own month never added)
const raw = {
  consumerNo: "17-60", sanctionedLoad: 200, sanctionedLoadUnit: "H.P.", connectedLoad: 200, connectedLoadUnit: "hp", contractDemand: 186,
  prevReading: 13068.23, currReading: 14030.4, multiplyingFactor: 40, kvahReading: 41151, activeKwh: 38487, readingFrom: "31/08/2026", readingTo: "30/09/2026",
  billingMonth: "Sep-2026", billingHistoryUnit: "kVAh", billingHistory: [{ monthLabel: "Aug-2026", units: 54063, billAmount: 605855.14 }], todSlots: [],
};
const sd = sanitizeCommercialData(raw);
check("sanitizer: load units normalised, value not converted", [sd.sanctionedLoad, sd.sanctionedLoadUnit, sd.connectedLoadUnit, sd.contractDemand], [200, "HP", "HP", 186]);
check("sanitizer: kWh and kVAh kept apart, dates ISO", [sd.activeKwh, sd.kvahReading, sd.readingFrom, sd.readingTo], [38487, 41151, "2026-08-31", "2026-09-30"]);
check("sanitizer: history = printed months only, own month not added", sd.billingHistory.map((r) => [r.monthLabel, r.units]), [["Aug-2026", 54063]]);
check("sanitizer: kWh history also gets no own-month row", sanitizeCommercialData({ ...raw, billingHistoryUnit: "kWh" }).billingHistory.some((r) => r.monthLabel === "Sep-2026"), false);
check("sanitizer: unrecognised units blanked", [sanitizeCommercialData({ ...raw, sanctionedLoadUnit: "units" }).sanctionedLoadUnit, sanitizeCommercialData({ ...raw, billingHistoryUnit: "x" }).billingHistoryUnit], ["", "unknown"]);
const reading = sanitizeCommercialData({ ...raw, kvahReading: 15388.23 }); // the KVAH register reading, not consumption
check("sanitizer: kVAh below kWh (a register reading) is blanked, not kept", reading.kvahReading, "");
check("sanitizer: an unknown current kVAh adds no history row either", reading.billingHistory.some((r) => r.monthLabel === "Sep-2026"), false);
check("request sizing clamped to the visible defaults", [sizingFrom({}), sizingFrom({ marginPct: 10 }).marginPct, sizingFrom({ marginPct: 500 }).marginPct], [DEFAULT_SIZING, 10, DEFAULT_SIZING.marginPct]);
check("pipeline guard: no energy → zeros", computeSizingPipeline({ annualKwh: 0, offsetPct: 100, marginPct: 0, specificYield: 1400, todFraction: 0.5, panelWattage: 600, ratePerKwh: 9, systemCost: 0 }).fullKwp, 0);

console.log(`\n${passed} checks passed.`);
