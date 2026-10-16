import React from "react";
import AnimatedNumber from "../../../components/AnimatedNumber";
import { PricingSummary as PricingSummaryType, ProposalInputs } from "../types";

interface Props {
  inputs: ProposalInputs;
  summary: PricingSummaryType;
  numPanels: number;
}

export default function SummaryStrip({ inputs, summary, numPanels }: Props) {
  const B1 = inputs.capacity === "" ? 0 : inputs.capacity;
  const items = [
    { title: "System capacity", value: B1, suffix: " kW", detail: inputs.phase || "Phase not selected" },
    { title: "Panels", value: numPanels, suffix: "", detail: `${inputs.panelBrand || "—"} ${inputs.panelWp ? inputs.panelWp + " Wp" : ""}` },
    { title: "Material cost", value: summary.matTotal / 100000, decimals: 2, suffix: "L", prefix: "₹", detail: "Before overheads & GST" },
    {
      title: summary.isDCR ? "After subsidy" : "Final amount",
      value: (summary.discountAmt > 0 ? summary.finalAfterDiscount : summary.effective) / 100000,
      decimals: 2,
      suffix: "L",
      prefix: "₹",
      detail: summary.isDCR ? "Subsidy ₹78k deducted" : "NDCR — No subsidy",
    },
  ];

  // Stripe-style stat cards: muted label, neutral large number, muted context
  // line. Colour is deliberately absent — it used to be a different accent per
  // card, which read as decoration rather than meaning.
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item, idx) => (
        <div key={idx} className="glass-panel rounded-xl p-4">
          <div className="text-[13px] text-[var(--text-secondary)]">{item.title}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)] truncate tabular-nums">
            <AnimatedNumber value={item.value} decimals={item.decimals ?? 0} prefix={item.prefix} suffix={item.suffix} />
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)] truncate">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}
