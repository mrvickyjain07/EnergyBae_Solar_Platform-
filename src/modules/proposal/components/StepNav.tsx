// 4-step nav for the calculator, adapted from 21st.dev's "Animated Progress
// Stepper" (shadcnspace/stepper-03) onto this app's tokens — no shadcn deps.
// All steps stay clickable: there's no completion-gating (validate() runs at
// save/export time), so a tick means "required fields filled", not "unlocked".
import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { User, Sliders, ClipboardList as BOQIcon, CheckCircle2, Check, ChevronLeft, ChevronRight } from "lucide-react";

// Pricing & Subsidy lives inside the BOQ step (BoqGeneration's tabs).
export type CalcStep = "customer" | "system" | "boq" | "review";

const CALC_STEPS: { id: CalcStep; label: string; hint: string; icon: typeof User }[] = [
  { id: "customer", label: "Customer & Proposal", hint: "Who it's for", icon: User },
  { id: "system", label: "System Configuration", hint: "Capacity, panels, inverter", icon: Sliders },
  { id: "boq", label: "BOQ & Pricing", hint: "Materials and commercials", icon: BOQIcon },
  { id: "review", label: "Review & Export", hint: "Save, export, share", icon: CheckCircle2 },
];

/** Step labels for the header breadcrumb and search palette. */
export const STEP_LABELS: Record<CalcStep, string> = Object.fromEntries(CALC_STEPS.map((s) => [s.id, s.label])) as Record<CalcStep, string>;
export const CALC_STEP_LIST = CALC_STEPS.map(({ id, label }) => ({ id, label }));
const ORDER = CALC_STEPS.map((s) => s.id);

interface Props {
  current: CalcStep;
  onSelect: (step: CalcStep) => void;
  /** Steps whose required fields are filled — shown with a tick. */
  done?: Partial<Record<CalcStep, boolean>>;
}

export default function StepNav({ current, onSelect, done = {} }: Props) {
  const reduce = useReducedMotion();
  const idx = ORDER.indexOf(current);
  const progress = idx / (ORDER.length - 1);
  const edge = `${50 / ORDER.length}%`;

  return (
    <nav aria-label="Proposal steps" className="glass-panel rounded-2xl px-4 pt-5 pb-4">
      <div className="relative">
        <div className="absolute top-5 h-0.5 bg-[var(--border-subtle)]" style={{ left: edge, right: edge }} />
        <motion.div className="absolute top-5 h-0.5 origin-left bg-[var(--accent-solid)]" style={{ left: edge, right: edge }}
          initial={false} animate={{ scaleX: progress }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        <ol className="relative flex items-start justify-between">
          {CALC_STEPS.map((s, i) => {
            const active = i === idx;
            const ticked = !active && !!done[s.id];
            const Icon = s.icon;
            return (
              <li key={s.id} className="flex flex-1 flex-col items-center gap-2 text-center min-w-0">
                <button type="button" onClick={() => onSelect(s.id)} aria-current={active ? "step" : undefined} aria-label={`${s.label} step${ticked ? " (complete)" : ""}`}
                  className="group relative z-10 grid size-10 place-items-center rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2">
                  <span className={`absolute inset-0 rounded-full transition-colors duration-300 ${active ? "bg-[var(--accent-solid)]" : ticked ? "bg-[color-mix(in_srgb,var(--accent-green)_15%,var(--bg-surface))]" : "bg-[var(--hover-bg)] group-hover:bg-[var(--border-subtle)]"}`} />
                  {active && !reduce && (
                    <motion.span className="absolute inset-0 rounded-full ring-2 ring-[var(--accent-green)]/50"
                      animate={{ scale: [1, 1.35, 1], opacity: [1, 0.2, 1] }} transition={{ duration: 2.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }} />
                  )}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={ticked ? "check" : "icon"} className="relative"
                      initial={{ scale: 0, opacity: 0, rotate: ticked ? -90 : 0 }} animate={{ scale: active ? 1.1 : 1, opacity: 1, rotate: 0 }} exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 22 }}>
                      {ticked
                        ? <Check className="size-5 text-[var(--accent-green)]" strokeWidth={3} />
                        : <Icon className={`size-[18px] ${active ? "text-white" : "text-[var(--text-muted)]"}`} />}
                    </motion.span>
                  </AnimatePresence>
                </button>
                <span className="min-w-0 px-1">
                  <span className={`block truncate text-xs font-semibold transition-colors ${active ? "text-[var(--accent-green)]" : "text-[var(--text-primary)]"}`}>{s.label}</span>
                  <span className="hidden sm:block truncate text-[11px] text-[var(--text-muted)]">{s.hint}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

/** Back / Continue footer for the input steps. */
export function StepFooter({ current, onSelect }: { current: CalcStep; onSelect: (step: CalcStep) => void }) {
  const i = ORDER.indexOf(current);
  const btn = "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" disabled={i === 0} onClick={() => onSelect(ORDER[i - 1])}
        className={`${btn} border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]`}>
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <span className="text-xs text-[var(--text-muted)]">Step {i + 1} of {ORDER.length}</span>
      <button type="button" disabled={i === ORDER.length - 1} onClick={() => onSelect(ORDER[i + 1])}
        className={`${btn} bg-[var(--accent-solid)] text-white hover:brightness-110`}>
        Continue to {STEP_LABELS[ORDER[Math.min(i + 1, ORDER.length - 1)]]} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
