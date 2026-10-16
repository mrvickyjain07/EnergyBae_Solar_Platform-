// src/modules/proposal/components/ReviewExportStep.tsx
// Last calculator step. The BOQ is the central object; this page shows two
// NON-exclusive ways forward — keep it in the app (A) or turn it into the
// customer proposal (B) — plus a shared status card with the BOQ lifecycle.
//
// Every button renders from boqActions() (reviewActions.ts), so availability
// (status, permission, saved/finalized/approved) is decided in one tested
// place. Handlers and validation stay owned by ProposalMaker.
//
// Effects, adapted from 21st.dev onto this app's tokens (no new deps):
// "Spotlight Card" (jahed) for the option cards, "Shimmer Button"
// (dillionverma) for primary actions, the Onboarding Timeline
// (ephraimduncan/onboarding-06) states for the lifecycle. CSS lives in
// proposal-maker.css (.rx-*); all motion honours prefers-reduced-motion.
import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, CloudUpload, Database, FileSpreadsheet, FileText, PencilLine, Save, AlertTriangle, Lock, Sparkles, RefreshCw, Zap, LayoutGrid, ListChecks, User } from "lucide-react";
import { BOQItem, PricingSummary as PricingSummaryType, ProposalInputs } from "../types";
import { fmtINR, formatProposalDate } from "../calculations";
import { ProposalListEntry } from "../storage";
import { ActionKey, ActionState, BoqStage, STAGE_TEXT, boqActions, boqStage } from "../reviewActions";
import AnimatedNumber from "../../../components/AnimatedNumber";

interface Props {
  inputs: ProposalInputs;
  boq: BOQItem[];
  summary: PricingSummaryType;
  numPanels: number;
  numInverters: number;
  onDownloadExcel: () => void;
  onOpenEditor: () => void;
  savedProposals: ProposalListEntry[];
  currentProposalNo: string;
  onSaveProposal: (status: "draft" | "final") => void;
  onOpenProposal: (proposalNo: string) => void;
  can: (permission: string) => boolean;
  proposalDate: string;
  onProposalDateChange: (date: string) => void;
  onRegenerateProposalNo: () => void;
}

const REVIEW_BADGE: Record<string, string> = { approved: "Approved", needs_changes: "Needs changes" };
const card = "glass-panel rounded-2xl p-5 bg-[var(--bg-card)]";
const ICONS: Record<ActionKey, typeof Save> = { saveDraft: Save, finalize: CloudUpload, excel: FileSpreadsheet, proposal: PencilLine };
const STAGE_TONE: Record<BoqStage, string> = {
  unsaved: "bg-[var(--hover-bg)] text-[var(--text-secondary)]",
  draft: "bg-sky-500/10 text-sky-600",
  pending: "bg-[var(--accent-green)]/10 text-[var(--accent-green)]",
  needs_changes: "bg-amber-500/15 text-amber-600",
  approved: "bg-emerald-500/10 text-[var(--success-text)]",
};
const STAGE_PILL: Record<BoqStage, string> = { unsaved: "Not saved", draft: "Draft", pending: "Awaiting approval", needs_changes: "Changes requested", approved: "Approved" };

const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } } } as const;

function ActionButton({ state, icon: Icon, onClick, primary, small }: { state: ActionState; icon: typeof Save; onClick: () => void; primary?: boolean; small?: boolean }) {
  const base = `inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition-colors cursor-pointer disabled:cursor-not-allowed ${small ? "px-3 py-2 text-[11px]" : "px-4 py-2.5 text-xs"}`;
  const tone = primary
    ? "rx-shimmer bg-[var(--accent-solid)] text-white shadow-[0_6px_20px_-6px_var(--accent-solid)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
    : "border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)] disabled:opacity-50";
  const ShownIcon = state.enabled ? Icon : Lock;
  return (
    <motion.button type="button" className={`${base} ${tone}`} disabled={!state.enabled} title={state.reason ?? undefined} onClick={onClick}
      whileHover={state.enabled ? { y: -1 } : undefined} whileTap={state.enabled ? { scale: 0.97 } : undefined}>
      <ShownIcon className={small ? "size-3.5" : "size-4"} aria-hidden /> {state.label}
    </motion.button>
  );
}

const TRACK: { label: string; stages: BoqStage[] }[] = [
  { label: "BOQ ready", stages: ["unsaved"] },
  { label: "Draft saved", stages: ["draft"] },
  { label: "Sent for approval", stages: ["pending", "needs_changes"] },
  { label: "Approved", stages: ["approved"] },
];

function Lifecycle({ stage }: { stage: BoqStage }) {
  const reduce = useReducedMotion();
  const at = TRACK.findIndex((t) => t.stages.includes(stage));
  return (
    <ol className="flex items-center" aria-label="BOQ status">
      {TRACK.map((t, i) => {
        const done = i < at || stage === "approved";
        const current = i === at && stage !== "approved";
        const warn = current && stage === "needs_changes";
        return (
          <li key={t.label} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
            <span className="relative grid size-7 shrink-0 place-items-center" aria-current={current ? "step" : undefined}>
              {current && !reduce && (
                <motion.span className={`absolute inset-0 rounded-full ${warn ? "bg-amber-500/30" : "bg-[var(--accent-green)]/25"}`}
                  animate={{ scale: [1, 1.6], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />
              )}
              <motion.span layout className={`relative grid size-7 place-items-center rounded-full text-[11px] font-bold transition-colors ${done ? "bg-[var(--accent-solid)] text-white" : warn ? "bg-amber-500 text-white" : current ? "border-2 border-[var(--accent-green)] bg-[var(--bg-surface)] text-[var(--accent-green)]" : "border border-[var(--border-strong)] text-[var(--text-muted)]"}`}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={done ? "d" : warn ? "w" : "n"} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}>
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : warn ? <AlertTriangle className="size-3.5" /> : i + 1}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            </span>
            <span className={`truncate text-xs font-medium ${done || current ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{warn ? "Changes requested" : t.label}</span>
            {i < TRACK.length - 1 && (
              <span className="relative mx-2 hidden h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--border-subtle)] sm:block">
                <motion.span className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-[var(--accent-solid)] to-[var(--accent-green-light)]"
                  initial={{ scaleX: 0 }} animate={{ scaleX: i < at || stage === "approved" ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.15 * i, ease: "easeOut" }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Option card with the cursor spotlight (.rx-spot). */
function PathCard({ icon: Icon, step, title, description, children }: { icon: typeof Database; step: string; title: string; description: string; children: React.ReactNode }) {
  const track = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <motion.section variants={rise} onMouseMove={track} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`${card} rx-spot flex flex-col gap-4`}>
      <div className="flex items-start gap-3">
        <motion.span whileHover={{ rotate: -8, scale: 1.08 }} className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent-solid)] to-[var(--accent-green-light)] text-white shadow-[0_8px_24px_-8px_var(--accent-solid)]">
          <Icon className="size-5" aria-hidden />
        </motion.span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-green)]">{step}</div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

export default function ReviewExportStep({
  inputs, boq, summary, numPanels, numInverters, onDownloadExcel, onOpenEditor,
  savedProposals, currentProposalNo, onSaveProposal, onOpenProposal, can,
  proposalDate, onProposalDateChange, onRegenerateProposalNo,
}: Props) {
  const activeItems = boq.filter((i) => i.qty > 0).length;
  const stage = boqStage(savedProposals.find((p) => p.proposal_no === currentProposalNo));
  const actions = boqActions(stage, can);
  const run: Record<ActionKey, () => void> = {
    saveDraft: () => onSaveProposal("draft"),
    finalize: () => onSaveProposal("final"),
    excel: onDownloadExcel,
    proposal: onOpenEditor,
  };
  const btn = (k: ActionKey, opts: { primary?: boolean; small?: boolean } = {}) => <ActionButton key={k} state={actions[k]} icon={ICONS[k]} onClick={run[k]} {...opts} />;
  const lockedNote = !actions.finalize.enabled ? actions.finalize.reason : null;
  const payable = summary.discountAmt > 0 ? summary.finalAfterDiscount : summary.effective;
  const chips: [typeof Zap, string][] = [
    [Zap, `${inputs.capacity || "—"} kW · ${inputs.phase || "—"}`],
    [LayoutGrid, `${numPanels} panels · ${numInverters} inverter${numInverters === 1 ? "" : "s"}`],
    [ListChecks, `${activeItems} line items`],
  ];

  return (
    <motion.div className="space-y-4" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
      {/* Hero recap */}
      <motion.section variants={rise} className={`${card} relative overflow-hidden`}>
        <span className="rx-aurora -top-16 -left-10 size-56 bg-[var(--accent-solid)]" aria-hidden />
        <span className="rx-aurora -bottom-20 right-10 size-64 bg-sky-400" style={{ animationDelay: "-7s" }} aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-green)]"><Sparkles className="size-3" aria-hidden /> Review</span>
              <AnimatePresence mode="wait">
                <motion.span key={stage} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STAGE_TONE[stage]}`}>{STAGE_PILL[stage]}</motion.span>
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <User className="size-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <h2 className="truncate text-xl font-semibold tracking-tight text-[var(--text-primary)]">{inputs.customerName || "Unnamed customer"}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {chips.map(([Icon, text]) => (
                <span key={text} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                  <Icon className="size-3.5 text-[var(--accent-green)]" aria-hidden /> {text}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--text-muted)]">Total payable</div>
            <div className="bg-gradient-to-r from-[var(--accent-solid)] to-[var(--accent-green-light)] bg-clip-text text-3xl font-bold tracking-tight text-transparent tabular-nums">
              <AnimatedNumber value={payable} format={fmtINR} />
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{summary.isDCR ? "After subsidy" : "No subsidy (NDCR)"}</div>
          </div>
        </div>
        {numPanels === 0 && <p className="relative mt-3 text-xs text-amber-600">Fill in the required fields to generate a live BOQ.</p>}
      </motion.section>

      <motion.p variants={rise} className="text-xs text-[var(--text-muted)]">Two ways forward from the same BOQ — use either, or both, in any order.</motion.p>

      <div className="grid gap-4 lg:grid-cols-2">
        <PathCard icon={Database} step="Option A" title="Save BOQ in EnergyBae"
          description="Keep this BOQ in the app so your team can reopen it, link it to the project and send it for approval.">
          {lockedNote && <p className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><Lock className="size-3.5" aria-hidden /> {lockedNote}</p>}
          <div className="mt-auto flex flex-wrap gap-2">{btn("saveDraft")}{btn("finalize", { primary: true })}</div>
          {savedProposals.length > 0 && (
            <select aria-label="Open a saved BOQ" defaultValue=""
              onChange={(e) => { const no = e.target.value; e.target.value = ""; onOpenProposal(no); }}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs cursor-pointer">
              <option value="" disabled>Open another saved BOQ…</option>
              {savedProposals.map((p) => (
                <option key={p.proposal_no} value={p.proposal_no}>
                  {p.proposal_no} — {p.customer_name || "Unnamed"} ({p.status}{p.status === "final" && p.review_status !== "none" ? ` · ${REVIEW_BADGE[p.review_status]}` : ""})
                </option>
              ))}
            </select>
          )}
        </PathCard>

        <PathCard icon={FileText} step="Option B" title="Continue to proposal"
          description="Turn this BOQ into the customer-facing proposal, or download it as an Excel workbook. Saving it in the app stays available here too.">
          <div className="flex flex-wrap gap-2">{btn("proposal", { primary: true })}{btn("excel")}</div>
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
            <span className="text-[11px] text-[var(--text-muted)]">Also keep it in the app:</span>
            {btn("saveDraft", { small: true })}{btn("finalize", { small: true })}
          </div>
        </PathCard>
      </div>

      {/* Shared status + every lifecycle action, so nothing depends on which option you read. */}
      <motion.section variants={rise} className={`${card} space-y-4`} aria-label="BOQ status and actions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">Proposal No.</span>
              <span className="rounded-lg bg-[var(--accent-green)]/10 px-2 py-1 font-mono text-xs font-semibold text-[var(--accent-green)]">{currentProposalNo || "—"}</span>
              <button type="button" onClick={onRegenerateProposalNo} title="Generate a new proposal number (saves as a new proposal)" aria-label="Generate a new proposal number"
                className="rounded-lg border border-[var(--border-subtle)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent-green)] hover:border-[var(--accent-green)]/40 transition cursor-pointer">
                <RefreshCw className="size-3.5" />
              </button>
              <label className="ml-1 inline-flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                Date
                <input type="date" value={proposalDate} onChange={(e) => onProposalDateChange(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]" />
              </label>
              <span className="text-[11px] text-[var(--text-muted)]">{formatProposalDate(proposalDate)}</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={stage} role="status" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className={`text-xs ${stage === "needs_changes" ? "text-amber-500" : stage === "approved" ? "text-[var(--success-text)]" : "text-[var(--text-muted)]"}`}>{STAGE_TEXT[stage]}</motion.div>
            </AnimatePresence>
          </div>
          <div className="flex flex-wrap gap-2">{btn("saveDraft", { small: true })}{btn("finalize", { small: true, primary: true })}{btn("excel", { small: true })}{btn("proposal", { small: true })}</div>
        </div>
        <Lifecycle stage={stage} />
      </motion.section>
    </motion.div>
  );
}
