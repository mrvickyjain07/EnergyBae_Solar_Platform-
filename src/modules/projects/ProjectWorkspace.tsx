// src/modules/projects/ProjectWorkspace.tsx
// One project: its customer, every solar system (each can start its own BOQ,
// pre-filled from the system), and the proposals saved against it.
// Saved bill analyses sit beside the systems: one can be reopened in the
// worksheet, or its recommended size copied into a new system.
// Consolidating several systems into ONE BOQ/proposal is a later phase — the
// panel says so rather than faking it.
import React, { useEffect, useState } from "react";
import {
  ArrowLeft, Plus, Sun, Pencil, Trash2, Calculator, FileText, Building2, Phone, Mail, MapPin, Layers, RefreshCw, Archive, ArchiveRestore, Zap, Receipt, ScanLine, Lock, Check, RotateCcw, XCircle,
} from "lucide-react";
import EmptyState from "../../components/ui/EmptyState";
import StatusPill from "../../components/ui/StatusPill";
import { primaryBtn, secondaryBtn } from "../../components/ui/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import { formatINRCompact, timeAgo } from "../../overviewStats";
import { api, BillAnalysis, ProjectDetail, ProjectSystem } from "./api";
import { BILL_CATEGORIES, billToSystemInput } from "./billAnalysisRules";
import { MotionConfig, motion } from "motion/react";
import { CUSTOMER_TYPES, PROJECT_STATUSES, ProjectStatus, isUnlocked, stageUnlocks, systemToProposalInputs, unlockStageLabel } from "./projectRules";
import { ProjectDialog, SystemDialog, CustomerDialog } from "./ProjectDialogs";
import StageCelebration, { type Celebration } from "./StageCelebration";
import { STAGE_COLOR, STATUS_STYLE, statusLabel } from "./ProjectsPage";
import type { ProposalInputs } from "../proposal/types";
import { structureTypeLabel } from "../proposal/structureTypes";

export interface StartBoqRequest {
  inputs: Partial<ProposalInputs>;
  projectId: string;
  projectSystemId: string;
  projectLabel: string;
}

interface Props {
  projectId: string;
  onBack: () => void;
  onStartBoq: (req: StartBoqRequest) => void;
  onOpenProposal: (proposalNo: string) => void;
  /** Go to Bill Analysis with this project preselected for "Save to project". */
  onAnalyzeBill: (projectId: string) => void;
  /** Reopen a saved Home/Society bill in the Bill Analysis worksheet. */
  onOpenBill: (bill: BillAnalysis) => void;
}

const PIPELINE = PROJECT_STATUSES.filter((s) => s.value !== "lost");

/** Step-by-step stage tracker: click a step to move the project there; shows what the next step unlocks. */
function StageTracker({ status, canMove, onMove }: { status: ProjectStatus; canMove: boolean; onMove: (s: ProjectStatus) => void }) {
  const lost = status === "lost";
  const cur = PIPELINE.findIndex((s) => s.value === status);
  const next = PIPELINE[cur + 1];
  const nextUnlocks = next ? stageUnlocks(next.value).filter((a) => !isUnlocked(status, a.action)) : [];
  return (
    <MotionConfig reducedMotion="user">
      <div className={`mt-6 rounded-xl border border-[var(--border-subtle)] p-4 ${lost ? "opacity-60" : ""}`}>
        <ol className="flex items-start">
          {PIPELINE.map((s, i) => {
            const c = STAGE_COLOR[s.value];
            const done = !lost && i < cur, here = !lost && i === cur;
            return (
              <li key={s.value} className="flex-1 flex flex-col items-center relative min-w-0">
                {i > 0 && (
                  <span aria-hidden className="absolute top-4 right-1/2 w-full h-0.5 bg-[var(--border-subtle)] -z-0">
                    <motion.span className="block h-full" style={{ background: c }} initial={false} animate={{ width: !lost && i <= cur ? "100%" : "0%" }} transition={{ duration: 0.45, delay: i * 0.05 }} />
                  </span>
                )}
                <button type="button" disabled={!canMove || here} onClick={() => onMove(s.value)} aria-current={here ? "step" : undefined}
                  title={canMove && !here ? `Move to ${s.label}` : undefined}
                  className="relative z-10 grid place-items-center w-8 h-8 rounded-full text-xs font-bold transition-transform enabled:hover:scale-110 enabled:cursor-pointer disabled:cursor-default"
                  style={{ background: done || here ? c : "var(--bg-card)", color: done || here ? "#fff" : "var(--text-muted)", border: `2px solid ${done || here ? c : "var(--border-strong)"}` }}>
                  {here && <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ border: `2px solid ${c}` }} animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
                  {done ? <Check className="w-4 h-4" /> : i + 1}
                </button>
                <span className={`mt-2 text-xs text-center truncate max-w-full px-1 ${here ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-[var(--text-muted)] text-center">
          {lost ? "Marked lost — nothing is unlocked. Reopen to bring it back to Enquiry."
            : next ? <>Next: <b className="text-[var(--text-secondary)]">{next.label}</b>{nextUnlocks.length > 0 && <> unlocks {nextUnlocks.map((a) => a.label).join(", ")}</>}.</>
            : "Project complete."}
        </p>
      </div>
    </MotionConfig>
  );
}

export default function ProjectWorkspace({ projectId, onBack, onStartBoq, onOpenProposal, onAnalyzeBill, onOpenBill }: Props) {
  const { can } = useAuth();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [systemDialog, setSystemDialog] = useState<{ system: ProjectSystem | null; fromBill?: BillAnalysis } | null>(null);

  const load = () => {
    setError(null);
    api<ProjectDetail>(`/api/projects/${projectId}`).then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, [projectId]);

  if (error) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <p className="text-sm text-[var(--text-primary)]">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className={secondaryBtn} onClick={onBack}><ArrowLeft className="w-4 h-4" /> All projects</button>
          <button type="button" className={secondaryBtn} onClick={load}><RefreshCw className="w-4 h-4" /> Try again</button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="space-y-4" aria-busy="true">{[40, 120, 220].map((h) => <div key={h} style={{ height: h }} className="rounded-2xl bg-[var(--hover-bg)] animate-pulse" />)}</div>;

  const { project, customer, systems, proposals, billAnalyses, totals } = data;
  const customerType = CUSTOMER_TYPES.find((t) => t.value === customer.customer_type)?.label;
  const proposalsFor = (systemId: string) => proposals.filter((p) => p.project_system_id === systemId);

  const setStatus = async (status: ProjectStatus) => {
    setActionError(null);
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", body: { status } });
      setCelebration({ stage: status, projectName: project.name, unlocked: stageUnlocks(status).filter((a) => !isUnlocked(project.status, a.action)).map((a) => a.label) });
      load();
    } catch (e: any) {
      setActionError(e.message);
    }
  };
  const toggleArchive = async () => {
    if (!project.archived_at && !window.confirm(`Archive "${project.name}"? It will be hidden from the project list but nothing is deleted.`)) return;
    setActionError(null);
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", body: { archived: !project.archived_at } });
      load();
    } catch (e: any) {
      setActionError(e.message);
    }
  };
  const deleteSystem = async (s: ProjectSystem) => {
    if (!window.confirm(`Delete the system "${s.name}"?`)) return;
    setActionError(null);
    try {
      await api(`/api/projects/${project.id}/systems/${s.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setActionError(e.message);
    }
  };
  const deleteBill = async (b: BillAnalysis) => {
    if (!window.confirm(`Delete the saved bill${b.consumer_name ? ` for ${b.consumer_name}` : ""}? Systems already created from it are kept.`)) return;
    setActionError(null);
    try {
      await api(`/api/bill-analyses/${b.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setActionError(e.message);
    }
  };
  const startBoq = (s: ProjectSystem) =>
    onStartBoq({
      inputs: systemToProposalInputs(customer, s, project.site_address),
      projectId: project.id,
      projectSystemId: s.id,
      projectLabel: `${customer.name} · ${project.name} · ${s.name}`,
    });

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
        <ArrowLeft className="w-4 h-4" /> All projects
      </button>

      {/* Header */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--text-muted)]">{customer.name}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)] flex flex-wrap items-center gap-2">
              {project.name}
              {project.archived_at && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--hover-bg)] text-[var(--text-muted)]">Archived</span>}
            </h2>
            {project.site_address && <p className="mt-1 text-sm text-[var(--text-muted)] flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {project.site_address}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLE[project.status]}`}>{statusLabel(project.status)}</span>
            {can("project.update") && (
              <button type="button" className={secondaryBtn} onClick={() => setStatus(project.status === "lost" ? "lead" : "lost")}>
                {project.status === "lost" ? <><RotateCcw className="w-4 h-4" /> Reopen</> : <><XCircle className="w-4 h-4" /> Mark lost</>}
              </button>
            )}
            {can("bill_analysis.create") && <button type="button" className={secondaryBtn} onClick={() => onAnalyzeBill(project.id)}><ScanLine className="w-4 h-4" /> Analyze bill</button>}
            {can("project.update") && <button type="button" className={secondaryBtn} onClick={() => setEditingProject(true)}><Pencil className="w-4 h-4" /> Edit</button>}
            {can("project.delete") && (
              <button type="button" className={secondaryBtn} onClick={toggleArchive}>
                {project.archived_at ? <><ArchiveRestore className="w-4 h-4" /> Restore</> : <><Archive className="w-4 h-4" /> Archive</>}
              </button>
            )}
          </div>
        </div>

        <StageTracker status={project.status} canMove={can("project.update")} onMove={setStatus} />

        <dl className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { k: "Solar systems", v: String(totals.systemCount), icon: Layers },
            { k: "Total capacity", v: totals.totalKw > 0 ? `${totals.totalKw} kW` : "—", icon: Sun, solar: true },
            { k: "Proposals", v: String(proposals.length), icon: FileText },
            { k: "Latest quote", v: proposals[0]?.total_effective ? formatINRCompact(proposals[0].total_effective) : "—", icon: Zap },
          ].map(({ k, v, icon: Icon, solar }) => (
            <div key={k} className="rounded-xl bg-[var(--hover-bg)] p-4">
              <dt className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {k}</dt>
              <dd className={`mt-1 text-xl font-semibold tabular-nums ${solar ? "text-[var(--solar-text)]" : "text-[var(--text-primary)]"}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {totals.unsized > 0 && <p className="mt-2 text-xs text-[var(--text-muted)]">{totals.unsized} system{totals.unsized === 1 ? " has" : "s have"} no capacity yet and isn't counted in the total.</p>}
        {actionError && <p role="alert" className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-[var(--text-primary)]">{actionError}</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Systems */}
          <section className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Solar systems</h3>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">Each site or installation, with its own capacity and equipment.</p>
              </div>
              {can("project.update") && <button type="button" className={primaryBtn} onClick={() => setSystemDialog({ system: null })}><Plus className="w-4 h-4" /> Add system</button>}
            </div>

            {systems.length === 0 ? (
              <div className="mt-5">
                <EmptyState icons={[Sun]} title="No solar systems yet"
                  description="Add the installation you're quoting. A project can hold several — for example a 50 kW factory roof and a 20 kW warehouse." />
              </div>
            ) : (
              <ul className="mt-5 grid gap-3 md:grid-cols-2">
                {systems.map((s) => {
                  const linked = proposalsFor(s.id);
                  return (
                    <li key={s.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--text-primary)] truncate">{s.name}</p>
                          {s.site_address && <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{s.site_address}</p>}
                        </div>
                        <span className="shrink-0 text-lg font-semibold tabular-nums text-[var(--solar-text)]">{typeof s.capacity_kw === "number" ? `${s.capacity_kw} kW` : "—"}</span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        {[
                          ["Type", s.system_type],
                          ["Phase", s.phase ? `${s.phase}-Phase` : "—"],
                          ["Structure", structureTypeLabel(s.structure_type) || "—"],
                          ["Panels", [s.panel_brand, s.panel_wp ? `${s.panel_wp} Wp` : null].filter(Boolean).join(" · ") || "—"],
                          ["Inverter", s.inverter_brand || "—"],
                          ["Proposals", String(linked.length)],
                        ].map(([k, v]) => (
                          <React.Fragment key={k}>
                            <dt className="text-[var(--text-muted)]">{k}</dt>
                            <dd className="text-[var(--text-secondary)] truncate">{v}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center gap-2">
                        {can("boq.create") && (isUnlocked(project.status, "boq") ? (
                          <button type="button" className={`${primaryBtn} h-8 px-3 text-xs`} onClick={() => startBoq(s)}>
                            <Calculator className="w-3.5 h-3.5" /> Start BOQ
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs bg-[var(--hover-bg)] text-[var(--text-muted)]">
                            <Lock className="w-3.5 h-3.5" /> BOQ unlocks at {unlockStageLabel("boq")}
                          </span>
                        ))}
                        <span className="flex-1" />
                        {can("project.update") && (
                          <>
                            <button type="button" onClick={() => setSystemDialog({ system: s })} aria-label={`Edit ${s.name}`} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer"><Pencil className="w-4 h-4" /></button>
                            <button type="button" onClick={() => deleteSystem(s)} aria-label={`Delete ${s.name}`} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--hover-bg)] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {systems.length > 1 && (
              <div className="mt-4 flex items-start gap-3 rounded-xl bg-[var(--hover-bg)] p-4">
                <Layers className="w-5 h-5 mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-secondary)] inline-flex items-center gap-2">One BOQ and proposal for all {systems.length} systems <StatusPill status="planned" /></span><br />
                  Today each system gets its own BOQ and proposal. Consolidating them into one is coming.
                </p>
              </div>
            )}
          </section>

          {/* Bill analyses */}
          {can("bill_analysis.view") && (
            <section className="glass-panel rounded-2xl p-6">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Bill analyses</h3>
              {billAnalyses.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  No bills saved yet.{can("bill_analysis.create") && <> Use <b>Analyze bill</b>, review the worksheet, then <b>Save to project</b>.</>}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-[var(--border-subtle)]">
                  {billAnalyses.map((b) => (
                    <li key={b.id} className="py-3 flex flex-wrap items-center gap-3">
                      <Receipt className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-[var(--text-primary)] truncate">
                          {b.consumer_name || "Unnamed consumer"}{b.consumer_number && <span className="font-normal text-[var(--text-muted)]"> · {b.consumer_number}</span>}
                        </span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {BILL_CATEGORIES.find((c) => c.value === b.category)?.label} · {b.avg_monthly_units !== null ? `${Math.round(b.avg_monthly_units)} kWh/month avg` : "no usage entered"} · {timeAgo(b.created_at, new Date())}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-[var(--solar-text)]">{b.recommended_kw !== null ? `${b.recommended_kw} kW` : "—"}</span>
                      <span className="flex items-center gap-1">
                        {b.category !== "commercial" && <button type="button" className={`${secondaryBtn} h-8 px-3 text-xs`} onClick={() => onOpenBill(b)}>Open</button>}
                        {can("project.update") && b.recommended_kw !== null && (
                          <button type="button" className={`${secondaryBtn} h-8 px-3 text-xs`} onClick={() => setSystemDialog({ system: null, fromBill: b })}><Sun className="w-3.5 h-3.5" /> Use for new system</button>
                        )}
                        {can("bill_analysis.delete") && (
                          <button type="button" onClick={() => deleteBill(b)} aria-label="Delete saved bill" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--hover-bg)] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Proposals */}
          {can("proposal.view") && (
            <section className="glass-panel rounded-2xl p-6">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Proposals</h3>
              {proposals.length === 0 ? (
                isUnlocked(project.status, "proposal") || isUnlocked(project.status, "boq") ? (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">No proposals yet. Use <b>Start BOQ</b> on a system, then save the proposal — it will be listed here.</p>
                ) : (
                  <p className="mt-3 text-sm text-[var(--text-muted)] flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Quotes unlock at {unlockStageLabel("boq")} — move the project there on the board or with the status menu.</p>
                )
              ) : (
                <ul className="mt-4 divide-y divide-[var(--border-subtle)]">
                  {proposals.map((p) => (
                    <li key={p.proposal_no}>
                      <button type="button" onClick={() => onOpenProposal(p.proposal_no)} className="w-full py-3 flex items-center gap-3 text-left hover:bg-[var(--hover-bg)] rounded-lg px-2 -mx-2 cursor-pointer">
                        <FileText className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-[var(--text-primary)]">{p.proposal_no}</span>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {systems.find((s) => s.id === p.project_system_id)?.name ?? "Project"} · {timeAgo(p.updated_at, new Date())}
                          </span>
                        </span>
                        <span className="text-sm tabular-nums text-[var(--text-secondary)]">{p.total_effective ? formatINRCompact(p.total_effective) : "—"}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === "final" ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : "bg-[var(--hover-bg)] text-[var(--text-secondary)]"}`}>{p.status === "final" ? "Final" : "Draft"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* Customer */}
        <aside className="glass-panel rounded-2xl p-6 h-fit space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Customer</p>
              <p className="mt-1 font-semibold text-[var(--text-primary)]">{customer.name}</p>
              {customerType && <p className="text-xs text-[var(--text-muted)]">{customerType}</p>}
            </div>
            {can("customer.update") && <button type="button" onClick={() => setEditingCustomer(true)} aria-label="Edit customer" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer"><Pencil className="w-4 h-4" /></button>}
          </div>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            {customer.contact_name && <li>{customer.contact_name}</li>}
            {customer.phone && <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-[var(--text-muted)]" /> <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a></li>}
            {customer.email && <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" /> <a href={`mailto:${customer.email}`} className="hover:underline truncate">{customer.email}</a></li>}
            {customer.address && <li className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 mt-0.5 text-[var(--text-muted)]" /> {customer.address}</li>}
            {customer.gstin && <li className="text-xs text-[var(--text-muted)]">GSTIN {customer.gstin}</li>}
          </ul>
          {project.notes && <div className="pt-4 border-t border-[var(--border-subtle)]"><p className="text-xs text-[var(--text-muted)]">Notes</p><p className="mt-1 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{project.notes}</p></div>}
        </aside>
      </div>

      <StageCelebration celebration={celebration} onDone={() => setCelebration(null)} />
      {editingProject && <ProjectDialog project={project} onClose={() => setEditingProject(false)} onSaved={() => { setEditingProject(false); load(); }} />}
      {editingCustomer && <CustomerDialog customer={customer} onClose={() => setEditingCustomer(false)} onSaved={() => { setEditingCustomer(false); load(); }} />}
      {systemDialog && <SystemDialog projectId={project.id} system={systemDialog.system} initial={systemDialog.fromBill && billToSystemInput(systemDialog.fromBill)} onClose={() => setSystemDialog(null)} onSaved={() => { setSystemDialog(null); load(); }} />}
    </div>
  );
}
