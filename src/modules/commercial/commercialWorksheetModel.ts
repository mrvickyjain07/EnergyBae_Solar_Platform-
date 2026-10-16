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
  computeValidationChecks,
  type SizingSettings,
} from "./commercialCalculations";
import { analyseCommercial } from "./consumptionSizing";

/** Sizing settings, as shown on screen (yield, offset and the optional margin). */
export type CommercialSizingInputs = SizingSettings;

// `startRow` lets Batch Bill Analysis stack many bills onto ONE worksheet by
// calling this same builder repeatedly at increasing offsets. Default 1 keeps
// the single-bill xlsx and Google Sheets exports byte-identical to before.
export function buildCommercialWorksheetModel(
  data: CommercialBillData,
  sizing: CommercialSizingInputs,
  startRow = 1
): WorksheetModel {
  const cells: WorksheetCell[] = [];
  const set = (ref: string, value: string | number | null) => cells.push({ ref, value });

  const todMode = detectTodMode(data.connectionType);
  const stats = computeBillingStats(data.billingHistory, data.fixedCharges);
  const tod = computeTodUtilisation(data.todSlots);
  const meter = computeMeterDerived(data);
  const recon = reconcileCharges(data);
  // Sized on this bill's own active energy (kWh) — see consumptionSizing.ts.
  const { pipeline, baseline, sanctioned, connected, energyRate } = analyseCommercial([{ data, sourceId: data.filename || "bill" }], sizing);
  const checks = computeValidationChecks(stats, tod, meter, recon, data);

  let row = startRow;
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
  kv(`Sanctioned Load (${data.sanctionedLoadUnit || "unit not stated"})`, num(data.sanctionedLoad));
  kv("Sanctioned Load (kW)", sanctioned.kw);
  kv("Sanctioned Load conversion", sanctioned.method ?? sanctioned.warning);
  kv(`Connected Load (${data.connectedLoadUnit || "unit not stated"})`, num(data.connectedLoad));
  kv("Connected Load (kW)", connected.kw);
  kv("Contract Demand (KVA)", num(data.contractDemand));
  kv("ED Code", data.edCode || null);
  kv("Security Deposit (Rs)", num(data.securityDeposit));
  kv("Meter Number", data.meterNo || null);
  kv("Existing Solar Installed", data.hasSolar ? "Yes" : "No");
  kv("Existing Solar Capacity (kW, nameplate)", num(data.solarCapacityKw));
  kv("Existing Solar Generation Signal (units)", num(data.solarGenerationUnits));
  kv("Existing Solar Source Field", data.solarSourceField || null);
  blank();

  // ── Section 3: Meter Readings ────────────────────────────────────────────
  heading("METER READINGS");
  kv("KWH register, previous", num(data.prevReading));
  kv("KWH register, current", num(data.currReading));
  kv("KVAH register, previous", num(data.kvahPrevReading));
  kv("KVAH register, current", num(data.kvahCurrReading));
  kv("Multiplying Factor", num(data.multiplyingFactor));
  kv("Check: (KWH curr - prev) x MF (kWh)", meter.assessedUnits);
  kv("Check: (KVAH curr - prev) x MF (kVAh)", meter.kvahFromRegisters);
  kv("Active energy consumption, this period (kWh)", num(data.activeKwh));
  kv("Apparent energy consumption, this period (kVAh)", num(data.kvahReading));
  kv("Reading Period", data.readingFrom && data.readingTo ? `${data.readingFrom} to ${data.readingTo}` : null);
  kv("Avg. / assessed PF (as printed)", num(data.avgPowerFactor));
  kv("Billed PF (as printed)", num(data.billedPowerFactor));
  kv("Recorded MD (kW)", num(data.recordedMdKw));
  kv("Recorded MD (kVA)", num(data.recordedMD));
  kv(`Billed Demand (as printed${data.billedDemandUnit ? `, ${data.billedDemandUnit}` : ""})`, num(data.billedDemand));
  kv("75% of contract demand (kVA, screening only - tariff rule not verified)", meter.demandFloorKva);
  blank();

  // ── Section 4: Billing History (every month the bill prints) ───────────
  heading("BILLING HISTORY");
  const hu = data.billingHistoryUnit === "unknown" ? "unit unknown" : data.billingHistoryUnit;
  kv("History units (reference only, not used for sizing)", hu);
  set(`A${row}`, "Sr.No"); set(`B${row}`, "Month"); set(`C${row}`, `Units (${hu})`); set(`D${row}`, "Bill Amount (Rs)"); set(`E${row}`, "Bill / units (all-in ratio, not an energy rate)"); set(`F${row}`, "Status");
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
  kv("Average bill / units (all-in ratio)", stats.avgUnitCost > 0 ? Number(stats.avgUnitCost.toFixed(4)) : null);
  kv("History months with units", stats.validCount);
  blank();

  // ── Section 5: Charge Components ────────────────────────────────────────
  heading("CHARGE COMPONENTS");
  kv("Energy Charges (Rs)", num(data.energyCharges));
  kv("TOD Tariff EC (Rs, signed)", num(data.todCharges));
  kv("Demand Charges (Rs)", num(data.demandCharges));
  kv("Fixed Charges (Rs, only if printed)", num(data.fixedCharges));
  kv("Fuel Adj. Charge / FAC (Rs)", num(data.fac));
  kv("Electricity Duty / ED (Rs)", num(data.ed));
  kv("Tax on Sale / ToSE (Rs)", num(data.tose));
  kv("Wheeling Charges (Rs)", num(data.wheelingCharges));
  kv("Delayed Payment Charges (Rs)", num(data.delayedPayment));
  kv("Arrears (Rs)", num(data.arrears));
  kv("Credit Adjustment (Rs)", num(data.creditAdjustment));
  kv("Other Charges (Rs)", num(data.otherCharges));
  kv("Sum of this period's charges (Rs)", recon.currentCharges);
  kv("Total Current Bill, printed (Rs)", recon.printedCurrentTotal > 0 ? recon.printedCurrentTotal : null);
  kv("Reconstructed Total, rounded to Rs 10 (Rs)", recon.reconstructedTotal);
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
  kv("06-17 h tariff-band share (%, proxy, low confidence - not a measured daytime load)", tod.utilisableFraction > 0 ? Number((tod.utilisableFraction * 100).toFixed(4)) : null);
  blank();

  // ── Section 7: Solar Sizing Pipeline ────────────────────────────────────
  heading("SOLAR SIZING PIPELINE");
  kv("Panel Wattage (W)", sizing.panelWatt);
  kv("Assumed annual specific yield (kWh/kWp/yr)", sizing.specificYield);
  kv("Energy offset target (%)", sizing.offsetPct);
  kv("Additional sizing margin (%)", sizing.marginPct);
  kv("STEP 1 - Active energy used (kWh)", baseline ? baseline.totalKwh : null);
  kv("STEP 1 - Periods / reading days", baseline ? `${baseline.periods} / ${baseline.totalDays ?? "dates missing"}` : null);
  kv(`STEP 1 - Annual active energy (kWh, ${baseline?.annualBasis ?? "-"})`, baseline ? Number(baseline.annualKwh.toFixed(0)) : null);
  kv("STEP 2 - Theoretical capacity (kWp, before margin)", pipeline.theoreticalKwp > 0 ? Number(pipeline.theoreticalKwp.toFixed(2)) : null);
  kv("STEP 2 - Added by sizing margin (kWp)", pipeline.marginKwp > 0 ? Number(pipeline.marginKwp.toFixed(2)) : 0);
  kv("STEP 3 - Full Panels", pipeline.fullPanels > 0 ? pipeline.fullPanels : null);
  kv("STEP 4 - Full kWp (actual)", pipeline.fullKwp > 0 ? Number(pipeline.fullKwp.toFixed(1)) : null);
  kv("STEP 5 - Solar Generation/Year at the full size (kWh)", pipeline.solarGenPerYearKwh > 0 ? Number(pipeline.solarGenPerYearKwh.toFixed(0)) : null);
  kv("TOD proxy - tariff-band share (%)", tod.utilisableFraction > 0 ? Number((tod.utilisableFraction * 100).toFixed(2)) : null);
  kv("TOD proxy - capacity (kWp, low confidence)", pipeline.todKwp > 0 ? Number(pipeline.todKwp.toFixed(1)) : null);
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
  kv("Theoretical energy-based capacity (kWp)", pipeline.fullKwp > 0 ? Number(pipeline.fullKwp.toFixed(1)) : null);
  kv("TOD tariff-band proxy capacity (kWp, low confidence)", pipeline.todKwp > 0 ? Number(pipeline.todKwp.toFixed(1)) : null);
  kv("Note", "Preliminary only, not an installable capacity: confirm daytime load, site yield, roof area and the utility's interconnection/export limits before quoting.");
  kv("Energy rate (Rs/kWh) = variable charges / active kWh", energyRate > 0 ? Number(energyRate.toFixed(4)) : null);
  kv("Annual Saving @ Energy Rate (Rs)", pipeline.annualSavingAvgRate > 0 ? Number(pipeline.annualSavingAvgRate.toFixed(0)) : null);
  kv("Annual Saving @ ROUNDUP Rate (Rs)", pipeline.annualSavingRoundUpRate > 0 ? Number(pipeline.annualSavingRoundUpRate.toFixed(0)) : null);
  kv("System Cost (Rs)", typeof sizing.systemCost === "number" && sizing.systemCost > 0 ? sizing.systemCost : null);
  kv("Simple Payback (Years)", pipeline.simplePaybackYears !== null ? Number(pipeline.simplePaybackYears.toFixed(1)) : null);

  return {
    sheetTitle: (data.consumerNo || "Commercial").slice(0, 31),
    cells,
    colWidths: [34, 20, 16, 16, 16, 14],
    // `row` has already advanced past the final written line.
    endRow: row - 1,
  };
}
