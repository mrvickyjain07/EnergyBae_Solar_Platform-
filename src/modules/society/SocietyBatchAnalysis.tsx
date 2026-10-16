// src/modules/society/SocietyBatchAnalysis.tsx
// Housing society, several bills (one per meter): upload them, scan each
// through the SAME residential pipeline (/api/extract), size each meter with
// the residential worksheet and add the results up (societyBatch.ts).
// (Standalone scanner: Google Drive folder import removed — local upload only.)
// Saving posts one 'society' bill analysis per meter (the server re-derives
// each meter's numbers), then the society total can become one solar system.
import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Play, RotateCcw, Trash2, Loader2, CheckCircle2, AlertTriangle, Sun, FileText, Building } from "lucide-react";
import Uploader, { LoadedFile } from "../../components/Uploader";
import AnimatedNumber from "../../components/AnimatedNumber";
import { primaryBtn, secondaryBtn } from "../../components/ui/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import { validateSelection, type RejectedFile } from "../commercial/commercialBatchQueue";
import { api, BillAnalysis } from "../projects/api";
import { PickProjectDialog, SystemDialog } from "../projects/ProjectDialogs";
import type { WorksheetSlot } from "../projects/billAnalysisRules";
import { duplicateConsumer, sizeMeter, slotFromExtraction, societyTotals } from "./societyBatch";

// /api/extract is rate-limited (20 per 10 min) — two at a time keeps a folder from turning into a wall of 429s.
const CONCURRENCY = 2;

interface Meter {
  id: string;
  fileName: string;
  fileData: string;
  status: "waiting" | "scanning" | "done" | "failed";
  label: string;
  slot?: WorksheetSlot;
  phase?: 1 | 3 | null;
  error?: string;
}

export default function SocietyBatchAnalysis({ presetProjectId, onSaved, onOpenProject }: {
  presetProjectId: string | null;
  onSaved: () => void;
  onOpenProject: (projectId: string) => void;
}) {
  const { can } = useAuth();
  const [meters, setMeters] = useState<Meter[]>([]);
  const metersRef = useRef(meters);
  metersRef.current = meters;
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [panelWp, setPanelWp] = useState(600);
  const [running, setRunning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null | undefined>(undefined);
  const [addingSystem, setAddingSystem] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const patch = (id: string, p: Partial<Meter>) => setMeters((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const addFiles = (files: LoadedFile[]) => {
    const { accepted, rejected: bad } = validateSelection(files, metersRef.current.map((m) => ({ ...m, status: "Waiting" as const })));
    setRejected(bad);
    setSavedProjectId(undefined);
    setMeters((ms) => [...ms, ...accepted.map((a) => ({ id: a.id, fileName: a.fileName, fileData: a.fileData, status: "waiting" as const, label: "" }))]);
  };


  // One bill; never throws — a failure is a status, so one bad bill can't stop the rest.
  const scanOne = async (m: Meter) => {
    patch(m.id, { status: "scanning", error: undefined });
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData: m.fileData, fileName: m.fileName }),
      });
      if (response.status === 429) return patch(m.id, { status: "failed", error: "Too many scans in a short time — wait a few minutes, then retry." });
      const res = await response.json().catch(() => ({}));
      if (!res.success || !res.data) return patch(m.id, { status: "failed", error: res.error || "Couldn't read this bill." });
      const slot = slotFromExtraction(res.data);
      patch(m.id, {
        status: "done", slot,
        phase: res.data.phaseType === "3-Phase" ? 3 : res.data.phaseType === "1-Phase" ? 1 : null,
        label: m.label || slot.consumerName || m.fileName.replace(/\.[^.]+$/, ""),
      });
    } catch {
      patch(m.id, { status: "failed", error: "Unable to reach the extraction service." });
    }
  };
  const run = async (queue: Meter[]) => {
    setRunning(true);
    setSavedProjectId(undefined);
    let next = 0;
    const worker = async () => { while (next < queue.length) await scanOne(queue[next++]); };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
  };

  const done = meters.filter((m) => m.status === "done" && m.slot);
  const sizings = useMemo(() => done.map((m) => sizeMeter(m.slot!, panelWp)), [done, panelWp]);
  const totals = societyTotals(sizings, panelWp);
  const pending = meters.filter((m) => m.status === "waiting" || m.status === "failed");

  const saveAll = async (projectId: string | null) => {
    setSaveError(null);
    try {
      for (const m of done) {
        await api<{ billAnalysis: BillAnalysis }>("/api/bill-analyses", {
          method: "POST",
          body: { category: "society", phase: m.phase ?? null, source_file_name: m.fileName, project_id: projectId, data: { slot: { ...m.slot!, consumerName: m.label || m.slot!.consumerName }, solarPanelUsed: panelWp } },
        });
      }
      setSavedProjectId(projectId);
      setPicking(false);
      onSaved();
    } catch (e: any) {
      setSaveError(e.message);
      throw e;
    }
  };

  return (
    <div className="space-y-5">
      <Uploader multiple onFilesLoaded={addFiles} isLoading={running}
        selectedFileName={meters.length ? `${meters.length} bill${meters.length > 1 ? "s" : ""} queued` : null} />


      {rejected.length > 0 && (
        <ul className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-[var(--text-secondary)] space-y-1">
          {rejected.map((r) => <li key={r.fileName}><b>{r.fileName}</b> — {r.reason}</li>)}
        </ul>
      )}

      {meters.length > 0 && (
        <section className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)]">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2"><Building className="w-4 h-4" /> Society meters</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Each meter is sized on its own (avg units ÷ 106.06, panels rounded up); the society total adds them up.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)] flex items-center gap-2">Panel
                <input type="number" min={50} max={1000} value={panelWp} onChange={(e) => setPanelWp(Math.min(1000, Math.max(50, Number(e.target.value) || 600)))}
                  className="w-20 h-9 px-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] tabular-nums" /> Wp
              </label>
              {pending.length > 0 && (
                <button type="button" className={primaryBtn} disabled={running} onClick={() => run(pending)}>
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Scan {pending.length} bill{pending.length > 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Society meters and their solar sizing</caption>
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th scope="col" className="px-4 py-3 font-medium">Meter</th>
                  <th scope="col" className="px-4 py-3 font-medium">Consumer no.</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Avg units / month</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Panels</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Capacity</th>
                  <th scope="col" className="px-2 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {meters.map((m) => {
                    const s = m.slot ? sizeMeter(m.slot, panelWp) : null;
                    const dup = !!m.slot && duplicateConsumer(m.slot.consumerNumber, done.filter((o) => o.id !== m.id && meters.indexOf(o) < meters.indexOf(m)).map((o) => o.slot!.consumerNumber));
                    return (
                      <motion.tr key={m.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-b border-[var(--border-subtle)] last:border-b-0">
                        <td className="px-4 py-3">
                          {m.status === "done" ? (
                            <input value={m.label} onChange={(e) => patch(m.id, { label: e.target.value })} aria-label={`Name for ${m.fileName}`}
                              className="w-full min-w-[160px] h-8 px-2 rounded-lg bg-transparent border border-transparent hover:border-[var(--border-strong)] focus:border-[var(--accent-green)] outline-none font-medium text-[var(--text-primary)]" />
                          ) : <span className="font-medium text-[var(--text-primary)]">{m.fileName}</span>}
                          <span className="block px-2 text-xs text-[var(--text-muted)]">
                            {m.status === "waiting" && "Waiting to scan"}
                            {m.status === "scanning" && <span className="inline-flex items-center gap-1 text-[var(--accent-green)]"><Loader2 className="w-3 h-3 animate-spin" /> Reading bill…</span>}
                            {m.status === "done" && <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[var(--accent-green)]" /> {m.fileName}</span>}
                            {m.status === "failed" && <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle className="w-3 h-3" /> {m.error}</span>}
                            {dup && <span className="ml-2 inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" /> Same consumer no. as another bill — remove one or it's counted twice</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">{m.slot?.consumerNumber || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{s?.avgUnits != null ? Math.round(s.avgUnits) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{s && s.panels > 0 ? s.panels : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--solar-text)]">{s && s.capacityKw > 0 ? `${s.capacityKw} kW` : "—"}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-right">
                          {m.status === "failed" && <button type="button" onClick={() => run([m])} disabled={running} aria-label={`Retry ${m.fileName}`} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer"><RotateCcw className="w-4 h-4" /></button>}
                          <button type="button" onClick={() => { setSavedProjectId(undefined); setMeters((ms) => ms.filter((x) => x.id !== m.id)); }} disabled={m.status === "scanning"} aria-label={`Remove ${m.fileName}`} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--hover-bg)] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {done.length > 0 && (
            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--solar)]/[0.06] flex flex-wrap items-center justify-between gap-4">
              <dl className="flex flex-wrap gap-6">
                <div><dt className="text-xs text-[var(--text-muted)]">Meters</dt><dd className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{totals.meters}</dd></div>
                <div><dt className="text-xs text-[var(--text-muted)]">Avg units / month (all)</dt><dd className="text-lg font-semibold tabular-nums text-[var(--text-primary)]"><AnimatedNumber value={totals.avgUnits} /></dd></div>
                <div><dt className="text-xs text-[var(--text-muted)]">Panels</dt><dd className="text-lg font-semibold tabular-nums text-[var(--text-primary)]"><AnimatedNumber value={totals.panels} /></dd></div>
                <div><dt className="text-xs text-[var(--text-muted)] flex items-center gap-1"><Sun className="w-3.5 h-3.5" /> Society total</dt><dd className="text-2xl font-bold tabular-nums text-[var(--solar-text)]"><AnimatedNumber value={totals.capacityKw} decimals={2} suffix=" kW" /></dd></div>
              </dl>
              {/* Saving needs an account + project access; the public scanner has neither. */}
              {can("bill_analysis.create") && can("project.view") && (
                <div className="flex flex-wrap items-center gap-2">
                  {savedProjectId && can("project.update") && totals.capacityKw > 0 && (
                    <button type="button" className={secondaryBtn} onClick={() => setAddingSystem(true)}><Sun className="w-4 h-4" /> Add total as solar system</button>
                  )}
                  {savedProjectId && <button type="button" className={secondaryBtn} onClick={() => onOpenProject(savedProjectId)}>Open project</button>}
                  <button type="button" className={primaryBtn} disabled={running} onClick={() => setPicking(true)}>
                    <FileText className="w-4 h-4" /> {savedProjectId !== undefined ? "Save again" : `Save ${done.length} bill${done.length > 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
            </div>
          )}
          {totals.unsized > 0 && <p className="px-4 pb-3 text-xs text-[var(--text-muted)]">{totals.unsized} meter{totals.unsized > 1 ? "s have" : " has"} no usage history and isn't counted in the total.</p>}
          {savedProjectId !== undefined && <p role="status" className="px-4 pb-3 text-sm text-[var(--accent-green)] flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {savedProjectId ? "All meters saved to the project." : "All meters saved on their own — link them to a project any time."}</p>}
          {saveError && <p role="alert" className="px-4 pb-3 text-sm text-red-500">{saveError}</p>}
        </section>
      )}

      {picking && (
        <PickProjectDialog title="Save society bills" description={`Saves ${done.length} meter bill${done.length > 1 ? "s" : ""}, one per meter. Each keeps its own size; the project can use the total for one solar system.`}
          confirmLabel="Save" allowStandalone presetProjectId={presetProjectId}
          seed={{ customer: { name: done[0]?.slot?.consumerName || "", customer_type: "RESIDENTIAL_SOCIETY" } }}
          onClose={() => setPicking(false)} onPick={saveAll} />
      )}
      {addingSystem && savedProjectId && (
        <SystemDialog projectId={savedProjectId}
          initial={{ name: "Society rooftop", capacity_kw: totals.capacityKw, panel_wp: panelWp, system_type: "On-Grid", notes: `Sum of ${totals.meters} meters (each sized separately): ${done.map((m, i) => `${m.label || m.fileName} ${sizings[i].capacityKw} kW`).join(", ")}` }}
          onClose={() => setAddingSystem(false)} onSaved={() => { setAddingSystem(false); onOpenProject(savedProjectId); }} />
      )}
    </div>
  );
}
