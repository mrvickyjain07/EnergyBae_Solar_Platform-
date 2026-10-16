// src/modules/boqTemplates/boqTemplatesApi.ts
// Phase 5C API: capacity ranges, BOQ templates and their versions for the
// caller's organization (migration 0019). Organization always comes from the
// session (orgOf), never from the request body. Drafts are editable;
// published versions are immutable here AND in the database (trigger).
//
// Out of scope by design (later phases): selecting a template for a system,
// generating a BOQ from a template, BOQ snapshots. Nothing here changes how a
// quote is priced today.
import type { Express, Request } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { orgOf, requirePermission, hasPermission, type AuthedRequest } from "../../services/authMiddleware";
import { DEFAULT_CATALOGUE } from "../proposal/defaultCatalogue";
import { LEGACY_SEED_DOCUMENT, validateRanges, validateTemplateDocument, validateTemplateMeta } from "./templateRules";

const FORBIDDEN = "You don't have permission to do that. Ask your company admin.";
const FK_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const IMMUTABLE = "P0001"; // raised by boq_template_versions_guard
const READ_ONLY = "Published versions are read-only. Create a new version to make changes.";

const userId = (req: Request) => (req as AuthedRequest).user!.sub;
const now = () => new Date().toISOString();

/** Every company gets its own copy of the default ranges/templates the first time it looks (idempotent, locked per company). */
async function ensureSeeded(org: string) {
  const { error } = await getSupabase().rpc("seed_boq_templates", { p_org: org });
  if (error) throw error;
}

async function latestVersion(org: string, templateId: string) {
  const { data, error } = await getSupabase()
    .from("boq_template_versions")
    .select("*")
    .eq("organization_id", org)
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function companyDefaults(org: string) {
  const { data, error } = await getSupabase().from("catalogue_state").select("data").eq("organization_id", org).maybeSingle();
  if (error) throw error;
  return (data?.data as any)?.charges ?? DEFAULT_CATALOGUE.charges;
}

export function registerBoqTemplateRoutes(app: Express) {
  // ── Capacity ranges ──────────────────────────────────────────────────────
  app.get("/api/capacity-ranges", requirePermission("boq_template.view"), async (req, res) => {
    try {
      const org = orgOf(req);
      await ensureSeeded(org);
      const { data, error } = await getSupabase().from("capacity_ranges").select("*").eq("organization_id", org).order("sort_order");
      if (error) throw error;
      res.json({ ranges: data ?? [] });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/capacity-ranges failed:", err.message);
      res.status(500).json({ error: "Failed to load capacity ranges." });
    }
  });

  // Replaces the whole set in one transaction (replace_capacity_ranges).
  app.put("/api/capacity-ranges", requirePermission("boq_template.update"), async (req, res) => {
    const v = validateRanges(req.body?.ranges);
    if ("error" in v) return res.status(400).json({ error: v.error });
    try {
      const { data, error } = await getSupabase().rpc("replace_capacity_ranges", { p_org: orgOf(req), p_ranges: v.value });
      if (error) {
        if (error.code === FK_VIOLATION) return res.status(409).json({ error: "A range you removed still has templates. Move or archive them first." });
        if (error.code === "P0002") return res.status(400).json({ error: "Unknown capacity range." });
        if (error.code === UNIQUE_VIOLATION) return res.status(400).json({ error: "Range names must be unique." });
        throw error;
      }
      res.json({ ranges: data ?? [] });
    } catch (err: any) {
      console.error("[EnergyBae] PUT /api/capacity-ranges failed:", err.message);
      res.status(500).json({ error: "Failed to save capacity ranges." });
    }
  });

  // ── Templates ────────────────────────────────────────────────────────────
  app.get("/api/boq-templates", requirePermission("boq_template.view"), async (req, res) => {
    try {
      const org = orgOf(req);
      await ensureSeeded(org);
      const sb = getSupabase();
      const [ranges, templates, defaults] = await Promise.all([
        sb.from("capacity_ranges").select("*").eq("organization_id", org).order("sort_order"),
        sb.from("boq_templates").select("*, boq_template_versions(id, version, status, published_at, created_at)").eq("organization_id", org).order("created_at"),
        companyDefaults(org),
      ]);
      if (ranges.error) throw ranges.error;
      if (templates.error) throw templates.error;
      res.json({
        ranges: ranges.data ?? [],
        templates: (templates.data ?? []).map(({ boq_template_versions, ...t }: any) => ({
          ...t,
          versions: (boq_template_versions ?? []).sort((a: any, b: any) => b.version - a.version),
        })),
        companyDefaults: defaults,
      });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/boq-templates failed:", err.message);
      res.status(500).json({ error: "Failed to load BOQ templates." });
    }
  });

  app.get("/api/boq-templates/:id", requirePermission("boq_template.view"), async (req, res) => {
    try {
      const sb = getSupabase();
      const org = orgOf(req);
      const { data: template, error } = await sb.from("boq_templates").select("*").eq("organization_id", org).eq("id", req.params.id).maybeSingle();
      if (error) throw error;
      if (!template) return res.status(404).json({ error: "Template not found." });
      const { data: versions, error: vErr } = await sb.from("boq_template_versions").select("*").eq("organization_id", org).eq("template_id", template.id).order("version", { ascending: false });
      if (vErr) throw vErr;
      const ids = [...new Set((versions ?? []).flatMap((v: any) => [v.created_by, v.published_by]).filter(Boolean))];
      const { data: people, error: uErr } = ids.length ? await sb.from("users").select("id, name").in("id", ids) : { data: [], error: null };
      if (uErr) throw uErr;
      const names = Object.fromEntries((people ?? []).map((u: any) => [u.id, u.name]));
      res.json({
        template,
        versions: (versions ?? []).map((v: any) => ({ ...v, created_by_name: names[v.created_by] ?? null, published_by_name: names[v.published_by] ?? null })),
        companyDefaults: await companyDefaults(org),
      });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/boq-templates/:id failed:", err.message);
      res.status(500).json({ error: "Failed to load the template." });
    }
  });

  // New template = a draft v1 copied from a source template (default: the
  // range's default template, else the built-in current-calculator seed).
  app.post("/api/boq-templates", requirePermission("boq_template.create"), async (req, res) => {
    const meta = validateTemplateMeta(req.body);
    if ("error" in meta) return res.status(400).json({ error: meta.error });
    const rangeId = typeof req.body?.capacity_range_id === "string" ? req.body.capacity_range_id : "";
    if (!rangeId) return res.status(400).json({ error: "Pick a capacity range." });
    const sourceId = typeof req.body?.source_template_id === "string" && req.body.source_template_id ? req.body.source_template_id : null;
    const sb = getSupabase();
    const org = orgOf(req);
    try {
      let source = LEGACY_SEED_DOCUMENT as unknown;
      const fromId = sourceId ?? (await sb.from("boq_templates").select("id").eq("organization_id", org).eq("capacity_range_id", rangeId).eq("is_default", true).is("archived_at", null).maybeSingle()).data?.id;
      if (fromId) {
        const v = await latestVersion(org, fromId);
        if (!v && sourceId) return res.status(404).json({ error: "Source template not found." });
        if (v) source = v.definition;
      }
      const doc = validateTemplateDocument(source);
      if ("error" in doc) return res.status(500).json({ error: `Source template is invalid: ${doc.error}` });

      const { data: template, error } = await sb
        .from("boq_templates")
        .insert({ ...meta.value, organization_id: org, capacity_range_id: rangeId, is_default: false, created_by: userId(req) })
        .select("*")
        .single();
      if (error) {
        // Composite FK (capacity_range_id, organization_id): another company's range lands here too.
        if (error.code === FK_VIOLATION) return res.status(400).json({ error: "That capacity range doesn't exist." });
        throw error;
      }
      const { data: version, error: vErr } = await sb
        .from("boq_template_versions")
        .insert({ organization_id: org, template_id: template.id, version: 1, status: "draft", definition: doc.value, created_by: userId(req) })
        .select("*")
        .single();
      if (vErr) {
        await sb.from("boq_templates").delete().eq("organization_id", org).eq("id", template.id);
        throw vErr;
      }
      res.json({ template, version });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/boq-templates failed:", err.message);
      res.status(500).json({ error: "Failed to create the template." });
    }
  });

  // Metadata, default flag (update) and archive / restore (delete).
  app.patch("/api/boq-templates/:id", requirePermission("boq_template.update"), async (req, res) => {
    const { archived, is_default, ...fields } = req.body ?? {};
    const meta = validateTemplateMeta(fields, true);
    if ("error" in meta) return res.status(400).json({ error: meta.error });
    const patch: Record<string, unknown> = { ...meta.value };
    if (archived !== undefined) {
      if (!hasPermission(req, "boq_template.delete")) return res.status(403).json({ error: FORBIDDEN });
      patch.archived_at = archived ? now() : null;
      if (archived) patch.is_default = false;
    }
    if (is_default !== undefined && typeof is_default !== "boolean") return res.status(400).json({ error: "is_default must be true or false." });
    if (!Object.keys(patch).length && is_default === undefined) return res.status(400).json({ error: "Nothing to update." });
    const sb = getSupabase();
    const org = orgOf(req);
    try {
      const { data: current, error: cErr } = await sb.from("boq_templates").select("*").eq("organization_id", org).eq("id", req.params.id).maybeSingle();
      if (cErr) throw cErr;
      if (!current) return res.status(404).json({ error: "Template not found." });
      if (is_default === true) {
        if (current.archived_at && archived !== false) return res.status(400).json({ error: "Restore the template before making it the default." });
        const { error: uErr } = await sb.from("boq_templates").update({ is_default: false, updated_at: now() }).eq("organization_id", org).eq("capacity_range_id", current.capacity_range_id).eq("is_default", true);
        if (uErr) throw uErr;
        patch.is_default = true;
      } else if (is_default === false) patch.is_default = false;
      const { data, error } = await sb.from("boq_templates").update({ ...patch, updated_at: now() }).eq("organization_id", org).eq("id", current.id).select("*").single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return res.status(409).json({ error: "This range already has a default template." });
        throw error;
      }
      res.json({ template: data });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/boq-templates/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update the template." });
    }
  });

  // ── Versions ─────────────────────────────────────────────────────────────
  // Next draft = a copy of the latest version. One open draft per template.
  app.post("/api/boq-templates/:id/versions", requirePermission("boq_template.update"), async (req, res) => {
    const sb = getSupabase();
    const org = orgOf(req);
    try {
      const { data: template, error } = await sb.from("boq_templates").select("id, archived_at").eq("organization_id", org).eq("id", req.params.id).maybeSingle();
      if (error) throw error;
      if (!template) return res.status(404).json({ error: "Template not found." });
      if (template.archived_at) return res.status(400).json({ error: "Restore the template before creating a new version." });
      const latest = await latestVersion(org, template.id);
      if (latest?.status === "draft") return res.status(409).json({ error: "This template already has an open draft.", version: latest });
      const doc = validateTemplateDocument(latest?.definition ?? LEGACY_SEED_DOCUMENT);
      if ("error" in doc) return res.status(500).json({ error: `Latest version is invalid: ${doc.error}` });
      const { data, error: iErr } = await sb
        .from("boq_template_versions")
        .insert({ organization_id: org, template_id: template.id, version: (latest?.version ?? 0) + 1, status: "draft", definition: doc.value, created_by: userId(req) })
        .select("*")
        .single();
      if (iErr) {
        if (iErr.code === UNIQUE_VIOLATION) return res.status(409).json({ error: "Someone else just created a version. Reload and try again." });
        throw iErr;
      }
      res.json({ version: data });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/boq-templates/:id/versions failed:", err.message);
      res.status(500).json({ error: "Failed to create a new version." });
    }
  });

  async function draftOr409(req: Request) {
    const { data, error } = await getSupabase().from("boq_template_versions").select("id, status, template_id, definition").eq("organization_id", orgOf(req)).eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return { status: 404, error: "Version not found." } as const;
    if (data.status !== "draft") return { status: 409, error: READ_ONLY } as const;
    return { version: data } as const;
  }

  app.patch("/api/boq-template-versions/:id", requirePermission("boq_template.update"), async (req, res) => {
    const doc = validateTemplateDocument(req.body?.definition);
    if ("error" in doc) return res.status(400).json({ error: doc.error });
    try {
      const found = await draftOr409(req);
      if ("error" in found) return res.status(found.status).json({ error: found.error });
      const { data, error } = await getSupabase()
        .from("boq_template_versions")
        .update({ definition: doc.value, updated_at: now() })
        .eq("organization_id", orgOf(req))
        .eq("id", found.version.id)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === IMMUTABLE) return res.status(409).json({ error: READ_ONLY });
        throw error;
      }
      if (!data) return res.status(409).json({ error: READ_ONLY });
      res.json({ version: data });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/boq-template-versions/:id failed:", err.message);
      res.status(500).json({ error: "Failed to save the draft." });
    }
  });

  app.post("/api/boq-template-versions/:id/publish", requirePermission("boq_template.publish"), async (req, res) => {
    try {
      const found = await draftOr409(req);
      if ("error" in found) return res.status(found.status).json({ error: found.error });
      // Re-validate at the moment it becomes immutable.
      const doc = validateTemplateDocument(found.version.definition);
      if ("error" in doc) return res.status(400).json({ error: `Fix the draft before publishing: ${doc.error}` });
      const org = orgOf(req);
      const { data, error } = await getSupabase()
        .from("boq_template_versions")
        .update({ status: "published", published_at: now(), published_by: userId(req), updated_at: now() })
        .eq("organization_id", org)
        .eq("id", found.version.id)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === IMMUTABLE) return res.status(409).json({ error: "This version is already published." });
        throw error;
      }
      if (!data) return res.status(409).json({ error: "This version is already published." });
      await getSupabase().from("boq_templates").update({ updated_at: now() }).eq("organization_id", org).eq("id", found.version.template_id);
      res.json({ version: data });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/boq-template-versions/:id/publish failed:", err.message);
      res.status(500).json({ error: "Failed to publish." });
    }
  });
}
