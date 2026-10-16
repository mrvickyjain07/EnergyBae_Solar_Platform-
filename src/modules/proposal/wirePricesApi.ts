// src/modules/proposal/wirePricesApi.ts
// Wire price backend: upload-preview + CRUD/upsert routes for the wire_prices
// table (see supabase/migrations/0002_wire_prices.sql). Reuses the base64
// data-URL upload pattern already used for utility-bill uploads (server.ts)
// instead of adding multipart/multer.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { sanitizePrice } from "./sanitizePrice";
import { parseSpreadsheetBuffer } from "./parseSpreadsheet";
import { extractWirePricesFromDocument } from "./wirePriceExtraction";
import { resolveWireType } from "./wireCategory";
import { orgOf, requirePermission, type AuthedRequest } from "../../services/authMiddleware";

function decodeUploadedFile(fileData: string): Buffer {
  const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(cleanBase64, "base64");
}

// Blank spreadsheet cells arrive as "" (parseSpreadsheetBuffer's defval),
// which is neither null nor undefined and blows up a numeric Postgres
// column. Coerce anything unparseable to null instead of passing it through.
function numOrNull(v: unknown): number | null {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

export interface WirePriceRow {
  id: string;
  internal_name: string;
  type: string;
  brand: string | null;
  size_sqmm: number | null;
  cores: number | null;
  material: string | null;
  price_per_m: number;
  gst_pct: number | null;
  source: "manual" | "upload";
  manual_override: boolean;
  manually_edited: boolean;
  is_active: boolean;
  fetched_at: string;
  updated_at: string;
}

export interface MappedWireRow {
  internal_name: string;
  type?: string;
  brand?: string | null;
  size_sqmm?: number | null;
  cores?: number | null;
  material?: string | null;
  price_per_m: number;
  gst_pct?: number | null;
  /** Set by the "add one wire" form (WirePriceList.tsx) — bulk upload never
   *  sends this and always lands as "upload". */
  source?: "manual" | "upload";
}

export function registerWirePriceRoutes(app: Express) {
  app.post("/api/wire-prices/preview", requirePermission("pricing.import"), async (req, res) => {
    const { fileData } = req.body ?? {};
    if (typeof fileData !== "string" || !fileData) {
      return res.status(400).json({ error: "Request body must include fileData (base64 data URL)." });
    }
    const mimeMatch = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1] : "";
    const buffer = decodeUploadedFile(fileData);

    const isDocument = detectedMime === "application/pdf" || detectedMime.startsWith("image/");
    if (isDocument) {
      try {
        const rows = await extractWirePricesFromDocument(buffer, detectedMime);
        return res.json({ extracted: true, rows, totalRows: rows.length });
      } catch (err: any) {
        console.error("[EnergyBae] POST /api/wire-prices/preview (extraction) failed:", err.message);
        if (err.name === "ExtractionUnavailableError") {
          return res.status(503).json({ error: err.message || "Could not extract wire prices from the uploaded document." });
        }
        return res.status(400).json({
          error: "Could not extract wire prices from the uploaded document. Try a clearer photo or a different file.",
        });
      }
    }

    try {
      const { headers, rows } = parseSpreadsheetBuffer(buffer);
      res.json({ headers, rows: rows, totalRows: rows.length });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/wire-prices/preview (spreadsheet) failed:", err.message);
      res.status(400).json({ error: "Could not parse the uploaded file. Is it a valid .xlsx or .csv?" });
    }
  });

  app.get("/api/wire-prices", requirePermission("pricing.view"), async (req, res) => {
    try {
      let query = getSupabase().from("wire_prices").select("*").eq("organization_id", orgOf(req)).eq("is_active", true).order("internal_name");
      const { type, brand, material, search, cores } = req.query;
      if (typeof type === "string" && type) query = query.eq("type", type);
      if (typeof brand === "string" && brand) query = query.eq("brand", brand);
      if (typeof material === "string" && material) query = query.eq("material", material);
      if (typeof search === "string" && search) query = query.ilike("internal_name", `%${search}%`);
      // "5plus" is the Multicore bucket; everything else (1, 2, 3, 3.5, 4) is
      // an exact core count.
      if (typeof cores === "string" && cores) query = cores === "5plus" ? query.gte("cores", 5) : query.eq("cores", Number(cores));
      const { data, error } = await query;
      if (error) throw error;
      res.json({ rows: (data ?? []) as WirePriceRow[] });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/wire-prices failed:", err.message);
      res.status(500).json({ error: "Failed to load wire prices." });
    }
  });

  app.post("/api/wire-prices/upsert", requirePermission("pricing.import"), async (req, res) => {
    const rows = req.body?.rows as MappedWireRow[] | undefined;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: "Request body must be { rows: MappedWireRow[] }." });
    }
    try {
      const sb = getSupabase();
      const userId = (req as AuthedRequest).user!.sub;
      let added = 0, updated = 0, skipped = 0;
      const skippedReasons: string[] = [];

      for (const raw of rows) {
        const internalName = String(raw.internal_name ?? "").trim();
        if (!internalName) {
          skipped++; skippedReasons.push("blank internal_name"); continue;
        }
        const { data: existing, error: lookupError } = await sb.from("wire_prices").select("id, price_per_m, manual_override").eq("organization_id", orgOf(req)).eq("internal_name", internalName).maybeSingle();
        if (lookupError) {
          skipped++; skippedReasons.push(`${internalName}: lookup failed: ${lookupError.message}`); continue;
        }
        if (existing?.manual_override) {
          skipped++; skippedReasons.push(`${internalName}: manual override`); continue;
        }
        const priceCandidate = typeof raw.price_per_m === "number" ? raw.price_per_m : parseFloat(String(raw.price_per_m ?? ""));
        if (!Number.isFinite(priceCandidate)) {
          skipped++; skippedReasons.push(`${internalName}: unparseable price (${String(raw.price_per_m)})`); continue;
        }
        // numOrNull, not intOrNull — a "3.5 core" cable is a real construction
        // (3 full conductors + reduced neutral), not a value to round away.
        const cores = numOrNull(raw.cores);
        const patch = {
          internal_name: internalName,
          // Route by the row's real core count, not the one category picked
          // for the whole file — a price sheet mixes 1-core and n-core rows.
          type: resolveWireType(raw.type || "Cable", cores),
          brand: raw.brand || null,
          size_sqmm: numOrNull(raw.size_sqmm),
          cores,
          material: raw.material ?? null,
          price_per_m: sanitizePrice(priceCandidate),
          gst_pct: numOrNull(raw.gst_pct),
          source: raw.source === "manual" ? ("manual" as const) : ("upload" as const),
          // Fresh data supersedes any earlier hand-edit of this row's price.
          manually_edited: false,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { error } = await sb.from("wire_prices").upsert({ ...patch, organization_id: orgOf(req) }, { onConflict: "organization_id,internal_name" });
        if (error) { skipped++; skippedReasons.push(`${internalName}: ${error.message}`); continue; }
        existing ? updated++ : added++;

        const oldPrice = existing?.price_per_m ?? null;
        if (oldPrice !== patch.price_per_m) {
          const { error: historyError } = await sb
            .from("price_history")
            .insert({ organization_id: orgOf(req), entity_type: "wire_price", entity_key: internalName, old_value: oldPrice, new_value: patch.price_per_m, source: patch.source, user_id: userId });
          if (historyError) console.error(`[EnergyBae] price_history insert failed for ${internalName}:`, historyError.message);
        }
      }
      res.json({ added, updated, skipped, skippedReasons });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/wire-prices/upsert failed:", err.message);
      res.status(500).json({ error: "Failed to import wire prices." });
    }
  });

  // Bulk delete — scoped by brand/type, or the whole table with an explicit
  // all=true. Registered BEFORE /:id so "/api/wire-prices" doesn't get
  // swallowed by the parameterised route. Refuses an unscoped call so a
  // dropped query string can't wipe the price list by accident.
  app.delete("/api/wire-prices", requirePermission("pricing.update"), async (req, res) => {
    const { brand, type, all, nobrand } = req.query;
    const hasBrand = typeof brand === "string" && brand;
    const hasType = typeof type === "string" && type;
    // nobrand=true scopes to rows whose brand is NULL — needed to clear the
    // legacy "No Company" groups without touching branded rows of that type.
    const nullBrand = nobrand === "true";
    if (!hasBrand && !hasType && !nullBrand && all !== "true") {
      return res.status(400).json({ error: "Refusing to delete every wire price without ?all=true (or a brand/type filter)." });
    }
    try {
      // .neq on the PK matches every row — PostgREST requires some filter on
      // a delete, and this keeps the "delete all" path explicit.
      let query = getSupabase().from("wire_prices").delete().eq("organization_id", orgOf(req)).neq("id", "00000000-0000-0000-0000-000000000000");
      if (hasBrand) query = query.eq("brand", brand as string);
      else if (nullBrand) query = query.is("brand", null);
      if (hasType) query = query.eq("type", type as string);
      const { data, error } = await query.select("id");
      if (error) throw error;
      res.json({ deleted: (data ?? []).length });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/wire-prices failed:", err.message);
      res.status(500).json({ error: "Failed to delete wire prices." });
    }
  });

  app.delete("/api/wire-prices/:id", requirePermission("pricing.update"), async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("wire_prices").delete().eq("organization_id", orgOf(req)).eq("id", req.params.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Wire price row not found." });
      res.json({ deleted: 1 });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/wire-prices/:id failed:", err.message);
      res.status(500).json({ error: "Failed to delete wire price." });
    }
  });

  app.patch("/api/wire-prices/:id", requirePermission("pricing.update"), async (req, res) => {
    const { price_per_m, manual_override, is_active, brand } = req.body ?? {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // Flags this row as hand-edited so the list can show "upload (edited)"
    // instead of a plain "upload" that looks untouched since import.
    if (price_per_m !== undefined) { patch.price_per_m = sanitizePrice(price_per_m); patch.manually_edited = true; }
    if (manual_override !== undefined) patch.manual_override = Boolean(manual_override);
    if (is_active !== undefined) patch.is_active = Boolean(is_active);
    if (brand !== undefined) patch.brand = brand || null;
    try {
      const sb = getSupabase();
      const { data: before } = await sb.from("wire_prices").select("internal_name, price_per_m").eq("organization_id", orgOf(req)).eq("id", req.params.id).maybeSingle();
      const { data, error } = await sb.from("wire_prices").update(patch).eq("organization_id", orgOf(req)).eq("id", req.params.id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Wire price row not found." });

      if (typeof patch.price_per_m === "number" && before && before.price_per_m !== patch.price_per_m) {
        const userId = (req as AuthedRequest).user!.sub;
        const { error: historyError } = await sb
          .from("price_history")
          .insert({ organization_id: orgOf(req), entity_type: "wire_price", entity_key: before.internal_name, old_value: before.price_per_m, new_value: patch.price_per_m, source: "manual", user_id: userId });
        if (historyError) console.error(`[EnergyBae] price_history insert failed for ${before.internal_name}:`, historyError.message);
      }

      res.json({ row: data as WirePriceRow });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/wire-prices/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update wire price." });
    }
  });
}
