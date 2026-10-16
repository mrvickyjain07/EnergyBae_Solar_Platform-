// src/services/tenancy.ts
// Pure rules for "which company is this session acting for" — split out of
// authApi.ts/authMiddleware.ts so they can be tested without a database.
// A user may belong to several organizations (organization_memberships,
// migration 0015), with a separate role in each.
import { resolvePermissions, systemRole, type Permission } from "../permissions";

export interface MembershipRow {
  organization_id: string;
  organization_name: string;
  /** Built-in role key (src/permissions.ts) or "custom". */
  role: string;
  /** Set when role === "custom". */
  custom_role_name?: string | null;
  custom_permissions?: string[] | null;
  is_active: boolean;
  created_at: string;
}

export function roleLabel(m: Pick<MembershipRow, "role" | "custom_role_name">): string {
  return m.role === "custom" ? m.custom_role_name || "Custom role" : systemRole(m.role)?.name ?? m.role;
}

/**
 * The organization a session should act for: the preferred one if the user
 * is still an active member of it, else their oldest active membership.
 * null = no access to any organization.
 */
export function pickActiveOrganization(memberships: MembershipRow[], preferredId?: string | null): MembershipRow | null {
  const active = memberships.filter((m) => m.is_active);
  if (preferredId) {
    const preferred = active.find((m) => m.organization_id === preferredId);
    if (preferred) return preferred;
  }
  return [...active].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
}

export interface SessionView {
  user: { id: string; email: string; name: string; role: string; roleName: string; permissions: Permission[] };
  organization: { id: string; name: string };
  organizations: { id: string; name: string; roleName: string }[];
}

/**
 * What /api/auth/* returns. role/roleName/permissions are for the ACTIVE
 * organization and drive the UI only — the server re-resolves permissions
 * from the database on every request (authMiddleware.ts).
 */
export function buildSessionView(
  user: { id: string; email: string; name: string },
  memberships: MembershipRow[],
  active: MembershipRow,
): SessionView {
  return {
    user: {
      id: user.id, email: user.email, name: user.name,
      role: active.role, roleName: roleLabel(active),
      permissions: resolvePermissions(active.role, active.custom_permissions),
    },
    organization: { id: active.organization_id, name: active.organization_name },
    organizations: memberships
      .filter((m) => m.is_active)
      .map((m) => ({ id: m.organization_id, name: m.organization_name, roleName: roleLabel(m) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
