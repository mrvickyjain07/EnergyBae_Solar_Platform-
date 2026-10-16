// src/modules/projects/projectsApi.ts
// Projects and their Solar Systems for the caller's organization (migration
// 0017). A project belongs to one customer and holds MANY systems. Projects
// are archived, never hard-deleted; a system can be deleted only while no
// saved proposal references it (the FK refuses, surfaced as 409).
import type { Express, Request } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { orgOf, requirePermission, hasPermission, type AuthedRequest } from "../../services/authMiddleware";
import { validateProject, validateSystem, projectTotals } from "./projectRules";
import { validateBillAnalysis } from "./billAnalysisRules";

const FORBIDDEN = "You don't have permission to do that. Ask your company admin.";
const FK_VIOLATION = "23503";

async function projectExists(req: Request, projectId: string): Promise<boolean> {
  const { data, error } = await getSupabase().from("projects").select("id").eq("organization_id", orgOf(req)).eq("id", projectId).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function touchProject(req: Request, projectId: string) {
  await getSupabase().from("projects").update({ updated_at: new Date().toISOString() }).eq("organization_id", orgOf(req)).eq("id", projectId);
}

export function registerProjectRoutes(app: Express) {
  app.get("/api/projects", requirePermission("project.view"), async (req, res) => {
    try {
      let query = getSupabase()
        .from("projects")
        .select("id, name, status, site_address, archived_at, created_at, updated_at, customer_id, customers(id, name, customer_type), project_systems(capacity_kw), proposals(count)")
        .eq("organization_id", orgOf(req))
        .order("updated_at", { ascending: false });
      if (req.query.archived !== "true") query = query.is("archived_at", null);
      if (typeof req.query.customerId === "string" && req.query.customerId) query = query.eq("customer_id", req.query.customerId);
      const { data, error } = await query;
      if (error) throw error;
      res.json({
        projects: (data ?? []).map(({ project_systems, proposals, customers, ...p }: any) => ({
          ...p,
          customer: customers,
          ...projectTotals(project_systems ?? []),
          proposal_count: proposals?.[0]?.count ?? 0,
        })),
      });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/projects failed:", err.message);
      res.status(500).json({ error: "Failed to load projects." });
    }
  });

  app.get("/api/projects/:id", requirePermission("project.view"), async (req, res) => {
    try {
      const sb = getSupabase();
      const org = orgOf(req);
      const { data: project, error } = await sb.from("projects").select("*, customers(*)").eq("organization_id", org).eq("id", req.params.id).maybeSingle();
      if (error) throw error;
      if (!project) return res.status(404).json({ error: "Project not found." });
      const [{ data: systems, error: sErr }, { data: proposals, error: pErr }, { data: bills, error: bErr }] = await Promise.all([
        sb.from("project_systems").select("*").eq("organization_id", org).eq("project_id", project.id).order("sort_order").order("created_at"),
        hasPermission(req, "proposal.view")
          ? sb.from("proposals").select("proposal_no, status, review_status, capacity_kw, total_effective, updated_at, project_system_id").eq("organization_id", org).eq("project_id", project.id).order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        hasPermission(req, "bill_analysis.view")
          ? sb.from("bill_analyses").select("*").eq("organization_id", org).eq("project_id", project.id).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (sErr) throw sErr;
      if (pErr) throw pErr;
      if (bErr) throw bErr;
      const { customers, ...rest } = project as any;
      res.json({ project: rest, customer: customers, systems: systems ?? [], proposals: proposals ?? [], billAnalyses: bills ?? [], totals: projectTotals(systems ?? []) });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/projects/:id failed:", err.message);
      res.status(500).json({ error: "Failed to load project." });
    }
  });

  app.post("/api/projects", requirePermission("project.create"), async (req, res) => {
    const v = validateProject(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    try {
      const { data, error } = await getSupabase()
        .from("projects")
        .insert({ ...v.value, organization_id: orgOf(req), created_by: (req as AuthedRequest).user!.sub })
        .select("*")
        .single();
      if (error) {
        // Composite FK (customer_id, organization_id): another company's customer id lands here too.
        if (error.code === FK_VIOLATION) return res.status(400).json({ error: "That customer doesn't exist." });
        throw error;
      }
      res.json({ project: data });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/projects failed:", err.message);
      res.status(500).json({ error: "Failed to create project." });
    }
  });

  // Edits need project.update; archiving/restoring (archived: bool) needs project.delete.
  app.patch("/api/projects/:id", requirePermission("project.view"), async (req, res) => {
    const { archived, ...fields } = req.body ?? {};
    const v = validateProject(fields, true);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const patch: Record<string, unknown> = { ...v.value };
    if (Object.keys(patch).length && !hasPermission(req, "project.update")) return res.status(403).json({ error: FORBIDDEN });
    if (archived !== undefined) {
      if (!hasPermission(req, "project.delete")) return res.status(403).json({ error: FORBIDDEN });
      patch.archived_at = archived ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update." });
    try {
      const { data, error } = await getSupabase()
        .from("projects")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("organization_id", orgOf(req))
        .eq("id", req.params.id)
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === FK_VIOLATION) return res.status(400).json({ error: "That customer doesn't exist." });
        throw error;
      }
      if (!data) return res.status(404).json({ error: "Project not found." });
      res.json({ project: data });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/projects/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update project." });
    }
  });

  // ── Solar systems (all need project.update) ─────────────────────────────
  app.post("/api/projects/:id/systems", requirePermission("project.update"), async (req, res) => {
    const v = validateSystem(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    try {
      if (!(await projectExists(req, req.params.id))) return res.status(404).json({ error: "Project not found." });
      const sb = getSupabase();
      const org = orgOf(req);
      const { data: last } = await sb.from("project_systems").select("sort_order").eq("organization_id", org).eq("project_id", req.params.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await sb
        .from("project_systems")
        .insert({ ...v.value, organization_id: org, project_id: req.params.id, sort_order: (last?.sort_order ?? -1) + 1 })
        .select("*")
        .single();
      if (error) throw error;
      await touchProject(req, req.params.id);
      res.json({ system: data });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/projects/:id/systems failed:", err.message);
      res.status(500).json({ error: "Failed to add system." });
    }
  });

  app.patch("/api/projects/:id/systems/:systemId", requirePermission("project.update"), async (req, res) => {
    const v = validateSystem(req.body, true);
    if ("error" in v) return res.status(400).json({ error: v.error });
    if (!Object.keys(v.value).length) return res.status(400).json({ error: "Nothing to update." });
    try {
      const { data, error } = await getSupabase()
        .from("project_systems")
        .update({ ...v.value, updated_at: new Date().toISOString() })
        .eq("organization_id", orgOf(req))
        .eq("project_id", req.params.id)
        .eq("id", req.params.systemId)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "System not found." });
      await touchProject(req, req.params.id);
      res.json({ system: data });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/projects/:id/systems/:systemId failed:", err.message);
      res.status(500).json({ error: "Failed to update system." });
    }
  });

  app.delete("/api/projects/:id/systems/:systemId", requirePermission("project.update"), async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("project_systems")
        .delete()
        .eq("organization_id", orgOf(req))
        .eq("project_id", req.params.id)
        .eq("id", req.params.systemId)
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === FK_VIOLATION) return res.status(409).json({ error: "A saved proposal uses this system, so it can't be deleted." });
        throw error;
      }
      if (!data) return res.status(404).json({ error: "System not found." });
      await touchProject(req, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/projects/:id/systems/:systemId failed:", err.message);
      res.status(500).json({ error: "Failed to delete system." });
    }
  });
  // ── Bill analyses (migration 0018) ──────────────────────────────────────
  // A saved bill is standalone (project_id null) or linked to one project.
  // Linking needs project.view on top of the bill permission. The summary
  // numbers are derived server-side from the worksheet (billAnalysisRules.ts).
  app.get("/api/bill-analyses", requirePermission("bill_analysis.view"), async (req, res) => {
    try {
      let query = getSupabase()
        .from("bill_analyses")
        .select("*, projects(id, name)")
        .eq("organization_id", orgOf(req))
        .order("created_at", { ascending: false })
        .limit(50);
      if (req.query.standalone === "true") query = query.is("project_id", null);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ billAnalyses: (data ?? []).map(({ projects, ...b }: any) => ({ ...b, project: projects ?? null })) });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/bill-analyses failed:", err.message);
      res.status(500).json({ error: "Failed to load saved bills." });
    }
  });

  app.post("/api/bill-analyses", requirePermission("bill_analysis.create"), async (req, res) => {
    const v = validateBillAnalysis(req.body);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const projectId = typeof req.body?.project_id === "string" && req.body.project_id ? req.body.project_id : null;
    if (projectId && !hasPermission(req, "project.view")) return res.status(403).json({ error: FORBIDDEN });
    try {
      const { data, error } = await getSupabase()
        .from("bill_analyses")
        .insert({ ...v.value, organization_id: orgOf(req), project_id: projectId, created_by: (req as AuthedRequest).user!.sub })
        .select("*")
        .single();
      if (error) {
        // Composite FK (project_id, organization_id): another company's project id lands here too.
        if (error.code === FK_VIOLATION) return res.status(404).json({ error: "Project not found." });
        throw error;
      }
      if (projectId) await touchProject(req, projectId);
      res.json({ billAnalysis: data });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/bill-analyses failed:", err.message);
      res.status(500).json({ error: "Failed to save the bill analysis." });
    }
  });

  // Link to a project, move to another, or unlink (project_id: null).
  app.patch("/api/bill-analyses/:id", requirePermission("bill_analysis.update"), async (req, res) => {
    const raw = req.body?.project_id;
    if (raw !== null && (typeof raw !== "string" || !raw)) return res.status(400).json({ error: "Pick a project." });
    if (raw && !hasPermission(req, "project.view")) return res.status(403).json({ error: FORBIDDEN });
    try {
      const { data, error } = await getSupabase()
        .from("bill_analyses")
        .update({ project_id: raw })
        .eq("organization_id", orgOf(req))
        .eq("id", req.params.id)
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === FK_VIOLATION) return res.status(404).json({ error: "Project not found." });
        throw error;
      }
      if (!data) return res.status(404).json({ error: "Bill analysis not found." });
      if (raw) await touchProject(req, raw);
      res.json({ billAnalysis: data });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/bill-analyses/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update the bill analysis." });
    }
  });

  app.delete("/api/bill-analyses/:id", requirePermission("bill_analysis.delete"), async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("bill_analyses")
        .delete()
        .eq("organization_id", orgOf(req))
        .eq("id", req.params.id)
        .select("id, project_id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Bill analysis not found." });
      if (data.project_id) await touchProject(req, data.project_id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/bill-analyses/:id failed:", err.message);
      res.status(500).json({ error: "Failed to delete the bill analysis." });
    }
  });
}
