// src/services/organizationApi.ts
// Company branding routes (see supabase/migrations/0014_organization_settings.sql).
// GET is open to every member of the company (the branding is shown to all);
// PUT needs organization.branding.update. Named *Api.ts per the route-registrar
// convention; lives in src/services because branding isn't one module's.
import type { Express } from "express";
import { getSupabase } from "./supabaseClient";
import { validateOrganizationSettings, OrganizationSettings } from "./organizationSettings";
import { orgOf, requireMember, requirePermission, type AuthedRequest } from "./authMiddleware";

const EMPTY: OrganizationSettings = { companyName: null, logoDataUrl: null, phone: null, email: null, address: null };

function fromRow(row: any): OrganizationSettings & { updatedAt: string | null } {
  return {
    companyName: row?.company_name ?? null,
    logoDataUrl: row?.logo_data_url ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    address: row?.address ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

// Before migration 0014 is applied the table doesn't exist. Reads degrade to
// "no custom branding" so the app keeps working; writes report it clearly.
const isMissingTable = (err: any) => err?.code === "42P01" || err?.code === "PGRST205" || /organization_settings/.test(err?.message ?? "") && /does not exist|schema cache/.test(err?.message ?? "");

export function registerOrganizationRoutes(app: Express) {
  app.get("/api/organization", requireMember, async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("organization_settings").select("*").eq("organization_id", orgOf(req)).maybeSingle();
      if (error) {
        if (isMissingTable(error)) return res.json({ ...EMPTY, updatedAt: null, configured: false });
        throw error;
      }
      res.json({ ...fromRow(data), configured: true });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/organization failed:", err.message);
      res.status(500).json({ error: "Failed to load company branding." });
    }
  });

  app.put("/api/organization", requirePermission("organization.branding.update"), async (req, res) => {
    const result = validateOrganizationSettings(req.body);
    // `in` narrows under this repo's non-strict tsconfig; `!result.ok` doesn't.
    if ("error" in result) return res.status(400).json({ error: result.error });
    const v = result.value;
    try {
      const { data, error } = await getSupabase()
        .from("organization_settings")
        .upsert(
          {
            organization_id: orgOf(req),
            company_name: v.companyName,
            logo_data_url: v.logoDataUrl,
            phone: v.phone,
            email: v.email,
            address: v.address,
            updated_at: new Date().toISOString(),
            updated_by: (req as AuthedRequest).user!.sub,
          },
          { onConflict: "organization_id" },
        )
        .select("*")
        .single();
      if (error) {
        if (isMissingTable(error)) {
          return res.status(503).json({ error: "Company branding isn't set up yet — the database migration 0014_organization_settings needs to be applied." });
        }
        throw error;
      }
      res.json({ ...fromRow(data), configured: true });
    } catch (err: any) {
      console.error("[EnergyBae] PUT /api/organization failed:", err.message);
      res.status(500).json({ error: "Failed to save company branding." });
    }
  });
}
