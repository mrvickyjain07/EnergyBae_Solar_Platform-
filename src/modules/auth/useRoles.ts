// src/modules/auth/useRoles.ts
// Loads the company's roles (built-in + custom) from GET /api/roles for the
// Team and Roles pages. Without role.view it falls back to the built-in
// roles from code (custom roles can't be listed then).
import { useCallback, useEffect, useState } from "react";
import { SYSTEM_ROLES, PERMISSION_GROUPS } from "../../permissions";

export interface RoleInfo {
  /** Built-in role key, or the custom role's uuid. */
  id: string;
  kind: "system" | "custom";
  name: string;
  description: string | null;
  permissions: string[];
  memberCount?: number;
}

export type PermissionGroup = { id: string; label: string; actions: readonly string[] };

/** <select> value for a role, and the API body it maps to. */
export const roleValue = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;
export function roleBody(value: string): { role: string; customRoleId?: string } {
  const [kind, id] = value.split(/:(.*)/s);
  return kind === "custom" ? { role: "custom", customRoleId: id } : { role: id };
}

const FALLBACK: RoleInfo[] = SYSTEM_ROLES.map((r) => ({ id: r.key, kind: "system", name: r.name, description: r.description, permissions: r.permissions }));

export function useRoles(enabled: boolean) {
  const [roles, setRoles] = useState<RoleInfo[]>(FALLBACK);
  const [groups, setGroups] = useState<PermissionGroup[]>(PERMISSION_GROUPS as unknown as PermissionGroup[]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/roles");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load roles.");
      setRoles(body.roles);
      setGroups(body.groups);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);
  return { roles, groups, error, reload };
}
