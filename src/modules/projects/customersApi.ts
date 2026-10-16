// src/modules/projects/customersApi.ts
// Customers of the caller's organization (migration 0017). Never hard-deleted:
// "delete" archives (archived_at), so proposals and projects keep their context.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { orgOf, requirePermission, hasPermission, type AuthedRequest } from "../../services/authMiddleware";
import { validateCustomer } from "./projectRules";

const FORBIDDEN = "You don't have permission to do that. Ask your company admin.";

export function registerCustomerRoutes(app: Express) {
  app.get("/api/customers", requirePermission("customer.view"), async (req, res) => {
    try {
      let query = getSupabase()
        .from("customers")
        .select("*, projects(count)")
        .eq("organization_id", orgOf(req))
        .order("name");
      if (req.query.archived !== "true") query = query.is("archived_at", null);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      // Strip PostgREST filter syntax characters rather than trusting them in .or().
      const safe = search.replace(/[,()*%\\]/g, " ").trim();
      if (safe) query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
      const { data, error } = await query;
      if (error) throw error;
      res.json({
        customers: (data ?? []).map(({ projects, ...c }: any) => ({ ...c, project_count: projects?.[0]?.count ?? 0 })),
      });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/customers failed:", err.message);
      res.status(500).json({ error: "Failed to load customers." });
    }
  });

  app.get("/api/customers/:id", requirePermission("customer.view"), async (req, res) => {
    try {
      const sb = getSupabase();
      const org = orgOf(req);
      const { data: customer, error } = await sb.from("customers").select("*").eq("organization_id", org).eq("id", req.params.id).maybeSingle();
      if (error) throw error;
      if (!customer) return res.status(404).json({ error: "Customer not found." });
      const { data: projects, error: pErr } = hasPermission(req, "project.view")
        ? await sb.from("projects").select("id, name, status, archived_at, updated_at").eq("organization_id", org).eq("customer_id", customer.id).order("updated_at", { ascending: false })
        : { data: [], error: null };
      if (pErr) throw pErr;
      res.json({ customer, projects: projects ?? [] });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/customers/:id failed:", err.message);
      res.status(500).json({ error: "Failed to load customer." });
    }
  });

  app.post("/api/customers", requirePermission("customer.create"), async (req, res) => {
    const v = validateCustomer(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    try {
      const { data, error } = await getSupabase()
        .from("customers")
        .insert({ ...v.value, organization_id: orgOf(req), created_by: (req as AuthedRequest).user!.sub })
        .select("*")
        .single();
      if (error) throw error;
      res.json({ customer: { ...data, project_count: 0 } });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/customers failed:", err.message);
      res.status(500).json({ error: "Failed to save customer." });
    }
  });

  // Edits need customer.update; archiving/restoring (archived: bool) needs customer.delete.
  app.patch("/api/customers/:id", requirePermission("customer.view"), async (req, res) => {
    const { archived, ...fields } = req.body ?? {};
    const v = validateCustomer(fields, true);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const patch: Record<string, unknown> = { ...v.value };
    if (Object.keys(patch).length && !hasPermission(req, "customer.update")) return res.status(403).json({ error: FORBIDDEN });
    if (archived !== undefined) {
      if (!hasPermission(req, "customer.delete")) return res.status(403).json({ error: FORBIDDEN });
      patch.archived_at = archived ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update." });
    try {
      const { data, error } = await getSupabase()
        .from("customers")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("organization_id", orgOf(req))
        .eq("id", req.params.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Customer not found." });
      res.json({ customer: data });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/customers/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update customer." });
    }
  });
}
