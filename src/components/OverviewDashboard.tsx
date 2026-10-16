// src/components/OverviewDashboard.tsx
// Overview page. Patterns from 21st.dev, rebuilt on the app's tokens + motion
// (no shadcn/recharts install):
//   • "Stats Card" (@kavikatiyar) + "Number Ticker" (@danielpetho) — KPI cards
//     whose values count up from 0, with a mini monthly bar trend;
//   • "Advanced Stats" (@uilayout) — area chart whose line draws in, with a
//     hover guide + glass tooltip;
//   • a cursor-following spotlight on every card, and a staggered page entrance.
// All numbers are real — the same GET /api/proposals list the Proposal Maker
// uses, aggregated in the pure, tested overviewStats.ts. Honours the OS
// "reduce motion" setting via MotionConfig.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, MotionConfig, animate, useInView, AnimatePresence } from "motion/react";
import { FileText, CheckCircle2, IndianRupee, Clock, FileScan, Plus, Sparkles, TrendingUp, TrendingDown, Minus, CalendarDays } from "lucide-react";
import { computeOverviewStats, formatINRCompact, timeAgo, OverviewProposal } from "../overviewStats";

interface Props {
  userName: string;
  onAnalyseBill: () => void;
  onTrySample: () => void;
  onNewProposal: () => void;
  /** The product workflow map, rendered under the greeting. */
  workflow?: React.ReactNode;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

function initialsOf(name: string | null) {
  return (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
// Stable per-person avatar tint so the feed is scannable.
const AVATAR_TINTS = ["bg-violet-500/15 text-violet-400", "bg-sky-500/15 text-sky-400", "bg-emerald-500/15 text-emerald-400", "bg-amber-500/15 text-amber-400", "bg-pink-500/15 text-pink-400"];
function tintFor(name: string | null) {
  const s = name || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

// ── Count-up (Number Ticker) ───────────────────────────────────────────────
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    const controls = animate(0, value, { duration: 1.1, ease: EASE, onUpdate: (v) => { el.textContent = format(v); } });
    return () => controls.stop();
  }, [inView, value, format]);
  return <span ref={ref}>{format(0)}</span>;
}

// ── Card with cursor-following spotlight ───────────────────────────────────
function SpotlightCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <motion.div
      ref={ref}
      variants={rise}
      onMouseMove={onMove}
      className={`group relative overflow-hidden glass-panel rounded-2xl ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: "radial-gradient(420px circle at var(--mx) var(--my), color-mix(in srgb, var(--accent-green) 12%, transparent), transparent 60%)" }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

// ── Area chart ─────────────────────────────────────────────────────────────
// Drawn in real pixels (ResizeObserver) so dots stay round; smooth curve with
// midpoint control points, which never overshoots below zero.
function AreaTrend({ data }: { data: { label: string; count: number }[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 220, PX = 28, PT = 20, PB = 34;
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = (w - PX * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => ({ x: PX + i * step, y: PT + (1 - d.count / max) * (H - PT - PB), ...d }));
  const line = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = pts[i - 1];
    const mx = (prev.x + p.x) / 2;
    return `${acc} C${mx},${prev.y} ${mx},${p.y} ${p.x},${p.y}`;
  }, "");
  const base = H - PB;
  const area = `${line} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z`;

  const onMove = (e: React.MouseEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const i = Math.round((e.clientX - r.left - PX) / step);
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };
  const hp = hover !== null ? pts[hover] : null;

  return (
    <div ref={wrap} className="relative w-full select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} className="block" role="img" aria-label="Proposals per month">
        <defs>
          <linearGradient id="ovArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-green)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--accent-green)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ovLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={PX} x2={w - PX} y1={PT + f * (H - PT - PB)} y2={PT + f * (H - PT - PB)} stroke="var(--border-subtle)" strokeDasharray="4 4" />
        ))}
        <motion.path d={area} fill="url(#ovArea)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }} />
        <motion.path
          d={line} fill="none" stroke="url(#ovLine)" strokeWidth={2.5} strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: EASE, delay: 0.2 }}
        />
        {hp && <line x1={hp.x} x2={hp.x} y1={PT} y2={base} stroke="var(--accent-green)" strokeOpacity={0.4} strokeDasharray="3 3" />}
        {pts.map((p, i) => (
          <motion.circle
            key={i} cx={p.x} cy={p.y} fill="var(--bg-card)" stroke="var(--accent-green)" strokeWidth={2}
            initial={{ r: 0 }} animate={{ r: hover === i ? 6 : 3.5 }}
            transition={{ type: "spring", stiffness: 400, damping: 20, delay: hover === null ? 0.4 + i * 0.12 : 0 }}
          />
        ))}
        {pts.map((p) => (
          <text key={p.label} x={p.x} y={H - 10} textAnchor="middle" className="fill-[var(--text-muted)] text-[12px]">{p.label}</text>
        ))}
      </svg>
      <AnimatePresence>
        {hp && (
          <motion.div
            key="tip"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, left: hp.x, top: hp.y }} exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="glass-popover pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg px-3 py-1.5 text-center whitespace-nowrap"
          >
            <p className="text-[11px] text-[var(--text-muted)]">{hp.label}</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{hp.count} proposal{hp.count === 1 ? "" : "s"}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Tiny monthly bars inside a stat card.
function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1 h-8" aria-hidden>
      {values.map((v, i) => (
        <motion.span
          key={i}
          className={`w-1.5 rounded-sm ${i === values.length - 1 ? "bg-[var(--accent-green)]" : "bg-[var(--accent-green)]/30"}`}
          initial={{ height: 2 }} animate={{ height: Math.max(2, (v / max) * 32) }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.3 + i * 0.06 }}
        />
      ))}
    </div>
  );
}

export default function OverviewDashboard({ userName, onAnalyseBill, onTrySample, onNewProposal, workflow }: Props) {
  const [proposals, setProposals] = useState<OverviewProposal[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/proposals")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProposals(d.proposals ?? []))
      .catch(() => setError(true));
  }, []);

  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => (proposals ? computeOverviewStats(proposals, now) : null), [proposals, now]);
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  // Month-over-month change for the chart header (real, from the monthly buckets).
  const thisMonth = stats?.monthly[stats.monthly.length - 1]?.count ?? 0;
  const lastMonth = stats?.monthly[stats.monthly.length - 2]?.count ?? 0;
  const delta = thisMonth - lastMonth;

  const intFmt = (n: number) => Math.round(n).toLocaleString("en-IN");
  const statCards = stats
    ? [
        { label: "Total proposals", value: stats.total, fmt: intFmt, hint: `${stats.updatedThisMonth} updated this month`, icon: FileText, tint: "bg-violet-500/15 text-violet-400", bars: stats.monthly.map((m) => m.count) },
        { label: "Finalised", value: stats.finalCount, fmt: intFmt, hint: `${stats.draftCount} draft${stats.draftCount === 1 ? "" : "s"} in progress`, icon: CheckCircle2, tint: "bg-emerald-500/15 text-emerald-400" },
        { label: "Pipeline value", value: stats.pipelineValue, fmt: formatINRCompact, hint: "Across all proposals", icon: IndianRupee, tint: "bg-sky-500/15 text-sky-400" },
        { label: "Awaiting review", value: stats.awaitingReview, fmt: intFmt, hint: `${stats.approved} approved so far`, icon: Clock, tint: "bg-amber-500/15 text-amber-400" },
      ]
    : [];

  const pipeline = stats
    ? [
        { label: "Approved", count: stats.approved, bar: "bg-emerald-500" },
        { label: "Needs changes", count: stats.needsChanges, bar: "bg-amber-500" },
        { label: "Awaiting review", count: stats.awaitingReview, bar: "bg-[var(--accent-green)]" },
        { label: "Drafts", count: stats.draftCount, bar: "bg-[var(--text-muted)]" },
      ]
    : [];

  const secondaryBtn =
    "h-9 px-3.5 inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] hover:-translate-y-0.5 transition-all cursor-pointer";

  return (
    <MotionConfig reducedMotion="user">
      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
        {/* Header */}
        <motion.div variants={rise} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
              <CalendarDays className="w-3.5 h-3.5" /> {today}
            </p>
            <h2 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
              {greeting}, <span className="ba-gradient-text">{userName.split(" ")[0]}</span>
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">Here's where your solar pipeline stands today.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onTrySample} className={secondaryBtn}>
              <Sparkles className="w-4 h-4 text-[var(--text-muted)]" /> Try sample bill
            </button>
            <button type="button" onClick={onAnalyseBill} className={secondaryBtn}>
              <FileScan className="w-4 h-4 text-[var(--text-muted)]" /> Analyse a bill
            </button>
            <button type="button" onClick={onNewProposal}
              className="h-9 px-3.5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white shadow-lg shadow-[color-mix(in_srgb,var(--accent-solid)_35%,transparent)] hover:-translate-y-0.5 transition-all cursor-pointer">
              <Plus className="w-4 h-4" /> New proposal
            </button>
          </div>
        </motion.div>

        {workflow && <motion.div variants={rise}>{workflow}</motion.div>}

        {error && (
          <motion.div variants={rise} className="glass-panel rounded-2xl p-6 text-sm text-[var(--text-muted)]">
            Couldn't load proposal data right now. The rest of the app still works — try refreshing in a moment.
          </motion.div>
        )}

        {/* KPI cards */}
        <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats
            ? statCards.map((c) => (
                <SpotlightCard key={c.label} className="p-5 hover:-translate-y-1 transition-transform duration-300">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text-secondary)]">{c.label}</span>
                    <span className={`size-9 rounded-xl grid place-items-center ${c.tint}`}><c.icon className="w-[18px] h-[18px]" aria-hidden /></span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-3xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)]">
                      <CountUp value={c.value} format={c.fmt} />
                    </p>
                    {c.bars && <MiniBars values={c.bars} />}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">{c.hint}</p>
                </SpotlightCard>
              ))
            : Array.from({ length: 4 }, (_, i) => (
                <motion.div key={i} variants={rise} className="glass-panel rounded-2xl p-5 animate-pulse space-y-3">
                  <div className="h-4 w-24 rounded bg-[var(--hover-bg)]" />
                  <div className="h-8 w-16 rounded bg-[var(--hover-bg)]" />
                  <div className="h-3 w-32 rounded bg-[var(--hover-bg)]" />
                </motion.div>
              ))}
        </motion.div>

        {/* Trend */}
        <SpotlightCard className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Proposal activity</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">Proposals saved or updated per month, last 6 months</p>
            </div>
            {stats && (
              <div className="text-right">
                <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{thisMonth}<span className="text-sm font-normal text-[var(--text-muted)]"> this month</span></p>
                <span className={`mt-1 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                  delta > 0 ? "bg-emerald-500/10 text-emerald-500" : delta < 0 ? "bg-red-500/10 text-red-500" : "bg-[var(--hover-bg)] text-[var(--text-muted)]"
                }`}>
                  {delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                  {delta > 0 ? "+" : ""}{delta} vs last month
                </span>
              </div>
            )}
          </div>
          <div className="mt-4">
            {stats ? <AreaTrend data={stats.monthly} /> : <div className="h-[220px] rounded-lg bg-[var(--hover-bg)] animate-pulse" />}
          </div>
        </SpotlightCard>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Review pipeline */}
          <SpotlightCard className="p-6">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Review pipeline</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">Where every proposal currently stands</p>
            {stats && stats.total > 0 && (
              // Stacked overview bar — every segment grows in from the left.
              <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-[var(--hover-bg)]">
                {pipeline.map((row, i) => (
                  <motion.span
                    key={row.label} className={row.bar}
                    initial={{ width: 0 }} animate={{ width: `${(row.count / stats.total) * 100}%` }}
                    transition={{ duration: 0.8, ease: EASE, delay: 0.3 + i * 0.1 }}
                  />
                ))}
              </div>
            )}
            <div className="mt-5 space-y-4">
              {pipeline.map((row, i) => {
                const pct = stats && stats.total ? Math.round((row.count / stats.total) * 100) : 0;
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]"><span className={`size-2 rounded-full ${row.bar}`} />{row.label}</span>
                      <span className="text-[var(--text-muted)] tabular-nums">{row.count} · {pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--hover-bg)] overflow-hidden">
                      <motion.div className={`h-full rounded-full ${row.bar}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.4 + i * 0.1 }} />
                    </div>
                  </div>
                );
              })}
              {!stats && <div className="h-40 rounded-lg bg-[var(--hover-bg)] animate-pulse" />}
            </div>
          </SpotlightCard>

          {/* Recent activity — timeline */}
          <SpotlightCard className="p-6">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Recent activity</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">Latest proposals saved by your team</p>
            <motion.ol variants={stagger} initial="hidden" animate="show" className="relative mt-5">
              {proposals && proposals.length === 0 && (
                <li className="text-sm text-[var(--text-muted)]">No proposals yet — create your first one with “New proposal”.</li>
              )}
              {(proposals ?? []).slice(0, 6).map((p, i, arr) => (
                <motion.li
                  key={p.proposal_no}
                  variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE } } }}
                  className="relative flex items-start gap-3 rounded-xl p-2 -mx-2 hover:bg-[var(--hover-bg)] transition-colors"
                >
                  {i < arr.length - 1 && <span aria-hidden className="absolute left-[23px] top-11 bottom-[-8px] w-px bg-[var(--border-subtle)]" />}
                  <div className={`relative z-10 size-8 rounded-full text-xs font-semibold grid place-items-center shrink-0 ${tintFor(p.created_by_name)}`}>
                    {initialsOf(p.created_by_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-[var(--text-primary)]">
                      <span className="font-medium">{p.created_by_name || "Someone"}</span>{" "}
                      <span className="text-[var(--text-muted)]">saved</span>{" "}
                      <span className="font-medium">{p.customer_name || "Untitled"}</span>
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {p.proposal_no} · {timeAgo(p.updated_at, now)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.status === "final" ? "bg-emerald-500/10 text-emerald-500" : "bg-[var(--hover-bg)] text-[var(--text-secondary)]"
                  }`}>
                    {p.status === "final" ? "Final" : "Draft"}
                  </span>
                </motion.li>
              ))}
              {!proposals && !error && Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex gap-3 animate-pulse py-2">
                  <div className="size-8 rounded-full bg-[var(--hover-bg)]" />
                  <div className="flex-1 space-y-2"><div className="h-3.5 w-3/4 rounded bg-[var(--hover-bg)]" /><div className="h-3 w-1/2 rounded bg-[var(--hover-bg)]" /></div>
                </li>
              ))}
            </motion.ol>
          </SpotlightCard>
        </div>
      </motion.div>
    </MotionConfig>
  );
}
