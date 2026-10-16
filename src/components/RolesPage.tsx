// src/components/RolesPage.tsx
// Roles & Permissions. Built-in roles come from code (src/permissions.ts) and
// are read-only; custom roles are the company's own (GET/POST/PATCH/DELETE
// /api/roles). Checkboxes for permissions the viewer doesn't hold are
// disabled — mirroring the server's no-escalation rule, which enforces it.
import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Plus, Copy, Trash2, Lock, Users, Save, ArrowRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useRoles, RoleInfo } from "../modules/auth/useRoles";
import type { AppRoute } from "../navigation";

const ACTION_LABEL: Record<string, string> = {
  "branding.update": "Branding",
};
const label = (a: string) => ACTION_LABEL[a] ?? a.charAt(0).toUpperCase() + a.slice(1);

export default function RolesPage({ onGo }: { onGo: (r: AppRoute) => void }) {
  const { user, can } = useAuth();
  const mine = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const { roles, groups, error: loadError, reload } = useRoles(true);
  const [selectedId, setSelectedId] = useState<string>("owner");
  const [draft, setDraft] = useState<{ id: string | null; name: string; description: string; permissions: Set<string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  useEffect(() => { setDraft(null); setError(null); }, [selectedId]);

  const shown = draft ? draft.permissions : new Set(selected?.permissions ?? []);
  const editing = !!draft;

  const startNew = (from?: RoleInfo) => {
    // Copying only carries over what you could grant yourself.
    const perms = new Set((from?.permissions ?? []).filter((p) => mine.has(p)));
    setDraft({ id: null, name: from ? `${from.name} (copy)` : "", description: from?.description ?? "", permissions: perms });
    setError(null);
  };
  const startEdit = (r: RoleInfo) => setDraft({ id: r.id, name: r.name, description: r.description ?? "", permissions: new Set(r.permissions) });

  const toggle = (p: string) => {
    if (!draft || !mine.has(p)) return;
    const next = new Set(draft.permissions);
    next.has(p) ? next.delete(p) : next.add(p);
    setDraft({ ...draft, permissions: next });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(draft.id ? `/api/roles/${draft.id}` : "/api/roles", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, description: draft.description, permissions: [...draft.permissions] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't save the role.");
      await reload();
      setDraft(null);
      setSelectedId(body.role.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: RoleInfo) => {
    if (!window.confirm(`Delete the role "${r.name}"? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/roles/${r.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't delete the role.");
      await reload();
      setSelectedId("owner");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const btn = "h-9 px-3.5 inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer disabled:opacity-50";
  const primary = "h-9 px-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white hover:opacity-90 cursor-pointer disabled:opacity-50";

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        {can("role.create") && (
          <button type="button" onClick={() => startNew()} className={`${primary} w-full justify-center`}>
            <Plus className="w-4 h-4" /> New custom role
          </button>
        )}
        <nav aria-label="Roles" className="glass-panel rounded-2xl p-2 space-y-0.5">
          {roles.map((r) => {
            const active = draft ? draft.id === r.id : r.id === selected?.id;
            return (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} aria-current={active ? "true" : undefined}
                className={`w-full text-left px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${active ? "bg-[var(--hover-bg)]" : "hover:bg-[var(--hover-bg)]/60"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">{r.name}</span>
                  {r.kind === "system" ? <Lock className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" aria-label="Built-in" /> : <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-[var(--solar)]/12 text-[var(--solar-text)]">Custom</span>}
                </span>
                <span className="mt-0.5 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {r.memberCount ?? 0}</span>
                  <span>{r.permissions.length} permissions</span>
                </span>
              </button>
            );
          })}
        </nav>
        <button type="button" onClick={() => onGo("team")} className={`${btn} w-full justify-center`}>
          Assign roles in Team <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
        </button>
      </aside>

      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)] flex flex-wrap items-start justify-between gap-3">
          {editing ? (
            <div className="flex-1 min-w-[240px] space-y-2">
              <input aria-label="Role name" value={draft!.name} onChange={(e) => setDraft({ ...draft!, name: e.target.value })} placeholder="Role name, e.g. Site Surveyor" maxLength={60}
                className="w-full h-10 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-base font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]" />
              <input aria-label="Description" value={draft!.description} onChange={(e) => setDraft({ ...draft!, description: e.target.value })} placeholder="What is this role for? (optional)"
                className="w-full h-9 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]" />
            </div>
          ) : (
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--text-muted)]" aria-hidden /> {selected?.name}
              </h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">{selected?.description || "No description."}</p>
              {selected?.kind === "system" && <p className="text-xs text-[var(--text-muted)] mt-1">Built-in roles can't be edited — copy one to make your own.</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <button type="button" onClick={() => setDraft(null)} className={btn} disabled={busy}>Cancel</button>
                <button type="button" onClick={save} className={primary} disabled={busy || !draft!.name.trim()}><Save className="w-4 h-4" /> {busy ? "Saving…" : "Save role"}</button>
              </>
            ) : selected && (
              <>
                {can("role.create") && <button type="button" onClick={() => startNew(selected)} className={btn}><Copy className="w-4 h-4" /> Copy</button>}
                {selected.kind === "custom" && can("role.update") && <button type="button" onClick={() => startEdit(selected)} className={btn}>Edit</button>}
                {selected.kind === "custom" && can("role.delete") && (
                  <button type="button" onClick={() => remove(selected)} className={`${btn} hover:!text-red-500`} disabled={busy}><Trash2 className="w-4 h-4" /> Delete</button>
                )}
              </>
            )}
          </div>
        </div>

        {(error || loadError) && <p role="alert" className="mx-6 mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-[var(--text-primary)]">{error || loadError}</p>}
        {editing && <p className="mx-6 mt-4 text-xs text-[var(--text-muted)]">Greyed-out permissions are ones you don't have yourself, so you can't give them out.</p>}

        <div className="p-6 grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <fieldset key={g.id} className="rounded-xl border border-[var(--border-subtle)] p-4">
              <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">{g.label}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {g.actions.map((a) => {
                  const p = `${g.id}.${a}`;
                  const on = shown.has(p);
                  const locked = !editing || !mine.has(p);
                  return (
                    <label key={p} className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium select-none ${
                      on ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]" : "border-[var(--border-subtle)] text-[var(--text-muted)]"
                    } ${editing && !locked ? "cursor-pointer hover:border-[var(--accent-green)]" : ""} ${editing && locked ? "opacity-40" : ""}`}>
                      <input type="checkbox" className="accent-[var(--accent-solid)]" checked={on} disabled={locked} onChange={() => toggle(p)} />
                      {label(a)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </section>
    </div>
  );
}
