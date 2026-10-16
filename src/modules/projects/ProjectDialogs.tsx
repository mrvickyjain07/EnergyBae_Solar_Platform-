// src/modules/projects/ProjectDialogs.tsx
// Create/edit dialogs for customers, projects and solar systems. They run the
// same validators as the API (projectRules.ts) for instant feedback; the
// server validates again.
import React, { useEffect, useState } from "react";
import Dialog, { Field, fieldCls, primaryBtn, secondaryBtn } from "../../components/ui/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import { structureOptions } from "../proposal/structureTypes";
import { CUSTOMER_TYPES, PROJECT_STATUSES, SYSTEM_TYPES, validateCustomer, validateProject, validateSystem, type CustomerInput, type SystemInput } from "./projectRules";
import { api, Customer, Project, ProjectListItem, ProjectSystem } from "./api";

const ErrorLine = ({ msg }: { msg: string | null }) =>
  msg ? <p role="alert" className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-[var(--text-primary)]">{msg}</p> : null;

type Str<T> = { [K in keyof T]: string };
const blank = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// ── Customer ─────────────────────────────────────────────────────────────
const CUSTOMER_FIELDS = ["name", "customer_type", "contact_name", "phone", "email", "address", "gstin", "notes"] as const;
type CustomerForm = Str<Pick<Customer, (typeof CUSTOMER_FIELDS)[number]>>;

function CustomerFields({ form, set }: { form: CustomerForm; set: (k: keyof CustomerForm, v: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Customer name *" wide><input className={fieldCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. ABC Industries or Asha Patil" /></Field>
      <Field label="Type" hint="Drives subsidy and financial analysis in proposals.">
        <select className={`${fieldCls} cursor-pointer`} value={form.customer_type} onChange={(e) => set("customer_type", e.target.value)}>
          {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      <Field label="Contact person"><input className={fieldCls} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
      <Field label="Phone"><input className={fieldCls} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
      <Field label="Email"><input className={fieldCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
      <Field label="Address" wide><textarea className={`${fieldCls} h-auto py-2 resize-none`} rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
      <Field label="GSTIN" hint="Optional · 15 characters"><input className={`${fieldCls} uppercase`} value={form.gstin} onChange={(e) => set("gstin", e.target.value)} /></Field>
      <Field label="Notes" wide><textarea className={`${fieldCls} h-auto py-2 resize-none`} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
    </div>
  );
}

const customerForm = (c?: Customer | null): CustomerForm =>
  Object.fromEntries(CUSTOMER_FIELDS.map((k) => [k, k === "customer_type" ? c?.customer_type ?? "INDIVIDUAL_HOUSE" : blank(c?.[k])])) as CustomerForm;

export function CustomerDialog({ customer, onClose, onSaved }: { customer?: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
  const [form, setForm] = useState<CustomerForm>(() => customerForm(customer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const v = validateCustomer(form);
    if ("error" in v) return setError(v.error);
    setBusy(true);
    setError(null);
    try {
      const { customer: saved } = customer
        ? await api<{ customer: Customer }>(`/api/customers/${customer.id}`, { method: "PATCH", body: v.value })
        : await api<{ customer: Customer }>("/api/customers", { method: "POST", body: v.value });
      onSaved(saved);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title={customer ? "Edit customer" : "New customer"} onClose={onClose} width="lg"
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save customer"}</button></>}>
      <CustomerFields form={form} set={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
      <ErrorLine msg={error} />
    </Dialog>
  );
}

// ── Project ──────────────────────────────────────────────────────────────
export function ProjectDialog({ project, presetCustomerId, seed, onClose, onSaved }: {
  project?: Project | null;
  presetCustomerId?: string | null;
  /** Prefill for a NEW project, e.g. from a bill analysis — starts on "New customer". */
  seed?: { customer?: Partial<CustomerInput>; siteAddress?: string | null };
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const { can } = useAuth();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [mode, setMode] = useState<"existing" | "new">(() => (seed?.customer && can("customer.create") ? "new" : "existing"));
  const [customerId, setCustomerId] = useState(project?.customer_id ?? presetCustomerId ?? "");
  const [newCustomer, setNewCustomer] = useState<CustomerForm>(() => customerForm((seed?.customer ?? null) as Customer | null));
  const [form, setForm] = useState({ name: project?.name ?? "", status: project?.status ?? "lead", site_address: blank(project?.site_address ?? seed?.siteAddress), notes: blank(project?.notes) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) return;
    api<{ customers: Customer[] }>("/api/customers")
      .then(({ customers }) => {
        setCustomers(customers);
        if (!customers.length && can("customer.create")) setMode("new");
      })
      .catch((e) => setError(e.message));
  }, [project]);

  const save = async () => {
    setError(null);
    let cid = customerId;
    if (!project && mode === "new") {
      const vc = validateCustomer(newCustomer);
      if ("error" in vc) return setError(vc.error);
    }
    const vp = validateProject({ ...form, customer_id: project || mode === "existing" ? cid : "pending" }, !!project);
    if ("error" in vp) return setError(vp.error);
    setBusy(true);
    try {
      if (!project && mode === "new") {
        const created = (await api<{ customer: Customer }>("/api/customers", { method: "POST", body: (validateCustomer(newCustomer) as any).value })).customer;
        cid = created.id;
        // If the project step below fails, a retry must reuse this customer, not create a duplicate.
        setCustomers((list) => [created, ...(list ?? [])]);
        setCustomerId(created.id);
        setMode("existing");
      }
      const body = project ? { name: form.name, status: form.status, site_address: form.site_address, notes: form.notes } : { ...form, customer_id: cid };
      const { project: saved } = project
        ? await api<{ project: Project }>(`/api/projects/${project.id}`, { method: "PATCH", body })
        : await api<{ project: Project }>("/api/projects", { method: "POST", body });
      onSaved(saved);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title={project ? "Edit project" : "New project"} description={project ? undefined : "Add the solar systems next — one project can hold several sites and capacities."} onClose={onClose} width="lg"
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} onClick={save} disabled={busy}>{busy ? "Saving…" : project ? "Save project" : "Create project"}</button></>}>
      <div className="space-y-5">
        {!project && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Customer</p>
              {can("customer.create") && (
                <div role="tablist" aria-label="Customer" className="flex gap-1 text-xs">
                  {(["existing", "new"] as const).map((m) => (
                    <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                      className={`h-7 px-2.5 rounded-md font-medium cursor-pointer ${mode === m ? "bg-[var(--hover-bg)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                      {m === "existing" ? "Existing" : "New customer"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {mode === "existing" ? (
              <select aria-label="Customer" className={`${fieldCls} cursor-pointer`} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!customers}>
                <option value="">{customers ? (customers.length ? "Choose a customer…" : "No customers yet") : "Loading…"}</option>
                {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <CustomerFields form={newCustomer} set={(k, v) => setNewCustomer((f) => ({ ...f, [k]: v }))} />
            )}
          </section>
        )}
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Project name *" wide><input className={fieldCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Solar Deployment 2026" /></Field>
          <Field label="Status">
            <select className={`${fieldCls} cursor-pointer`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Project["status"] })}>
              {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Main site address" hint="Each system can have its own site."><input className={fieldCls} value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })} /></Field>
          <Field label="Notes" wide><textarea className={`${fieldCls} h-auto py-2 resize-none`} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </section>
      </div>
      <ErrorLine msg={error} />
    </Dialog>
  );
}

// ── Solar system ─────────────────────────────────────────────────────────
export function SystemDialog({ projectId, system, initial, onClose, onSaved }: {
  projectId: string;
  system?: ProjectSystem | null;
  /** Prefill for a NEW system (e.g. from a saved bill analysis). Ignored when editing. */
  initial?: Partial<SystemInput>;
  onClose: () => void;
  onSaved: (s: ProjectSystem) => void;
}) {
  const seed: Partial<SystemInput> = system ?? initial ?? {};
  const [form, setForm] = useState({
    name: seed.name ?? "",
    site_address: blank(seed.site_address),
    capacity_kw: blank(seed.capacity_kw),
    system_type: seed.system_type ?? "On-Grid",
    phase: blank(seed.phase),
    structure_type: blank(seed.structure_type),
    panel_brand: blank(seed.panel_brand),
    panel_wp: blank(seed.panel_wp),
    inverter_brand: blank(seed.inverter_brand),
    notes: blank(seed.notes),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const v = validateSystem(form);
    if ("error" in v) return setError(v.error);
    setBusy(true);
    setError(null);
    try {
      const { system: saved } = system
        ? await api<{ system: ProjectSystem }>(`/api/projects/${projectId}/systems/${system.id}`, { method: "PATCH", body: v.value })
        : await api<{ system: ProjectSystem }>(`/api/projects/${projectId}/systems`, { method: "POST", body: v.value });
      onSaved(saved);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title={system ? "Edit solar system" : "Add solar system"} description="Only what you've decided — sizing, cables and earthing are calculated in the BOQ." onClose={onClose} width="lg"
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save system"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="System name *" wide><input className={fieldCls} value={form.name} onChange={set("name")} placeholder="e.g. Pune factory rooftop" /></Field>
        <Field label="Capacity (kW)" hint="Leave blank if the bill analysis will decide it."><input className={fieldCls} inputMode="decimal" value={form.capacity_kw} onChange={set("capacity_kw")} placeholder="e.g. 50" /></Field>
        <Field label="System type">
          <select className={`${fieldCls} cursor-pointer`} value={form.system_type} onChange={set("system_type")}>{SYSTEM_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Phase">
          <select className={`${fieldCls} cursor-pointer`} value={form.phase} onChange={set("phase")}>
            <option value="">Not decided</option><option value="1">1-Phase</option><option value="3">3-Phase</option>
          </select>
        </Field>
        <Field label="Structure">
          <select className={`${fieldCls} cursor-pointer`} value={form.structure_type} onChange={set("structure_type")}>
            <option value="">Not decided</option>{structureOptions(form.structure_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Panel brand"><input className={fieldCls} value={form.panel_brand} onChange={set("panel_brand")} placeholder="e.g. Waaree" /></Field>
        <Field label="Panel wattage (Wp)"><input className={fieldCls} inputMode="numeric" value={form.panel_wp} onChange={set("panel_wp")} placeholder="e.g. 545" /></Field>
        <Field label="Inverter brand"><input className={fieldCls} value={form.inverter_brand} onChange={set("inverter_brand")} placeholder="e.g. Solis" /></Field>
        <Field label="Site address" hint="If different from the project's main site." wide><input className={fieldCls} value={form.site_address} onChange={set("site_address")} /></Field>
        <Field label="Notes" wide><textarea className={`${fieldCls} h-auto py-2 resize-none`} rows={2} value={form.notes} onChange={set("notes")} /></Field>
      </div>
      <ErrorLine msg={error} />
    </Dialog>
  );
}

// ── Pick a project (save / link a bill analysis) ────────────────────────
const STANDALONE = "__standalone";

/** Project picker. The caller does the API call in `onPick` (throw to show an error). */
export function PickProjectDialog({ title, description, confirmLabel, allowStandalone, presetProjectId, seed, onClose, onPick }: {
  title: string;
  description?: string;
  confirmLabel: string;
  /** Offer "No project — save standalone" (project is never mandatory for a bill). */
  allowStandalone?: boolean;
  presetProjectId?: string | null;
  /** Prefill for "+ New project". */
  seed?: { customer?: Partial<CustomerInput>; siteAddress?: string | null };
  onClose: () => void;
  onPick: (projectId: string | null) => Promise<void>;
}) {
  const { can } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [choice, setChoice] = useState(presetProjectId ?? "");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!can("project.view")) return setProjects([]);
    api<{ projects: ProjectListItem[] }>("/api/projects").then(({ projects }) => setProjects(projects)).catch((e) => setError(e.message));
  }, []);

  const confirm = async () => {
    if (!choice) return setError(allowStandalone ? "Pick a project, or save it without one." : "Pick a project.");
    setBusy(true);
    setError(null);
    try {
      await onPick(choice === STANDALONE ? null : choice);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (creating) {
    return <ProjectDialog seed={seed} onClose={() => setCreating(false)} onSaved={(p) => {
      setProjects((list) => [{ id: p.id, name: p.name, customer: null } as ProjectListItem, ...(list ?? [])]);
      setChoice(p.id);
      setCreating(false);
    }} />;
  }

  return (
    <Dialog title={title} description={description} onClose={onClose}
      footer={<><button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button><button type="button" className={primaryBtn} onClick={confirm} disabled={busy || !projects}>{busy ? "Saving…" : confirmLabel}</button></>}>
      <Field label="Project">
        <select className={`${fieldCls} cursor-pointer`} value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!projects}>
          <option value="">{projects ? "Choose…" : "Loading…"}</option>
          {allowStandalone && <option value={STANDALONE}>No project — save on its own</option>}
          {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.customer ? `${p.customer.name} · ${p.name}` : p.name}</option>)}
        </select>
      </Field>
      {can("project.create") && (
        <button type="button" onClick={() => setCreating(true)} className="mt-3 text-sm font-medium text-[var(--accent-green)] hover:underline cursor-pointer">+ New project{seed?.customer?.name ? ` for ${seed.customer.name}` : ""}</button>
      )}
      <ErrorLine msg={error} />
    </Dialog>
  );
}
