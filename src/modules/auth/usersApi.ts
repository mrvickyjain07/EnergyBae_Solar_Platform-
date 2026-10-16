// src/modules/auth/usersApi.ts
// Team management for the caller's ACTIVE organization. A person (users row:
// email + name) can belong to several organizations; what's granted,
// revoked or re-roled here is their organization_memberships row in this
// company only. No DELETE — access is revoked via PATCH { is_active: false }
// (soft delete keeps created_by/updated_by FKs on old records intact).
//
// Guard rails (pure rules in src/permissions.ts / teamRules.ts):
//   • you can only hand out a role whose permissions you hold yourself, and
//     only change/deactivate someone whose current permissions you hold —
//     so an Admin can't promote anyone to Owner or demote an Owner;
//   • the company always keeps at least one active Owner.
import type { Express, Request } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { orgOf, requireMember, requirePermission, hasPermission, permissionsOf } from "../../services/authMiddleware";
import { canGrant, resolvePermissions, systemRole } from "../../permissions";
import { roleLabel } from "../../services/tenancy";
import { wouldRemoveLastOwner } from "./teamRules";

const MEMBER_SELECT = "role, custom_role_id, is_active, created_at, users!inner(id, email, name), custom_roles(name, permissions)";
const FORBIDDEN = "You don't have permission to do that. Ask your company admin.";

function toUser(m: any) {
  return {
    id: m.users.id,
    email: m.users.email,
    name: m.users.name,
    role: m.role,
    custom_role_id: m.custom_role_id ?? null,
    roleName: roleLabel({ role: m.role, custom_role_name: m.custom_roles?.name }),
    is_active: m.is_active,
    created_at: m.created_at,
  };
}

const memberPermissions = (m: any) => resolvePermissions(m.role, m.custom_roles?.permissions);

async function loadMember(org: string, userId: string) {
  const { data, error } = await getSupabase()
    .from("organization_memberships")
    .select(MEMBER_SELECT)
    .eq("organization_id", org)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function activeOwnerIds(org: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", org)
    .eq("role", "owner")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}

/** Validates a requested role for THIS organization and returns what to store plus the permissions it grants. */
async function resolveRequestedRole(req: Request, role: unknown, customRoleId: unknown) {
  if (role === "custom") {
    if (typeof customRoleId !== "string" || !customRoleId) return { error: "customRoleId is required for a custom role." } as const;
    const { data, error } = await getSupabase()
      .from("custom_roles")
      .select("id, permissions")
      .eq("organization_id", orgOf(req))
      .eq("id", customRoleId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: "That role doesn't exist." } as const;
    return { role: "custom", custom_role_id: data.id as string, permissions: resolvePermissions("custom", data.permissions) } as const;
  }
  if (typeof role !== "string" || !systemRole(role)) return { error: "Unknown role." } as const;
  return { role, custom_role_id: null, permissions: resolvePermissions(role) } as const;
}

export function registerUserRoutes(app: Express) {
  app.get("/api/users", requirePermission("user.view"), async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("organization_memberships")
        .select(MEMBER_SELECT)
        .eq("organization_id", orgOf(req))
        .order("created_at");
      if (error) throw error;
      res.json({ users: (data ?? []).map(toUser) });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/users failed:", err.message);
      res.status(500).json({ error: "Failed to list users." });
    }
  });

  // Adds a person to this company. If their Google email already exists
  // (they belong to another company), the existing identity is reused and
  // their name there is left untouched.
  app.post("/api/users", requirePermission("user.invite"), async (req, res) => {
    const { email: rawEmail, name: rawName, role, customRoleId } = req.body as { email?: string; name?: string; role?: string; customRoleId?: string };
    const email = rawEmail?.trim().toLowerCase();
    const name = rawName?.trim();
    if (!email || !name) return res.status(400).json({ error: "Request body must include email, name and role." });
    try {
      const target = await resolveRequestedRole(req, role, customRoleId);
      if ("error" in target) return res.status(400).json({ error: target.error });
      if (!canGrant(permissionsOf(req), target.permissions)) {
        return res.status(403).json({ error: "You can't give someone a role with more access than your own." });
      }

      const sb = getSupabase();
      const org = orgOf(req);
      // Exact match, not ilike — "_" and "%" are ilike wildcards, and a
      // wildcard hit here would attach the wrong person to this company.
      let { data: user, error: findErr } = await sb.from("users").select("id").eq("email", email).maybeSingle();
      if (findErr) throw findErr;
      if (!user) {
        const { data: created, error: createErr } = await sb.from("users").insert({ email, name }).select("id").single();
        if (createErr) throw createErr;
        user = created;
      }
      const { error } = await sb
        .from("organization_memberships")
        .insert({ organization_id: org, user_id: user!.id, role: target.role, custom_role_id: target.custom_role_id });
      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "That email already has access." });
        throw error;
      }
      res.json({ user: toUser(await loadMember(org, user!.id)) });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/users failed:", err.message);
      res.status(500).json({ error: "Failed to grant access." });
    }
  });

  // Route-level: any member; each kind of change is checked below because
  // one PATCH can carry a role change, a deactivation and a rename at once.
  app.patch("/api/users/:id", requireMember, async (req, res) => {
    const { name, email, role, customRoleId, is_active } = req.body as {
      name?: string; email?: string; role?: string; customRoleId?: string; is_active?: boolean;
    };
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: "name cannot be blank." });
    if (email !== undefined && !email.trim()) return res.status(400).json({ error: "email cannot be blank." });

    try {
      const sb = getSupabase();
      const org = orgOf(req);
      const userId = req.params.id;
      // Scoped to a member of THIS company — a user id from another company is a 404.
      const member = await loadMember(org, userId);
      if (!member) return res.status(404).json({ error: "User not found." });
      const mine = permissionsOf(req);

      const patch: Record<string, unknown> = {};
      if (role !== undefined) {
        if (!hasPermission(req, "role.assign")) return res.status(403).json({ error: FORBIDDEN });
        const target = await resolveRequestedRole(req, role, customRoleId);
        if ("error" in target) return res.status(400).json({ error: target.error });
        if (!canGrant(mine, target.permissions) || !canGrant(mine, memberPermissions(member))) {
          return res.status(403).json({ error: "You can't change the role of someone with more access than you, or give more access than your own." });
        }
        patch.role = target.role;
        patch.custom_role_id = target.custom_role_id;
      }
      if (is_active !== undefined) {
        if (!hasPermission(req, "user.deactivate") || !canGrant(mine, memberPermissions(member))) {
          return res.status(403).json({ error: FORBIDDEN });
        }
        patch.is_active = is_active;
      }
      if (Object.keys(patch).length) {
        const owners = await activeOwnerIds(org);
        const after = { role: (patch.role as string) ?? member.role, is_active: (patch.is_active as boolean) ?? member.is_active };
        if (wouldRemoveLastOwner(owners, userId, after)) {
          return res.status(409).json({ error: "The company needs at least one active Owner. Make someone else Owner first." });
        }
        const { error } = await sb
          .from("organization_memberships")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("organization_id", org)
          .eq("user_id", userId);
        if (error) throw error;
      }

      if (name !== undefined || email !== undefined) {
        if (!hasPermission(req, "user.update")) return res.status(403).json({ error: FORBIDDEN });
        // The identity (email/name) is shared across every company the person
        // belongs to, so only let this company rewrite it if it's their only one.
        const { count, error: countErr } = await sb
          .from("organization_memberships")
          .select("organization_id", { count: "exact", head: true })
          .eq("user_id", userId);
        if (countErr) throw countErr;
        if ((count ?? 0) > 1) {
          return res.status(409).json({ error: "This person also belongs to another company, so their name and email can only be changed by them or by support." });
        }
        const identity: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) identity.name = name.trim();
        if (email !== undefined) identity.email = email.trim().toLowerCase();
        const { error } = await sb.from("users").update(identity).eq("id", userId);
        if (error) {
          if (error.code === "23505") return res.status(409).json({ error: "That email already has access." });
          throw error;
        }
      }

      res.json({ user: toUser(await loadMember(org, userId)) });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/users/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update user." });
    }
  });
}
