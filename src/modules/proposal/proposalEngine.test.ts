// Checkpoints from Proposal Field Calculator (1).xlsx (cached cell values,
// verified by dumping the workbook's formulas + values directly). Run with:
//   npx tsx src/modules/proposal/proposalEngine.test.ts
import assert from "node:assert/strict";
import { calculateProposal, EngineInputs, EngineOutputs } from "./proposalEngine";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
  console.log(`  ok — ${label}: ${actual}`);
}

// ─── Legacy-mode checkpoints (bit-exact Excel replication) ────────────────

console.log("Akshay (INDUSTRIAL, NON-SUBSIDY, AD=YES, GST=YES, 25kW, generation factor 1360 — this sheet's outlier)");
{
  const inputs: EngineInputs = {
    customerType: "INDUSTRIAL",
    projectType: "NON_SUBSIDY",
    adApplicable: true,
    gstRegistered: true,
    connections: 1,
    systemSizeKw: 25,
    unitCost: 8.04,
    costPerWatt: 55,
    extraCost: 204201,
    extraCostGstRate: 0.18,
  };
  const r = calculateProposal(inputs, { specificYield: 1360 }, "legacy");
  assert(r.ok, "Akshay result should be ok");
  const out = r as EngineOutputs;
  check("projectCost", out.projectCost, 1375000);
  check("gst", out.gst, 122375);
  check("totalProjectCost", out.totalProjectCost, 1701576);
  check("adBenefit", out.adBenefit, 464416);
  check("gstBenefit", out.gstBenefit, 153524);
  check("totalEffectiveAmount", out.totalEffectiveAmount, 1083636);
  check("paybackYears", out.paybackYears, 4);
  check("paybackMonths", out.paybackMonths, 4);
  check("lifetimeSavings", out.lifetimeSavings, 5750000);
}

console.log("\nKaustubh (RESIDENTIAL SOCIETY, SUBSIDY, 7.2kW, default 1450 yield)");
{
  const inputs: EngineInputs = {
    customerType: "RESIDENTIAL_SOCIETY",
    projectType: "SUBSIDY",
    adApplicable: false,
    gstRegistered: false,
    connections: 1,
    systemSizeKw: 7.2,
    unitCost: 17.6,
    costPerWatt: 64,
    extraCost: 0,
    extraCostGstRate: 0.18,
  };
  const r = calculateProposal(inputs, {}, "legacy");
  assert(r.ok, "Kaustubh result should be ok");
  const out = r as EngineOutputs;
  check("totalProjectCost", out.totalProjectCost, 501811);
  check("subsidy", out.subsidy, 129600);
  check("totalEffectiveAmount", out.totalEffectiveAmount, 372211);
  check("paybackYears", out.paybackYears, 2);
  check("paybackMonths", out.paybackMonths, 4);
}

console.log("\nVaishnavi (INDIVIDUAL HOUSE, SUBSIDY, 3kW, default 1450 yield)");
{
  const inputs: EngineInputs = {
    customerType: "INDIVIDUAL_HOUSE",
    projectType: "SUBSIDY",
    adApplicable: false,
    gstRegistered: false,
    connections: 1,
    systemSizeKw: 3,
    unitCost: 10,
    costPerWatt: 66,
    extraCost: 0,
    extraCostGstRate: 0.18,
  };
  const r = calculateProposal(inputs, {}, "legacy");
  assert(r.ok, "Vaishnavi result should be ok");
  const out = r as EngineOutputs;
  check("totalProjectCost", out.totalProjectCost, 215622);
  check("subsidy", out.subsidy, 78000);
  check("totalEffectiveAmount", out.totalEffectiveAmount, 137622);
  check("paybackYears", out.paybackYears, 3);
  check("paybackMonths", out.paybackMonths, 6);
}

// ─── Input validation (Sheet5's #DIV/0! case must not happen anymore) ─────

console.log("\nValidation: zero system size is rejected instead of throwing/NaN");
{
  const inputs: EngineInputs = {
    customerType: "INDIVIDUAL_HOUSE",
    projectType: "SUBSIDY",
    adApplicable: false,
    gstRegistered: false,
    connections: 1,
    systemSizeKw: 0,
    unitCost: 11,
    costPerWatt: 66,
    extraCost: 0,
    extraCostGstRate: 0.18,
  };
  const r = calculateProposal(inputs, {}, "legacy");
  assert.equal(r.ok, false, "zero systemSizeKw should fail validation");
  if (!r.ok) check("validation error field", r.errors[0].field, "systemSizeKw");
}

// ─── Subsidy cap boundaries ─────────────────────────────────────────────

console.log("\nSubsidy boundaries: individual house per-connection bands");
{
  const base: EngineInputs = {
    customerType: "INDIVIDUAL_HOUSE",
    projectType: "SUBSIDY",
    adApplicable: false,
    gstRegistered: false,
    connections: 1,
    systemSizeKw: 2,
    unitCost: 10,
    costPerWatt: 60,
    extraCost: 0,
    extraCostGstRate: 0.18,
  };
  const at2kw = calculateProposal(base, {}, "legacy");
  assert(at2kw.ok);
  check("subsidy at 2kW/conn (30000 x 2)", (at2kw as EngineOutputs).subsidy, 60000);

  const at3kw = calculateProposal({ ...base, systemSizeKw: 3 }, {}, "legacy");
  assert(at3kw.ok);
  check("subsidy at 3kW/conn (capped 78000)", (at3kw as EngineOutputs).subsidy, 78000);

  const at5kw = calculateProposal({ ...base, systemSizeKw: 5 }, {}, "legacy");
  assert(at5kw.ok);
  check("subsidy at 5kW/conn (still capped 78000)", (at5kw as EngineOutputs).subsidy, 78000);
}

console.log("\nSubsidy boundaries: society cap — legacy uncapped (Excel defect) vs enhanced capped at 500kW");
{
  const base: EngineInputs = {
    customerType: "RESIDENTIAL_SOCIETY",
    projectType: "SUBSIDY",
    adApplicable: false,
    gstRegistered: false,
    connections: 50,
    systemSizeKw: 600,
    unitCost: 10,
    costPerWatt: 45,
    extraCost: 0,
    extraCostGstRate: 0.18,
  };
  const legacy = calculateProposal(base, {}, "legacy");
  assert(legacy.ok);
  check("legacy society subsidy at 600kW (uncapped, 18000x600)", (legacy as EngineOutputs).subsidy, 10800000);

  const enhanced = calculateProposal(base, {}, "enhanced");
  assert(enhanced.ok);
  check("enhanced society subsidy at 600kW (capped at 500kW)", (enhanced as EngineOutputs).subsidy, 9000000);
}

// ─── Enhanced-mode sanity checks ───────────────────────────────────────────

console.log("\nEnhanced mode: Vaishnavi case — NPV positive, payback within reasonable delta of legacy");
{
  const inputs: EngineInputs = {
    customerType: "INDIVIDUAL_HOUSE",
    projectType: "SUBSIDY",
    adApplicable: false,
    gstRegistered: false,
    connections: 1,
    systemSizeKw: 3,
    unitCost: 10,
    costPerWatt: 66,
    extraCost: 0,
    extraCostGstRate: 0.18,
  };
  const legacy = calculateProposal(inputs, {}, "legacy") as EngineOutputs;
  const enhanced = calculateProposal(inputs, {}, "enhanced") as EngineOutputs;
  assert(legacy.ok && enhanced.ok);

  assert(enhanced.npv! > 0, `expected positive NPV, got ${enhanced.npv}`);
  passed++;
  console.log(`  ok — enhanced NPV positive: ${enhanced.npv!.toFixed(0)}`);

  const legacyPaybackYears = legacy.paybackYears + legacy.paybackMonths / 12;
  const enhancedPaybackYears = enhanced.paybackYears + enhanced.paybackMonths / 12;
  assert(enhancedPaybackYears >= legacyPaybackYears - 0.5, "enhanced payback (degradation-adjusted) should be >= legacy minus small delta");
  passed++;
  console.log(`  ok — legacy payback ${legacyPaybackYears.toFixed(2)}y vs enhanced ${enhancedPaybackYears.toFixed(2)}y`);

  assert.equal(enhanced.cashflow!.length, enhanced.assumptions.systemLifeYears);
  passed++;
  console.log(`  ok — cashflow has ${enhanced.cashflow!.length} years`);
}

console.log(`\n${passed} checks passed.`);
