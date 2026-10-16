// src/modules/boqTemplates/BoqTemplatesPage.tsx
// BOQ Templates (Phase 5C): the company's capacity ranges, the templates in
// each, and their versions. Layout follows the reference BOQ screen (stat
// cards → working panels) and the 21st.dev "card tabs" pattern, built on the
// app's own primitives (glass panels, Dialog, SegmentedTabs) rather than a new
// component library. Templates are stored and versioned here; generating a BOQ
// from them is a later phase, and the page says so instead of implying it.
import React, { useEffect, useMemo, useState } from "react";
import { Layers, LayoutTemplate, Plus, RefreshCw, Gauge, FileCheck2, FilePen, Info, ChevronRight, Star, Archive } from "lucide-react";
import Dialog, { Field, fieldCls, primaryBtn, secondaryBtn } from "../../components/ui/Dialog";
import EmptyState from "../../components/ui/EmptyState";
import { useAuth } from "../../contexts/AuthContext";
import { timeAgo } from "../../overviewStats";
import { api, latestOf, latestPublished, type CapacityRange, type TemplateListItem, type TemplatesResponse } from "./api";
import { PANEL_TYPES, SYSTEM_TYPES, rangeRule, validateRanges, validateTemplateMeta } from "./templateRules";
import { structureOptions } from "../proposal/structureTypes";
import TemplateEditor from "./TemplateEditor";
import { VersionBadge, variantChips } from "./templateUi";

const ErrorLine = ({ msg }: { msg: string | null }) =>
  msg ? <p role="alert" className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-[var(--text-primary)]">{msg}</p> : null;

export default function BoqTemplatesPage() {
  const { can } = useAuth();
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeId, setRangeId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingRanges, setEditingRanges] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = () => {
    setError(null);
    api<TemplatesResponse>("/api/boq-templates")
      .then((d) => {
        setData(d);
        setRangeId((cur) => (cur && d.ranges.some((r) => r.id === cur) ? cur : d.ranges[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const stats = useMemo(() => {
    const live = (data?.templates ?? []).filter((t) => !t.archived_at);
    return {
      ranges: data?.ranges.length ?? 0,
      templates: live.length,
      published: live.filter((t) => latestPublished(t.versions)).length,
      drafts: live.filter((t) => t.versions.some((v) => v.status === "draft")).length,
    };
  }, [data]);

  if (openId) {
    return <TemplateEditor templateId={openId} ranges={data?.ranges ?? []} onBack={() => { setOpenId(null); load(); }} />;
  }
  if (error) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <p className="text-sm text-[var(--text-primary)]">{error}</p>
        <button type="button" className={`${secondaryBtn} mt-4`} onClick={load}><RefreshCw className="w-4 h-4" /> Try again</button>
      </div>
    );
  }
  if (!data) return <div className="space-y-4" aria-busy="true">{[96, 64, 320].map((h) => <div key={h} style={{ height: h }} className="rounded-2xl bg-[var(--hover-bg)] animate-pulse" />)}</div>;

  const range = data.ranges.find((r) => r.id === rangeId) ?? null;
  const inRange = data.templates.filter((t) => t.capacity_range_id === rangeId && (showArchived || !t.archived_at));
  const countIn = (id: string) => data.templates.filter((t) => t.capacity_range_id === id && !t.archived_at).length;
  const defaultIn = (id: string) => data.templates.find((t) => t.capacity_range_id === id && t.is_default && !t.archived_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">BOQ Templates</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">Capacity ranges, the templates inside them, and every published version.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("boq_template.update") && <button type="button" className={secondaryBtn} onClick={() => setEditingRanges(true)}><Gauge className="w-4 h-4" /> Edit ranges</button>}
          {can("boq_template.create") && <button type="button" className={primaryBtn} onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New template</button>}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--hover-bg)] p-4">
        <Info className="w-5 h-5 mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">
          Templates are saved and versioned here. <b>Quotes don't use them yet</b> — the BOQ calculator keeps working exactly as before until template-based BOQ generation is switched on in a later release.
        </p>
      </div>

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { k: "Capacity ranges", v: stats.ranges, icon: Gauge },
          { k: "Templates", v: stats.templates, icon: LayoutTemplate },
          { k: "With a published version", v: stats.published, icon: FileCheck2 },
          { k: "Open drafts", v: stats.drafts, icon: FilePen },
        ].map(({ k, v, icon: Icon }) => (
          <div key={k} className="glass-panel rounded-2xl p-5 flex items-center gap-4">
            <span className="size-11 rounded-xl grid place-items-center bg-[var(--accent-green)]/10 text-[var(--accent-green)]"><Icon className="w-5 h-5" /></span>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">{k}</dt>
              <dd className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{v}</dd>
            </div>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <section className="glass-panel rounded-2xl p-4 h-fit" aria-label="Capacity ranges">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Capacity ranges</p>
          <ul className="space-y-1.5">
            {data.ranges.map((r) => {
              const active = r.id === rangeId;
              const def = defaultIn(r.id);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setRangeId(r.id)} aria-current={active}
                    className={`w-full text-left rounded-xl px-3 py-3 border transition-colors cursor-pointer ${active ? "border-[var(--accent-green)] bg-[var(--accent-green)]/[0.08]" : "border-transparent hover:bg-[var(--hover-bg)]"}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-primary)]">{r.label}</span>
                      <span className="text-xs tabular-nums text-[var(--text-muted)]">{countIn(r.id)} template{countIn(r.id) === 1 ? "" : "s"}</span>
                    </span>
                    <span className="block text-xs text-[var(--text-muted)] mt-0.5">System capacity {rangeRule(r)}</span>
                    {def && <span className="block text-xs text-[var(--text-secondary)] mt-1 truncate">Default: {def.name}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-2 pt-3 text-[11px] text-[var(--text-muted)]">Ranges match on the system (required) capacity, not on actual DC kWp.</p>
        </section>

        <section className="space-y-4">
          {range && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{range.label}</h3>
                <p className="text-sm text-[var(--text-muted)]">System capacity {rangeRule(range)}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
              </label>
            </div>
          )}
          {inRange.length === 0 ? (
            <EmptyState icons={[LayoutTemplate, Layers, FilePen]} title="No templates in this range"
              description={can("boq_template.create") ? "Create one from the range's default template — it starts as a draft you can edit and publish." : "Ask your admin to add a template for this range."} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {inRange.map((t) => <TemplateCard key={t.id} t={t} onOpen={() => setOpenId(t.id)} />)}
            </ul>
          )}
        </section>
      </div>

      {editingRanges && <RangesDialog ranges={data.ranges} onClose={() => setEditingRanges(false)} onSaved={() => { setEditingRanges(false); load(); }} />}
      {creating && <NewTemplateDialog ranges={data.ranges} templates={data.templates} presetRangeId={rangeId} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </div>
  );
}

function TemplateCard({ t, onOpen }: { t: TemplateListItem; onOpen: () => void }) {
  const latest = latestOf(t.versions);
  const published = latestPublished(t.versions);
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full text-left glass-panel rounded-2xl p-5 hover:shadow-lg transition-shadow cursor-pointer group">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              <span className="truncate">{t.name}</span>
              {t.is_default && <Star className="w-3.5 h-3.5 shrink-0 fill-[var(--solar)] text-[var(--solar)]" aria-label="Default template" />}
              {t.archived_at && <Archive className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" aria-label="Archived" />}
            </span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {variantChips(t).length ? variantChips(t).map((c) => <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--hover-bg)] text-[var(--text-secondary)]">{c}</span>)
                : <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--hover-bg)] text-[var(--text-muted)]">Any system · any structure</span>}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform" />
        </span>
        <span className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <span className="flex flex-wrap gap-1.5">
            {published && <VersionBadge status="published" version={published.version} />}
            {latest && latest.status === "draft" && <VersionBadge status="draft" version={latest.version} />}
          </span>
          <span className="text-xs text-[var(--text-muted)]">Updated {timeAgo(t.updated_at, new Date())}</span>
        </span>
      </button>
    </li>
  );
}

function RangesDialog({ ranges, onClose, onSaved }: { ranges: CapacityRange[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(() => ranges.map((r) => ({ id: r.id as string | undefined, label: r.label, min_kw: String(r.min_kw), max_kw: r.max_kw === null ? "" : String(r.max_kw) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, k: "label" | "min_kw" | "max_kw", v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const payload = () => rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), label: r.label, min_kw: r.min_kw, max_kw: r.max_kw === "" ? null : r.max_kw }));
  const save = async () => {
    const v = validateRanges(payload());
    if ("error" in v) return setError(v.error);
    setBusy(true);
    setError(null);
    try {
      await api("/api/capacity-ranges", { method: "PUT", body: { ranges: v.value } });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title="Capacity ranges" description="Each range holds system capacities above its lower bound, up to and including its upper bound. Leave the last upper bound blank (open-ended)." onClose={onClose} width="lg"
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save ranges"}</button></>}>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_110px_110px_36px] gap-2 text-xs font-medium text-[var(--text-secondary)] px-1"><span>Name</span><span>Above (kW)</span><span>Up to (kW)</span><span /></div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_110px_110px_36px] gap-2 items-center">
            <input aria-label="Range name" className={fieldCls} value={r.label} onChange={(e) => set(i, "label", e.target.value)} />
            <input aria-label="Lower bound" className={fieldCls} inputMode="decimal" value={r.min_kw} onChange={(e) => set(i, "min_kw", e.target.value)} />
            <input aria-label="Upper bound" className={fieldCls} inputMode="decimal" value={r.max_kw} placeholder="no limit" onChange={(e) => set(i, "max_kw", e.target.value)} />
            <button type="button" aria-label={`Remove ${r.label || "range"}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="h-9 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--hover-bg)] cursor-pointer">×</button>
          </div>
        ))}
        <button type="button" className="text-sm font-medium text-[var(--accent-green)] hover:underline cursor-pointer" onClick={() => setRows((rs) => [...rs, { id: undefined, label: "", min_kw: "", max_kw: "" }])}>+ Add range</button>
        <p className="text-xs text-[var(--text-muted)]">Ranges must start at 0, be contiguous, and end open-ended. A range that still has templates can't be removed.</p>
      </div>
      <ErrorLine msg={error} />
    </Dialog>
  );
}

function NewTemplateDialog({ ranges, templates, presetRangeId, onClose, onCreated }: {
  ranges: CapacityRange[]; templates: TemplateListItem[]; presetRangeId: string | null; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", capacity_range_id: presetRangeId ?? ranges[0]?.id ?? "", system_type: "", structure_type: "", panel_type: "", source_template_id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const sources = templates.filter((t) => !t.archived_at && t.versions.length);
  const save = async () => {
    const v = validateTemplateMeta(form);
    if ("error" in v) return setError(v.error);
    if (!form.capacity_range_id) return setError("Pick a capacity range.");
    setBusy(true);
    setError(null);
    try {
      const { template } = await api<{ template: { id: string } }>("/api/boq-templates", { method: "POST", body: { ...v.value, capacity_range_id: form.capacity_range_id, source_template_id: form.source_template_id || undefined } });
      onCreated(template.id);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title="New BOQ template" description="It starts as a draft copied from another template, so nothing changes until you publish it." onClose={onClose} width="lg"
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} onClick={save} disabled={busy}>{busy ? "Creating…" : "Create draft"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Template name *" wide><input className={fieldCls} value={form.name} onChange={set("name")} placeholder="e.g. Standard On-Grid · Non-elevated" /></Field>
        <Field label="Capacity range *">
          <select className={`${fieldCls} cursor-pointer`} value={form.capacity_range_id} onChange={set("capacity_range_id")}>
            {ranges.map((r) => <option key={r.id} value={r.id}>{r.label} ({rangeRule(r)})</option>)}
          </select>
        </Field>
        <Field label="Copy from" hint="Defaults to this range's default template.">
          <select className={`${fieldCls} cursor-pointer`} value={form.source_template_id} onChange={set("source_template_id")}>
            <option value="">Range default</option>
            {sources.map((t) => <option key={t.id} value={t.id}>{t.name} — {ranges.find((r) => r.id === t.capacity_range_id)?.label}</option>)}
          </select>
        </Field>
        <Field label="System type">
          <select className={`${fieldCls} cursor-pointer`} value={form.system_type} onChange={set("system_type")}><option value="">Any</option>{SYSTEM_TYPES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Structure type">
          <select className={`${fieldCls} cursor-pointer`} value={form.structure_type} onChange={set("structure_type")}><option value="">Any</option>{structureOptions(form.structure_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Field>
        <Field label="Panel type (DCR / NDCR)">
          <select className={`${fieldCls} cursor-pointer`} value={form.panel_type} onChange={set("panel_type")}><option value="">Any</option>{PANEL_TYPES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
      </div>
      <ErrorLine msg={error} />
    </Dialog>
  );
}
