// src/modules/projects/StageCelebration.tsx
// A short greeting when a project changes stage — a confetti burst whose size
// grows with the milestone (Won / Completed get a full shower), a calm card for
// Lost. Particles are plain motion divs (the 21st.dev "motion confetti"
// pattern) so it needs no confetti library; with reduced motion only the card
// fades in. It never blocks the page: click, Esc, or wait and it's gone.
import React, { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Inbox, MapPin, FileText, Trophy, Wrench, PartyPopper, CloudRain, type LucideIcon } from "lucide-react";
import type { ProjectStatus } from "./projectRules";
import { STAGE_COLOR } from "./ProjectsPage";

export interface Celebration { stage: ProjectStatus; projectName: string; unlocked: string[] }

const GREETING: Record<ProjectStatus, { title: string; line: string; icon: LucideIcon; burst: number; rain: number }> = {
  lead: { title: "New enquiry", line: "Every big plant starts with a conversation.", icon: Inbox, burst: 16, rain: 0 },
  site_visit: { title: "Site visit on!", line: "Time to measure the roof and check the shade.", icon: MapPin, burst: 24, rain: 0 },
  proposal: { title: "Proposal time", line: "Build the BOQ and send a sharp quote.", icon: FileText, burst: 30, rain: 0 },
  won: { title: "Project won! 🎉", line: "Great work — the customer said yes.", icon: Trophy, burst: 56, rain: 48 },
  installation: { title: "Installation underway", line: "Panels are going up. Safety first!", icon: Wrench, burst: 30, rain: 0 },
  completed: { title: "Project completed! ☀️", line: "Another rooftop generating clean power.", icon: PartyPopper, burst: 56, rain: 48 },
  lost: { title: "Marked as lost", line: "Not this time — note what you learned and move on.", icon: CloudRain, burst: 0, rain: 0 },
};
const PALETTE = ["#f59e0b", "#10b981", "#7c3aed", "#0ea5e9", "#ec4899", "#facc15"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function Particles({ burst, rain, color }: { burst: number; rain: number; color: string }) {
  const parts = useMemo(() => [
    ...Array.from({ length: burst }, () => {
      const angle = rnd(0, Math.PI * 2), dist = rnd(120, 340);
      return { kind: "burst" as const, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.75, left: "50%", top: "50%", delay: rnd(0, 0.12), dur: rnd(1.3, 2) };
    }),
    ...Array.from({ length: rain }, () => ({ kind: "rain" as const, x: rnd(-60, 60), y: rnd(70, 100) * (typeof window === "undefined" ? 8 : window.innerHeight / 100), left: `${rnd(0, 100)}%`, top: "-4%", delay: rnd(0, 0.9), dur: rnd(2.2, 3.4) })),
  ].map((p, i) => ({ ...p, color: i % 3 === 0 ? color : PALETTE[i % PALETTE.length], w: rnd(6, 11), round: i % 4 === 0, strip: i % 5 === 0, spin: rnd(-540, 540) })), [burst, rain, color]);

  return (
    <>
      {parts.map((p, i) => (
        <motion.span key={i} aria-hidden className="absolute block"
          style={{ left: p.left, top: p.top, width: p.strip ? p.w * 0.45 : p.w, height: p.strip ? p.w * 1.8 : p.w, background: p.color, borderRadius: p.round ? "50%" : 2 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: p.kind === "burst" ? 0.4 : 1 }}
          animate={p.kind === "burst"
            ? { x: p.x, y: [0, p.y, p.y + 160], rotate: p.spin, opacity: [1, 1, 0], scale: 1 }
            : { x: [0, p.x, -p.x / 2], y: p.y, rotate: p.spin, opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: p.kind === "burst" ? [0.15, 0.8, 0.3, 1] : "linear", times: [0, 0.6, 1] }} />
      ))}
    </>
  );
}

export default function StageCelebration({ celebration, onDone }: { celebration: Celebration | null; onDone: () => void }) {
  const reduce = useReducedMotion();
  // Parents pass an inline onDone; keep the latest in a ref so their re-renders don't restart the timer.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!celebration) return;
    const big = celebration.stage === "won" || celebration.stage === "completed";
    const t = setTimeout(() => done.current(), big ? 3800 : 2600);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") done.current(); };
    window.addEventListener("keydown", esc);
    return () => { clearTimeout(t); window.removeEventListener("keydown", esc); };
  }, [celebration]);

  return (
    <AnimatePresence>
      {celebration && (() => {
        const g = GREETING[celebration.stage];
        const c = STAGE_COLOR[celebration.stage];
        const big = g.rain > 0;
        const Icon = g.icon;
        return (
          <motion.div key={celebration.stage + celebration.projectName} role="status" aria-live="polite" onClick={onDone}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] grid place-items-center overflow-hidden cursor-pointer"
            style={{ background: big ? `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${c} 22%, transparent), rgba(17,24,39,.35) 70%)` : "transparent" }}>
            {!reduce && <Particles burst={g.burst} rain={g.rain} color={c} />}
            <motion.div initial={{ scale: 0.6, y: 24, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}
              className="relative w-[min(92vw,380px)] rounded-3xl bg-[var(--bg-card)] border shadow-2xl px-7 pt-9 pb-7 text-center"
              style={{ borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, boxShadow: `0 30px 80px -20px color-mix(in srgb, ${c} 55%, transparent)` }}>
              <div className="relative mx-auto w-20 h-20 grid place-items-center">
                {!reduce && celebration.stage !== "lost" && [0, 1].map((k) => (
                  <motion.span key={k} aria-hidden className="absolute inset-0 rounded-full" style={{ border: `2px solid ${c}` }}
                    initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 1.4, delay: k * 0.45, repeat: Infinity }} />
                ))}
                <motion.span className="w-20 h-20 rounded-full grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 65%, #000))` }}
                  initial={{ rotate: -30, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.1 }}>
                  <Icon className="w-9 h-9" aria-hidden />
                </motion.span>
              </div>
              <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className={`mt-5 font-bold tracking-tight text-[var(--text-primary)] ${big ? "text-2xl" : "text-xl"}`}>{g.title}</motion.h2>
              <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
                className="mt-1 text-sm font-medium" style={{ color: c }}>{celebration.projectName}</motion.p>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.36 }}
                className="mt-2 text-sm text-[var(--text-muted)]">{g.line}</motion.p>
              {celebration.unlocked.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {celebration.unlocked.map((u) => (
                    <span key={u} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>🔓 {u} unlocked</span>
                  ))}
                </motion.div>
              )}
              {/* Time-left bar */}
              <motion.span aria-hidden className="absolute left-6 right-6 bottom-3 h-0.5 rounded-full origin-left" style={{ background: c }}
                initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: big ? 3.8 : 2.6, ease: "linear" }} />
            </motion.div>
          </motion.div>
        );
      })()}
    </AnimatePresence>
  );
}
