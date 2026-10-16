// src/modules/auth/UserManagement.tsx
// Team page: who can sign in to this company and with which role. What's
// shown/enabled follows the viewer's permissions (user.invite, role.assign,
// user.update, user.deactivate) and mirrors the server's no-escalation rule —
// but the server (usersApi.ts) enforces all of it independently.
import React, { useEffect, useMemo, useState } from "react";
import { UserPlus, ShieldCheck, ShieldOff, Pencil, Check, X, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { canGrant } from "../../permissions";
import { useRoles, roleValue, roleBody, RoleInfo } from "./useRoles";
import EmptyState from "../../components/ui/EmptyState";

interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  custom_role_id: string | null;
  roleName: string;
  is_active: boolean;
  created_at: string;
}

const memberValue = (m: Member) => (m.role === "custom" ? `custom:${m.custom_role_id}` : `system:${m.role}`);

const field = "w-full h-9 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]";
const iconBtn = "p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

export default function UserManagement() {
  const { user, can } = useAuth();
  const mine = user?.permissions ?? [];
  const { roles } = useRoles(can("role.view"));
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("system:sales_executive");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", email: "", role: "" });
  const [saving, setSaving] = useState(false);

  const byValue = useMemo(() => new Map(roles.map((r) => [roleValue(r), r])), [roles]);
  const grantable = useMemo(() => roles.filter((r) => canGrant(mine, r.permissions)), [roles, mine]);
  const permsOf = (m: Member) => byValue.get(memberValue(m))?.permissions ?? [];
  // Mirrors the server: you may only change someone whose access you fully hold.
  const canManage = (m: Member) => canGrant(mine, permsOf(m));

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load your team.");
      setMembers(body.users);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const call = async (url: string, method: string, body: object, fallback: string) => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || fallback);
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await call("/api/users", "POST", { email, name, ...roleBody(role) }, "Couldn't add that person.");
      setEmail("");
      setName("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (m: Member) => {
    setEditingId(m.id);
    setEdit({ name: m.name, email: m.email, role: memberValue(m) });
    setError(null);
  };

  // Only send what actually changed: each field needs a different permission,
  // and a shared identity (name/email) can't be rewritten for multi-company users.
  const saveEdit = async (m: Member) => {
    const body: Record<string, unknown> = {};
    if (edit.name.trim() !== m.name) body.name = edit.name;
    if (edit.email.trim().toLowerCase() !== m.email) body.email = edit.email;
    if (edit.role !== memberValue(m)) Object.assign(body, roleBody(edit.role));
    if (!Object.keys(body).length) return setEditingId(null);
    setSaving(true);
    setError(null);
    try {
      await call(`/api/users/${m.id}`, "PATCH", body, "Couldn't update that person.");
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: Member) => {
    setError(null);
    try {
      await call(`/api/users/${m.id}`, "PATCH", { is_active: !m.is_active }, "Couldn't update access.");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const roleOptions = (current?: string) => {
    const opts: RoleInfo[] = [...grantable];
    const cur = current ? byValue.get(current) : undefined;
    if (cur && !opts.includes(cur)) opts.unshift(cur); // show the current role even if you couldn't grant it
    return opts.map((r) => (
      <option key={roleValue(r)} value={roleValue(r)}>{r.name}{r.kind === "custom" ? " (custom)" : ""}</option>
    ));
  };

  return (
    <div className="space-y-5">
      {can("user.invite") && (
        <form onSubmit={invite} className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add someone to {user?.organization.name}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">They sign in with this Google account. You can only give a role with access you have yourself.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_220px_auto] items-end">
            <label>
              <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Google email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" className={field} />
            </label>
            <label>
              <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Name</span>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={field} />
            </label>
            <label>
              <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={`${field} cursor-pointer`}>{roleOptions()}</select>
            </label>
            <button type="submit" disabled={submitting}
              className="h-9 px-4 rounded-lg bg-[var(--accent-solid)] text-white text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
              <UserPlus className="w-4 h-4" /> {submitting ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      )}

      {error && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-[var(--text-primary)]">{error}</div>}

      <section className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-11 rounded-lg bg-[var(--hover-bg)] animate-pulse" />)}</div>
        ) : members.length === 0 ? (
          <div className="p-6"><EmptyState icons={[Users]} title="No one here yet" description="Add your team so they can sign in." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Team members</caption>
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Email</th>
                  <th scope="col" className="px-4 py-3 font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">Access</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const editing = editingId === m.id;
                  const manageable = canManage(m);
                  const canEditRow = manageable && (can("role.assign") || can("user.update"));
                  const inputCls = "w-full h-8 px-2 rounded-md bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)]";
                  return (
                    <tr key={m.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">
                        {editing && can("user.update") ? <input aria-label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} /> : <>{m.name}{m.id === user?.id && <span className="ml-1.5 text-xs text-[var(--text-muted)]">(you)</span>}</>}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {editing && can("user.update") ? <input aria-label="Email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className={inputCls} /> : m.email}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {editing && can("role.assign") ? (
                          <select aria-label="Role" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className={`${inputCls} cursor-pointer`}>{roleOptions(memberValue(m))}</select>
                        ) : (
                          m.roleName
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.is_active ? "bg-emerald-500/10 text-[var(--success-text)]" : "bg-red-500/10 text-red-500"}`}>
                          {m.is_active ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {editing ? (
                            <>
                              <button type="button" disabled={saving} onClick={() => saveEdit(m)} aria-label="Save" className={iconBtn}><Check className="w-4 h-4 text-[var(--accent-green)]" /></button>
                              <button type="button" disabled={saving} onClick={() => setEditingId(null)} aria-label="Cancel" className={iconBtn}><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <>
                              {canEditRow && (
                                <button type="button" onClick={() => startEdit(m)} aria-label={`Edit ${m.name}`} className={iconBtn}><Pencil className="w-4 h-4" /></button>
                              )}
                              {manageable && can("user.deactivate") && (
                                <button type="button" onClick={() => toggleActive(m)} aria-label={m.is_active ? `Revoke ${m.name}'s access` : `Restore ${m.name}'s access`} className={iconBtn}>
                                  {m.is_active ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
