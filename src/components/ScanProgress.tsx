// src/components/ScanProgress.tsx
// The "reading your bill" state, shared by the residential and commercial
// scans. Combines three 21st.dev patterns, rebuilt on the app's tokens:
//   • "Analyzing Image" (@loading-ui) — a scanner beam sweeping over the
//     user's OWN uploaded bill (not a generic spinner), with corner brackets;
//   • "AI Text Loading" (@kokonutd) — the active step shimmering;
//   • "Task Steps" (@ddoemonn) — a vertical checklist joined by a line, with
//     pending / active / done states.
// Plus an elapsed-time counter, so a slow AI call reads as "still working"
// rather than a frozen screen.
//
// Step states come from the pure, tested scanSteps.ts.
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, FileText } from "lucide-react";
import { stepStates, ScanStep } from "../scanSteps";

export type { ScanStep };

interface Props {
  title: string;
  steps: ScanStep[];
  progress: number;
  /** A data URL of the bill. Images are shown with the scan beam over them;
   *  anything else (PDF) falls back to a document icon under the beam. */
  preview?: string | null;
  fileName?: string | null;
}

export default function ScanProgress({ title, steps, progress, preview, fileName }: Props) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const states = stepStates(steps, progress);
  const activeIdx = states.indexOf("active");
  const activeLabel = activeIdx >= 0 ? steps[activeIdx].label : "Finishing up";
  const isImage = !!preview && preview.startsWith("data:image");
  const pct = Math.min(100, Math.round(progress));

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8" role="status" aria-live="polite" aria-label={`${title}: ${activeLabel}, ${pct}%`}>
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* Document being scanned */}
        <div className="relative mx-auto md:mx-0 w-40 h-52 shrink-0 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          {isImage ? (
            <img src={preview!} alt="" className="absolute inset-0 w-full h-full object-cover object-top opacity-80" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
              <FileText className="w-10 h-10" />
              <div className="space-y-1.5 w-24">
                {[100, 80, 90, 60].map((w, i) => (
                  <div key={i} className="h-1.5 rounded-full bg-[var(--border-subtle)]" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          )}
          <div className="scan-beam" aria-hidden />
          {/* Viewfinder corners */}
          {["top-2 left-2 border-t-2 border-l-2", "top-2 right-2 border-t-2 border-r-2", "bottom-2 left-2 border-b-2 border-l-2", "bottom-2 right-2 border-b-2 border-r-2"].map((c) => (
            <span key={c} aria-hidden className={`absolute w-4 h-4 rounded-[3px] border-[var(--accent-green)] ${c}`} />
          ))}
        </div>

        {/* Status + steps */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeLabel}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="shimmer-text text-sm font-medium mt-0.5 truncate"
                >
                  {activeLabel}…
                </motion.p>
              </AnimatePresence>
              {fileName && <p className="text-xs text-[var(--text-muted)] mt-1 truncate">{fileName}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{pct}%</p>
              <p className="text-xs text-[var(--text-muted)] tabular-nums">{elapsed}s elapsed</p>
            </div>
          </div>

          <div className="mt-4 h-1.5 w-full rounded-full bg-[var(--hover-bg)] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[var(--accent-green)]"
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 24 }}
            />
          </div>

          {/* Vertical task checklist */}
          <ol className="mt-5">
            {steps.map((s, i) => {
              const st = states[i];
              const last = i === steps.length - 1;
              return (
                <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
                  {!last && (
                    <span aria-hidden className="absolute left-[11px] top-6 bottom-0 w-px bg-[var(--border-subtle)]">
                      <motion.span
                        className="block w-full bg-emerald-500 origin-top"
                        initial={false}
                        animate={{ scaleY: st === "done" ? 1 : 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        style={{ height: "100%" }}
                      />
                    </span>
                  )}
                  <span className="relative z-10 mt-0.5 size-6 shrink-0 grid place-items-center">
                    <AnimatePresence mode="wait" initial={false}>
                      {st === "done" ? (
                        <motion.span
                          key="done"
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 22 }}
                          className="size-6 rounded-full bg-emerald-500 text-white grid place-items-center"
                        >
                          <Check className="size-3.5" strokeWidth={3} />
                        </motion.span>
                      ) : st === "active" ? (
                        <motion.span key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative size-6 grid place-items-center">
                          <span className="absolute inset-0 rounded-full bg-[var(--accent-green)]/20 animate-ping" />
                          <span className="size-6 rounded-full border-2 border-[var(--accent-green)]/30 border-t-[var(--accent-green)] animate-spin" />
                        </motion.span>
                      ) : (
                        <motion.span key="pending" className="size-6 rounded-full border-2 border-[var(--border-strong)] bg-[var(--bg-card)]" />
                      )}
                    </AnimatePresence>
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={`text-sm ${st === "pending" ? "text-[var(--text-muted)]" : "text-[var(--text-primary)] font-medium"}`}>{s.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {st === "done" ? "Done" : st === "active" ? "In progress" : "Waiting"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
