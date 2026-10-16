// src/modules/proposal/catalogueApi.ts
// Price DB backend: GET/PUT the whole Catalogue object as one jsonb row in
// catalogue_state (see supabase/migrations/0001_catalogue_state.sql). No
// per-field CRUD endpoints — the client already edits the whole object in
// memory (PriceDatabase.tsx) and saves it as one unit, same as the old
// localStorage write; this keeps that exact shape.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { sanitizePrice } from "./sanitizePrice";
import { diffCatalogue } from "./priceHistory";
import { Catalogue } from "./types";
import { orgOf, requirePermission, type AuthedRequest } from "../../services/authMiddleware";

// Only the scalar price/rate fields need clamping — everything else (brand,
// model, category strings, ids) passes through untouched.
function sanitizeCatalogue(raw: Catalogue): Catalogue {
  return {
    ...raw,
    panels: raw.panels.map((p) => ({ ...p, pricePerWp: sanitizePrice(p.pricePerWp, { min: 0, max: 60 }) })),
    batteries: raw.batteries.map((b) => ({ ...b, price: sanitizePrice((b as any).price) })),
    acdb: raw.acdb.map((r) => ({ ...r, price: sanitizePrice(r.price) })),
    dcdb: raw.dcdb.map((r) => ({ ...r, price: sanitizePrice(r.price) })),
    bos: Object.fromEntries(Object.entries(raw.bos).map(([k, v]) => [k, sanitizePrice(v as number)])) as unknown as Catalogue["bos"],
    customBOS: raw.customBOS.map((c) => ({ ...c, price: sanitizePrice((c as any).price) })),
    charges: Object.fromEntries(Object.entries(raw.charges).map(([k, v]) => [k, sanitizePrice(v as number)])) as unknown as Catalogue["charges"],
  };
}

export function registerCatalogueRoutes(app: Express) {
  app.get("/api/catalogue", requirePermission("catalogue.view"), async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("catalogue_state").select("data").eq("organization_id", orgOf(req)).maybeSingle();
      if (error) throw error;
      // null (not DEFAULT_CATALOGUE) when no row has been saved yet — lets the
      // client tell "nothing saved" apart from "factory defaults were saved".
      res.json({ catalogue: (data?.data as Catalogue) ?? null });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/catalogue failed:", err.message);
      res.status(500).json({ error: "Failed to load price catalogue." });
    }
  });

  app.put("/api/catalogue", requirePermission("catalogue.update"), async (req, res) => {
    const raw = req.body?.catalogue as Catalogue | undefined;
    if (!raw || !Array.isArray(raw.panels) || !raw.charges) {
      return res.status(400).json({ error: "Request body must be { catalogue: Catalogue }." });
    }
    try {
      const clean = sanitizeCatalogue(raw);
      const sb = getSupabase();
      const org = orgOf(req);
      const { data: existing } = await sb.from("catalogue_state").select("data").eq("organization_id", org).maybeSingle();
      const { error } = await sb.from("catalogue_state").upsert({ organization_id: org, data: clean, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
      if (error) throw error;

      const changes = diffCatalogue((existing?.data as Catalogue) ?? null, clean);
      if (changes.length) {
        // Best-effort audit trail — a logging failure shouldn't fail the save
        // the office is actually waiting on.
        const userId = (req as AuthedRequest).user!.sub;
        const { error: historyError } = await sb.from("price_history").insert(changes.map((c) => ({ ...c, source: "manual", user_id: userId, organization_id: org })));
        if (historyError) console.error("[EnergyBae] price_history insert failed:", historyError.message);
      }

      res.json({ catalogue: clean });
    } catch (err: any) {
      console.error("[EnergyBae] PUT /api/catalogue failed:", err.message);
      res.status(500).json({ error: "Failed to save price catalogue." });
    }
  });
}
