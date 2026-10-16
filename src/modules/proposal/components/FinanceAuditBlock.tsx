import React from "react";
import { fmtINR } from "../calculations";
import { EngineOutputs, EngineResult } from "../proposalEngine";

// Print-ready rendering of the Financial Analysis engine's output, shared by
// the on-screen Preview modal. Purely presentational — same numbers the
// FinancialAnalysis panel computed, so the printed proposal always matches
// what the calculator showed before export.
export function FinanceAuditBlock({ result }: { result: EngineResult | null }) {
  if (!result || !result.ok) return null;
  const r: EngineOutputs = result;
  const isCommercialOrIndustrial = r.inputs.customerType === "COMMERCIAL" || r.inputs.customerType === "INDUSTRIAL";
  const a = r.assumptions;

  return (
    <div className="mb-6">
      <div className="text-xs text-[#6B7A94] font-medium mb-1.5">
        Financial &amp; Subsidy Analysis <span className="normal-case font-normal">({r.mode === "legacy" ? "Legacy (Excel-exact)" : "Enhanced"} mode)</span>
      </div>
      <table className="w-full text-[11px] mb-2">
        <tbody>
          {isCommercialOrIndustrial ? (
            <>
              <tr>
                <td className="py-1 text-[#44546B]">Accelerated Depreciation Benefit</td>
                <td className="py-1 text-right">{fmtINR(r.adBenefit)}</td>
              </tr>
              <tr>
                <td className="py-1 text-[#44546B]">GST Input Credit Benefit</td>
                <td className="py-1 text-right">{fmtINR(r.gstBenefit)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td className="py-1 text-[#B45309]">PM Surya Ghar Subsidy</td>
              <td className="py-1 text-right text-[#B45309]">− {fmtINR(r.subsidy)}</td>
            </tr>
          )}
          <tr className="border-t border-[#D0D7E2]">
            <td className="py-1.5 font-semibold">Total Effective Amount</td>
            <td className="py-1.5 text-right font-bold">{fmtINR(r.totalEffectiveAmount)}</td>
          </tr>
          <tr>
            <td className="py-1 text-[#44546B]">Payback Period</td>
            <td className="py-1 text-right">
              {r.paybackYears}y {r.paybackMonths}m
            </td>
          </tr>
          <tr>
            <td className="py-1 text-[#44546B]">Lifetime Savings ({a.systemLifeYears} yrs)</td>
            <td className="py-1 text-right">{fmtINR(r.lifetimeSavings)}</td>
          </tr>
          {r.mode === "enhanced" && (
            <>
              <tr>
                <td className="py-1 text-[#44546B]">NPV @ {(a.discountRate * 100).toFixed(1)}%</td>
                <td className="py-1 text-right">{r.npv !== undefined ? fmtINR(r.npv) : "—"}</td>
              </tr>
              <tr>
                <td className="py-1 text-[#44546B]">IRR</td>
                <td className="py-1 text-right">{r.irr != null ? `${(r.irr * 100).toFixed(1)}%` : "Did not converge"}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <div className="text-[9px] text-[#6B7A94] leading-relaxed">
        <span className="font-bold">Assumptions used —</span> Specific yield {a.specificYield} kWh/kW/yr · System life {a.systemLifeYears} yrs · Degradation{" "}
        {(a.degradationYear1 * 100).toFixed(1)}% yr-1, {(a.degradationLinear * 100).toFixed(2)}%/yr thereafter · Tariff escalation {(a.tariffEscalation * 100).toFixed(1)}%/yr · Project GST{" "}
        {(a.gstEffectiveRate * 100).toFixed(2)}% · Commissioning lag {a.commissioningLagYears} yrs · AD {(a.adDepreciationRate * 100).toFixed(0)}% WDV @ {(a.adTaxRate * 100).toFixed(2)}% tax ·
        Individual subsidy cap {fmtINR(a.subsidyIndividualCap)}/connection · Society subsidy ₹{a.subsidySocietyPerKw.toLocaleString("en-IN")}/kW
        {r.mode === "enhanced" ? ` (capped at ${a.subsidySocietyCapKw} kW)` : " (uncapped, legacy)"} · Extra-cost GST rate {(r.inputs.extraCostGstRate * 100).toFixed(1)}% · Discount rate{" "}
        {(a.discountRate * 100).toFixed(1)}%.
      </div>
    </div>
  );
}
