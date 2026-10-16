// src/modules/proposal/components/StructureDetails.tsx
// Structure Details for the selected structure type: the manual inputs that
// type uses, and the state of its structure rules. Follows the register's
// pending-default policy (docs/phase5/pending-business-decisions.md): while
// decision D1 is open, F / B / SH / Prestructure read "Requires engineering
// input" — never a number or a formula that could pass for an approved rule.
// The proposed formulas are shown only to people who maintain BOQ templates
// (boq_template.update), collapsed, for engineering review. Nothing here
// computes a derived height or a Prestructure amount. Which fields a type
// shows lives in structureTypes.ts, not here.
import React from "react";
import { Info } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import type { ProposalInputs } from "../types";
import { isLegacyStructure, structureDef, structureFields, type StructureField } from "../structureTypes";
import { TextField } from "./FormField";

const FIELD_LABELS: Record<StructureField, string> = {
  structLowerFt: "Lower Height (ft)",
  structUpperFt: "Upper Height (ft)",
  structureLegs: "Structure Legs",
};

const numOrEmpty = (v: number | "" | undefined) => (v === "" || v === undefined ? "" : String(v));

export default function StructureDetails({ inputs, setNum }: { inputs: ProposalInputs; setNum: (k: StructureField) => (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const def = structureDef(inputs.structureType);
  const fields = structureFields(inputs.structureType);
  const reviewer = useAuth().can("boq_template.update");
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-[var(--text-muted)]">Structure Details</div>
      {isLegacyStructure(inputs.structureType) && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-xs text-[var(--text-secondary)]">
          Saved as “{inputs.structureType}”, an earlier structure option. Choose one of the five types above; it is not converted automatically.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {fields.map((f) => (
          <TextField key={f} label={FIELD_LABELS[f]} type="number" placeholder={f === "structureLegs" ? "0" : "Not measured"} value={numOrEmpty(inputs[f] as number | "" | undefined)} onChange={setNum(f)} />
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        Structure Legs set the anchor bolts (legs × 2 base plates × 4).{def && !def.fields.includes("structUpperFt") && " Front and back heights are not entered for shed structures."}
      </p>
      {def && (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Info className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden />
            <span className="font-semibold text-[var(--text-primary)]">Structure rules for {def.label}</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">Requires engineering input</span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {["Front (F)", "Back (B)", "Shed Height (SH)", "Prestructure"].map((k) => (
              <div key={k} className="min-w-0"><dt className="text-[var(--text-muted)]">{k}</dt><dd className="text-[var(--text-secondary)]">Requires engineering input</dd></div>
            ))}
          </dl>
          <p className="text-[11px] text-[var(--text-muted)]">
            These rules await approval (decisions {def.pending.join(", ")}). Nothing here changes the quote: structure lines use the current calculator rules, and lines with an open rule are marked Provisional on the BOQ.
          </p>
          {reviewer && (
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--text-muted)]">Proposed rule (for engineering review)</summary>
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([["Front (F)", def.proposal.front], ["Back (B)", def.proposal.back], ["Shed Height (SH)", def.proposal.sh], ["Prestructure", def.proposal.prestructure]] as const).map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="text-[var(--text-muted)]">{k}</dt><dd className="text-[var(--text-secondary)] break-words">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {def.proposal.sh === def.proposal.front && "Shed Height (SH) is written the same as Front (F); its formula is not confirmed. "}
                Units and the meaning of each height are not confirmed. Not approved; not used anywhere.
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
