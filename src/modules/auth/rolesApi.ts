// src/modules/auth/rolesApi.ts
// Roles for the caller's organization: the built-in roles (defined in code,
// src/permissions.ts — read-only here) plus the company's own custom roles
// (custom_roles, migration 0016). Anti-escalation: you can't create or edit
// a role to contain permissions you don't hold, nor edit a role that already
// holds permissions you don't.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { orgOf, requirePermission, permissionsOf } from "../../services/authMiddleware";
import { SYSTEM_ROLES, PERMISSION_GROUPS, canGrant, isPermission } from "../../permissions";

const ESCALATION = "A role can't include access you don't have yourself.";

function cleanPermissions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw)].filter(isPermission);
}

function validName(raw: unknown): string | null {
  const name = typeof raw === "string" ? raw.trim() : "";
  return name && name.length <= 60 ? name : null;
}

export function registerRoleRoutes(app: Express) {
  app.get("/api/roles", requirePermission("role.view"), async (req, res) => {
    try {
      const sb = getSupabase();
      const org = orgOf(req);
      const [{ data: custom, error }, { data: members, error: mErr }] = await Promise.all([
        sb.from("custom_roles").select("id, name, description, permissions, updated_at").eq("organization_id", org).order("name"),
        sb.from("organization_memberships").select("role, custom_role_id").eq("organization_id", org).eq("is_active", true),
      ]);
      if (error) throw error;
      if (mErr) throw mErr;
      const countBy = (key: string) => (members ?? []).filter((m) => (m.role === "custom" ? m.custom_role_id : m.role) === key).length;

      res.json({
        groups: PERMISSION_GROUPS,
        roles: [
          ...SYSTEM_ROLES.map((r) => ({ id: r.key, kind: "system", name: r.name, description: r.description, permissions: r.permissions, memberCount: countBy(r.key) })),
          ...(custom ?? []).map((r) => ({ id: r.id, kind: "custom", name: r.name, description: r.description, permissions: r.permissions.filter(isPermission), memberCount: countBy(r.id) })),
        ],
      });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/roles failed:", err.message);
      res.status(500).json({ error: "Failed to load roles." });
    }
  });

  app.post("/api/roles", requirePermission("role.create"), async (req, res) => {
    const name = validName(req.body?.name);
    const permissions = cleanPermissions(req.body?.permissions);
    if (!name || !permissions) return res.status(400).json({ error: "Request body must include a name (max 60 characters) and a permissions array." });
    if (!canGrant(permissionsOf(req), permissions)) return res.status(403).json({ error: ESCALATION });
    try {
      const { data, error } = await getSupabase()
        .from("custom_roles")
        .insert({ organization_id: orgOf(req), name, description: req.body?.description?.trim() || null, permissions })
        .select("id, name, description, permissions")
        .single();
      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "A role with that name already exists." });
        throw error;
      }
      res.json({ role: { ...data, kind: "custom", memberCount: 0 } });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/roles failed:", err.message);
      res.status(500).json({ error: "Failed to create role." });
    }
  });

  app.patch("/api/roles/:id", requirePermission("role.update"), async (req, res) => {
    const name = req.body?.name === undefined ? undefined : validName(req.body.name);
    const permissions = req.body?.permissions === undefined ? undefined : cleanPermissions(req.body.permissions);
    if (name === null || permissions === null) return res.status(400).json({ error: "Invalid name or permissions." });
    try {
      const sb = getSupabase();
      const org = orgOf(req);
      const { data: existing, error: findErr } = await sb.from("custom_roles").select("permissions").eq("organization_id", org).eq("id", req.params.id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) return res.status(404).json({ error: "Role not found." });
      const mine = permissionsOf(req);
      if (!canGrant(mine, existing.permissions.filter(isPermission)) || (permissions && !canGrant(mine, permissions))) {
        return res.status(403).json({ error: ESCALATION });
      }
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) patch.name = name;
      if (permissions !== undefined) patch.permissions = permissions;
      if (req.body?.description !== undefined) patch.description = String(req.body.description).trim() || null;
      const { data, error } = await sb.from("custom_roles").update(patch).eq("organization_id", org).eq("id", req.params.id).select("id, name, description, permissions").single();
      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "A role with that name already exists." });
        throw error;
      }
      res.json({ role: { ...data, kind: "custom" } });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/roles/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update role." });
    }
  });

  app.delete("/api/roles/:id", requirePermission("role.delete"), async (req, res) => {
    try {
      const sb = getSupabase();
      const org = orgOf(req);
      // Includes deactivated members: their membership row still points at the role.
      const { count, error: countErr } = await sb
        .from("organization_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", org)
        .eq("custom_role_id", req.params.id);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) return res.status(409).json({ error: "People still have this role. Give them another role first." });
      const { data, error } = await sb.from("custom_roles").delete().eq("organization_id", org).eq("id", req.params.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Role not found." });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/roles/:id failed:", err.message);
      res.status(500).json({ error: "Failed to delete role." });
    }
  });
}
