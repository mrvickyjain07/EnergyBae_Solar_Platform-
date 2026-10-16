import React from "react";
import { Coins, Sun, Ruler, TrendingDown } from "lucide-react";
import AnimatedNumber from "../../../components/AnimatedNumber";
import { Catalogue, PricingSummary as PricingSummaryType, ProposalInputs } from "../types";
import { fmtINR } from "../calculations";
import { sanitizePrice } from "../sanitizePrice";

interface Props {
  summary: PricingSummaryType;
  inputs: ProposalInputs;
  catalogue: Catalogue;
  setCatalogue: React.Dispatch<React.SetStateAction<Catalogue>>;
  numPanels: number;
}

function NumInput({ value, onChange, width = "w-16" }: { value: number; onChange: (val: string) => void; width?: string }) {
  return (
    <input
      type="number"
      step="0.1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`${width} bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]`}
    />
  );
}

function EditableRow({
  label,
  value,
  highlight,
  negative,
  sub,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  highlight?: boolean;
  negative?: boolean;
  sub?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] gap-2 ${highlight ? "bg-[var(--hover-bg)]" : ""} ${sub ? "bg-amber-500/5" : ""}`}>
      <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 flex-wrap">{label}</span>
      <span className={`font-mono text-xs font-semibold ${negative ? "text-red-400" : sub ? "text-amber-500" : "text-[var(--text-primary)]"}`}>{value}</span>
    </div>
  );
}

function Row({ label, value, highlight, grand, negative, sub }: { label: string; value: string; highlight?: boolean; grand?: boolean; negative?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0 ${highlight ? "bg-[var(--hover-bg)]" : ""} ${sub ? "bg-amber-500/5" : ""}`}>
      <span className={`text-xs ${grand ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{label}</span>
      <span
        className={`font-mono ${grand ? "text-base font-extrabold" : "text-xs font-semibold"} ${
          negative ? "text-red-400" : grand ? "text-[var(--accent-green)]" : sub ? "text-amber-500" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function PricingSummary({ summary, inputs, catalogue, setCatalogue, numPanels }: Props) {
  const ch = catalogue.charges;
  const B1 = inputs.capacity === "" ? 0 : inputs.capacity;
  const updCharge = (key: keyof Catalogue["charges"], val: string) => setCatalogue((c) => ({ ...c, charges: { ...c.charges, [key]: sanitizePrice(val) } }));

  return (
    <div className="space-y-4">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { title: "System Capacity", value: B1, suffix: " kW", detail: inputs.phase || "Phase not selected", color: "text-[var(--accent-green)]" },
          { title: "No. of Panels", value: numPanels, suffix: "", detail: `${inputs.panelBrand || "—"} ${inputs.panelWp ? inputs.panelWp + " Wp" : ""}`, color: "text-cyan-500" },
          { title: "Material Cost", value: summary.matTotal / 100000, decimals: 2, suffix: "L", prefix: "₹", detail: "Before overheads & GST", color: "text-amber-500" },
          {
            title: summary.isDCR ? "After Subsidy" : "Final Amount",
            value: (summary.discountAmt > 0 ? summary.finalAfterDiscount : summary.effective) / 100000,
            decimals: 2,
            suffix: "L",
            prefix: "₹",
            detail: summary.isDCR ? "Subsidy ₹78k deducted" : "NDCR — No subsidy",
            color: "text-[var(--accent-green)]",
          },
        ].map((item, idx) => (
          <div key={idx} className="glass-panel rounded-2xl p-4 bg-[var(--bg-card)] relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full bg-[var(--accent-green)]/10 blur-xl pointer-events-none" />
            <div className="text-xs text-[var(--text-muted)] font-medium">{item.title}</div>
            <div className={`mt-1.5 text-lg font-bold font-display truncate ${item.color}`}>
              <AnimatedNumber value={item.value} decimals={item.decimals ?? 0} prefix={item.prefix} suffix={item.suffix} />
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)] truncate">{item.detail}</div>
          </div>
        ))}
      </div>

      {/* Full breakdown */}
      <div className="glass-panel rounded-2xl overflow-hidden bg-[var(--bg-card)]">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--hover-bg)] flex items-center gap-2">
          <Coins className="w-4 h-4 text-[var(--accent-green)]" />
          <h3 className="text-xs font-medium font-display text-[var(--text-primary)]">Pricing Summary &amp; Final Quote</h3>
        </div>
        <Row label="Material Total" value={fmtINR(summary.matTotal)} />
        <EditableRow
          label={
            <>
              Installation ({B1} kW × ₹<NumInput value={ch.installation || 5500} onChange={(v) => updCharge("installation", v)} />)
            </>
          }
          value={fmtINR(summary.install)}
        />
        <EditableRow
          label={
            <>
              Transportation (<NumInput value={ch.transport || 3} onChange={(v) => updCharge("transport", v)} width="w-14" />% of material)
            </>
          }
          value={fmtINR(summary.transport)}
        />
        <EditableRow
          label={
            <>
              Liaisoning ({B1} kW × ₹<NumInput value={ch.liaisoning || 3500} onChange={(v) => updCharge("liaisoning", v)} />)
            </>
          }
          value={fmtINR(summary.liaison)}
        />
        <Row label="Sub Total" value={fmtINR(summary.subTotal)} highlight />
        <Row label="Insurance (5 yr premium)" value={fmtINR(summary.insurance)} />
        <EditableRow
          label={
            <>
              Profit Margin (<NumInput value={ch.profit || 15} onChange={(v) => updCharge("profit", v)} width="w-14" />%)
            </>
          }
          value={fmtINR(summary.profit)}
        />
        <Row label="Total (Excl. GST)" value={fmtINR(summary.totalExGST)} highlight />
        <Row label="First Quote Rate (+buffer)" value={`₹${Math.round(summary.firstQuoteRate).toLocaleString("en-IN")}/kW`} />
        <EditableRow
          label={
            <>
              GST @ <NumInput value={ch.gst || 8.9} onChange={(v) => updCharge("gst", v)} width="w-14" />%
            </>
          }
          value={fmtINR(summary.gstAmt)}
        />
        <Row label="Total Project Cost (Payable)" value={fmtINR(summary.final)} grand />
        {summary.isDCR && (
          <>
            <EditableRow
              label="PM Surya Ghar (PMSGY) Subsidy"
              value={
                <>
                  − ₹<NumInput value={ch.subsidy || 78000} onChange={(v) => updCharge("subsidy", v)} width="w-20" />
                </>
              }
              sub
              negative
            />
            <Row label="Total Effective Amount After Subsidy" value={fmtINR(summary.effective)} grand />
          </>
        )}
        {summary.discountAmt > 0 && (
          <>
            <Row label={`Discount (${inputs.discountPct}%)`} value={`− ${fmtINR(summary.discountAmt)}`} negative />
            <Row label="Net Payable Amount" value={fmtINR(summary.finalAfterDiscount)} grand />
          </>
        )}

        {/* Mini info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border-t border-[var(--border-subtle)]">
          {[
            { icon: Sun, label: "Est. Annual Generation", value: `${summary.annualGen.toLocaleString("en-IN")} kWh` },
            { icon: Ruler, label: "Shadow Free Area", value: `${summary.shadowArea} sq.ft.` },
            { icon: TrendingDown, label: "Lifetime Savings (25yr)", value: summary.lifeSavings > 0 ? `₹${(summary.lifeSavings / 100000).toFixed(1)}L` : "₹0" },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 text-center">
                <Icon className="w-4 h-4 mx-auto mb-1.5 text-[var(--accent-green)]" />
                <div className="text-xs text-[var(--text-muted)]">{c.label}</div>
                <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{c.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
