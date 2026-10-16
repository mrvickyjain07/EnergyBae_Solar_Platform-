// src/components/WorkflowMap.tsx
// The EnergyBae product loop, drawn as a pipeline: Bill → Project → System →
// Capacity range → Template → Auto BOQ → Edit → Proposal → Share, plus the
// Direct Proposal and multi-system branches. Pattern from 21st.dev "How It
// Works Timeline" (numbered nodes on a dashed rail), laid out horizontally.
//
// Every stage states what exists TODAY. A stage links to a screen only when
// that screen really does the job — planned stages are not clickable.
import React from "react";
import { motion } from "motion/react";
import {
  FileScan, FolderKanban, Sun, Gauge, LayoutTemplate, Cpu, PencilRuler, FileText, Send,
  ArrowRight, GitBranch, Layers, type LucideIcon,
} from "lucide-react";
import StatusPill from "./ui/StatusPill";
import type { AppRoute, ModuleStatus } from "../navigation";

interface Stage {
  label: string;
  note: string;
  icon: LucideIcon;
  status: ModuleStatus;
  route?: AppRoute;
}

const STAGES: Stage[] = [
  { label: "Bill Analysis", note: "AI reads the electricity bill", icon: FileScan, status: "live", route: "bill-analysis" },
  { label: "Project", note: "Customer, opportunity and its systems", icon: FolderKanban, status: "live", route: "projects" },
  { label: "System & Structure", note: "Capacity, phase, panels, structure", icon: Sun, status: "partial", route: "projects" },
  { label: "Capacity range", note: "1–6 · 7–20 · 21–50 · 51–100 · 100+ kW", icon: Gauge, status: "planned" },
  { label: "BOQ template", note: "Range blueprint picked automatically", icon: LayoutTemplate, status: "planned" },
  { label: "Automatic BOQ", note: "Engine sizes cables, earthing, BOS", icon: Cpu, status: "partial", route: "boq" },
  { label: "Manual edit", note: "Override qty, price, add items", icon: PencilRuler, status: "live", route: "boq" },
  { label: "Proposal", note: "Priced, reviewed, exported", icon: FileText, status: "live", route: "proposals" },
  { label: "Share", note: "PDF · secure link · WhatsApp · email", icon: Send, status: "planned" },
];

const TODAY: Partial<Record<string, string>> = {
  "System & Structure": "Saved per system; structure rules pending",
  "Automatic BOQ": "One formula set for every capacity",
  "Share": "Word & Excel export today",
};

export default function WorkflowMap({ onGo }: { onGo: (r: AppRoute) => void }) {
  return (
    <section className="glass-panel rounded-2xl p-6" aria-labelledby="wf-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="wf-title" className="text-base font-semibold text-[var(--text-primary)]">From electricity bill to signed proposal</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">The EnergyBae workflow — and what's working today.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <StatusPill status="live" /> <StatusPill status="partial" /> <StatusPill status="planned" />
        </div>
      </div>

      <ol className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const clickable = !!s.route;
          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`size-9 rounded-xl grid place-items-center ${
                    s.status === "planned"
                      ? "bg-[var(--hover-bg)] text-[var(--text-muted)]"
                      : "bg-[var(--solar)]/15 text-[var(--solar-text)]"
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" aria-hidden />
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)] leading-tight">{s.label}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)] leading-snug">{s.note}</p>
              {TODAY[s.label] && <p className="mt-1.5 text-[11px] text-[var(--solar-text)] leading-snug">{TODAY[s.label]}</p>}
              <StatusPill status={s.status} className="mt-2.5" />
            </>
          );
          return (
            <motion.li
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.35 }}
              className="relative"
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onGo(s.route!)}
                  className="w-full h-full text-left rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 hover:border-[var(--solar)] hover:-translate-y-0.5 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]"
                  aria-label={`${s.label} — open`}
                >
                  {body}
                </button>
              ) : (
                <div className="h-full rounded-xl border border-dashed border-[var(--border-subtle)] p-3.5 opacity-80">{body}</div>
              )}
            </motion.li>
          );
        })}
      </ol>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl bg-[var(--hover-bg)] p-4">
          <GitBranch className="w-5 h-5 mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
              Direct proposal <StatusPill status="planned" />
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1 flex flex-wrap items-center gap-1">
              Project <ArrowRight className="w-3 h-3" /> Proposal, without building a BOQ. Today every proposal is priced from a BOQ.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-[var(--hover-bg)] p-4">
          <Layers className="w-5 h-5 mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
              Multiple systems per project <StatusPill status="partial" />
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              e.g. 50 kW factory + 20 kW warehouse. Projects hold many systems today, each with its own BOQ; one consolidated BOQ and proposal is coming.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
