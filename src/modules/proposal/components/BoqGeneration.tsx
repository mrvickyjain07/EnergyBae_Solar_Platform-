// src/modules/proposal/components/BoqGeneration.tsx
// One-screen BOQ step (replaces the BOQ + Pricing steps): KPI cards, system
// inputs, template match, an editable item table with a detail/"why" panel,
// and a sticky totals bar.
//
// Presentation only. Every qty / cost / total still comes from calcBOQ() via
// the `boq` + `overrides` props, and every total from computePricingSummary().
// The "calculated" column and the "Why?" trace come from running LEGACY_V1
// with no overrides — legacyParity.test.ts proves that equals calcBOQ, so the
// explanation is the real formula, not a description of it.
//
// Template Match is read-only: quotes don't use stored templates until 5D/5E.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Zap, LayoutGrid, Cpu, IndianRupee, Settings2, Pencil, FileStack, Layers, CheckCircle2, Info,
  Plus, Search, Undo2, Redo2, Download, RotateCcw, Trash2, HelpCircle, Save, FileCheck2, FolderKanban,
} from "lucide-react";
import { BOQItem, BOQOverrides, Catalogue, ProposalInputs, ProposalMeta, PricingSummary as PricingSummaryType } from "../types";
import { fmtINR } from "../calculations";
import { sanitizePrice } from "../sanitizePrice";
import { EditHistory, emptyHistory, pushHistory, undoHistory, redoHistory } from "../editHistory";
import { matchWirePrice, parseCableSpec, WireCandidate } from "../matchWirePrice";
import { LEGACY_V1 } from "../../boqEngine/legacyV1";
import { formatExpr, runTemplate } from "../../boqEngine/ruleEngine";
import { INPUT_NAMES, QUANTITY_NAMES, describeExpr, inputLabel, namesIn, refLabel } from "../../boqEngine/quantityNames";
import { provisionalDecision } from "../../boqEngine/pendingDecisions";
import { useAuth } from "../../../contexts/AuthContext";
import { matchTemplate, rangeRule } from "../../boqTemplates/templateRules";
import { api, latestPublished, type TemplatesResponse } from "../../boqTemplates/api";
import AnimatedNumber from "../../../components/AnimatedNumber";
import AddCustomItemModal, { NewCustomItem } from "./AddCustomItemModal";
import PricingSummary from "./PricingSummary";
import FinancialAnalysis, { FinanceSettings } from "./FinancialAnalysis";
import { structureTypeLabel } from "../structureTypes";

const STANDARD_ITEM_COUNT = 38;
const CUSTOM_GROUP = "Optional / Special";

type Tab = "items" | "commercials" | "financials";

interface Props {
  inputs: ProposalInputs;
  meta: ProposalMeta;
  boq: BOQItem[];
  overrides: BOQOverrides;
  setOverrides: React.Dispatch<React.SetStateAction<BOQOverrides>>;
  catalogue: Catalogue;
  setCatalogue: React.Dispatch<React.SetStateAction<Catalogue>>;
  summary: PricingSummaryType;
  numPanels: number;
  numInverters: number;
  financeSettings: FinanceSettings;
  setFinanceSettings: React.Dispatch<React.SetStateAction<FinanceSettings>>;
  canViewTemplates: boolean;
  canFinalize: boolean;
  onEditInputs: () => void;
  onSaveDraft: () => void;
  onFinalize: () => void;
  onOpenProject?: (projectId: string) => void;
}

const card = "glass-panel rounded-2xl";
const btn = "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const primaryBtn = "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent-solid)] text-white text-xs font-bold hover:brightness-110 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const numInput = "w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green)]/20";
const fmtQty = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const shown = (v: unknown) => (v === "" || v === null || v === undefined ? "—" : String(v));

function exportCsv(boq: BOQItem[]) {
  const rows = [["Category", "Item", "Specification", "Make", "Unit", "Qty", "Unit Cost", "Total"], ...boq.map((i) => [i.group, i.name, i.spec, i.make, i.unit, i.qty, i.unitCost, i.price])];
  const csv = rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })), download: "boq-export.csv" });
  a.click();
  URL.revokeObjectURL(a.href);
}

function Kpi({ icon: Icon, title, children, detail }: { icon: typeof Zap; title: string; children: React.ReactNode; detail: string }) {
  return (
    <div className={`${card} p-4 flex items-start gap-3`}>
      <div className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-[var(--accent-green)]/10 text-[var(--accent-green)]"><Icon className="w-5 h-5" aria-hidden /></div>
      <div className="min-w-0">
        <div className="text-xs text-[var(--text-muted)]">{title}</div>
        <div className="text-xl font-semibold tracking-tight text-[var(--text-primary)] tabular-nums truncate">{children}</div>
        <div className="text-xs text-[var(--text-muted)] truncate">{detail}</div>
      </div>
    </div>
  );
}

/** Read-only: the template this system's capacity + variants would use. */
function TemplateMatch({ inputs, enabled }: { inputs: ProposalInputs; enabled: boolean }) {
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    api<TemplatesResponse>("/api/boq-templates").then(setData).catch((e) => setError(e.message));
  }, [enabled]);

  const kw = inputs.capacity === "" ? 0 : inputs.capacity;
  const match = useMemo(() => data && matchTemplate(data.ranges, data.templates, {
    kw, system_type: inputs.systemType, structure_type: inputs.structureType, panel_type: inputs.panelType,
  }), [data, kw, inputs.systemType, inputs.structureType, inputs.panelType]);
  const version = match?.template ? latestPublished(match.template.versions) : null;

  const body = !enabled ? <p className="text-sm text-[var(--text-muted)]">You don't have access to BOQ templates.</p>
    : error ? <p className="text-sm text-red-500">{error}</p>
    : !data ? <p className="text-sm text-[var(--text-muted)]">Loading templates…</p>
    : !match?.range ? <p className="text-sm text-[var(--text-muted)]">Enter the system capacity to see which template applies.</p>
    : (
      <>
        <div className="rounded-xl border border-[var(--accent-green)]/30 bg-[var(--accent-green)]/[0.06] p-4">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-9 h-9 rounded-lg bg-[var(--accent-green)]/15 text-[var(--accent-green)]"><Layers className="w-4 h-4" aria-hidden /></div>
            <div className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">
              {match.range.label} <span className="text-[var(--text-muted)] font-normal">({rangeRule(match.range)})</span>
              {match.template && <> · {match.template.name}</>}
            </div>
          </div>
          {match.template ? (
            <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div><dt className="text-[var(--text-muted)]">Version</dt><dd className="font-semibold text-[var(--text-primary)]">{version ? `v${version.version}` : "No published version"}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Published</dt><dd className="text-[var(--text-primary)]">{version?.published_at ? new Date(version.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Variant</dt><dd className="text-[var(--text-primary)]">{[match.template.system_type, structureTypeLabel(match.template.structure_type), match.template.panel_type].filter(Boolean).join(" · ") || "Any system"}</dd></div>
            </dl>
          ) : <p className="mt-2 text-xs text-[var(--text-muted)]">No active template in this range.</p>}
        </div>
        <p className="flex gap-2 text-xs text-[var(--text-muted)]">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
          Shown for reference. This quote is calculated by the built-in calculator; quotes don't use stored templates yet.
        </p>
      </>
    );

  return (
    <section className={`${card} p-5 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]"><FileStack className="w-4 h-4 text-[var(--accent-green)]" aria-hidden /> Template Match</h2>
        {match?.template && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-[var(--success-text)]"><CheckCircle2 className="w-3 h-3" aria-hidden /> Matched</span>}
      </div>
      {body}
    </section>
  );
}

function SystemInputs({ inputs, onEdit }: { inputs: ProposalInputs; onEdit: () => void }) {
  const fields: [string, unknown][] = [
    ["System capacity (kW)", inputs.capacity], ["Panel wattage (Wp)", inputs.panelWp], ["Phase", inputs.phase],
    ["System type", inputs.systemType], ["Structure type", structureTypeLabel(inputs.structureType)], ["DCR / NDCR", inputs.panelType],
    ["Panel brand", inputs.panelBrand], ["Inverter", inputs.inverterBrand && `${inputs.inverterBrand}${inputs.inverterSize ? ` ${inputs.inverterSize} kW` : ""}`],
    ["Building floors", inputs.buildingFloors], ["Panel rows", inputs.panelRows],
  ];
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]"><Settings2 className="w-4 h-4 text-[var(--accent-green)]" aria-hidden /> System Inputs</h2>
        <button type="button" className={btn} onClick={onEdit}><Pencil className="w-3.5 h-3.5" /> Edit inputs</button>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 min-w-0">
            <dt className="text-[11px] text-[var(--text-muted)] truncate">{label}</dt>
            <dd className="text-sm font-medium text-[var(--text-primary)] truncate">{shown(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The real rule behind a standard line in business words, with this system's values plugged in. */
function WhyQuantity({ sr, unit, calculatedQty, inputs, values }: { sr: number; unit: string; calculatedQty?: number; inputs: ProposalInputs; values: Record<string, unknown> }) {
  const technical = useAuth().can("boq_template.update");
  const it = LEGACY_V1.items.find((x) => x.sr === sr);
  if (!it) return <p className="text-xs text-[var(--text-muted)]">A custom item — its quantity is whatever you enter.</p>;
  const { refs, inputs: used } = namesIn(it.qty);
  const withUnit = (v: unknown, u?: string) => `${shown(typeof v === "number" ? fmtQty(v) : v)}${u ? ` ${u}` : ""}`;
  const ruleOf = (k: string) => LEGACY_V1.quantities.find((q) => q.key === k)?.expr;
  const pending = provisionalDecision(sr);
  return (
    <div className="space-y-2 text-xs">
      {pending && (
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-2 text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Provisional rule.</span> This line still uses the current calculator rule while
          business decision {pending.id} ({pending.title}) is open. Check it against the site design and override the quantity if it differs.
        </p>
      )}
      <div><span className="text-[var(--text-muted)]">Rule: </span><span className="text-[var(--text-primary)]">{describeExpr(it.qty)}</span></div>
      {(refs.size > 0 || used.size > 0) && (
        <ul className="space-y-1.5 rounded-lg bg-[var(--bg-surface)] p-2">
          {[...refs].map((k) => {
            const rule = ruleOf(k);
            return (
              <li key={k}>
                <span className="text-[var(--text-primary)]">{refLabel(k)}</span> = <span className="font-medium tabular-nums">{withUnit(values[k], QUANTITY_NAMES[k]?.unit)}</span>
                {QUANTITY_NAMES[k]?.role && <div className="text-[var(--text-muted)]">{QUANTITY_NAMES[k].role}</div>}
                {rule && <div className="text-[var(--text-muted)]">Rule: {describeExpr(rule)}</div>}
              </li>
            );
          })}
          {[...used].map((k) => <li key={k}><span className="text-[var(--text-primary)]">{inputLabel(k)}</span> = <span className="font-medium tabular-nums">{withUnit((inputs as any)[k], INPUT_NAMES[k]?.unit)}</span></li>)}
        </ul>
      )}
      {calculatedQty !== undefined && <div><span className="text-[var(--text-muted)]">Calculated quantity: </span><span className="font-semibold tabular-nums text-[var(--text-primary)]">{fmtQty(calculatedQty)} {unit}</span></div>}
      {technical && (
        <details className="text-[var(--text-muted)]">
          <summary className="cursor-pointer">Technical formula</summary>
          <code className="block break-all mt-1">{formatExpr(it.qty)}</code>
          {[...refs].map((k) => <code key={k} className="block break-all">{k} = {ruleOf(k) ? formatExpr(ruleOf(k)!) : "?"}</code>)}
        </details>
      )}
    </div>
  );
}

export default function BoqGeneration(p: Props) {
  const { inputs, boq, overrides, setOverrides, catalogue, setCatalogue, summary } = p;
  const [tab, setTab] = useState<Tab>("items");
  const [search, setSearch] = useState("");
  const [selectedSr, setSelectedSr] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);

  // Undo/redo over `overrides` — the only state edited here.
  const [history, setHistory] = useState<EditHistory<BOQOverrides>>(() => emptyHistory(overrides));
  const commit = useCallback((next: BOQOverrides) => { setHistory((h) => pushHistory(h, next)); setOverrides(next); }, [setOverrides]);
  const undo = () => setHistory((h) => { const n = undoHistory(h); setOverrides(n.present); return n; });
  const redo = () => setHistory((h) => { const n = redoHistory(h); setOverrides(n.present); return n; });
  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 3500); };

  // Calculated values (no overrides) + the named quantities behind them.
  const trace = useMemo(() => runTemplate(LEGACY_V1, inputs, catalogue, {}), [inputs, catalogue]);
  const calculated = useMemo(() => new Map(trace.items.map((i) => [i.sr, i])), [trace]);

  const setQty = (sr: number, v: number) => commit({ ...overrides, [sr]: sanitizePrice(v) });
  const setCost = (sr: number, v: number) => commit({ ...overrides, [`c${sr}`]: sanitizePrice(v) });
  const resetRow = (sr: number) => { const next = { ...overrides }; delete next[sr]; delete next[`c${sr}`]; commit(next); };
  const qtyOverridden = (sr: number) => overrides[sr] !== undefined;
  const costOverridden = (sr: number) => overrides[`c${sr}`] !== undefined;

  const removeRow = (item: BOQItem) => {
    if (item.sr <= STANDARD_ITEM_COUNT) { commit({ ...overrides, [`x${item.sr}`]: 1 }); flash(`Removed "${item.name}" from this quote.`); }
    else {
      const idx = item.sr - (STANDARD_ITEM_COUNT + 1);
      setCatalogue((prev) => ({ ...prev, customBOS: (prev.customBOS || []).filter((_, i) => i !== idx) }));
      resetRow(item.sr);
      flash(`Deleted "${item.name}".`);
    }
    if (selectedSr === item.sr) setSelectedSr(null);
  };
  const removedCount = Object.keys(overrides).filter((k) => k.startsWith("x") && overrides[k]).length;
  const restoreRemoved = () => commit(Object.fromEntries(Object.entries(overrides).filter(([k]) => !k.startsWith("x"))));

  const addCustom = (ci: NewCustomItem) => {
    const sr = STANDARD_ITEM_COUNT + 1 + (catalogue.customBOS || []).length;
    setCatalogue((prev) => ({ ...prev, customBOS: [...(prev.customBOS || []), { id: Date.now() + Math.random(), label: ci.label, unit: ci.unit, price: ci.price, group: CUSTOM_GROUP }] }));
    if (ci.qty > 0) commit({ ...overrides, [sr]: ci.qty });
    setAdding(false);
    flash(`Added "${ci.label}".`);
  };

  // Fill unpriced cable rows from the uploaded Wire Prices list — never overwrites a rate.
  const cableRowsUnpriced = boq.filter((i) => i.unitCost === 0 && parseCableSpec(i.spec)).length;
  const fillCableRates = async () => {
    setFilling(true);
    try {
      const wires = ((await api<{ rows?: WireCandidate[] }>("/api/wire-prices")).rows ?? []);
      const next = { ...overrides };
      let hits = 0;
      boq.forEach((item) => {
        const spec = item.unitCost > 0 ? null : parseCableSpec(item.spec);
        const hit = spec && matchWirePrice(wires, spec);
        if (hit) { next[`c${item.sr}`] = hit.price_per_m; hits++; }
      });
      if (hits) commit(next);
      flash(hits ? `Filled ${hits} cable rate${hits > 1 ? "s" : ""} from Wire Prices.` : "No uploaded wire price matched the unpriced cable rows.");
    } catch {
      flash("Could not load wire prices.");
    } finally {
      setFilling(false);
    }
  };

  const q = search.trim().toLowerCase();
  const rows = q ? boq.filter((i) => `${i.name} ${i.spec} ${i.make} ${i.group}`.toLowerCase().includes(q)) : boq;
  const selected = boq.find((i) => i.sr === selectedSr) ?? null;
  const overheads = summary.totalExGST - summary.matTotal;
  const capacity = inputs.capacity === "" ? 0 : inputs.capacity;
  const dcKw = inputs.panelWp === "" ? 0 : (p.numPanels * inputs.panelWp) / 1000;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">BOQ Generation</h1>
          <p className="text-sm text-[var(--text-muted)]">Generate and customise the bill of quantities for this solar system.</p>
        </div>
        {/* Proposal No./date live on Review & Export only. */}
        {p.meta.projectId && p.onOpenProject && (
          <button type="button" className={btn} onClick={() => p.onOpenProject!(p.meta.projectId!)}><FolderKanban className="w-3.5 h-3.5" /> Back to project</button>
        )}
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Zap} title="System capacity" detail={dcKw ? `${dcKw.toFixed(2)} kWp DC from panels` : "Required capacity"}><AnimatedNumber value={capacity} decimals={capacity % 1 ? 2 : 0} suffix=" kW" /></Kpi>
        <Kpi icon={LayoutGrid} title="Panels" detail={inputs.panelWp ? `${inputs.panelWp} Wp each` : "Panel wattage not set"}><AnimatedNumber value={p.numPanels} /></Kpi>
        <Kpi icon={Cpu} title="Inverters" detail={[inputs.inverterBrand, inputs.inverterSize && `${inputs.inverterSize} kW`].filter(Boolean).join(" ") || "Not selected"}><AnimatedNumber value={p.numInverters} /></Kpi>
        <Kpi icon={IndianRupee} title="Estimated material cost" detail="Before overheads & GST"><AnimatedNumber value={summary.matTotal / 100000} decimals={2} prefix="₹" suffix="L" /></Kpi>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SystemInputs inputs={inputs} onEdit={p.onEditInputs} />
        <TemplateMatch inputs={inputs} enabled={p.canViewTemplates} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)]">
        <div role="tablist" className="flex gap-1">
          {([["items", "BOQ Items"], ["commercials", "Commercials"], ["financials", "Savings & Subsidy"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition cursor-pointer ${tab === id ? "border-[var(--accent-green)] text-[var(--accent-green)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === "items" && (
          <div className="flex items-center gap-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" aria-label="Search BOQ items"
                className="w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]" />
            </div>
            <button type="button" className={btn} title="Undo" aria-label="Undo" disabled={!history.past.length} onClick={undo}><Undo2 className="w-3.5 h-3.5" /></button>
            <button type="button" className={btn} title="Redo" aria-label="Redo" disabled={!history.future.length} onClick={redo}><Redo2 className="w-3.5 h-3.5" /></button>
            <button type="button" className={btn} title="Export CSV" aria-label="Export CSV" onClick={() => exportCsv(boq)}><Download className="w-3.5 h-3.5" /></button>
            <button type="button" className={btn} onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5" /> Add custom item</button>
          </div>
        )}
      </div>

      {tab === "items" && (
        <>
          {(notice || cableRowsUnpriced > 0 || removedCount > 0) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {notice && <span className="rounded-lg bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-secondary)]" role="status">{notice}</span>}
              {cableRowsUnpriced > 0 && (
                <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--solar)]/40 bg-[var(--solar)]/[0.07] px-3 py-2 text-[var(--text-secondary)]">
                  {cableRowsUnpriced} cable row{cableRowsUnpriced > 1 ? "s have" : " has"} no rate.
                  <button type="button" className="font-semibold text-[var(--solar-text)] hover:underline cursor-pointer disabled:opacity-50" disabled={filling} onClick={fillCableRates}>{filling ? "Matching…" : "Fill from Wire Prices"}</button>
                </span>
              )}
              {removedCount > 0 && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-secondary)]">
                  {removedCount} row{removedCount > 1 ? "s" : ""} removed from this quote.
                  <button type="button" className="font-semibold text-[var(--accent-green)] hover:underline cursor-pointer" onClick={restoreRemoved}>Restore all</button>
                </span>
              )}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full min-w-[920px] text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-left text-[var(--text-muted)]">
                    {["#", "Item", "Category", "Calculated", "Qty", "Unit", "Unit cost (₹)", "Total (₹)", "Source", ""].map((h, i) => (
                      <th key={i} className={`px-3 py-3 font-medium ${i >= 3 && i <= 7 && i !== 5 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, idx) => {
                    const calc = calculated.get(item.sr);
                    const isSel = selectedSr === item.sr;
                    const manual = qtyOverridden(item.sr) || costOverridden(item.sr);
                    return (
                      <tr key={item.sr} onClick={() => setSelectedSr(item.sr)}
                        className={`border-b border-[var(--border-subtle)] cursor-pointer transition-colors ${isSel ? "bg-[var(--accent-green)]/[0.07]" : "hover:bg-[var(--hover-bg)]"}`}>
                        <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">{idx + 1}</td>
                        <td className="px-3 py-2 max-w-[240px]">
                          <div className="font-medium text-[var(--text-primary)] truncate">{item.name}</div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate">{[item.make, item.spec].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">{item.group}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)] whitespace-nowrap">{calc ? fmtQty(calc.qty) : "—"}</td>
                        <td className="px-2 py-2 w-20" onClick={(e) => e.stopPropagation()}>
                          <input inputMode="decimal" aria-label={`Quantity for ${item.name}`} value={item.qty || ""} placeholder="0"
                            className={`${numInput} ${qtyOverridden(item.sr) ? "border-[var(--solar)]" : ""}`}
                            onChange={(e) => setQty(item.sr, sanitizePrice(e.target.value.replace(/[^0-9.]/g, "")))} />
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{item.unit}</td>
                        <td className="px-2 py-2 w-28" onClick={(e) => e.stopPropagation()}>
                          <input inputMode="decimal" aria-label={`Unit cost for ${item.name}`} value={item.unitCost ? item.unitCost.toLocaleString("en-IN") : ""} placeholder="0"
                            className={`${numInput} ${costOverridden(item.sr) ? "border-[var(--solar)]" : ""}`}
                            onChange={(e) => setCost(item.sr, sanitizePrice(e.target.value.replace(/[^0-9.]/g, "")))} />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text-primary)] whitespace-nowrap">{item.price ? fmtINR(item.price) : "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {(() => {
                            const pending = item.sr <= STANDARD_ITEM_COUNT && !manual ? provisionalDecision(item.sr) : null;
                            return (
                              <span title={pending ? `Rule awaiting decision ${pending.id}: ${pending.title}. Check this quantity.` : undefined}
                                className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${item.sr > STANDARD_ITEM_COUNT ? "bg-sky-500/10 text-sky-600" : manual ? "bg-[var(--solar)]/15 text-[var(--solar-text)]" : pending ? "bg-amber-500/10 text-amber-600" : "bg-[var(--hover-bg)] text-[var(--text-secondary)]"}`}>
                                {item.sr > STANDARD_ITEM_COUNT ? "Custom" : manual ? "Manual" : pending ? "Provisional" : "Calculated"}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 cursor-pointer" onClick={() => setSelectedSr(item.sr)}><HelpCircle className="w-3 h-3" /> Why?</button>
                          <button type="button" title={item.sr > STANDARD_ITEM_COUNT ? "Delete custom item" : "Remove from this quote"} aria-label={`Remove ${item.name}`}
                            className="rounded p-1 text-[var(--text-muted)] hover:text-red-500 cursor-pointer" onClick={() => removeRow(item)}><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">{q ? "No items match your search." : "No BOQ lines yet — enter the system inputs."}</td></tr>}
                </tbody>
              </table>
            </div>

            <aside className={`${card} p-4 space-y-4 self-start xl:sticky xl:top-4`}>
              {!selected ? (
                <p className="py-8 text-center text-sm text-[var(--text-muted)]">Select a line to see its details and why its quantity is what it is.</p>
              ) : (
                <>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{selected.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{[selected.make, selected.spec].filter(Boolean).join(" · ") || selected.group}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text-primary)]">Manual override</span>
                      {(qtyOverridden(selected.sr) || costOverridden(selected.sr)) && selected.sr <= STANDARD_ITEM_COUNT && (
                        <button type="button" className="inline-flex items-center gap-1 text-[var(--accent-green)] hover:underline cursor-pointer" onClick={() => resetRow(selected.sr)}><RotateCcw className="w-3 h-3" /> Reset to calculated</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label className="space-y-1"><span className="text-[var(--text-muted)]">Quantity ({selected.unit})</span>
                        <input inputMode="decimal" value={selected.qty || ""} placeholder="0" className={numInput} onChange={(e) => setQty(selected.sr, sanitizePrice(e.target.value.replace(/[^0-9.]/g, "")))} /></label>
                      <label className="space-y-1"><span className="text-[var(--text-muted)]">Unit cost (₹)</span>
                        <input inputMode="decimal" value={selected.unitCost ? selected.unitCost.toLocaleString("en-IN") : ""} placeholder="0" className={numInput} onChange={(e) => setCost(selected.sr, sanitizePrice(e.target.value.replace(/[^0-9.]/g, "")))} /></label>
                    </div>
                    {calculated.get(selected.sr) && (
                      <p className="text-[11px] text-[var(--text-muted)]">Calculated: {fmtQty(calculated.get(selected.sr)!.qty)} {selected.unit} at {fmtINR(calculated.get(selected.sr)!.unitCost)}</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-[var(--accent-green)]/[0.06] p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]"><Info className="w-3.5 h-3.5 text-[var(--accent-green)]" aria-hidden /> Why this quantity?</div>
                    <WhyQuantity sr={selected.sr} unit={selected.unit} calculatedQty={calculated.get(selected.sr)?.qty} inputs={inputs} values={trace.values} />
                  </div>
                </>
              )}
            </aside>
          </div>
        </>
      )}

      {tab === "commercials" && <PricingSummary summary={summary} inputs={inputs} catalogue={catalogue} setCatalogue={setCatalogue} numPanels={p.numPanels} />}
      {tab === "financials" && <FinancialAnalysis inputs={inputs} summary={summary} catalogue={catalogue} settings={p.financeSettings} setSettings={p.setFinanceSettings} />}

      <div className="sticky bottom-0 z-30 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
          {([["Material cost (A)", summary.matTotal], ["Overheads (B)", overheads], [`GST (C) @ ${catalogue.charges.gst || 8.9}%`, summary.gstAmt]] as const).map(([label, v]) => (
            <div key={label}><div className="text-[11px] text-[var(--text-muted)]">{label}</div><div className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{fmtINR(v)}</div></div>
          ))}
          <div className="border-l border-[var(--border-subtle)] pl-6">
            <div className="text-[11px] text-[var(--text-muted)]">Final amount (A+B+C)</div>
            <div className="text-xl font-bold tabular-nums text-[var(--accent-green)]">{fmtINR(summary.final)}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" className={btn} onClick={p.onSaveDraft}><Save className="w-3.5 h-3.5" /> Save draft</button>
            <button type="button" className={primaryBtn} disabled={!p.canFinalize} title={p.canFinalize ? undefined : "You don't have permission to finalize proposals"} onClick={p.onFinalize}><FileCheck2 className="w-3.5 h-3.5" /> Finalize BOQ</button>
          </div>
        </div>
      </div>

      {adding && <AddCustomItemModal onCancel={() => setAdding(false)} onAdd={addCustom} />}
    </div>
  );
}
