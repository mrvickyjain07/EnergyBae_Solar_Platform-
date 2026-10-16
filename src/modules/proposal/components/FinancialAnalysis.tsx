import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Landmark, ChevronDown, Settings2, AlertTriangle } from "lucide-react";
import { Catalogue, PricingSummary as PricingSummaryType, ProposalInputs } from "../types";
import { fmtINR } from "../calculations";
import { calculateProposal, DEFAULT_ASSUMPTIONS, EngineAssumptions, EngineInputs, EngineMode, EngineOutputs } from "../proposalEngine";

export interface FinanceSettings {
  mode: EngineMode;
  extraCostGstRate: number;
  assumptionOverrides: Partial<EngineAssumptions>;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  mode: "legacy",
  extraCostGstRate: 0.18,
  assumptionOverrides: {},
};

interface Props {
  inputs: ProposalInputs;
  summary: PricingSummaryType;
  catalogue: Catalogue;
  settings: FinanceSettings;
  setSettings: React.Dispatch<React.SetStateAction<FinanceSettings>>;
}

// Every ₹ figure fed into the engine traces to either a user-entered input
// (unitCost, extraCost, connections) or a real computed BOQ number.
//
// costPerWatt comes from summary.rateKW — the exact, unrounded ₹/kW that the
// itemized BOQ (material + install + transport + liaisoning + insurance +
// profit) reconstructs to (rateKW = totalExGST / capacity), so
// costPerWatt*1000*kW reproduces summary.totalExGST exactly. summary.
// firstQuoteRate is NOT this: it's rateKW rounded up + a ₹2000 negotiation
// buffer (see its own "+buffer" label), so it diverges from the real total —
// most visibly at 0 kW, where firstQuoteRate is forced to 0 by definition
// even though the itemized total is nonzero.
export function buildEngineInputs(inputs: ProposalInputs, summary: PricingSummaryType, extraCostGstRate: number): EngineInputs | null {
  if (!inputs.financeCustomerType || !inputs.financeProjectType) return null;
  return {
    customerType: inputs.financeCustomerType,
    projectType: inputs.financeProjectType,
    adApplicable: inputs.adApplicable,
    gstRegistered: inputs.gstRegistered,
    connections: inputs.connections === "" ? 0 : inputs.connections,
    systemSizeKw: inputs.capacity === "" ? 0 : inputs.capacity,
    unitCost: inputs.unitCost === "" ? 0 : inputs.unitCost,
    costPerWatt: summary.rateKW / 1000,
    // The Extra Cost field was removed from the form, so it's always 0 here —
    // otherwise a value saved on an older proposal would keep affecting the
    // financials with no way to see or edit it. (Still stored, not deleted.)
    extraCost: 0,
    extraCostGstRate,
  };
}

const ASSUMPTION_FIELDS: { key: keyof EngineAssumptions; label: string; unit: string; percent?: boolean; step?: number }[] = [
  { key: "specificYield", label: "Specific Yield", unit: "kWh/kW/yr", step: 10 },
  { key: "systemLifeYears", label: "System Life", unit: "yrs", step: 1 },
  { key: "degradationYear1", label: "Year-1 Degradation", unit: "%", percent: true, step: 0.1 },
  { key: "degradationLinear", label: "Linear Degradation", unit: "%/yr", percent: true, step: 0.1 },
  { key: "tariffEscalation", label: "Tariff Escalation", unit: "%/yr", percent: true, step: 0.5 },
  { key: "gstEffectiveRate", label: "Project GST Rate", unit: "%", percent: true, step: 0.1 },
  { key: "commissioningLagYears", label: "Commissioning Lag", unit: "yrs", step: 0.1 },
  { key: "adDepreciationRate", label: "AD Depreciation Rate (WDV)", unit: "%", percent: true, step: 1 },
  { key: "adTaxRate", label: "AD Marginal Tax Rate", unit: "%", percent: true, step: 0.1 },
  { key: "subsidyIndividualCap", label: "Individual Subsidy Cap", unit: "₹/conn", step: 1000 },
  { key: "subsidySocietyPerKw", label: "Society Subsidy Rate", unit: "₹/kW", step: 500 },
  { key: "subsidySocietyCapKw", label: "Society Subsidy Cap", unit: "kW", step: 10 },
  { key: "amcThresholdCostPerWatt", label: "AMC Threshold Cost/W", unit: "₹/W", step: 1 },
  { key: "discountRate", label: "Discount Rate (NPV/IRR)", unit: "%", percent: true, step: 0.5 },
];

export default function FinancialAnalysis({ inputs, summary, catalogue, settings, setSettings }: Props) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  // The project GST rate assumption defaults to whatever the Price Database
  // has configured (catalogue.charges.gst), so the two engines stay in sync
  // unless a user deliberately overrides it here.
  const effectiveAssumptions: EngineAssumptions = useMemo(
    () => ({ ...DEFAULT_ASSUMPTIONS, gstEffectiveRate: (catalogue.charges.gst || 8.9) / 100, ...settings.assumptionOverrides }),
    [catalogue.charges.gst, settings.assumptionOverrides]
  );

  const engineInputs = useMemo(() => buildEngineInputs(inputs, summary, settings.extraCostGstRate), [inputs, summary, settings.extraCostGstRate]);

  const result = useMemo(() => (engineInputs ? calculateProposal(engineInputs, effectiveAssumptions, settings.mode) : null), [engineInputs, effectiveAssumptions, settings.mode]);

  function setAssumption<K extends keyof EngineAssumptions>(key: K, rawValue: string, percent?: boolean) {
    const n = Number(rawValue);
    if (rawValue === "" || Number.isNaN(n)) return;
    const value = percent ? n / 100 : n;
    setSettings((prev) => ({ ...prev, assumptionOverrides: { ...prev.assumptionOverrides, [key]: value } }));
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden bg-[var(--bg-card)]">
      <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--hover-bg)] flex items-center gap-2">
        <Landmark className="w-4 h-4 text-[var(--accent-green)]" />
        <h3 className="text-xs font-medium font-display text-[var(--text-primary)]">Financial &amp; Subsidy Analysis</h3>
      </div>

      {!engineInputs && (
        <div className="p-4 flex items-center gap-2 text-[11px] text-amber-500 font-mono">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Select Customer Type and Subsidy Scheme above to see subsidy, tax-benefit and payback figures.
        </div>
      )}

      {engineInputs && result && result.ok === false && (
        <div className="p-4 space-y-1">
          {result.errors.map((e) => (
            <div key={e.field} className="flex items-center gap-2 text-[11px] text-red-400 font-mono">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {e.message}
            </div>
          ))}
        </div>
      )}

      {result?.ok && <ResultsGrid result={result} />}

      {/* Assumptions panel — collapsible, every value editable, echoed into exports for audit */}
      <div className="border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setAssumptionsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="w-3.5 h-3.5" /> Assumptions ({assumptionsOpen ? "hide" : "show & edit"})
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${assumptionsOpen ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence initial={false}>
          {assumptionsOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 pt-0">
                {ASSUMPTION_FIELDS.map((f) => {
                  const raw = effectiveAssumptions[f.key] as number;
                  const displayValue = f.percent ? +(raw * 100).toFixed(4) : raw;
                  return (
                    <div key={f.key}>
                      <label className="text-xs text-[var(--text-muted)] block mb-1">
                        {f.label} <span className="opacity-70">({f.unit})</span>
                      </label>
                      <input
                        type="number"
                        step={f.step}
                        value={displayValue}
                        onChange={(e) => setAssumption(f.key, e.target.value, f.percent)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green)]/20"
                      />
                    </div>
                  );
                })}
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">Extra Cost GST Rate (%)</label>
                  <input
                    type="number"
                    step={0.5}
                    value={+(settings.extraCostGstRate * 100).toFixed(4)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value === "" || Number.isNaN(n)) return;
                      setSettings((prev) => ({ ...prev, extraCostGstRate: n / 100 }));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green)]/20"
                  />
                </div>
              </div>
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, assumptionOverrides: {}, extraCostGstRate: 0.18 }))}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-green)] font-mono underline cursor-pointer"
                >
                  Reset assumptions to defaults
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${color || "text-[var(--text-primary)]"}`}>{value}</div>
      {sub && <div className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function ResultsGrid({ result }: { result: EngineOutputs }) {
  const isCommercialOrIndustrial = result.inputs.customerType === "COMMERCIAL" || result.inputs.customerType === "INDUSTRIAL";
  return (
    <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {isCommercialOrIndustrial ? (
        <>
          <Stat label="Accelerated Depreciation Benefit" value={fmtINR(result.adBenefit)} />
          <Stat label="GST Input Credit Benefit" value={fmtINR(result.gstBenefit)} />
        </>
      ) : (
        <Stat label="PM Surya Ghar Subsidy" value={result.subsidy > 0 ? `− ${fmtINR(result.subsidy)}` : fmtINR(0)} color={result.subsidy > 0 ? "text-amber-500" : undefined} />
      )}
      <Stat label="Total Effective Amount" value={fmtINR(result.totalEffectiveAmount)} color="text-[var(--accent-green)]" />
      <Stat label="Payback Period" value={`${result.paybackYears}y ${result.paybackMonths}m`} />
      <Stat label="Lifetime Savings" value={fmtINR(result.lifetimeSavings)} color="text-[var(--accent-green)]" sub={`over ${result.assumptions.systemLifeYears} years`} />
      <Stat label="Annual Generation" value={`${Math.round(result.annualGenerationKwh).toLocaleString("en-IN")} kWh`} />
      <Stat label="Shadow-Free Area" value={`${result.shadowFreeAreaSqft.toLocaleString("en-IN")} sq.ft.`} />
      <Stat label="Annual O&M / Cleaning" value={`${fmtINR(result.amc)} + ${fmtINR(result.cleaningCost)}`} sub="AMC + cleaning" />
      {result.mode === "enhanced" && (
        <>
          <Stat
            label="NPV"
            value={result.npv !== undefined ? fmtINR(result.npv) : "—"}
            color={result.npv !== undefined && result.npv > 0 ? "text-[var(--accent-green)]" : "text-red-400"}
            sub={`@ ${(result.assumptions.discountRate * 100).toFixed(1)}% discount rate`}
          />
          <Stat label="IRR" value={result.irr != null ? `${(result.irr * 100).toFixed(1)}%` : "Did not converge"} color="text-cyan-500" />
        </>
      )}
    </div>
  );
}
