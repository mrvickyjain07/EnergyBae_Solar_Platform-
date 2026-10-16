// src/modules/projects/billAnalysisRules.test.ts
// Run with: npx tsx src/modules/projects/billAnalysisRules.test.ts
import assert from "node:assert/strict";
import { validateBillAnalysis, billToSystemInput, billCustomerType, billPanelWp } from "./billAnalysisRules";
import { buildBlankCommercialBillData } from "../commercial/types";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

const row = (units: number | "", billAmount: number | "" = "") => ({ month: "Jan-26", units, billAmount, unitCost: "" });
const slot = (history: any[]) => ({ consumerName: " Asha Patil ", consumerNumber: "170012345678", fixedCharges: 130, sanctionedLoadKw: 5, connectionType: "90/LT I", contractDemandKva: "", history });
const body = (history: any[], extra: any = {}) => ({ category: "home", data: { slot: slot(history), solarPanelUsed: 600 }, ...extra });

check("unknown category rejected", err(validateBillAnalysis({ ...body([]), category: "factory" })), "Unknown bill category.");
check("missing worksheet rejected", err(validateBillAnalysis({ category: "home" })), "The bill worksheet is missing.");
check("oversized history rejected", err(validateBillAnalysis(body(Array(25).fill(row(1))))), "A bill worksheet has at most 24 months.");

// 300 units/month → 300/106.060606 = 2.8286 kW → ceil(2828.6/600) = 5 panels → 3 kW.
// Same numbers the worksheet export shows (buildWorksheetModel D22/D25).
const v = (validateBillAnalysis(body([row(300), row(300), row("")], { phase: 3, source_file_name: "bill.jpg" })) as any).value;
check("average ignores blank months", v.avg_monthly_units, 300);
check("recommended capacity rounds up to whole panels", v.recommended_kw, 3);
check("names trimmed", v.consumer_name, "Asha Patil");
check("sanctioned load kept", v.sanctioned_load_kw, 5);
check("phase kept", v.phase, 3);
check("file name kept", v.source_file_name, "bill.jpg");

const empty = (validateBillAnalysis(body([row("")])) as any).value;
check("no usage → no recommendation (not 0 kW)", empty.recommended_kw, null);
check("unknown phase becomes null", (validateBillAnalysis(body([], { phase: 2 })) as any).value.phase, null);

const dirty = (validateBillAnalysis(body([{ month: "Feb", units: -5, billAmount: "1e9", unitCost: Infinity }])) as any).value;
check("negative / non-numeric / infinite values dropped", dirty.data.slot.history[0], { month: "Feb", units: "", billAmount: "", unitCost: "" });
check("absurd panel wattage falls back to 600", (validateBillAnalysis({ ...body([]), data: { slot: slot([]), solarPanelUsed: 99999 } }) as any).value.data.solarPanelUsed, 600);
check("client-sent recommendation is ignored", (validateBillAnalysis({ ...body([row(300)]), recommended_kw: 500 }) as any).value.recommended_kw, 3);

check("bill → system prefill", billToSystemInput(v), { name: "Meter 170012345678", capacity_kw: 3, phase: 3, panel_wp: 600 });

// ── Commercial & Industrial (sizing itself is covered end-to-end in billAnalyses.integration.test.ts) ──
const ci = (data: any, extra: any = {}) => ({ category: "commercial", data: { data, panelWatt: 600, specificYield: 1400, offsetPct: 100, marginPct: 0, systemCost: "", ...extra } });
// Billing history is kVAh on MSEDCL industrial bills — it must never size the plant; activeKwh does.
const ciBill = { ...buildBlankCommercialBillData(), consumerNo: "111", consumerName: "Shree", connectionType: "LT", billingMonth: "Sep-2026", activeKwh: 6000, kvahReading: 6500, billingHistoryUnit: "kVAh", billingHistory: [{ monthLabel: "Aug-2026", units: 9999, billAmount: 9000 }] };
const kwOf = (body: any) => (validateBillAnalysis(body) as any).value.recommended_kw;
check("C&I worksheet missing rejected", err(validateBillAnalysis({ category: "commercial", data: {} })), "The bill analysis is missing.");
check("C&I oversized history rejected", err(validateBillAnalysis(ci({ ...ciBill, billingHistory: Array(25).fill(ciBill.billingHistory[0]) }))), "A bill analysis has at most 24 months.");
const c = (validateBillAnalysis(ci({ ...ciBill, evil: "x", connectionType: "XX", hasSolar: "yes", sanctionedLoadUnit: "XX", billingHistoryUnit: "lots", readingFrom: "yesterday", todSlots: [{ slot: "B", units: 5 }, { slot: "Z", units: 9 }] })) as any).value;
check("unknown C&I keys dropped", "evil" in c.data.data, false);
check("unknown connection type blanked", c.data.data.connectionType, "");
check("boolean fields stay boolean", c.data.data.hasSolar, false);
check("bad unit / history unit / date blanked", [c.data.data.sanctionedLoadUnit, c.data.data.billingHistoryUnit, c.data.data.readingFrom], ["", "unknown", ""]);
check("TOD slots normalised to A–D", c.data.data.todSlots, [{ slot: "A", units: "" }, { slot: "B", units: 5 }, { slot: "C", units: "" }, { slot: "D", units: "" }]);
check("sized on kWh, default 0 % margin: 6000 × 12 ÷ 1400 = 51.43 → 86 × 600 W", kwOf(ci(ciBill)), 51.6);
check("kVAh history never sizes: no kWh → no recommendation", kwOf(ci({ ...ciBill, activeKwh: "" })), null);
check("kVAh reading is not used as kWh", kwOf(ci({ ...ciBill, activeKwh: "", kvahReading: 99999 })), null);
check("optional 10 % margin: 56.57 → 94 × 600 W", kwOf(ci(ciBill, { marginPct: 10 })), 56.4);
check("editable yield 1200: 60 kWp → 100 × 600 W", kwOf(ci(ciBill, { specificYield: 1200 })), 60);
check("offset 50 % halves the energy target", kwOf(ci(ciBill, { offsetPct: 50 })), 25.8);
check("annualised from reading days: 6000 ÷ 30 × 365 = 73000 → 87 × 600 W", kwOf(ci({ ...ciBill, readingFrom: "2026-08-31", readingTo: "2026-09-30" })), 52.2);
check("avg monthly units are kWh", (validateBillAnalysis(ci(ciBill)) as any).value.avg_monthly_units, 6000);
check("C&I has no phase on the bill", (validateBillAnalysis(ci(ciBill)) as any).value.phase, null);
const saved = (validateBillAnalysis(ci(ciBill, { specificYield: 1e9, marginPct: -5 })) as any).value.data;
check("absurd yield / margin fall back to the visible defaults", [saved.specificYield, saved.marginPct], [1400, 0]);
check("C&I panel wattage used for the system", billPanelWp((validateBillAnalysis(ci(ciBill, { panelWatt: 550 })) as any).value.data), 550);
const sl = (load: number, unit: string) => (validateBillAnalysis(ci({ ...ciBill, sanctionedLoad: load, sanctionedLoadUnit: unit })) as any).value.sanctioned_load_kw;
check("sanctioned 200 HP stored as 149.2 kW", sl(200, "HP"), 149.2);
check("sanctioned kW kept, kVA / no unit not stored as kW", [sl(80, "kW"), sl(186, "kVA"), sl(200, "")], [80, null, null]);
const two = (validateBillAnalysis(ci(ciBill, { bills: [{ ...ciBill, billingMonth: "Aug-2026", activeKwh: 4000 }, ciBill] })) as any).value;
check("several bills: one connection consolidated (avg of 4000 and 6000)", [two.avg_monthly_units, two.data.bills.length], [5000, 2]);
check("several bills: invalid bill rejected", err(validateBillAnalysis(ci(ciBill, { bills: [ciBill, "nope"] }))), "One of the bills in this analysis is not valid.");

check("home → individual house", billCustomerType("home"), "INDIVIDUAL_HOUSE");
check("society → housing society", billCustomerType("society"), "RESIDENTIAL_SOCIETY");
check("C&I industrial category → industrial", billCustomerType("commercial", "Industrial"), "INDUSTRIAL");
check("other C&I → commercial", billCustomerType("commercial", "Commercial"), "COMMERCIAL");

console.log(`\n${passed} passed`);
