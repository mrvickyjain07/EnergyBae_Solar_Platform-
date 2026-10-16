// src/modules/projects/BillProjectLink.tsx
// Bill Analysis ↔ Projects (migration 0018), shown on the Bill Analysis page
// for every category — Home/Society worksheet and the C&I analysis alike.
//
//   BillSaveBar      — save the analysis on screen: standalone, to an
//                      existing project, or to a new project prefilled from
//                      the bill; then optionally add a solar system from it.
//   SavedBillsPanel  — recent saved bills: reopen, link a standalone one to a
//                      project, delete.
//
// The page owns the analysis; these only POST what it hands over. All sizing
// numbers are re-derived by the server (billAnalysisRules.ts).
import React, { useEffect, useState } from "react";
import { Check, FileText, Receipt, Sun, Trash2, Link2, RefreshCw } from "lucide-react";
import { primaryBtn, secondaryBtn } from "../../components/ui/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import { timeAgo } from "../../overviewStats";
import { api, BillAnalysis } from "./api";
import { BILL_CATEGORIES, billToSystemInput } from "./billAnalysisRules";
import type { CustomerInput } from "./projectRules";
import { PickProjectDialog, SystemDialog } from "./ProjectDialogs";

export interface BillSeed { customer?: Partial<CustomerInput>; siteAddress?: string | null }

export function BillSaveBar({ bill, seed, presetProjectId, onSaved, onOpenProject }: {
  /** POST /api/bill-analyses body without project_id. */
  bill: Record<string, unknown>;
  seed: BillSeed;
  presetProjectId: string | null;
  onSaved: (b: BillAnalysis) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const { can } = useAuth();
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState<BillAnalysis | null>(null);
  const [addingSystem, setAddingSystem] = useState(false);
  if (!can("bill_analysis.create")) return null;

  const save = async (projectId: string | null) => {
    const { billAnalysis } = await api<{ billAnalysis: BillAnalysis }>("/api/bill-analyses", { method: "POST", body: { ...bill, project_id: projectId } });
    setSaved(billAnalysis);
    setPicking(false);
    onSaved(billAnalysis);
  };

  return (
    <div className="glass-panel rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--text-secondary)]">
        {saved
          ? <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-[var(--accent-green)]" /> {saved.project_id ? "Saved to the project." : "Saved on its own — link it to a project any time."}</span>
          : "Reviewed the numbers? Save this bill — on its own or to a project."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {saved?.project_id && (
          <>
            {can("project.update") && saved.recommended_kw !== null && (
              <button type="button" className={secondaryBtn} onClick={() => setAddingSystem(true)}><Sun className="w-4 h-4" /> Add as solar system</button>
            )}
            <button type="button" className={secondaryBtn} onClick={() => onOpenProject(saved.project_id!)}>Open project</button>
          </>
        )}
        <button type="button" className={primaryBtn} onClick={() => setPicking(true)}>
          <FileText className="w-4 h-4" /> {saved ? "Save again" : "Save bill"}
        </button>
      </div>
      {picking && (
        <PickProjectDialog title="Save bill" description="Saved as you see it. A project can use its recommended size for a solar system."
          confirmLabel="Save" allowStandalone presetProjectId={saved?.project_id ?? presetProjectId} seed={seed}
          onClose={() => setPicking(false)} onPick={save} />
      )}
      {addingSystem && saved?.project_id && (
        <SystemDialog projectId={saved.project_id} initial={billToSystemInput(saved)} onClose={() => setAddingSystem(false)}
          onSaved={() => { setAddingSystem(false); onOpenProject(saved.project_id!); }} />
      )}
    </div>
  );
}

export function SavedBillsPanel({ refreshKey, onOpenBill, onOpenProject }: {
  refreshKey: number;
  onOpenBill: (b: BillAnalysis) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const { can } = useAuth();
  const [bills, setBills] = useState<BillAnalysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<BillAnalysis | null>(null);

  const load = () => {
    setError(null);
    api<{ billAnalyses: BillAnalysis[] }>("/api/bill-analyses").then(({ billAnalyses }) => setBills(billAnalyses)).catch((e) => setError(e.message));
  };
  useEffect(load, [refreshKey]);

  if (!can("bill_analysis.view")) return null;
  if (error) {
    return (
      <section className="glass-panel rounded-2xl p-5 flex items-center justify-between gap-3 text-sm">
        <span className="text-[var(--text-secondary)]">{error}</span>
        <button type="button" className={secondaryBtn} onClick={load}><RefreshCw className="w-4 h-4" /> Try again</button>
      </section>
    );
  }
  if (!bills?.length) return null;

  const remove = async (b: BillAnalysis) => {
    if (!window.confirm(`Delete the saved bill${b.consumer_name ? ` for ${b.consumer_name}` : ""}? Systems already created from it are kept.`)) return;
    try {
      await api(`/api/bill-analyses/${b.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <section className="glass-panel rounded-2xl p-6">
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Saved bills</h3>
      <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
        {bills.map((b) => (
          <li key={b.id} className="py-3 flex flex-wrap items-center gap-3">
            <Receipt className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--text-primary)] truncate">{b.consumer_name || "Unnamed consumer"}</span>
              <span className="block text-xs text-[var(--text-muted)]">
                {BILL_CATEGORIES.find((c) => c.value === b.category)?.label} · {b.project ? b.project.name : "Not linked to a project"} · {timeAgo(b.created_at, new Date())}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums text-[var(--solar-text)]">{b.recommended_kw !== null ? `${b.recommended_kw} kW` : "—"}</span>
            <span className="flex items-center gap-1">
              {b.category !== "commercial" && <button type="button" className={`${secondaryBtn} h-8 px-3 text-xs`} onClick={() => onOpenBill(b)}>Open</button>}
              {b.project_id
                ? <button type="button" className={`${secondaryBtn} h-8 px-3 text-xs`} onClick={() => onOpenProject(b.project_id!)}>Project</button>
                : can("bill_analysis.update") && <button type="button" className={`${secondaryBtn} h-8 px-3 text-xs`} onClick={() => setLinking(b)}><Link2 className="w-3.5 h-3.5" /> Link to project</button>}
              {can("bill_analysis.delete") && (
                <button type="button" onClick={() => remove(b)} aria-label="Delete saved bill" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--hover-bg)] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {linking && (
        <PickProjectDialog title="Link bill to a project" confirmLabel="Link"
          seed={{ customer: linking.consumer_name ? { name: linking.consumer_name } : undefined }}
          onClose={() => setLinking(null)}
          onPick={async (projectId) => {
            await api(`/api/bill-analyses/${linking.id}`, { method: "PATCH", body: { project_id: projectId } });
            setLinking(null);
            load();
          }} />
      )}
    </section>
  );
}
