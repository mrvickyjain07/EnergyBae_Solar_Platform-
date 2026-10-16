// src/components/BillAnalysisHero.tsx
// Hero for the Bill Analysis page: headline, a dusk-graded rooftop photo, an
// "Extract key details" pill that jumps to the upload box, and a progress card
// that tracks the REAL flow (choose type → upload → review) rather than a
// decorative bar.
//
// Copy is kept to what the product actually does: extraction is tuned for
// MSEDCL bills, so the pill says so (not "all DISCOMs").
import React from "react";
import { motion, type Variants } from "motion/react";
import { Zap, ChevronRight, Sparkles, FileText } from "lucide-react";
import heroPhoto from "../modules/proposal/assets/proposal-header-banner.jpg";

const STEP_LABELS = ["Choose the bill type", "Upload your bill", "Review the extracted data"] as const;

interface Props {
  /** 1 = choose type, 2 = file picked, 3 = results shown. */
  step: 1 | 2 | 3;
  onJumpToUpload: () => void;
  /** When set, a compact "Try sample bill" action sits under the copy (it
   *  used to be its own card below the upload box — moved here so the
   *  whole page fits one screen). */
  onTrySample?: () => void;
  sampleDisabled?: boolean;
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};
export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

export default function BillAnalysisHero({ step, onJumpToUpload, onTrySample, sampleDisabled }: Props) {
  return (
    <motion.section variants={stagger} initial="hidden" animate="show" className="grid lg:grid-cols-[1fr_1.05fr] gap-5 items-center">
      {/* Copy */}
      <div>
        <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Bill analysis
        </motion.p>
        <motion.h2 variants={fadeUp} className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight leading-[1.15] text-[var(--text-primary)]">
          Analyze Electricity Bills <span className="ba-gradient-text">with AI</span>
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          Choose the bill type, upload it, and review what AI extracted — every field stays editable.
        </motion.p>
        {onTrySample && (
          <motion.button
            variants={fadeUp}
            type="button"
            onClick={onTrySample}
            disabled={sampleDisabled}
            className="mt-3 h-8 px-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" /> No bill handy? Try the sample
          </motion.button>
        )}
      </div>

      {/* Photo panel */}
      <motion.div variants={fadeUp} className="relative h-40 sm:h-44 rounded-2xl overflow-hidden">
        <img src={heroPhoto} alt="" className="ba-photo ba-kenburns absolute inset-0 w-full h-full object-cover" />
        {/* Dusk grade: indigo sky fading to a warm horizon glow. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1e1b4b]/60 via-[#4c1d95]/20 to-[#f97316]/25 mix-blend-multiply" aria-hidden />
        {/* Melt the photo's left edge into the page. */}
        <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-[var(--bg-primary)] to-transparent" aria-hidden />

        <button
          type="button"
          onClick={onJumpToUpload}
          className="glass-popover absolute top-3 left-3 sm:left-6 flex items-center gap-2.5 rounded-xl pl-1.5 pr-2.5 py-1.5 text-left cursor-pointer hover:-translate-y-0.5 transition-transform"
        >
          <span className="size-8 rounded-full bg-emerald-500/15 grid place-items-center">
            <Zap className="w-4 h-4 text-emerald-400" fill="currentColor" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-medium text-[var(--text-primary)]">Extract key details in seconds</span>
            <span className="block text-xs text-[var(--text-muted)]">Built for MSEDCL bills</span>
          </span>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
        </button>

        {/* Live flow progress — not decoration. */}
        <div className="glass-popover hidden sm:block absolute bottom-3 right-3 w-52 rounded-2xl p-3 overflow-hidden">
          <div className="flex items-center gap-2.5">
            <div className="relative size-8 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center shadow-lg shadow-violet-500/30">
              <Zap className="w-4 h-4 text-white" fill="currentColor" />
              <Sparkles className="ba-glow absolute -top-1.5 -right-1.5 w-3 h-3 text-violet-200" />
            </div>
            <p className="text-xs font-medium leading-snug text-[var(--text-primary)]">Turn electricity bills into better solar opportunities</p>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-[var(--hover-bg)] overflow-hidden" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label="Bill analysis progress">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" animate={{ width: `${(step / 3) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">Step {step} of 3 · {STEP_LABELS[step - 1]}</p>
          {/* Rolling green hills, looping sideways. */}
          <svg className="absolute -bottom-2 left-0 w-[200%] h-10 ba-wave opacity-70" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden>
            {/* Two identical halves, so the -50% slide loops with no seam. */}
            <path d="M0 28 C 40 10, 80 10, 100 24 S 160 38, 200 28 C 240 10, 280 10, 300 24 S 360 38, 400 28 V40 H0Z" fill="url(#ba-hill)" />
            <defs>
              <linearGradient id="ba-hill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity=".55" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </motion.div>
    </motion.section>
  );
}
