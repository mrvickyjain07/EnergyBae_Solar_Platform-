// src/modules/boqTemplates/TemplateEditor.tsx
// One BOQ template: its details, and any version's definition. A draft is
// editable (Save / Publish); a published version is read-only and shown as
// such — the server and the database both refuse to change it. "New version"
// copies the latest version into the next draft.
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, RefreshCw, Save, Send, CopyPlus, Star, Archive, ArchiveRestore, Lock, PenLine, Info, Calculator, Ruler, Cable, Zap, IndianRupee, History, HelpCircle,
} from "lucide-react";
import Dialog, { Field, fieldCls, primaryBtn, secondaryBtn } from "../../components/ui/Dialog";
import SegmentedTabs from "../../components/SegmentedTabs";
import { useAuth } from "../../contexts/AuthContext";
import { formatExpr } from "../boqEngine/ruleEngine";
import { LEGACY_V1 } from "../boqEngine/legacyV1";
import { QUANTITY_NAMES, describeExpr, describeText, namesIn, refLabel } from "../boqEngine/quantityNames";
import { provisionalDecision } from "../boqEngine/pendingDecisions";
import { structureOptions } from "../proposal/structureTypes";
import { api, type CapacityRange, type TemplateDetail, type TemplateVersion } from "./api";
import {
  ACDB_RULES, BUILTIN_ENGINES, CABLE_FIELDS, CLARIFICATION_MEANINGS, CLARIFICATION_REQUIRED, COMMERCIAL_RATE_FIELDS, EARTHING_TYPES, PANEL_TYPES, QUOTE_SEQUENCES, STRUCTURE_FIELDS, SYSTEM_TYPES,
  rangeRule, validateTemplateDocument, validateTemplateMeta, type TemplateDocument,
} from "./templateRules";
import { VersionBadge, variantChips } from "./templateUi";

type Tab = "basic" | "items" | "defaults" | "commercial" | "versions";
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const numOrBlank = (v: number | null) => (v === null || v === undefined ? "" : String(v));
const parseNum = (s: string): number | null => (s.trim() === "" ? null : Number(s));
const ErrorLine = ({ msg }: { msg: string | null }) =>
  msg ? <p role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-[var(--text-primary)]">{msg}</p> : null;

export default function TemplateEditor({ templateId, ranges, onBack }: { templateId: string; ranges: CapacityRange[]; onBack: () => void }) {
  const { can } = useAuth();
  const [data, setData] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [doc, setDoc] = useState<TemplateDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("commercial");
  const [confirmPublish, setConfirmPublish] = useState(false);

  const load = (selectId?: string) => {
    setError(null);
    api<TemplateDetail>(`/api/boq-templates/${templateId}`)
      .then((d) => {
        setData(d);
        const pick = d.versions.find((v) => v.id === selectId) ?? d.versions[0];
        setVersionId(pick?.id ?? null);
        setDoc(pick ? structuredClone(pick.definition) : null);
        setDirty(false);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => load(), [templateId]);

  const version = data?.versions.find((v) => v.id === versionId) ?? null;
  const editable = !!version && version.status === "draft" && can("boq_template.update") && !data?.template.archived_at;
  const hasDraft = !!data?.versions.some((v) => v.status === "draft");

  const selectVersion = (id: string) => {
    if (dirty && !window.confirm("Discard unsaved changes to this draft?")) return;
    const v = data!.versions.find((x) => x.id === id)!;
    setVersionId(id);
    setDoc(structuredClone(v.definition));
    setDirty(false);
    setActionError(null);
  };
  const update = (fn: (d: TemplateDocument) => void) => {
    setDoc((cur) => {
      const next = structuredClone(cur!);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try { await fn(); } catch (e: any) { setActionError(e.message); } finally { setBusy(false); }
  };
  const saveDraft = () => run(async () => {
    const v = validateTemplateDocument(doc);
    if ("error" in v) throw new Error(v.error);
    await api(`/api/boq-template-versions/${version!.id}`, { method: "PATCH", body: { definition: v.value } });
    load(version!.id);
  });
  const publish = () => run(async () => {
    if (dirty) {
      const v = validateTemplateDocument(doc);
      if ("error" in v) throw new Error(v.error);
      await api(`/api/boq-template-versions/${version!.id}`, { method: "PATCH", body: { definition: v.value } });
    }
    await api(`/api/boq-template-versions/${version!.id}/publish`, { method: "POST" });
    setConfirmPublish(false);
    load(version!.id);
  });
  const newVersion = () => run(async () => {
    const { version: v } = await api<{ version: TemplateVersion }>(`/api/boq-templates/${templateId}/versions`, { method: "POST" });
    load(v.id);
    setTab("commercial");
  });
  const patchTemplate = (body: Record<string, unknown>) => run(async () => {
    await api(`/api/boq-templates/${templateId}`, { method: "PATCH", body });
    load(versionId ?? undefined);
  });

  if (error) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <p className="text-sm text-[var(--text-primary)]">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className={secondaryBtn} onClick={onBack}><ArrowLeft className="w-4 h-4" /> All templates</button>
          <button type="button" className={secondaryBtn} onClick={() => load()}><RefreshCw className="w-4 h-4" /> Try again</button>
        </div>
      </div>
    );
  }
  if (!data || !doc || !version) return <div className="space-y-4" aria-busy="true">{[60, 120, 360].map((h) => <div key={h} style={{ height: h }} className="rounded-2xl bg-[var(--hover-bg)] animate-pulse" />)}</div>;

  const { template, companyDefaults } = data;
  const range = ranges.find((r) => r.id === template.capacity_range_id);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <button type="button" onClick={() => { if (!dirty || window.confirm("Leave without saving this draft?")) onBack(); }} className="inline-flex items-center gap-1.5 hover:text-[var(--text-primary)] cursor-pointer"><ArrowLeft className="w-4 h-4" /> BOQ Templates</button>
        <span>/</span><span>{range?.label ?? "Range"}</span><span>/</span><span className="text-[var(--text-primary)] font-medium truncate">{template.name}</span>
      </nav>

      {/* Header */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] flex flex-wrap items-center gap-2">
              {template.name}
              {template.is_default && <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--solar)]/12 text-[var(--solar-text)]"><Star className="w-3 h-3 fill-current" /> Range default</span>}
              {template.archived_at && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--hover-bg)] text-[var(--text-muted)]">Archived</span>}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {range ? `${range.label} · system capacity ${rangeRule(range)}` : ""}{variantChips(template).length ? ` · ${variantChips(template).join(" · ")}` : " · any system / structure / panel"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="version-pick">Version</label>
            <select id="version-pick" value={version.id} onChange={(e) => selectVersion(e.target.value)} className={`${fieldCls} w-auto cursor-pointer`}>
              {data.versions.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.status === "published" ? "Published" : "Draft"}</option>)}
            </select>
            {editable && <button type="button" className={secondaryBtn} disabled={busy || !dirty} onClick={saveDraft}><Save className="w-4 h-4" /> {dirty ? "Save draft" : "Saved"}</button>}
            {version.status === "draft" && can("boq_template.publish") && !template.archived_at && (
              <button type="button" className={primaryBtn} disabled={busy} onClick={() => setConfirmPublish(true)}><Send className="w-4 h-4" /> Publish v{version.version}</button>
            )}
            {!hasDraft && can("boq_template.update") && !template.archived_at && (
              <button type="button" className={primaryBtn} disabled={busy} onClick={newVersion}><CopyPlus className="w-4 h-4" /> New version</button>
            )}
          </div>
        </div>

        <div className={`mt-5 flex items-start gap-3 rounded-xl p-4 ${version.status === "published" ? "bg-emerald-500/[0.07]" : "bg-[var(--solar)]/[0.08]"}`}>
          {version.status === "published" ? <Lock className="w-5 h-5 mt-0.5 shrink-0 text-[var(--success-text)]" /> : <PenLine className="w-5 h-5 mt-0.5 shrink-0 text-[var(--solar-text)]" />}
          <div className="text-sm">
            <p className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <VersionBadge status={version.status} version={version.version} />
              {version.status === "published" ? "Published — read only" : editable ? "Draft — editable" : "Draft"}
            </p>
            <p className="mt-1 text-[var(--text-secondary)]">
              {version.status === "published"
                ? `Published ${fmtDate(version.published_at)}${version.published_by_name ? ` by ${version.published_by_name}` : ""}. It can never change — ${hasDraft ? "edit the open draft" : "create a new version"} to make changes.`
                : `Created ${fmtDate(version.created_at)}${version.created_by_name ? ` by ${version.created_by_name}` : ""}. Publishing freezes it permanently.`}
            </p>
          </div>
        </div>
        {actionError && <div className="mt-4"><ErrorLine msg={actionError} /></div>}
      </section>

      <SegmentedTabs<Tab>
        ariaLabel="Template sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: "basic", label: "Basic", icon: Info },
          { value: "items", label: "BOQ items", icon: Calculator },
          { value: "defaults", label: "Defaults", icon: Ruler },
          { value: "commercial", label: "Commercial", icon: IndianRupee },
          { value: "versions", label: "Versions", icon: History },
        ]}
      />

      {tab === "basic" && <BasicTab template={template} ranges={ranges} busy={busy} onSave={patchTemplate} />}
      {tab === "items" && <ItemsTab doc={doc} />}
      {tab === "defaults" && <DefaultsTab doc={doc} editable={editable} update={update} />}
      {tab === "commercial" && <CommercialTab doc={doc} editable={editable} update={update} companyDefaults={companyDefaults} />}
      {tab === "versions" && <VersionsTab versions={data.versions} selected={version.id} onSelect={selectVersion} />}

      {confirmPublish && (
        <Dialog title={`Publish v${version.version}?`} description="A published version can never be edited or deleted." onClose={() => setConfirmPublish(false)}
          footer={<><button type="button" className={secondaryBtn} onClick={() => setConfirmPublish(false)}>Cancel</button><button type="button" className={primaryBtn} disabled={busy} onClick={publish}>{busy ? "Publishing…" : "Publish"}</button></>}>
          <p className="text-sm text-[var(--text-secondary)]">{dirty ? "Your unsaved changes will be saved first. " : ""}Future BOQs generated from this template will record this exact version. Quotes made with today's BOQ calculator are not affected.</p>
          {actionError && <div className="mt-3"><ErrorLine msg={actionError} /></div>}
        </Dialog>
      )}
    </div>
  );
}

// ── Basic ─────────────────────────────────────────────────────────────────
function BasicTab({ template, ranges, busy, onSave }: { template: TemplateDetail["template"]; ranges: CapacityRange[]; busy: boolean; onSave: (b: Record<string, unknown>) => void }) {
  const { can } = useAuth();
  const canEdit = can("boq_template.update") && !template.archived_at;
  const [form, setForm] = useState({ name: template.name, system_type: template.system_type ?? "", structure_type: template.structure_type ?? "", panel_type: template.panel_type ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const range = ranges.find((r) => r.id === template.capacity_range_id);
  const save = () => {
    const v = validateTemplateMeta(form, true);
    if ("error" in v) return setErr(v.error);
    setErr(null);
    onSave(v.value);
  };
  return (
    <section className="glass-panel rounded-2xl p-6 space-y-5">
      <p className="text-sm text-[var(--text-muted)]">Template details apply to every version. Changing them never alters a published definition.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Template name" wide><input className={fieldCls} value={form.name} onChange={set("name")} disabled={!canEdit} /></Field>
        <Field label="Capacity range"><input className={fieldCls} value={range ? `${range.label} (${rangeRule(range)})` : ""} disabled /></Field>
        <Field label="System type"><select className={`${fieldCls} cursor-pointer`} value={form.system_type} onChange={set("system_type")} disabled={!canEdit}><option value="">Any</option>{SYSTEM_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Structure type"><select className={`${fieldCls} cursor-pointer`} value={form.structure_type} onChange={set("structure_type")} disabled={!canEdit}><option value="">Any</option>{structureOptions(form.structure_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        <Field label="Panel type (DCR / NDCR)"><select className={`${fieldCls} cursor-pointer`} value={form.panel_type} onChange={set("panel_type")} disabled={!canEdit}><option value="">Any</option>{PANEL_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <ErrorLine msg={err} />
      <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border-subtle)]">
        {canEdit && <button type="button" className={primaryBtn} disabled={busy} onClick={save}><Save className="w-4 h-4" /> Save details</button>}
        {canEdit && !template.is_default && <button type="button" className={secondaryBtn} disabled={busy} onClick={() => onSave({ is_default: true })}><Star className="w-4 h-4" /> Make range default</button>}
        {can("boq_template.delete") && (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => (template.archived_at || window.confirm(`Archive "${template.name}"? Its versions are kept.`)) && onSave({ archived: !template.archived_at })}>
            {template.archived_at ? <><ArchiveRestore className="w-4 h-4" /> Restore</> : <><Archive className="w-4 h-4" /> Archive</>}
          </button>
        )}
      </div>
    </section>
  );
}

// ── BOQ items (read-only: rules come from the calculation engine) ─────────
function costSource(e: any): string {
  const s = JSON.stringify(e);
  if (s.includes('"bos"')) return "Catalogue (Price DB)";
  if (s.includes('"calc":"acdb"') || s.includes('"calc":"dcdb"')) return "Catalogue lookup";
  if (s.includes('"input"')) return "Form / price list";
  if (s.includes('"ref"')) return "Calculated";
  return "Fixed";
}
function ItemsTab({ doc }: { doc: TemplateDocument }) {
  const def = doc.engine.kind === "builtin" ? LEGACY_V1 : doc.engine.definition;
  const [open, setOpen] = useState<number | null>(null);
  // Raw rule syntax is for people who maintain templates; everyone else reads the business wording.
  const technical = useAuth().can("boq_template.update");
  const quantities = useMemo(() => Object.fromEntries(def.quantities.map((q) => [q.key, q.expr])), [def]);
  return (
    <section className="glass-panel rounded-2xl p-6 space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-[var(--hover-bg)] p-4">
        <Lock className="w-5 h-5 mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">
          Engine: <b>{doc.engine.kind === "builtin" ? BUILTIN_ENGINES[doc.engine.id] : "Rule-based template"}</b>. {doc.engine.kind === "builtin"
            ? "Its lines are fixed so it stays identical to today's calculator. Editable line rules come with the template engine, after the workbook decisions are approved."
            : "Line rules are shown read-only."} Every line can still be edited or removed per quote.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              <th className="py-2 pr-3 font-medium">#</th><th className="py-2 pr-3 font-medium">Item</th><th className="py-2 pr-3 font-medium">Group</th>
              <th className="py-2 pr-3 font-medium">Unit</th><th className="py-2 pr-3 font-medium">Quantity rule</th><th className="py-2 pr-3 font-medium">Unit cost</th><th className="py-2 font-medium">Per quote</th>
            </tr>
          </thead>
          <tbody>
            {def.items.map((it) => {
              const refs = [...namesIn(it.qty).refs].filter((k) => k in quantities);
              // Line numbers in PROVISIONAL_LINES are legacy-v1's; a rule-based definition numbers its own lines.
              const pending = doc.engine.kind === "builtin" ? provisionalDecision(it.sr) : null;
              return (
                <React.Fragment key={it.key}>
                  <tr className="border-b border-[var(--border-subtle)] align-top">
                    <td className="py-2.5 pr-3 tabular-nums text-[var(--text-muted)]">{it.sr}</td>
                    <td className="py-2.5 pr-3 font-medium text-[var(--text-primary)]">{describeText(it.name)}</td>
                    <td className="py-2.5 pr-3 text-[var(--text-secondary)]">{it.group}</td>
                    <td className="py-2.5 pr-3 text-[var(--text-secondary)]">{it.unit}</td>
                    <td className="py-2.5 pr-3 max-w-md">
                      <span className="text-xs text-[var(--text-secondary)]">{describeExpr(it.qty)}</span>
                      {pending && <span title={`Provisional: awaiting decision ${pending.id} (${pending.title})`} className="ml-2 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600">Pending {pending.id}</span>}
                      {refs.length > 0 && <button type="button" aria-expanded={open === it.sr} onClick={() => setOpen(open === it.sr ? null : it.sr)} className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--accent-green)] hover:underline cursor-pointer"><HelpCircle className="w-3 h-3" /> Why?</button>}
                    </td>
                    <td className="py-2.5 pr-3 text-[var(--text-secondary)]">{costSource(it.unitCost)}</td>
                    <td className="py-2.5 text-xs text-[var(--text-muted)]">Editable · removable</td>
                  </tr>
                  {open === it.sr && (
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--hover-bg)]/50">
                      <td />
                      <td colSpan={6} className="py-3 pr-3">
                        <ul className="space-y-2 text-xs">
                          {refs.map((k) => (
                            <li key={k}>
                              <span className="font-medium text-[var(--text-primary)]">{refLabel(k)}</span>
                              {QUANTITY_NAMES[k]?.unit && <span className="text-[var(--text-muted)]"> ({QUANTITY_NAMES[k].unit})</span>}
                              {QUANTITY_NAMES[k]?.role && <span className="text-[var(--text-muted)]"> — {QUANTITY_NAMES[k].role}</span>}
                              <div className="text-[var(--text-secondary)]">= {describeExpr(quantities[k])}</div>
                            </li>
                          ))}
                        </ul>
                        {technical && (
                          <details className="mt-2 text-xs text-[var(--text-muted)]">
                            <summary className="cursor-pointer">Technical formula</summary>
                            <code className="block break-all mt-1">{formatExpr(it.qty)}</code>
                            {refs.map((k) => <code key={k} className="block break-all">{k} = {formatExpr(quantities[k])}</code>)}
                          </details>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Defaults ──────────────────────────────────────────────────────────────
function NumberInput({ value, onChange, disabled, unit, label, placeholder }: { value: number | null; onChange: (v: number | null) => void; disabled: boolean; unit: string; label: string; placeholder?: string }) {
  const [text, setText] = useState(numOrBlank(value));
  useEffect(() => setText(numOrBlank(value)), [value]);
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</span>
      <span className="relative block">
        <input className={`${fieldCls} pr-14 tabular-nums`} inputMode="decimal" value={text} disabled={disabled} placeholder={placeholder ?? "Not set"}
          onChange={(e) => { setText(e.target.value); const n = parseNum(e.target.value); if (n === null || Number.isFinite(n)) onChange(n); }} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] pointer-events-none">{unit}</span>
      </span>
    </label>
  );
}

function Card({ title, icon: Icon, children, hint }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; hint?: string }) {
  return (
    <section className="glass-panel rounded-2xl p-6">
      <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2"><Icon className="w-4 h-4 text-[var(--text-muted)]" /> {title}</h3>
      {hint && <p className="text-sm text-[var(--text-muted)] mt-1">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DefaultsTab({ doc, editable, update }: { doc: TemplateDocument; editable: boolean; update: (fn: (d: TemplateDocument) => void) => void }) {
  const d = doc.defaults;
  const [advanced, setAdvanced] = useState(false);
  const basicStructure = STRUCTURE_FIELDS.filter((f) => ["uClamps", "zClamps", "walkwayM", "ladderBracingM", "laQty", "purlinExtraM"].includes(f.key));
  const advancedStructure = STRUCTURE_FIELDS.filter((f) => !basicStructure.includes(f));
  return (
    <div className="space-y-6">
      <Card title="Cable" icon={Cable} hint="Final length = calculated length + spare (template) + extra (per project, later). Blank = not set.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CABLE_FIELDS.map((f) => <NumberInput key={f.key} label={f.label} unit={f.unit} value={d.cable[f.key]} disabled={!editable} onChange={(v) => update((x) => { x.defaults.cable[f.key] = v; })} />)}
        </div>
      </Card>
      <Card title="Structure" icon={Ruler} hint="Typed per project in the source BOQs, so they are defaults here — no formula is applied. Blank = not set.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {basicStructure.map((f) => <NumberInput key={f.key} label={f.label} unit={f.unit} value={d.structure[f.key]} disabled={!editable} onChange={(v) => update((x) => { x.defaults.structure[f.key] = v; })} />)}
        </div>
        <button type="button" onClick={() => setAdvanced(!advanced)} className="mt-4 text-sm font-medium text-[var(--accent-green)] hover:underline cursor-pointer">{advanced ? "Hide" : "Show"} advanced structure parameters</button>
        {advanced && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {advancedStructure.map((f) => <NumberInput key={f.key} label={f.label} unit={f.unit} value={d.structure[f.key]} disabled={!editable} onChange={(v) => update((x) => { x.defaults.structure[f.key] = v; })} />)}
          </div>
        )}
        <div className="mt-5 rounded-xl border border-dashed border-[var(--border-strong)] p-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">Business clarification required</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Named in the product spec. Their formulas are not confirmed and appear in none of the source BOQs, so no rule uses them.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{CLARIFICATION_REQUIRED.map((k) => <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-[var(--hover-bg)] text-[var(--text-muted)]">{CLARIFICATION_MEANINGS[k] ? `${k} · ${CLARIFICATION_MEANINGS[k]}` : k}</span>)}</div>
        </div>
      </Card>
      <Card title="Earthing & ACDB" icon={Zap}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Earthing type" hint="Pits = 2 × inverters + 1; Conventional +0, ESE +2, NA −1.">
            <select className={`${fieldCls} cursor-pointer`} value={d.earthing.type} disabled={!editable} onChange={(e) => update((x) => { x.defaults.earthing.type = e.target.value as any; })}>
              {EARTHING_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ACDB quantity">
            <select className={`${fieldCls} cursor-pointer`} value={d.acdb.rule} disabled={!editable} onChange={(e) => update((x) => { x.defaults.acdb.rule = e.target.value as any; })}>
              {ACDB_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Notes" icon={Info}>
        <textarea className={`${fieldCls} h-auto py-2 resize-none`} rows={3} value={doc.notes} disabled={!editable} placeholder="What changed in this version, and why" onChange={(e) => update((x) => { x.notes = e.target.value; })} />
      </Card>
    </div>
  );
}

// ── Commercial ────────────────────────────────────────────────────────────
function CommercialTab({ doc, editable, update, companyDefaults }: { doc: TemplateDocument; editable: boolean; update: (fn: (d: TemplateDocument) => void) => void; companyDefaults: TemplateDetail["companyDefaults"] }) {
  const c = doc.commercial;
  return (
    <div className="space-y-6">
      <Card title="Rates" icon={IndianRupee} hint="Blank inherits the company default from Pricing (Price DB). Enter a value to override it for this template version.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMMERCIAL_RATE_FIELDS.map((f) => (
            <div key={f.key}>
              <NumberInput label={f.label} unit={f.unit} value={c[f.key]} disabled={!editable} placeholder={`Company default: ${companyDefaults?.[f.companyKey] ?? "—"}`} onChange={(v) => update((x) => { x.commercial[f.key] = v; })} />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{c[f.key] === null ? `Inheriting ${companyDefaults?.[f.companyKey] ?? "—"} ${f.unit}` : "Overridden for this template"}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Insurance" icon={IndianRupee} hint="Insurance = Sub-total × cover multiplier ÷ 1000 × factor A × factor B + fixed amount (the form used in the source BOQs).">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([["coverMultiplier", "Cover multiplier", "×"], ["factorA", "Factor A", "×"], ["factorB", "Factor B", "×"], ["fixedAmount", "Fixed amount", "₹"]] as const).map(([k, label, unit]) => (
            <NumberInput key={k} label={label} unit={unit} value={c.insurance[k]} disabled={!editable} placeholder="Required" onChange={(v) => update((x) => { x.commercial.insurance[k] = v as number; })} />
          ))}
        </div>
      </Card>
      <Card title="Quote" icon={Calculator}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label="Quote adjustment" unit="₹/W" value={c.quoteAdjustmentPerW} disabled={!editable} placeholder="Required" onChange={(v) => update((x) => { x.commercial.quoteAdjustmentPerW = v as number; })} />
          <Field label="Quote sequence">
            <select className={`${fieldCls} cursor-pointer`} value={c.quoteSequence} disabled={!editable} onChange={(e) => update((x) => { x.commercial.quoteSequence = e.target.value as any; })}>
              {QUOTE_SEQUENCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <ol className="mt-5 grid gap-1.5 text-sm text-[var(--text-secondary)] list-decimal list-inside rounded-xl bg-[var(--hover-bg)] p-4">
          <li>Material + Installation + Transport + Liaisoning + Insurance + Profit = <b>Total before GST</b></li>
          <li>₹/W = Total before GST ÷ (system kW × 1000)</li>
          <li>First quote rate = ROUNDUP(₹/W) + quote adjustment</li>
          {c.quoteSequence === "approved-v1"
            ? <><li>Quoted price = first quote rate × system kW × 1000</li><li>Final = quoted price + GST</li></>
            : <li>Final = Total before GST + GST (first quote rate shown for reference only — today's calculator)</li>}
        </ol>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Per-kW charges and the ₹/W rate use the system (required) capacity.</p>
      </Card>
    </div>
  );
}

// ── Versions ──────────────────────────────────────────────────────────────
function VersionsTab({ versions, selected, onSelect }: { versions: TemplateVersion[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <section className="glass-panel rounded-2xl p-6">
      <ol className="relative border-l border-[var(--border-subtle)] ml-2 space-y-5">
        {versions.map((v) => (
          <li key={v.id} className="ml-5">
            <span className={`absolute -left-[7px] mt-1.5 size-3 rounded-full ring-4 ring-[var(--bg-card)] ${v.status === "published" ? "bg-[var(--accent-green)]" : "bg-[var(--solar)]"}`} />
            <div className="flex flex-wrap items-center gap-2">
              <VersionBadge status={v.status} version={v.version} />
              {v.id === selected ? <span className="text-xs text-[var(--text-muted)]">Viewing</span> : <button type="button" onClick={() => onSelect(v.id)} className="text-xs font-medium text-[var(--accent-green)] hover:underline cursor-pointer">View</button>}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Created {fmtDate(v.created_at)}{v.created_by_name ? ` by ${v.created_by_name}` : ""}
              {v.status === "published" && <> · Published {fmtDate(v.published_at)}{v.published_by_name ? ` by ${v.published_by_name}` : " (seeded)"}</>}
            </p>
            {v.definition.notes && <p className="mt-1 text-sm text-[var(--text-muted)] whitespace-pre-wrap">{v.definition.notes}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
