// Solar proposal financial engine — subsidy, tax-benefit, payback and
// lifetime-savings math for the customer-facing proposal (distinct from the
// BOQ material-pricing engine in calculations.ts).
//
// Ported 1:1 from `Proposal Field Calculator (1).xlsx` (sheets Akshay,
// Kaustubh, Akhilesh, Vaishnavi, Sheet5 — one shared engine, verified against
// each sheet's cached values). `mode: 'legacy'` reproduces the Excel bit-exact,
// including its known quirks (uncapped society subsidy, flat 30% AD benefit,
// hardcoded 18% extra-cost GST split, flat 25-year savings). `mode: 'enhanced'`
// fixes those with a degraded/escalated year-by-year cashflow, NPV/IRR, and
// configurable subsidy caps — see the defect list in the spec this was built
// from for why each exists.

export type CustomerType = "RESIDENTIAL_SOCIETY" | "INDIVIDUAL_HOUSE" | "COMMERCIAL" | "INDUSTRIAL";
export type ProjectType = "SUBSIDY" | "NON_SUBSIDY";
export type EngineMode = "legacy" | "enhanced";

export interface EngineInputs {
  customerType: CustomerType;
  projectType: ProjectType;
  adApplicable: boolean;
  gstRegistered: boolean;
  connections: number;
  systemSizeKw: number;
  unitCost: number;
  costPerWatt: number;
  extraCost: number;
  extraCostGstRate: number; // e.g. 0.18 — GST rate the extraCost figure was inclusive of
}

export interface EngineAssumptions {
  specificYield: number; // kWh/kW/yr
  systemLifeYears: number;
  degradationYear1: number;
  degradationLinear: number;
  tariffEscalation: number;
  gstEffectiveRate: number; // blended project GST (70% supply @5% + 30% service @18% = 8.9%)
  commissioningLagYears: number;
  adDepreciationRate: number;
  adTaxRate: number;
  subsidyIndividualPerKw: [number, number, number]; // ₹/kW for bands [0-1), [1-2), [2-3)
  subsidyIndividualCap: number; // ₹ per connection
  subsidySocietyPerKw: number;
  subsidySocietyCapKw: number; // PM Surya Ghar common-facility cap
  amcThresholdCostPerWatt: number;
  discountRate: number;
}

export const DEFAULT_ASSUMPTIONS: EngineAssumptions = {
  specificYield: 1450,
  systemLifeYears: 25,
  degradationYear1: 0.02,
  degradationLinear: 0.007,
  tariffEscalation: 0.03,
  gstEffectiveRate: 0.089,
  commissioningLagYears: 0.3,
  adDepreciationRate: 0.4,
  adTaxRate: 0.2517,
  subsidyIndividualPerKw: [30000, 30000, 18000],
  subsidyIndividualCap: 78000,
  subsidySocietyPerKw: 18000,
  subsidySocietyCapKw: 500,
  amcThresholdCostPerWatt: 50,
  discountRate: 0.09,
};

export interface EngineError {
  field: string;
  message: string;
}

export interface CashflowYear {
  year: number;
  generationKwh: number;
  tariff: number;
  savings: number;
  cumulativeSavings: number;
}

export interface EngineOutputs {
  ok: true;
  mode: EngineMode;
  inputs: EngineInputs;
  assumptions: EngineAssumptions;

  annualGenerationKwh: number;
  shadowFreeAreaSqft: number;
  perKwPrice: number;
  projectCost: number;
  gst: number;
  totalProjectCost: number;

  subsidy: number;
  adBenefit: number;
  gstBenefit: number;
  totalEffectiveAmount: number;

  paybackYearsDecimal: number;
  paybackYears: number;
  paybackMonths: number;
  lifetimeSavings: number;

  amc: number;
  cleaningCost: number;

  // enhanced-mode only
  cashflow?: CashflowYear[];
  npv?: number;
  irr?: number | null;
}

export type EngineResult = EngineOutputs | { ok: false; errors: EngineError[] };

// ─── Excel-semantics rounding ───────────────────────────────────────────────
// Excel's ROUND/ROUNDDOWN/ROUNDUP round half-away-from-zero / truncate-toward-
// zero / away-from-zero — not JS's Math.round (half-up) or Math.floor (toward
// -Infinity). The distinction matters for negative values (Sheet5's #DIV/0!
// case surfaces a negative lifetime-savings figure in the workbook) and was
// verified against the cached -137000 value in Sheet5.
const excelRound = (value: number, digits: number): number => {
  const f = Math.pow(10, digits);
  return Math.sign(value) * Math.round(Math.abs(value) * f) / f;
};
const excelRoundDown = (value: number, digits: number): number => {
  const f = Math.pow(10, digits);
  return Math.sign(value) * Math.floor(Math.abs(value) * f) / f;
};
const excelRoundUp = (value: number, digits: number): number => {
  const f = Math.pow(10, digits);
  return Math.sign(value) * Math.ceil(Math.abs(value) * f) / f;
};

// ─── Validation ──────────────────────────────────────────────────────────
function validateInputs(inputs: EngineInputs): EngineError[] {
  const errors: EngineError[] = [];
  if (!(inputs.systemSizeKw > 0)) errors.push({ field: "systemSizeKw", message: "System size must be greater than zero." });
  if (!(inputs.unitCost > 0)) errors.push({ field: "unitCost", message: "Unit cost (tariff) must be greater than zero." });
  if (!(inputs.costPerWatt > 0)) errors.push({ field: "costPerWatt", message: "Cost per watt must be greater than zero." });
  if (!(inputs.connections > 0)) errors.push({ field: "connections", message: "Number of connections must be at least 1." });
  if (inputs.extraCost < 0) errors.push({ field: "extraCost", message: "Extra cost cannot be negative." });
  if (inputs.extraCostGstRate < 0) errors.push({ field: "extraCostGstRate", message: "Extra cost GST rate cannot be negative." });
  return errors;
}

// Individual-house subsidy: per-kW rate is banded (0-1kW, 1-2kW, 2-3kW), then
// capped per connection. With the default [30000,30000,18000]/78000 this
// reproduces the Excel IFS() piecewise formula exactly (bands 1 and 2 share a
// rate, which is what makes the Excel formula linear below 2kW).
function individualSubsidyPerConnection(kwPerConn: number, perKwBands: readonly number[], cap: number): number {
  let remaining = kwPerConn;
  let total = 0;
  for (let i = 0; i < perKwBands.length && remaining > 0; i++) {
    const bandWidth = Math.min(1, remaining);
    total += bandWidth * perKwBands[i];
    remaining -= bandWidth;
  }
  return Math.min(total, cap);
}

export function calculateProposal(inputs: EngineInputs, assumptionOverrides: Partial<EngineAssumptions> = {}, mode: EngineMode = "legacy"): EngineResult {
  const errors = validateInputs(inputs);
  if (errors.length > 0) return { ok: false, errors };

  const assumptions: EngineAssumptions = { ...DEFAULT_ASSUMPTIONS, ...assumptionOverrides };
  const isCommercialOrIndustrial = inputs.customerType === "COMMERCIAL" || inputs.customerType === "INDUSTRIAL";

  const annualGenerationKwh = inputs.systemSizeKw * assumptions.specificYield;
  const shadowFreeAreaSqft = 75 * inputs.systemSizeKw;

  const perKwPrice = inputs.costPerWatt * 1000;
  const projectCost = excelRound(inputs.costPerWatt * 1000 * inputs.systemSizeKw, 0);
  const gst = excelRound(projectCost * assumptions.gstEffectiveRate, 0);
  const totalProjectCost = projectCost + gst + inputs.extraCost;

  // extraCost was quoted GST-inclusive; net it out at its own rate to get the
  // pre-GST asset base / ITC component (legacy hardcodes this at /1.18).
  const extraCostGstRate = mode === "legacy" ? 0.18 : inputs.extraCostGstRate;
  const extraCostExGst = inputs.extraCost / (1 + extraCostGstRate);

  // --- Subsidy (PM Surya Ghar Muft Bijli Yojana) ---
  const kwPerConn = inputs.systemSizeKw / inputs.connections;
  const subsidyIndividual = individualSubsidyPerConnection(kwPerConn, assumptions.subsidyIndividualPerKw, assumptions.subsidyIndividualCap) * inputs.connections;
  const subsidySocietyRaw = assumptions.subsidySocietyPerKw * inputs.systemSizeKw;
  const subsidySociety = mode === "legacy" ? subsidySocietyRaw : Math.min(subsidySocietyRaw, assumptions.subsidySocietyPerKw * assumptions.subsidySocietyCapKw);

  let subsidy = 0;
  if (inputs.projectType === "SUBSIDY") {
    if (inputs.customerType === "RESIDENTIAL_SOCIETY") subsidy = subsidySociety;
    else if (inputs.customerType === "INDIVIDUAL_HOUSE") subsidy = subsidyIndividual;
  }

  // --- Tax benefits (Commercial / Industrial only) ---
  const adBenefit =
    inputs.adApplicable && isCommercialOrIndustrial
      ? mode === "legacy"
        ? excelRound((projectCost + extraCostExGst) * 0.3, 0)
        : excelRound((projectCost + extraCostExGst) * assumptions.adDepreciationRate * assumptions.adTaxRate, 0)
      : 0;
  const gstBenefit = inputs.gstRegistered && isCommercialOrIndustrial ? excelRound(gst + extraCostExGst * extraCostGstRate, 0) : 0;

  const totalEffectiveAmount = isCommercialOrIndustrial ? totalProjectCost - adBenefit - gstBenefit : totalProjectCost - subsidy;

  // --- Add-ons ---
  const amc = inputs.costPerWatt < assumptions.amcThresholdCostPerWatt ? excelRound(0.02 * projectCost, -2) : inputs.systemSizeKw * 1000;
  const cleaningCost = Math.max(excelRoundUp(inputs.systemSizeKw * 2 * 35 * 18, -3), 12000);

  const base: Omit<EngineOutputs, "cashflow" | "npv" | "irr"> = {
    ok: true,
    mode,
    inputs,
    assumptions,
    annualGenerationKwh,
    shadowFreeAreaSqft,
    perKwPrice,
    projectCost,
    gst,
    totalProjectCost,
    subsidy,
    adBenefit,
    gstBenefit,
    totalEffectiveAmount,
    paybackYearsDecimal: 0,
    paybackYears: 0,
    paybackMonths: 0,
    lifetimeSavings: 0,
    amc,
    cleaningCost,
  };

  if (mode === "legacy") {
    const denom = annualGenerationKwh * inputs.unitCost;
    const paybackYearsDecimal = denom > 0 ? totalEffectiveAmount / denom + assumptions.commissioningLagYears : Infinity;
    const paybackYears = Number.isFinite(paybackYearsDecimal) ? excelRoundDown(paybackYearsDecimal, 0) : 0;
    const paybackMonths = Number.isFinite(paybackYearsDecimal) ? excelRoundUp((paybackYearsDecimal - paybackYears) * 12, 0) : 0;
    const lifetimeSavings = excelRoundDown(assumptions.systemLifeYears * inputs.unitCost * annualGenerationKwh - totalEffectiveAmount, -3);
    return { ...base, paybackYearsDecimal, paybackYears, paybackMonths, lifetimeSavings };
  }

  // --- Enhanced mode: degraded/escalated year-by-year cashflow ---
  const cashflow: CashflowYear[] = [];
  const year1Factor = 1 - assumptions.degradationYear1;
  let cumulativeSavings = 0;
  for (let year = 1; year <= assumptions.systemLifeYears; year++) {
    const factor = Math.max(0, year1Factor - (year - 1) * assumptions.degradationLinear);
    const generationKwh = annualGenerationKwh * factor;
    const tariff = inputs.unitCost * Math.pow(1 + assumptions.tariffEscalation, year - 1);
    const savings = generationKwh * tariff;
    cumulativeSavings += savings;
    cashflow.push({ year, generationKwh, tariff, savings, cumulativeSavings });
  }

  // Interpolated payback: find the year cumulative savings crosses the
  // effective cost, then the fractional month within that year.
  let paybackYearsDecimal = Infinity;
  const crossingYear = cashflow.find((y) => y.cumulativeSavings >= totalEffectiveAmount);
  if (crossingYear) {
    const priorCumulative = crossingYear.cumulativeSavings - crossingYear.savings;
    const fractionOfYear = crossingYear.savings > 0 ? (totalEffectiveAmount - priorCumulative) / crossingYear.savings : 0;
    paybackYearsDecimal = crossingYear.year - 1 + fractionOfYear + assumptions.commissioningLagYears;
  }
  const paybackYears = Number.isFinite(paybackYearsDecimal) ? excelRoundDown(paybackYearsDecimal, 0) : 0;
  const paybackMonths = Number.isFinite(paybackYearsDecimal) ? excelRoundUp((paybackYearsDecimal - paybackYears) * 12, 0) : 0;

  const lifetimeSavings = excelRoundDown(cumulativeSavings - totalEffectiveAmount, -3);

  const npv = cashflow.reduce((sum, y) => sum + y.savings / Math.pow(1 + assumptions.discountRate, y.year), -totalEffectiveAmount);
  const irr = solveIrr(totalEffectiveAmount, cashflow.map((y) => y.savings));

  return { ...base, paybackYearsDecimal, paybackYears, paybackMonths, lifetimeSavings, cashflow, npv, irr };
}

// Bisection IRR solver: finds the rate where NPV(rate) = 0 for
// [-upfrontCost, ...yearlySavings]. Returns null if no sign change is found
// in [-0.99, 5] (e.g. the project never pays back within the cashflow).
function solveIrr(upfrontCost: number, yearlySavings: number[]): number | null {
  const npvAt = (rate: number) => yearlySavings.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, i + 1), -upfrontCost);
  let lo = -0.99;
  let hi = 5;
  const npvLo = npvAt(lo);
  const npvHi = npvAt(hi);
  if (npvLo === 0) return lo;
  if (npvHi === 0) return hi;
  if (Math.sign(npvLo) === Math.sign(npvHi)) return null; // no sign change — doesn't converge
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npvAt(mid);
    if (Math.abs(npvMid) < 1e-6) return mid;
    if (Math.sign(npvMid) === Math.sign(npvLo)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
