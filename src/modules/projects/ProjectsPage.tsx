// src/modules/projects/ProjectsPage.tsx
// Projects index: every opportunity with its customer, total capacity across
// all its solar systems, and linked proposals. Real data from GET /api/projects.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, FolderKanban, Building2, Sun, RefreshCw, ChevronRight, Archive, Columns3, Table2, Clock, Lock, Check, Sparkles } from "lucide-react";
import EmptyState from "../../components/ui/EmptyState";
import { primaryBtn } from "../../components/ui/Dialog";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import AnimatedNumber from "../../components/AnimatedNumber";
import { useAuth } from "../../contexts/AuthContext";
import { timeAgo } from "../../overviewStats";
import { api, ProjectListItem } from "./api";
import { CUSTOMER_TYPES, PROJECT_STATUSES, ProjectStatus, STAGE_ACTIONS, isUnlocked, stageUnlocks } from "./projectRules";
import { ProjectDialog } from "./ProjectDialogs";
import StageCelebration, { type Celebration } from "./StageCelebration";

export const STATUS_STYLE: Record<ProjectStatus, string> = {
  lead: "bg-[var(--hover-bg)] text-[var(--text-secondary)]",
  site_visit: "bg-sky-500/10 text-sky-600",
  proposal: "bg-[var(--accent-green)]/10 text-[var(--accent-green)]",
  won: "bg-emerald-500/10 text-[var(--success-text)]",
  installation: "bg-violet-500/10 text-violet-600",
  completed: "bg-[var(--solar)]/12 text-[var(--solar-text)]",
  lost: "bg-red-500/10 text-red-500",
};
export const statusLabel = (s: ProjectStatus) => PROJECT_STATUSES.find((x) => x.value === s)?.label ?? s;

/** Per-stage accent, used for lane bars, the stage strip and card stripes. */
export const STAGE_COLOR: Record<ProjectStatus, string> = {
  lead: "#64748b", site_visit: "#0ea5e9", proposal: "#7c3aed", won: "#10b981",
  installation: "#6366f1", completed: "#f59e0b", lost: "#ef4444",
};
const TYPE_BADGE: Record<string, string> = {
  INDIVIDUAL_HOUSE: "bg-amber-500/10 text-amber-700",
  RESIDENTIAL_SOCIETY: "bg-sky-500/10 text-sky-700",
  COMMERCIAL: "bg-rose-500/10 text-rose-600",
  INDUSTRIAL: "bg-slate-500/10 text-slate-600",
};
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
const kwSum = (ps: ProjectListItem[]) => Math.round(ps.reduce((s, p) => s + p.totalKw, 0) * 100) / 100;
const spring = { type: "spring", stiffness: 380, damping: 32 } as const;
const ARROW = "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%";

/**
 * Kanban pipeline: drag a card to another lane to change its stage (native
 * HTML5 drag-and-drop — no dnd library; keyboard users change stage from the
 * project's stage tracker or the Table view). Cards glide between lanes via a
 * shared layoutId; each shows what its stage has unlocked (STAGE_ACTIONS).
 */
function PipelineBoard({ rows, canMove, onMove, onOpen, celebrateId }: {
  rows: ProjectListItem[];
  canMove: boolean;
  onMove: (p: ProjectListItem, to: ProjectStatus) => void;
  onOpen: (id: string) => void;
  celebrateId: string | null;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<ProjectStatus | null>(null);
  const laneRefs = useRef<Partial<Record<ProjectStatus, HTMLElement | null>>>({});
  const now = new Date();
  const dragging = rows.find((r) => r.id === dragId);

  return (
    <MotionConfig reducedMotion="user">
      {/* Step-by-step stage strip — click a step to jump to its lane. */}
      <ol className="flex gap-1 overflow-x-auto pb-1 mb-4" aria-label="Pipeline stages">
        {PROJECT_STATUSES.map((lane, i) => {
          const n = rows.filter((p) => p.status === lane.value).length;
          const c = STAGE_COLOR[lane.value];
          const hot = overLane === lane.value && !!dragId;
          return (
            <li key={lane.value} className="flex-1 min-w-[132px]">
              <button type="button" onClick={() => laneRefs.current[lane.value]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
                className="relative w-full h-14 pl-6 pr-5 text-left cursor-pointer transition-[transform,background] duration-200 hover:-translate-y-0.5"
                style={{ clipPath: i === 0 ? `${ARROW})` : `${ARROW}, 14px 50%)`, background: hot ? tint(c, 30) : n ? tint(c, 14) : "var(--hover-bg)" }}>
                <span className="block text-[10px] font-semibold tracking-wider uppercase" style={{ color: c }}>Step {i + 1}</span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{lane.label}</span>
                  <motion.span key={n} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}
                    className="text-sm font-bold tabular-nums" style={{ color: c }}>{n}</motion.span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="overflow-x-auto pb-3 -mx-1 px-1 snap-x">
        <div className="flex gap-4 min-w-max">
          {PROJECT_STATUSES.map((lane, i) => {
            const cards = rows.filter((p) => p.status === lane.value);
            const c = STAGE_COLOR[lane.value];
            const isOver = overLane === lane.value && !!dragId && dragging?.status !== lane.value;
            const endLane = lane.value === "won" || lane.value === "completed" || lane.value === "lost";
            return (
              <motion.section key={lane.value} ref={(el) => { laneRefs.current[lane.value] = el; }} aria-label={`${lane.label} lane`}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, scale: isOver ? 1.015 : 1 }} transition={{ ...spring, delay: i * 0.04 }}
                onDragOver={(e) => { if (!canMove || !dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverLane(lane.value); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverLane(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const p = rows.find((r) => r.id === e.dataTransfer.getData("text/plain"));
                  setOverLane(null); setDragId(null);
                  if (p && p.status !== lane.value) onMove(p, lane.value);
                }}
                style={{ ["--stage" as string]: c, background: isOver ? tint(c, 10) : endLane ? tint(c, 5) : "var(--hover-bg)", borderColor: isOver ? c : tint(c, 25), boxShadow: isOver ? `0 12px 32px -12px ${tint(c, 55)}` : "none" }}
                className="snap-start w-[284px] shrink-0 rounded-2xl border flex flex-col min-h-[540px] overflow-hidden transition-colors">
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${c}, ${tint(c, 30)})` }} />
                <header className="px-4 pt-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <span className="grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold text-white" style={{ background: c }}>{i + 1}</span>
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{lane.label}</h3>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: tint(c, 12), color: c }}>{cards.length} project{cards.length === 1 ? "" : "s"}</span>
                    <span className="font-medium tabular-nums text-[var(--text-secondary)]"><AnimatedNumber value={kwSum(cards)} decimals={2} suffix=" kW" /></span>
                  </p>
                </header>
                <ul className="p-3 space-y-3 flex-1">
                  <AnimatePresence>
                    {isOver && (
                      <motion.li key="drop" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 56 }} exit={{ opacity: 0, height: 0 }}
                        className="relative rounded-xl grid place-items-center text-sm font-medium overflow-hidden" style={{ background: tint(c, 10), color: c }}>
                        <span aria-hidden className="pl-dropzone absolute inset-x-0 top-0 h-0.5" /><span aria-hidden className="pl-dropzone absolute inset-x-0 bottom-0 h-0.5" />
                        Drop to move to {lane.label}
                      </motion.li>
                    )}
                  </AnimatePresence>
                  {cards.length === 0 && !isOver && (
                    <li className="rounded-xl border border-dashed border-[var(--border-strong)] p-4 text-center text-sm text-[var(--text-muted)]">No projects in this lane</li>
                  )}
                  {cards.map((p) => {
                    const unlocked = stageUnlocks(p.status);
                    const nextLocked = p.status === "lost" ? undefined : STAGE_ACTIONS.find((a) => !isUnlocked(p.status, a.action));
                    const type = CUSTOMER_TYPES.find((t) => t.value === p.customer?.customer_type);
                    const lifted = dragId === p.id;
                    return (
                      <li key={p.id} draggable={canMove}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; setDragId(p.id); }}
                        onDragEnd={() => { setDragId(null); setOverLane(null); }}
                        className={canMove ? "cursor-grab active:cursor-grabbing" : ""}>
                        <motion.div layoutId={p.id} transition={spring}
                          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: lifted ? 0.35 : 1, scale: lifted ? 0.97 : 1, rotate: lifted ? 1.5 : 0 }} whileHover={{ y: -3 }}
                          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`); e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`); }}
                          style={{ ["--stage" as string]: c, boxShadow: celebrateId === p.id ? `0 0 0 2px ${c}, 0 10px 30px -10px ${tint(c, 60)}` : undefined }}
                          className={`group relative overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm hover:shadow-lg transition-shadow ${celebrateId === p.id ? "pl-shine" : ""}`}>
                          <span aria-hidden className="absolute left-0 inset-y-0 w-1" style={{ background: c }} />
                          <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{ background: `radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), ${tint(c, 14)}, transparent 70%)` }} />
                          <button type="button" onClick={() => onOpen(p.id)} className="relative w-full text-left p-4 pl-5 cursor-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] rounded-xl">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-[var(--text-primary)] leading-snug flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{p.name}</span>
                                {p.archived_at && <Archive className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" aria-label="Archived" />}
                              </span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--solar-text)]">{p.totalKw > 0 ? `${p.totalKw} kW` : "—"}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {type && <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${TYPE_BADGE[type.value]}`}>{type.label}</span>}
                              <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-muted)]"><Clock className="w-3 h-3" aria-hidden /> {timeAgo(p.updated_at, now)}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border-strong)] text-[var(--text-secondary)] truncate">{p.customer?.name ?? "—"}</span>
                              <span className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">{p.systemCount} sys · {p.proposal_count} prop</span>
                            </div>
                            {(unlocked.length > 0 || nextLocked) && (
                              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap gap-1.5">
                                {unlocked.map((a, k) => (
                                  <motion.span key={a.action} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06 }}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: tint(c, 12), color: c }}>
                                    <Check className="w-3 h-3" aria-hidden /> {a.label}
                                  </motion.span>
                                ))}
                                {nextLocked && (
                                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-[var(--hover-bg)] text-[var(--text-muted)]">
                                    <Lock className="w-3 h-3" aria-hidden /> {nextLocked.label} · at {statusLabel(nextLocked.from)}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        </motion.div>
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            );
          })}
        </div>
      </div>
    </MotionConfig>
  );
}

export default function ProjectsPage({ onOpen }: { onOpen: (projectId: string) => void }) {
  const { can } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"lane" | "table">("lane");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  // Optimistic: the card moves at once; on a failed PATCH it goes back and says why.
  const move = async (p: ProjectListItem, to: ProjectStatus) => {
    const setStatusOf = (s: ProjectStatus) => setProjects((ps) => ps && ps.map((x) => (x.id === p.id ? { ...x, status: s } : x)));
    setStatusOf(to);
    try {
      await api(`/api/projects/${p.id}`, { method: "PATCH", body: { status: to } });
      const fresh = stageUnlocks(to).filter((a) => !isUnlocked(p.status, a.action)).map((a) => a.label);
      setCelebration({ stage: to, projectName: p.name, unlocked: fresh });
      if (fresh.length) { setCelebrateId(p.id); setTimeout(() => setCelebrateId((id) => (id === p.id ? null : id)), 2400); }
    } catch (e: any) {
      setStatusOf(p.status);
      setNotice({ text: e.message, error: true });
    }
  };
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const load = () => {
    setError(null);
    setProjects(null);
    api<{ projects: ProjectListItem[] }>(`/api/projects${showArchived ? "?archived=true" : ""}`)
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e.message));
  };
  useEffect(load, [showArchived]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? [])
      .filter((p) => view === "lane" || status === "all" || p.status === status)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.customer?.name.toLowerCase().includes(q));
  }, [projects, status, query, view]);

  const totals = useMemo(() => {
    const open = (projects ?? []).filter((p) => !p.archived_at && (p.status === "lead" || p.status === "site_visit" || p.status === "proposal"));
    return { open: open.length, kw: Math.round(open.reduce((s, p) => s + p.totalKw, 0) * 10) / 10 };
  }, [projects]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
          <div role="tablist" aria-label="View" className="inline-flex p-1 rounded-xl bg-[var(--hover-bg)] mr-2">
            {([["lane", "Lane", Columns3], ["table", "Table", Table2]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium cursor-pointer ${view === v ? "bg-[var(--accent-solid)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          {projects && (
            <>
              <span className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-[var(--hover-bg)]"><FolderKanban className="w-4 h-4" /> <b className="text-[var(--text-primary)] tabular-nums">{totals.open}</b> open</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-[var(--solar)]/10"><Sun className="w-4 h-4 text-[var(--solar-text)]" /> <b className="text-[var(--solar-text)] tabular-nums">{totals.kw} kW</b> in the pipeline</span>
            </>
          )}
        </div>
        {can("project.create") && (
          <button type="button" className={primaryBtn} onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New project</button>
        )}
      </div>

      <AnimatePresence>
        {notice && (
          <motion.p key={notice.text} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            role={notice.error ? "alert" : "status"} className={`flex items-center gap-2 p-3 rounded-xl border text-sm text-[var(--text-primary)] ${notice.error ? "border-red-500/30 bg-red-500/10" : "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10"}`}>
            {!notice.error && <Sparkles className="w-4 h-4 text-[var(--accent-green)] shrink-0" aria-hidden />}{notice.text}
          </motion.p>
        )}
      </AnimatePresence>

      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)]">
          <div role="tablist" aria-label="Filter by status" className={`flex flex-wrap gap-1 ${view === "lane" ? "invisible" : ""}`}>
            {[{ value: "all" as const, label: "All" }, ...PROJECT_STATUSES].map((s) => (
              <button key={s.value} type="button" role="tab" aria-selected={status === s.value} onClick={() => setStatus(s.value)}
                className={`h-8 px-3 rounded-lg text-sm font-medium cursor-pointer ${status === s.value ? "bg-[var(--hover-bg)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[var(--accent-solid)]" /> Show archived
            </label>
            <label className="relative w-full lg:w-72">
              <span className="sr-only">Search projects</span>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project or customer"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]" />
            </label>
          </div>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-[var(--text-primary)]">{error}</p>
            <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-green)] cursor-pointer"><RefreshCw className="w-4 h-4" /> Try again</button>
          </div>
        ) : projects === null ? (
          <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading projects">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-12 rounded-lg bg-[var(--hover-bg)] animate-pulse" />)}</div>
        ) : projects.length === 0 ? (
          <div className="p-6">
            <EmptyState icons={[Building2, FolderKanban, Sun]} title="No projects yet"
              description="A project holds one customer opportunity — with one or many solar systems, their BOQs and proposals.">
              {can("project.create") && <button type="button" className={primaryBtn} onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Create your first project</button>}
            </EmptyState>
          </div>
        ) : view === "lane" ? (
          <div className="p-4"><PipelineBoard rows={rows} canMove={can("project.update")} onMove={move} onOpen={onOpen} celebrateId={celebrateId} /></div>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">No projects match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Projects</caption>
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th scope="col" className="px-4 py-3 font-medium">Project</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Systems</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Capacity</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right hidden md:table-cell">Proposals</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Updated</th>
                  <th scope="col" className="px-2 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => onOpen(p.id)} className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--hover-bg)] cursor-pointer">
                    <td className="px-4 py-3">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} className="text-left cursor-pointer outline-none focus-visible:underline">
                        <span className="flex items-center gap-2 font-medium text-[var(--text-primary)]">{p.name}{p.archived_at && <Archive className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-label="Archived" />}</span>
                        <span className="block text-xs text-[var(--text-muted)]">{p.customer?.name ?? "—"}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">{p.systemCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.totalKw > 0 ? <><span className="font-medium text-[var(--solar-text)]">{p.totalKw}</span> kW</> : <span className="text-[var(--text-muted)]">—</span>}
                      {p.unsized > 0 && <span className="block text-[11px] text-[var(--text-muted)]">{p.unsized} not sized</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)] hidden md:table-cell">{p.proposal_count}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>{statusLabel(p.status)}</span></td>
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap hidden sm:table-cell">{timeAgo(p.updated_at, new Date())}</td>
                    <td className="px-2 py-3"><ChevronRight className="w-4 h-4 text-[var(--text-muted)]" aria-hidden /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <StageCelebration celebration={celebration} onDone={() => setCelebration(null)} />
      {creating && <ProjectDialog onClose={() => setCreating(false)} onSaved={(p) => { setCreating(false); onOpen(p.id); }} />}
    </div>
  );
}
