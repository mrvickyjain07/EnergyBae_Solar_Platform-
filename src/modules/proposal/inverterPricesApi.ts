// src/modules/proposal/inverterPricesApi.ts
// Inverter price backend: upload-preview + CRUD/upsert routes for the
// inverter_prices table (see supabase/migrations/0006_inverter_prices.sql).
// Mirrors wirePricesApi.ts's shape closely — same base64 data-URL upload
// pattern, same PDF/image AI-extraction branch (inverterPriceExtraction.ts),
// same upsert/dedupe/manual_override/price_history conventions. Unlike wire,
// extracted/mapped rows never carry brand or system_type themselves — every
// vendor pricelist is one brand/one system type per document, so the client
// attaches those from two file-wide selects before calling /upsert.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { sanitizePrice } from "./sanitizePrice";
import { parseSpreadsheetBuffer } from "./parseSpreadsheet";
import { extractInverterPricesFromDocument } from "./inverterPriceExtraction";
import { SystemType } from "./types";
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

const SYSTEM_TYPE_MAP: Record<string, SystemType> = {
  "on grid": "On-Grid", "on-grid": "On-Grid", "ongrid": "On-Grid",
  "off grid": "Off-Grid", "off-grid": "Off-Grid", "offgrid": "Off-Grid",
  hybrid: "Hybrid",
};
function normalizeSystemType(v: unknown): SystemType | null {
  const key = String(v ?? "").trim().toLowerCase();
  return SYSTEM_TYPE_MAP[key] ?? null;
}

// "1 Phase" / "1-Phase" / "Single Phase" / "1P" -> 1, "3 Phase" / "Three
// Phase" / "3P" -> 3. Anything else (including a bare "2") is invalid.
function normalizePhase(v: unknown): 1 | 3 | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.includes("single") || /(^|\D)1\D*p?$/.test(s) || s === "1") return 1;
  if (s.includes("three") || /(^|\D)3\D*p?$/.test(s) || s === "3") return 3;
  return null;
}

export interface InverterPriceRow {
  id: string;
  internal_name: string;
  brand: string;
  system_type: SystemType;
  phase: 1 | 3;
  kw: number;
  model: string;
  category: string | null;
  price: number;
  cost: number | null;
  notes: string | null;
  source: "manual" | "upload";
  manual_override: boolean;
  is_active: boolean;
  fetched_at: string;
  updated_at: string;
}

export interface MappedInverterRow {
  internal_name?: string;
  brand?: string;
  system_type?: string;
  phase?: string | number;
  kw?: number | string;
  model?: string;
  category?: string;
  price?: number | string;
  cost?: number | string;
  notes?: string;
  /** Set by the "Add Inverter" form (InverterPriceList.tsx) — bulk upload
   *  never sends this and always lands as "upload". */
  source?: "manual" | "upload";
}

function computeInternalName(brand: string, systemType: SystemType, phase: 1 | 3, kw: number, model: string): string {
  return [brand, systemType, `${phase}p`, `${kw}kw`, model].map((s) => String(s).trim().toLowerCase()).join("|");
}

export function registerInverterPriceRoutes(app: Express) {
  app.post("/api/inverter-prices/preview", requirePermission("catalogue.update"), async (req, res) => {
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
        const rows = await extractInverterPricesFromDocument(buffer, detectedMime);
        return res.json({ extracted: true, rows, totalRows: rows.length });
      } catch (err: any) {
        console.error("[EnergyBae] POST /api/inverter-prices/preview (extraction) failed:", err.message);
        if (err.name === "ExtractionUnavailableError") {
          return res.status(503).json({ error: err.message || "Could not extract inverter prices from the uploaded document." });
        }
        return res.status(400).json({
          error: "Could not extract inverter prices from the uploaded document. Try a clearer photo or a different file.",
        });
      }
    }

    try {
      const { headers, rows } = parseSpreadsheetBuffer(buffer);
      res.json({ headers, rows, totalRows: rows.length });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/inverter-prices/preview failed:", err.message);
      res.status(400).json({ error: "Could not parse the uploaded file. Is it a valid .xlsx or .csv?" });
    }
  });

  app.get("/api/inverter-prices", requirePermission("catalogue.view"), async (req, res) => {
    try {
      let query = getSupabase().from("inverter_prices").select("*").eq("organization_id", orgOf(req)).eq("is_active", true).order("brand");
      const { systemType, phase, brand, search } = req.query;
      if (typeof systemType === "string" && systemType) query = query.eq("system_type", systemType);
      if (typeof phase === "string" && phase) query = query.eq("phase", Number(phase));
      if (typeof brand === "string" && brand) query = query.eq("brand", brand);
      if (typeof search === "string" && search) query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ rows: (data ?? []) as InverterPriceRow[] });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/inverter-prices failed:", err.message);
      res.status(500).json({ error: "Failed to load inverter prices." });
    }
  });

  app.post("/api/inverter-prices/upsert", requirePermission("catalogue.update"), async (req, res) => {
    const rows = req.body?.rows as MappedInverterRow[] | undefined;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: "Request body must be { rows: MappedInverterRow[] }." });
    }
    try {
      const sb = getSupabase();
      const userId = (req as AuthedRequest).user!.sub;
      let added = 0, updated = 0, skipped = 0;
      const skippedReasons: string[] = [];

      for (const raw of rows) {
        const brand = String(raw.brand ?? "").trim();
        const model = String(raw.model ?? "").trim();
        const label = `${brand || "?"} ${model || "?"}`;

        const systemType = normalizeSystemType(raw.system_type);
        if (!systemType) { skipped++; skippedReasons.push(`${label}: invalid System Type (${String(raw.system_type)})`); continue; }
        const phase = normalizePhase(raw.phase);
        if (!phase) { skipped++; skippedReasons.push(`${label}: invalid Phase (${String(raw.phase)})`); continue; }
        if (!brand) { skipped++; skippedReasons.push(`${label}: blank Brand`); continue; }
        if (!model) { skipped++; skippedReasons.push(`${label}: blank Model`); continue; }
        const kw = numOrNull(raw.kw);
        if (kw === null || kw <= 0) { skipped++; skippedReasons.push(`${label}: invalid kW (${String(raw.kw)})`); continue; }
        const priceCandidate = typeof raw.price === "number" ? raw.price : parseFloat(String(raw.price ?? ""));
        if (!Number.isFinite(priceCandidate) || priceCandidate < 0) { skipped++; skippedReasons.push(`${label}: invalid Price (${String(raw.price)})`); continue; }

        const internalName = computeInternalName(brand, systemType, phase, kw, model);
        const { data: existing, error: lookupError } = await sb.from("inverter_prices").select("id, price, manual_override").eq("organization_id", orgOf(req)).eq("internal_name", internalName).maybeSingle();
        if (lookupError) { skipped++; skippedReasons.push(`${label}: lookup failed: ${lookupError.message}`); continue; }
        if (existing?.manual_override) { skipped++; skippedReasons.push(`${label}: manual override`); continue; }

        const patch = {
          internal_name: internalName,
          brand, system_type: systemType, phase, kw, model,
          category: raw.category || null,
          price: sanitizePrice(priceCandidate),
          cost: numOrNull(raw.cost),
          notes: raw.notes || null,
          source: raw.source === "manual" ? ("manual" as const) : ("upload" as const),
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { error } = await sb.from("inverter_prices").upsert({ ...patch, organization_id: orgOf(req) }, { onConflict: "organization_id,internal_name" });
        if (error) { skipped++; skippedReasons.push(`${label}: ${error.message}`); continue; }
        existing ? updated++ : added++;

        const oldPrice = existing?.price ?? null;
        if (oldPrice !== patch.price) {
          const { error: historyError } = await sb
            .from("price_history")
            .insert({ organization_id: orgOf(req), entity_type: "inverter_price", entity_key: internalName, old_value: oldPrice, new_value: patch.price, source: patch.source, user_id: userId });
          if (historyError) console.error(`[EnergyBae] price_history insert failed for ${internalName}:`, historyError.message);
        }
      }
      res.json({ added, updated, skipped, skippedReasons });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/inverter-prices/upsert failed:", err.message);
      res.status(500).json({ error: "Failed to import inverter prices." });
    }
  });

  // Bulk delete — scoped by brand/system_type, or the whole table with an
  // explicit all=true. Registered BEFORE /:id so "/api/inverter-prices"
  // doesn't get swallowed by the parameterised route. Refuses an unscoped
  // call so a dropped query string can't wipe the price list by accident.
  app.delete("/api/inverter-prices", requirePermission("catalogue.delete"), async (req, res) => {
    const { brand, systemType, all } = req.query;
    const hasBrand = typeof brand === "string" && brand;
    const hasSystemType = typeof systemType === "string" && systemType;
    if (!hasBrand && !hasSystemType && all !== "true") {
      return res.status(400).json({ error: "Refusing to delete every inverter price without ?all=true (or a brand/systemType filter)." });
    }
    try {
      let query = getSupabase().from("inverter_prices").delete().eq("organization_id", orgOf(req)).neq("id", "00000000-0000-0000-0000-000000000000");
      if (hasBrand) query = query.eq("brand", brand as string);
      if (hasSystemType) query = query.eq("system_type", systemType as string);
      const { data, error } = await query.select("id");
      if (error) throw error;
      res.json({ deleted: (data ?? []).length });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/inverter-prices failed:", err.message);
      res.status(500).json({ error: "Failed to delete inverter prices." });
    }
  });

  app.delete("/api/inverter-prices/:id", requirePermission("catalogue.delete"), async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("inverter_prices").delete().eq("organization_id", orgOf(req)).eq("id", req.params.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Inverter price row not found." });
      res.json({ deleted: 1 });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/inverter-prices/:id failed:", err.message);
      res.status(500).json({ error: "Failed to delete inverter price." });
    }
  });

  app.patch("/api/inverter-prices/:id", requirePermission("catalogue.update"), async (req, res) => {
    const { price, manual_override, is_active, cost, notes } = req.body ?? {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (price !== undefined) patch.price = sanitizePrice(price);
    if (manual_override !== undefined) patch.manual_override = Boolean(manual_override);
    if (is_active !== undefined) patch.is_active = Boolean(is_active);
    if (cost !== undefined) patch.cost = numOrNull(cost);
    if (notes !== undefined) patch.notes = notes || null;
    try {
      const sb = getSupabase();
      const { data: before } = await sb.from("inverter_prices").select("internal_name, price").eq("organization_id", orgOf(req)).eq("id", req.params.id).maybeSingle();
      const { data, error } = await sb.from("inverter_prices").update(patch).eq("organization_id", orgOf(req)).eq("id", req.params.id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Inverter price row not found." });

      if (typeof patch.price === "number" && before && before.price !== patch.price) {
        const userId = (req as AuthedRequest).user!.sub;
        const { error: historyError } = await sb
          .from("price_history")
          .insert({ organization_id: orgOf(req), entity_type: "inverter_price", entity_key: before.internal_name, old_value: before.price, new_value: patch.price, source: "manual", user_id: userId });
        if (historyError) console.error(`[EnergyBae] price_history insert failed for ${before.internal_name}:`, historyError.message);
      }

      res.json({ row: data as InverterPriceRow });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/inverter-prices/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update inverter price." });
    }
  });
}
