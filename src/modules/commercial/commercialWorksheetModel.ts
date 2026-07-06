// Pure, framework-agnostic builder for the Commercial Bill Analysis worksheet
// layout. Mirrors the pattern of src/worksheetModel.ts (Residential) but is
// completely independent — separate sections, separate sheet, never shares a
// template with Residential. Used by both server.ts (xlsx generation) and the
// Google Sheets export flow (commercialGoogleSheetsExport.ts).
import { WorksheetCell, WorksheetModel } from "../../worksheetModel";
import { CommercialBillData } from "./types";
import {
  computeBillingStats,
  detectTodMode,
  computeTodUtilisation,
  computeMeterDerived,
  reconcileCharges,
  computeSizingPipeline,
  computeValidationChecks,
} from "./commercialCalculations";

export interface CommercialSizingInputs {
  panelWatt: number;
  sunHours: number;
  buffer: number;
  systemCost: number;
}

export function buildCommercialWorksheetModel(
  data: CommercialBillData,
  sizing: CommercialSizingInputs
): WorksheetModel {
  const cells: WorksheetCell[] = [];
  const set = (ref: string, value: string | number | null) => cells.push({ ref, value });

  const todMode = detectTodMode(data.connectionType);
  const stats = computeBillingStats(data.billingHistory, data.fixedCharges);
  const tod = computeTodUtilisation(data.todSlots, todMode);
  const meter = computeMeterDerived(
    data.prevReading,
    data.currReading,
    data.multiplyingFactor,
    data.kvahReading,
    data.recordedMD,
    data.contractDemand
  );
  const recon = reconcileCharges({
    energyCharges: data.energyCharges,
    demandCharges: data.demandCharges,
    fac: data.fac,
    ed: data.ed,
    tose: data.tose,
    wheelingCharges: data.wheelingCharges,
    delayedPayment: data.delayedPayment,
    arrears: data.arrears,
    creditAdjustment: data.creditAdjustment,
    otherCharges: data.otherCharges,
    billAmount: data.billAmount,
  });
  const pipeline = computeSizingPipeline(
    stats.avgUnits,
    stats.avgUnitCost,
    stats.avgUnitCostRoundUp,
    tod.bufferedFraction,
    sizing.panelWatt,
    sizing.sunHours,
    sizing.buffer,
    sizing.systemCost
  );
  const checks = computeValidationChecks(stats, tod, meter, recon);

  let row = 1;
  const blank = () => { row += 1; };
  const heading = (text: string) => { set(`A${row}`, text); row += 1; };
  const kv = (label: string, value: string | number | null) => { set(`A${row}`, label); set(`B${row}`, value); row += 1; };
  const num = (v: number | "" | undefined) => (typeof v === "number" ? v : null);

  // ── Section 1: Consumer Details ─────────────────────────────────────────
  heading("CONSUMER DETAILS");
  kv("Consumer No", data.consumerNo || null);
  kv("Consumer Name", data.consumerName || null);
  kv("Address", data.address || null);
  kv("Connection Type", data.connectionType || null);
  kv("Category", data.category || null);
  kv("TOD Mode (auto)", todMode === "LT" ? "LT-II C" : "HT");
  blank();

  // ── Section 2: Technical Parameters ─────────────────────────────────────
  heading("TECHNICAL PARAMETERS");
  kv("Sanctioned Load (kW)", num(data.sanctionedLoad));
  kv("Contract Demand (KVA)", num(data.contractDemand));
  kv("Fixed Charges (Rs)", num(data.fixedCharges));
  kv("ED Code", data.edCode || null);
  kv("Security Deposit (Rs)", num(data.securityDeposit));
  kv("Meter Number", data.meterNo || null);
  blank();

  // ── Section 3: Meter Readings ────────────────────────────────────────────
  heading("METER READINGS");
  kv("Previous Reading (kWh)", num(data.prevReading));
  kv("Current Reading (kWh)", num(data.currReading));
  kv("Multiplying Factor", num(data.multiplyingFactor));
  kv("Assessed Units (kWh)", meter.assessedUnits);
  kv("kVAh Reading", num(data.kvahReading));
  kv("Power Factor", meter.powerFactor !== null ? Number(meter.powerFactor.toFixed(4)) : null);
  kv("Recorded MD (KVA)", num(data.recordedMD));
  kv("Billed Demand (KVA)", meter.billedDemand !== null ? Number(meter.billedDemand.toFixed(1)) : null);
  blank();

  // ── Section 4: Billing History (12 months) ──────────────────────────────
  heading("BILLING HISTORY (12 MONTHS)");
  set(`A${row}`, "Sr.No"); set(`B${row}`, "Month"); set(`C${row}`, "Units (kWh)"); set(`D${row}`, "Bill Amount (Rs)"); set(`E${row}`, "Unit Cost (Rs/kWh)"); set(`F${row}`, "Status");
  row += 1;
  data.billingHistory.forEach((r, idx) => {
    const flags = stats.rows[idx];
    const isCurrent = idx === data.billingHistory.length - 1;
    set(`A${row}`, idx + 1);
    set(`B${row}`, r.monthLabel || null);
    set(`C${row}`, num(r.units));
    set(`D${row}`, num(r.billAmount));
    set(`E${row}`, flags?.unitCost !== null && flags?.unitCost !== undefined ? Number(flags.unitCost.toFixed(4)) : null);
    set(`F${row}`, isCurrent ? "CURRENT" : flags?.isOutlier ? "OUTLIER" : flags?.isDemandOnly ? "DEMAND ONLY" : flags?.isZero ? "ZERO" : null);
    row += 1;
  });
  kv("Average Units (valid months)", stats.avgUnits > 0 ? Number(stats.avgUnits.toFixed(2)) : null);
  kv("Average Bill Amount", stats.avgBillAmount > 0 ? Number(stats.avgBillAmount.toFixed(2)) : null);
  kv("Average Unit Cost", stats.avgUnitCost > 0 ? Number(stats.avgUnitCost.toFixed(4)) : null);
  kv("Average Unit Cost ROUNDUP(0.5)", stats.avgUnitCostRoundUp > 0 ? Number(stats.avgUnitCostRoundUp.toFixed(2)) : null);
  kv("Valid Months", stats.validCount);
  blank();

  // ── Section 5: Charge Components ────────────────────────────────────────
  heading("CHARGE COMPONENTS");
  kv("Energy Charges (Rs)", num(data.energyCharges));
  kv("Demand Charges (Rs)", num(data.demandCharges));
  kv("Fuel Adj. Charge / FAC (Rs)", num(data.fac));
  kv("Electricity Duty / ED (Rs)", num(data.ed));
  kv("Tax on Sale / ToSE (Rs)", num(data.tose));
  kv("Wheeling Charges (Rs)", num(data.wheelingCharges));
  kv("Delayed Payment Charges (Rs)", num(data.delayedPayment));
  kv("Arrears (Rs)", num(data.arrears));
  kv("Credit Adjustment (Rs)", num(data.creditAdjustment));
  kv("Other Charges (Rs)", num(data.otherCharges));
  kv("Reconstructed Total (Rs)", recon.reconstructedTotal);
  kv("Printed Bill Amount (Rs)", recon.printedAmount > 0 ? recon.printedAmount : null);
  kv("Reconciliation", recon.printedAmount > 0 ? (recon.withinTolerance ? `OK (diff Rs ${recon.diff})` : `MISMATCH (diff Rs ${recon.diff})`) : null);
  blank();

  // ── Section 6: TOD Data ──────────────────────────────────────────────────
  heading("TOD SLOT DATA");
  set(`A${row}`, "Slot"); set(`B${row}`, "Time Range"); set(`C${row}`, "Units"); set(`D${row}`, "% Share"); set(`E${row}`, "Utilisable %"); set(`F${row}`, "Rule");
  row += 1;
  const slotTimes: Record<string, string> = { A: "00:00-06:00", B: "06:00-09:00", C: "09:00-17:00", D: "17:00-24:00" };
  tod.slots.forEach((s) => {
    const reading = data.todSlots.find((t) => t.slot === s.slot);
    set(`A${row}`, s.slot);
    set(`B${row}`, slotTimes[s.slot]);
    set(`C${row}`, num(reading?.units));
    set(`D${row}`, s.pctShare > 0 ? Number((s.pctShare * 100).toFixed(2)) : null);
    set(`E${row}`, s.utilisable > 0 ? Number((s.utilisable * 100).toFixed(4)) : 0);
    set(`F${row}`, s.rule);
    row += 1;
  });
  kv("Total Units", tod.totalUnits > 0 ? tod.totalUnits : null);
  kv("Utilisable Fraction (raw)", tod.utilisableFraction > 0 ? Number((tod.utilisableFraction * 100).toFixed(4)) : null);
  kv(todMode === "LT" ? "Utilisable Fraction (+10% buffer)" : "Utilisable Fraction (no buffer)", tod.bufferedFraction > 0 ? Number((tod.bufferedFraction * 100).toFixed(4)) : null);
  blank();

  // ── Section 7: Solar Sizing Pipeline ────────────────────────────────────
  heading("SOLAR SIZING PIPELINE");
  kv("Panel Wattage (W)", sizing.panelWatt);
  kv("Sun Hours (hrs/yr)", sizing.sunHours);
  kv("Buffer Multiplier", sizing.buffer);
  kv("STEP 1 - Avg Units (kWh/mo)", stats.avgUnits > 0 ? Number(stats.avgUnits.toFixed(2)) : null);
  kv("STEP 2 - Solar Capacity Raw (kWp)", pipeline.solarCapacityRawKwp > 0 ? Number(pipeline.solarCapacityRawKwp.toFixed(2)) : null);
  kv("STEP 3 - Full Panels", pipeline.fullPanels > 0 ? pipeline.fullPanels : null);
  kv("STEP 4 - Full kWp (actual)", pipeline.fullKwp > 0 ? Number(pipeline.fullKwp.toFixed(1)) : null);
  kv("STEP 5 - TOD Utilisable Fraction", tod.bufferedFraction > 0 ? Number((tod.bufferedFraction * 100).toFixed(2)) : null);
  kv("STEP 6 - TOD Solar Capacity (kWp)", pipeline.todSolarCapacityKwp > 0 ? Number(pipeline.todSolarCapacityKwp.toFixed(2)) : null);
  kv("STEP 7 - TOD Panels", pipeline.todPanels > 0 ? pipeline.todPanels : null);
  kv("STEP 8 - TOD kWp (actual)", pipeline.todKwp > 0 ? Number(pipeline.todKwp.toFixed(1)) : null);
  kv("STEP 9 - Solar Generation/Year (kWh)", pipeline.solarGenPerYearKwh > 0 ? Number(pipeline.solarGenPerYearKwh.toFixed(0)) : null);
  blank();

  // ── Section 8: Validation Results ───────────────────────────────────────
  heading("VALIDATION RESULTS");
  checks.forEach((c) => {
    set(`A${row}`, c.label);
    set(`B${row}`, c.status.toUpperCase());
    row += 1;
  });
  blank();

  // ── Section 9: Recommendations / Savings & Payback ─────────────────────
  heading("SAVINGS ANALYSIS & RECOMMENDATIONS");
  kv("Full Solar Capacity (kWp)", pipeline.fullKwp > 0 ? Number(pipeline.fullKwp.toFixed(1)) : null);
  kv("TOD-Adjusted Capacity (kWp)", pipeline.todKwp > 0 ? Number(pipeline.todKwp.toFixed(1)) : null);
  kv("Annual Saving @ Avg Rate (Rs)", pipeline.annualSavingAvgRate > 0 ? Number(pipeline.annualSavingAvgRate.toFixed(0)) : null);
  kv("Annual Saving @ ROUNDUP Rate (Rs)", pipeline.annualSavingRoundUpRate > 0 ? Number(pipeline.annualSavingRoundUpRate.toFixed(0)) : null);
  kv("System Cost (Rs)", sizing.systemCost > 0 ? sizing.systemCost : null);
  kv("Simple Payback (Years)", pipeline.simplePaybackYears !== null ? Number(pipeline.simplePaybackYears.toFixed(1)) : null);

  return {
    sheetTitle: (data.consumerNo || "Commercial").slice(0, 31),
    cells,
    colWidths: [34, 20, 16, 16, 16, 14],
  };
}
