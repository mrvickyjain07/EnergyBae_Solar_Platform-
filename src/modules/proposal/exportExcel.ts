// Proposal Maker — client-side styled Excel (.xlsx) export.
// Ported from the reference tool's downloadExcel() — builds a live-formula
// workbook (input cells are yellow, formulas reference each other exactly
// like the source spreadsheet) using xlsx-js-style so cell styling survives
// (plain `xlsx` strips styles on write).

import * as XLSX from "xlsx-js-style";
import { BOQItem, Catalogue, ProposalInputs, ProposalMeta } from "./types";
import { PricingSummary } from "./types";
import { EngineOutputs, EngineResult } from "./proposalEngine";
import { computeEarthingPits } from "./earthingRules";

const fontCambria = { name: "Cambria", sz: 11 };
const fontCambriaB = { name: "Cambria", sz: 11, bold: true };
const yellowFill = { patternType: "solid", fgColor: { rgb: "FFFF00" } };
const greenFill = { patternType: "solid", fgColor: { rgb: "2E7D32" } };
const greenLightFill = { patternType: "solid", fgColor: { rgb: "E8F5E9" } };

function setCell(ws: XLSX.WorkSheet, addr: string, value: number, formula?: string) {
  const cell: any = { t: "n", v: value };
  if (formula) cell.f = formula;
  cell.s = { font: fontCambria };
  ws[addr] = cell;
}
function setText(ws: XLSX.WorkSheet, addr: string, text: string | number) {
  ws[addr] = { t: "s", v: String(text), s: { font: fontCambria } };
}
function setInputCell(ws: XLSX.WorkSheet, addr: string, value: string | number) {
  const cell: any = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: String(value) };
  cell.s = { font: fontCambria, fill: yellowFill };
  ws[addr] = cell;
}

export function downloadProposalExcel(
  inp: ProposalInputs,
  cat: Catalogue,
  boq: BOQItem[],
  summary: PricingSummary,
  meta: ProposalMeta,
  financeResult?: EngineResult | null
) {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};
  const ch = cat.charges;
  const instRate = ch.installation || 5500;
  const transPct = ch.transport || 3;
  const liaisonRate = ch.liaisoning || 3500;
  const profPct2 = ch.profit || 15;
  const gstPct2 = ch.gst || 8.9;
  const B1 = inp.capacity === "" ? 0 : inp.capacity;

  setText(ws, "A1", "Proposal No.");
  setInputCell(ws, "B1", meta.proposalNo);
  setText(ws, "A2", "Customer Name");
  setInputCell(ws, "B2", inp.customerName || "");
  setText(ws, "A3", "Required Solar Capacity");
  setInputCell(ws, "B3", B1 || 0);
  setText(ws, "A4", "Panel Price/Wp");
  setInputCell(ws, "B4", inp.panelPriceWp === "" ? 0 : inp.panelPriceWp);
  setText(ws, "A5", "Solar Module Size (W)");
  setInputCell(ws, "B5", inp.panelWp === "" ? 0 : inp.panelWp);
  setText(ws, "A6", "System Connection Phase");
  setInputCell(ws, "B6", inp.phase === "3-Phase" ? 3 : 1);
  setText(ws, "A7", "No. of Inverter");
  setInputCell(ws, "B7", inp.numInverters === "" ? 0 : inp.numInverters);
  setText(ws, "A8", "Inverter Size");
  setInputCell(ws, "B8", inp.inverterSize ? `${inp.inverterSize} kW` : "");
  setText(ws, "A9", "No. of Panel Rows");
  setInputCell(ws, "B9", inp.panelRows === "" ? 0 : inp.panelRows);
  setText(ws, "A10", "No. of Strings");
  setInputCell(ws, "B10", inp.numStrings === "" ? 0 : inp.numStrings);
  setText(ws, "A11", "Earthing Pits");
  // Calculated, not the (retired) typed field — must match the BOQ's pit row.
  setInputCell(ws, "B11", computeEarthingPits(inp.numInverters, inp.laType));
  setText(ws, "A12", "Unit Cost (₹/kWh)");
  setInputCell(ws, "B12", inp.unitCost === "" ? 0 : inp.unitCost);
  setText(ws, "A13", "Contact Number");
  setInputCell(ws, "B13", inp.contactNumber || "");
  setText(ws, "A14", "Customer Address");
  setInputCell(ws, "B14", inp.customerAddress || "");
  setText(ws, "A15", "System Type");
  setInputCell(ws, "B15", inp.systemType || "On-Grid");

  setText(ws, "E12", "OVERALL BOQ");
  const boqHdrs = ["Sr. No.", "Material", "Specification", "Make / Type/Model", "Units", "Qty.", "Note", "Cost", "Price"];
  boqHdrs.forEach((h, i) => setText(ws, XLSX.utils.encode_cell({ r: 12, c: 4 + i }), h));

  let r = 13;
  boq.forEach((item) => {
    const er = r + 1;
    setCell(ws, `E${er}`, item.sr);
    setText(ws, `F${er}`, item.name);
    setText(ws, `G${er}`, item.spec);
    setText(ws, `H${er}`, item.make);
    setText(ws, `I${er}`, item.unit);
    setCell(ws, `J${er}`, item.qty || 0);
    setText(ws, `K${er}`, "");
    setCell(ws, `L${er}`, item.unitCost || 0);
    setCell(ws, `M${er}`, (item.qty || 0) * (item.unitCost || 0), `J${er}*L${er}`);
    r++;
  });
  const lastItemRow = r;
  const matRow = lastItemRow + 1;
  const instRow = matRow + 1;
  const transRow = instRow + 1;
  const liaisonRow = transRow + 1;
  const subTotalRow = liaisonRow + 1;
  const insRow = subTotalRow + 1;
  const profitRow = insRow + 1;
  const totalRow = profitRow + 1;
  const rateRow = totalRow + 1;
  const firstQuoteRow = rateRow + 1;
  const finalRow = firstQuoteRow + 1;

  setText(ws, `K${matRow}`, "Material");
  setCell(ws, `M${matRow}`, summary.matTotal, `SUM(M14:M${lastItemRow})`);

  setText(ws, `I${instRow}`, "kW");
  setCell(ws, `J${instRow}`, B1 || 0, `B3`);
  setText(ws, `K${instRow}`, "Installation");
  setCell(ws, `L${instRow}`, instRate);
  setCell(ws, `M${instRow}`, summary.install, `L${instRow}*J${instRow}`);

  setText(ws, `K${transRow}`, "Transportation");
  setCell(ws, `M${transRow}`, summary.transport, `M${matRow}*${transPct}/100`);

  setText(ws, `K${liaisonRow}`, "Liaisoning");
  setCell(ws, `L${liaisonRow}`, liaisonRate);
  setCell(ws, `M${liaisonRow}`, summary.liaison, `L${liaisonRow}*J${instRow}`);

  setText(ws, `K${subTotalRow}`, "Sub Total");
  setCell(ws, `M${subTotalRow}`, summary.subTotal, `SUM(M${matRow}:M${liaisonRow})`);

  setText(ws, `K${insRow}`, "Insurance");
  setCell(ws, `M${insRow}`, summary.insurance, `(M${subTotalRow}*1.2)/1000*3*5`);

  setText(ws, `K${profitRow}`, "Profit");
  setCell(ws, `L${profitRow}`, profPct2 / 100);
  setCell(ws, `M${profitRow}`, summary.profit, `M${subTotalRow}/(1-L${profitRow})*L${profitRow}`);

  setText(ws, `K${totalRow}`, "Total");
  setCell(ws, `M${totalRow}`, summary.totalExGST, `SUM(M${subTotalRow}:M${profitRow})`);

  setText(ws, `K${rateRow}`, "Rate per kW");
  setCell(ws, `M${rateRow}`, summary.rateKW, `M${totalRow}/1000/J${instRow}`);

  setText(ws, `K${firstQuoteRow}`, "First Quote Rate");
  setCell(ws, `M${firstQuoteRow}`, Math.ceil(summary.rateKW) + 2, `ROUNDUP(M${rateRow},0)+2`);

  setText(ws, `K${finalRow}`, "Total Project Cost (Payable, incl. GST)");
  setCell(ws, `M${finalRow}`, summary.final, `M${firstQuoteRow}*J${instRow}*1000*(1+${gstPct2 / 100})`);

  let lastRow = finalRow;
  if (summary.isDCR) {
    const subsidyRow = finalRow + 1;
    const effRow = subsidyRow + 1;
    setText(ws, `K${subsidyRow}`, "PMSGY Subsidy (DCR)");
    setCell(ws, `M${subsidyRow}`, -(ch.subsidy || 78000), `-${ch.subsidy || 78000}`);
    setText(ws, `K${effRow}`, "Total Effective Amount");
    setCell(ws, `M${effRow}`, summary.effective, `M${finalRow}+M${subsidyRow}`);
    lastRow = effRow;
  }
  if (summary.discountAmt > 0) {
    const discRow = lastRow + 1;
    const netRow = discRow + 1;
    setText(ws, `K${discRow}`, `Discount (${inp.discountPct}%)`);
    setCell(ws, `M${discRow}`, -summary.discountAmt);
    setText(ws, `K${netRow}`, "Net Payable Amount");
    setCell(ws, `M${netRow}`, summary.finalAfterDiscount, `M${lastRow}+M${discRow}`);
    lastRow = netRow;
  }

  if (financeResult && financeResult.ok) {
    lastRow = writeFinanceAuditBlock(ws, financeResult, lastRow + 2);
  }

  const range = { s: { r: 0, c: 0 }, e: { r: lastRow, c: 13 } };
  ws["!ref"] = XLSX.utils.encode_range(range);
  ws["!cols"] = [
    { wch: 26 }, { wch: 16 }, { wch: 2 }, { wch: 2 },
    { wch: 6 }, { wch: 26 }, { wch: 34 }, { wch: 20 },
    { wch: 8 }, { wch: 7 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, `${B1 || 0} kW Solar BOQ`);

  const fname = `EnergyBae_Proposal_${(inp.customerName || "Customer").replace(/[^a-zA-Z0-9]/g, "_")}_${B1 || 0}kW.xlsx`;
  XLSX.writeFile(wb, fname);
}

// Financial Analysis engine output (subsidy / AD / GST benefit / payback /
// lifetime savings) plus the exact assumptions used — appended so the
// workbook is self-auditing, independent of the itemized BOQ pricing above.
// Returns the last row written.
function writeFinanceAuditBlock(ws: XLSX.WorkSheet, r: EngineOutputs, startRow: number): number {
  const isCI = r.inputs.customerType === "COMMERCIAL" || r.inputs.customerType === "INDUSTRIAL";
  const a = r.assumptions;
  let row = startRow;

  setText(ws, `K${row}`, "FINANCIAL & SUBSIDY ANALYSIS");
  setText(ws, `M${row}`, r.mode === "legacy" ? "Legacy (Excel-exact)" : "Enhanced");
  row++;

  if (isCI) {
    setText(ws, `K${row}`, "Accelerated Depreciation Benefit"); setCell(ws, `M${row}`, r.adBenefit); row++;
    setText(ws, `K${row}`, "GST Input Credit Benefit"); setCell(ws, `M${row}`, r.gstBenefit); row++;
  } else {
    setText(ws, `K${row}`, "PM Surya Ghar Subsidy"); setCell(ws, `M${row}`, -r.subsidy); row++;
  }
  setText(ws, `K${row}`, "Total Effective Amount"); setCell(ws, `M${row}`, r.totalEffectiveAmount); row++;
  setText(ws, `K${row}`, "Payback Period"); setText(ws, `M${row}`, `${r.paybackYears}y ${r.paybackMonths}m`); row++;
  setText(ws, `K${row}`, `Lifetime Savings (${a.systemLifeYears} yrs)`); setCell(ws, `M${row}`, r.lifetimeSavings); row++;
  if (r.mode === "enhanced") {
    setText(ws, `K${row}`, `NPV @ ${(a.discountRate * 100).toFixed(1)}%`); setCell(ws, `M${row}`, r.npv ?? 0); row++;
    setText(ws, `K${row}`, "IRR"); setText(ws, `M${row}`, r.irr != null ? `${(r.irr * 100).toFixed(1)}%` : "Did not converge"); row++;
  }

  row++;
  setText(ws, `K${row}`, "Assumptions Used"); row++;
  const assumptionRows: [string, string][] = [
    ["Specific Yield", `${a.specificYield} kWh/kW/yr`],
    ["System Life", `${a.systemLifeYears} yrs`],
    ["Degradation", `${(a.degradationYear1 * 100).toFixed(1)}% yr-1, ${(a.degradationLinear * 100).toFixed(2)}%/yr thereafter`],
    ["Tariff Escalation", `${(a.tariffEscalation * 100).toFixed(1)}%/yr`],
    ["Project GST Rate", `${(a.gstEffectiveRate * 100).toFixed(2)}%`],
    ["Commissioning Lag", `${a.commissioningLagYears} yrs`],
    ["AD Depreciation / Tax Rate", `${(a.adDepreciationRate * 100).toFixed(0)}% WDV @ ${(a.adTaxRate * 100).toFixed(2)}% tax`],
    ["Individual Subsidy Cap", `₹${a.subsidyIndividualCap.toLocaleString("en-IN")}/connection`],
    ["Society Subsidy Rate", `₹${a.subsidySocietyPerKw.toLocaleString("en-IN")}/kW${r.mode === "enhanced" ? ` (capped at ${a.subsidySocietyCapKw} kW)` : " (uncapped, legacy)"}`],
    ["Extra Cost GST Rate", `${(r.inputs.extraCostGstRate * 100).toFixed(1)}%`],
    ["Discount Rate (NPV/IRR)", `${(a.discountRate * 100).toFixed(1)}%`],
  ];
  for (const [label, value] of assumptionRows) {
    setText(ws, `K${row}`, label);
    setText(ws, `M${row}`, value);
    row++;
  }
  return row - 1;
}
