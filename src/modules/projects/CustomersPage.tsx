// src/modules/projects/CustomersPage.tsx
// Customers of the company: searchable list, create/edit, archive, and a
// drill-in to their projects. Real data from /api/customers.
import React, { useEffect, useState } from "react";
import { Plus, Search, Users, Building2, Phone, Mail, Pencil, Archive, ArchiveRestore, FolderKanban, RefreshCw } from "lucide-react";
import EmptyState from "../../components/ui/EmptyState";
import { primaryBtn, secondaryBtn } from "../../components/ui/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import { api, Customer } from "./api";
import { CUSTOMER_TYPES } from "./projectRules";
import { CustomerDialog, ProjectDialog } from "./ProjectDialogs";
import { STATUS_STYLE, statusLabel } from "./ProjectsPage";

interface CustomerProject { id: string; name: string; status: keyof typeof STATUS_STYLE; archived_at: string | null }

export default function CustomersPage({ onOpenProject }: { onOpenProject: (projectId: string) => void }) {
  const { can } = useAuth();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [projects, setProjects] = useState<CustomerProject[] | null>(null);
  const [dialog, setDialog] = useState<"new" | "edit" | "project" | null>(null);

  const load = () => {
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    if (showArchived) params.set("archived", "true");
    api<{ customers: Customer[] }>(`/api/customers?${params}`).then((d) => setCustomers(d.customers)).catch((e) => setError(e.message));
  };
  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [query, showArchived]);

  useEffect(() => {
    if (!selected) return;
    setProjects(null);
    api<{ projects: CustomerProject[] }>(`/api/customers/${selected.id}`).then((d) => setProjects(d.projects)).catch(() => setProjects([]));
  }, [selected?.id]);

  const toggleArchive = async (c: Customer) => {
    if (!c.archived_at && !window.confirm(`Archive ${c.name}? They'll be hidden from lists but nothing is deleted.`)) return;
    try {
      const { customer } = await api<{ customer: Customer }>(`/api/customers/${c.id}`, { method: "PATCH", body: { archived: !c.archived_at } });
      setSelected(customer);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const typeLabel = (t: string) => CUSTOMER_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <section className="glass-panel rounded-2xl overflow-hidden h-fit">
        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border-subtle)]">
          <label className="relative w-full md:w-80">
            <span className="sr-only">Search customers</span>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or email"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]" />
          </label>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[var(--accent-solid)]" /> Show archived
            </label>
            {can("customer.create") && <button type="button" className={primaryBtn} onClick={() => setDialog("new")}><Plus className="w-4 h-4" /> New customer</button>}
          </div>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-[var(--text-primary)]">{error}</p>
            <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-green)] cursor-pointer"><RefreshCw className="w-4 h-4" /> Try again</button>
          </div>
        ) : customers === null ? (
          <div className="p-4 space-y-3" aria-busy="true">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-12 rounded-lg bg-[var(--hover-bg)] animate-pulse" />)}</div>
        ) : customers.length === 0 ? (
          <div className="p-6">
            {query ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">No customers match “{query}”.</p>
            ) : (
              <EmptyState icons={[Users, Building2, FolderKanban]} title="No customers yet" description="Add a customer once and reuse them for every project and proposal.">
                {can("customer.create") && <button type="button" className={primaryBtn} onClick={() => setDialog("new")}><Plus className="w-4 h-4" /> Add your first customer</button>}
              </EmptyState>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {customers.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelected(c)} aria-current={selected?.id === c.id ? "true" : undefined}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left cursor-pointer ${selected?.id === c.id ? "bg-[var(--hover-bg)]" : "hover:bg-[var(--hover-bg)]/60"}`}>
                  <span className="size-9 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] text-xs font-semibold grid place-items-center shrink-0">
                    {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] truncate">{c.name}{c.archived_at && <Archive className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-label="Archived" />}</span>
                    <span className="block text-xs text-[var(--text-muted)] truncate">{typeLabel(c.customer_type)}{c.phone ? ` · ${c.phone}` : ""}</span>
                  </span>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">{c.project_count ?? 0} project{c.project_count === 1 ? "" : "s"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="glass-panel rounded-2xl p-6 h-fit">
        {!selected ? (
          <p className="text-sm text-[var(--text-muted)]">Select a customer to see their details and projects.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-[var(--text-primary)]">{selected.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{typeLabel(selected.customer_type)}{selected.archived_at ? " · Archived" : ""}</p>
              </div>
              <div className="flex gap-1">
                {can("customer.update") && <button type="button" onClick={() => setDialog("edit")} aria-label="Edit customer" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer"><Pencil className="w-4 h-4" /></button>}
                {can("customer.delete") && (
                  <button type="button" onClick={() => toggleArchive(selected)} aria-label={selected.archived_at ? "Restore customer" : "Archive customer"} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer">
                    {selected.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              {selected.contact_name && <li>{selected.contact_name}</li>}
              {selected.phone && <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {selected.phone}</li>}
              {selected.email && <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {selected.email}</li>}
              {selected.address && <li className="text-[var(--text-muted)]">{selected.address}</li>}
            </ul>
            {can("project.view") && (
              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Projects</p>
                  {can("project.create") && !selected.archived_at && <button type="button" className={`${secondaryBtn} h-8 text-xs`} onClick={() => setDialog("project")}><Plus className="w-3.5 h-3.5" /> New project</button>}
                </div>
                {projects === null ? (
                  <div className="mt-3 h-10 rounded-lg bg-[var(--hover-bg)] animate-pulse" />
                ) : projects.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">No projects yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {projects.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => onOpenProject(p.id)} className="w-full flex items-center justify-between gap-2 px-2 py-2 -mx-2 rounded-lg hover:bg-[var(--hover-bg)] text-left cursor-pointer">
                          <span className="text-sm text-[var(--text-primary)] truncate">{p.name}{p.archived_at ? " (archived)" : ""}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>{statusLabel(p.status)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </aside>

      {dialog === "new" && <CustomerDialog onClose={() => setDialog(null)} onSaved={(c) => { setDialog(null); setSelected(c); load(); }} />}
      {dialog === "edit" && selected && <CustomerDialog customer={selected} onClose={() => setDialog(null)} onSaved={(c) => { setDialog(null); setSelected(c); load(); }} />}
      {dialog === "project" && selected && <ProjectDialog presetCustomerId={selected.id} onClose={() => setDialog(null)} onSaved={(p) => { setDialog(null); onOpenProject(p.id); }} />}
    </div>
  );
}
