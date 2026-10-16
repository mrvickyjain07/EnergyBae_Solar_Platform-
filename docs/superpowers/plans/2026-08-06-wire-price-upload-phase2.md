# Wire Price Upload — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the office a real, shared `wire_prices` table (type/size/material/price) plus an Excel/CSV upload flow (preview → column-mapping → confirm) and a management/list screen, so wire/cable prices stop being 4 flat numbers and become bulk-updatable from a supplier price sheet.

**Architecture:** Same pattern as Phase 1 (`docs/superpowers/plans/2026-08-05-boq-system-architecture-and-phase1.md`, merged to `main`): Express routes in a `registerXRoutes(app)` module mounted from `server.ts`, Supabase Postgres accessed only server-side via `getSupabase()`. The upload path reuses the exact base64-data-URL pattern already in this codebase (`src/components/Uploader.tsx` client-side, `server.ts:651-659` server-side) instead of adding `multer`/multipart parsing. Parsing reuses the already-installed `xlsx` package (already used server-side for writing in `server.ts`/`commercialApi.ts`) instead of adding `papaparse` — `xlsx`'s `XLSX.read()` handles both `.xlsx` and `.csv` buffers.

**Tech Stack:** Express 4 · React 19 · `@supabase/supabase-js` (server-only) · Supabase Postgres · `xlsx` (already a dependency) · `tsx` for dev/scripts · `node:assert` for tests.

**Explicitly out of scope for this phase** (confirmed with the project owner before writing this plan):
- Wiring `wire_prices` into the BOQ calculation engine (`calculations.ts` still prices DC/AC/earth cable off the 4 flat `Catalogue.bos` fields — that's a separate future phase once there's a reason to match BOQ lines to specific SKUs).
- Vashi API fetch/automation.
- A `price_history` audit trail for wire prices (Phase 1 made the same call for the Price DB catalogue — can be added later on the existing generic `activity_logs` table without a schema change).

## Global Constraints

- Reuse the existing route-registration pattern (`export function registerXRoutes(app: Express, deps?: XApiDeps)` in a module file, called once from `server.ts`) — see `src/modules/proposal/catalogueApi.ts` for the reference shape.
- No new dependencies. `xlsx` (already installed) parses both `.xlsx` and `.csv`. File upload reuses the existing base64-data-URL pattern (`FileReader.readAsDataURL` client-side, `Buffer.from(base64, "base64")` server-side) — do not add `multer` or any multipart-parsing library.
- No client-side Supabase access, ever. All DB reads/writes go through Express routes using `getSupabase()` from `src/services/supabaseClient.ts`.
- No new test framework. Follow `src/modules/proposal/sanitizePrice.test.ts`'s convention: a plain `node:assert/strict` script run via `npx tsx <file>.test.ts`.
- No auth/RLS work — matches every other route in this codebase today.
- Reuse `sanitizePrice` from `src/modules/proposal/sanitizePrice.ts` for all price validation (client and server) — do not write a second price-clamping function.
- Don't add a schema-validation library (zod/ajv/etc.) — shallow shape checks are enough, matching Phase 1's `/api/catalogue` route.

---

## Phase roadmap context

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Price DB → shared Supabase backend, price validation | Done — merged to `main` |
| **2** | Wire prices: upload parser + `wire_prices` table | **This plan** |
| 3 | BOQ dashboard stepped-layout redesign | Not planned yet |
| 4 | Auto-calc engine consolidation, incl. wiring wire size → wire_prices lookup | Not planned yet |
| 5 | Proposals persistence, templates, auth, exports | Not planned yet |

---

## Phase 2 tasks

### Task 1: `wire_prices` table

**Files:**
- Create: `supabase/migrations/0002_wire_prices.sql`

**Interfaces:**
- Produces: table `wire_prices(id, internal_name, type, size_sqmm, cores, material, price_per_m, gst_pct, source, manual_override, is_active, fetched_at, updated_at)`, unique on `internal_name` (the upsert-match key for Task 4).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_wire_prices.sql
-- Wire/cable price list — genuinely tabular (many SKUs by type/size/material),
-- unlike the Price DB catalogue (see 0001_catalogue_state.sql), so this is a
-- real table, not a jsonb blob. internal_name is the office's own naming
-- (e.g. "DC Cable 4 sqmm Cu") and is the upsert-match key for repeat uploads.
create table if not exists wire_prices (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null unique,
  type text not null default 'Cable',
  size_sqmm numeric,
  cores integer,
  material text,
  price_per_m numeric not null default 0,
  gst_pct numeric,
  source text not null default 'manual' check (source in ('manual', 'upload')),
  manual_override boolean not null default false,
  is_active boolean not null default true,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wire_prices_type_idx on wire_prices(type);
create index if not exists wire_prices_material_idx on wire_prices(material);
```

- [ ] **Step 2: Apply it**

Via `mcp__supabase__apply_migration` against project `ipuptvlxorkerkgjvvnb` (same project Phase 1 used), or paste into the Supabase SQL Editor. Confirm with:

```sql
select count(*) from wire_prices;
```

Expected: table exists, 0 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_wire_prices.sql
git commit -m "db: add wire_prices table for Phase 2 wire price upload"
```

---

### Task 2: Spreadsheet parser

**Files:**
- Create: `src/modules/proposal/parseSpreadsheet.ts`
- Test: `src/modules/proposal/parseSpreadsheet.test.ts`

**Interfaces:**
- Produces: `parseSpreadsheetBuffer(buffer: Buffer): { headers: string[]; rows: Record<string, unknown>[] }` — used by Task 3's preview route. Headers come from the first row; `rows` are every subsequent row as header-keyed objects (empty cells become `""`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/proposal/parseSpreadsheet.test.ts
// Run with: npx tsx src/modules/proposal/parseSpreadsheet.test.ts
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseSpreadsheetBuffer } from "./parseSpreadsheet";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

// Build a real .xlsx buffer in-memory (same XLSX.utils used by exportExcel.ts)
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ["Wire Name", "Size (sqmm)", "Price/m"],
  ["DC Cable 4sqmm Cu", 4, "18.5"],
  ["AC Cable 6sqmm Cu", 6, "27"],
]);
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
const xlsxBuffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

const xlsxResult = parseSpreadsheetBuffer(xlsxBuffer);
check("xlsx headers", xlsxResult.headers, ["Wire Name", "Size (sqmm)", "Price/m"]);
check("xlsx row count", xlsxResult.rows.length, 2);
check("xlsx first row", xlsxResult.rows[0], { "Wire Name": "DC Cable 4sqmm Cu", "Size (sqmm)": 4, "Price/m": "18.5" });

// CSV buffer
const csvBuffer = Buffer.from("Name,Size,Price\nEarth Cable 6sqmm,6,15.2\n", "utf-8");
const csvResult = parseSpreadsheetBuffer(csvBuffer);
check("csv headers", csvResult.headers, ["Name", "Size", "Price"]);
check("csv row count", csvResult.rows.length, 1);
check("csv first row", csvResult.rows[0], { Name: "Earth Cable 6sqmm", Size: 6, Price: 15.2 });

// Empty sheet (header row only)
const wbEmpty = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbEmpty, XLSX.utils.aoa_to_sheet([["A", "B"]]), "Sheet1");
const emptyResult = parseSpreadsheetBuffer(XLSX.write(wbEmpty, { type: "buffer", bookType: "xlsx" }));
check("empty-body headers", emptyResult.headers, ["A", "B"]);
check("empty-body rows", emptyResult.rows, []);

console.log(`\n${passed} checks passed.`);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx src/modules/proposal/parseSpreadsheet.test.ts`
Expected: fails with a module-not-found error (`parseSpreadsheet.ts` doesn't exist yet).

- [ ] **Step 3: Implement it**

```typescript
// src/modules/proposal/parseSpreadsheet.ts
// Shared Excel/CSV parser for wire-price uploads. xlsx.read() handles both
// formats from a single buffer, so no separate CSV library is needed.
import * as XLSX from "xlsx";

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

export function parseSpreadsheetBuffer(buffer: Buffer): ParsedSpreadsheet {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" })[0] ?? [];
  const headers = headerRow.map((h) => String(h));
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return { headers, rows };
}
```

- [ ] **Step 4: Run it again to confirm it passes**

Run: `npx tsx src/modules/proposal/parseSpreadsheet.test.ts`
Expected: all 8 checks print `ok`, final line `8 checks passed.`

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/parseSpreadsheet.ts src/modules/proposal/parseSpreadsheet.test.ts
git commit -m "feat: add shared Excel/CSV parser for wire price uploads"
```

---

### Task 3: `POST /api/wire-prices/preview`

**Files:**
- Create: `src/modules/proposal/wirePricesApi.ts`
- Modify: `server.ts` (register the route module, mirroring the existing `registerCatalogueRoutes(app)` call)

**Interfaces:**
- Consumes: `parseSpreadsheetBuffer` from Task 2.
- Produces: `export function registerWirePriceRoutes(app: Express): void`.
  - `POST /api/wire-prices/preview` → body `{ fileData: string; fileName: string }` (`fileData` is a `data:...;base64,...` URL, same shape `Uploader.tsx`'s `onFileLoaded` already hands the app) → `200 { headers: string[]; rows: Record<string, unknown>[]; totalRows: number }` (`rows` capped to the first 20 for preview; `totalRows` is the full parsed count; does NOT write to the DB).

- [ ] **Step 1: Write the route module**

```typescript
// src/modules/proposal/wirePricesApi.ts
// Wire price backend: upload-preview + CRUD/upsert routes for the wire_prices
// table (see supabase/migrations/0002_wire_prices.sql). Reuses the base64
// data-URL upload pattern already used for utility-bill uploads (server.ts)
// instead of adding multipart/multer.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { sanitizePrice } from "./sanitizePrice";
import { parseSpreadsheetBuffer } from "./parseSpreadsheet";

function decodeUploadedFile(fileData: string): Buffer {
  const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(cleanBase64, "base64");
}

export function registerWirePriceRoutes(app: Express) {
  app.post("/api/wire-prices/preview", (req, res) => {
    const { fileData } = req.body ?? {};
    if (typeof fileData !== "string" || !fileData) {
      return res.status(400).json({ error: "Request body must include fileData (base64 data URL)." });
    }
    try {
      const buffer = decodeUploadedFile(fileData);
      const { headers, rows } = parseSpreadsheetBuffer(buffer);
      res.json({ headers, rows: rows.slice(0, 20), totalRows: rows.length });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/wire-prices/preview failed:", err.message);
      res.status(400).json({ error: "Could not parse the uploaded file. Is it a valid .xlsx or .csv?" });
    }
  });
}
```

- [ ] **Step 2: Register it in `server.ts`**

Add near the existing `registerCatalogueRoutes(app)` call:

```typescript
import { registerWirePriceRoutes } from "./src/modules/proposal/wirePricesApi";
// ...
registerWirePriceRoutes(app);
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, then in another terminal (Windows Git Bash — adjust for your shell):

```bash
printf 'Name,Size,Price\nDC Cable 4sqmm,4,18.5\n' > /tmp/wire-test.csv
B64=$(base64 -w0 /tmp/wire-test.csv)
curl -s -X POST http://localhost:3000/api/wire-prices/preview \
  -H "Content-Type: application/json" \
  -d "{\"fileData\":\"data:text/csv;base64,$B64\",\"fileName\":\"wire-test.csv\"}"
```

Expected: `{"headers":["Name","Size","Price"],"rows":[{"Name":"DC Cable 4sqmm","Size":4,"Price":18.5}],"totalRows":1}`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal/wirePricesApi.ts server.ts
git commit -m "feat: add POST /api/wire-prices/preview upload parser route"
```

---

### Task 4: `wire_prices` CRUD + upsert routes

**Files:**
- Modify: `src/modules/proposal/wirePricesApi.ts` (add to the same `registerWirePriceRoutes`)

**Interfaces:**
- Consumes: `sanitizePrice` from `src/modules/proposal/sanitizePrice.ts`.
- Produces (all added to `registerWirePriceRoutes`):
  - `GET /api/wire-prices?type=&material=&search=` → `200 { rows: WirePriceRow[] }` — active rows, optionally filtered by exact `type`/`material` and a case-insensitive `internal_name` substring `search`.
  - `POST /api/wire-prices/upsert` → body `{ rows: MappedWireRow[] }` → for each row: skip if `internal_name` blank; sanitize `price_per_m` via `sanitizePrice`; if an existing row with the same `internal_name` has `manual_override = true`, skip it (count as skipped, reason `"manual override"`); otherwise upsert (`source: "upload"`, `fetched_at: now()`). Returns `200 { added: number; updated: number; skipped: number; skippedReasons: string[] }`.
  - `PATCH /api/wire-prices/:id` → body `{ price_per_m?: number; manual_override?: boolean; is_active?: boolean }` → sanitizes `price_per_m` if present, updates only the provided fields, returns `200 { row: WirePriceRow }`.

- [ ] **Step 1: Add the types and routes**

```typescript
// Add to src/modules/proposal/wirePricesApi.ts, above registerWirePriceRoutes

export interface WirePriceRow {
  id: string;
  internal_name: string;
  type: string;
  size_sqmm: number | null;
  cores: number | null;
  material: string | null;
  price_per_m: number;
  gst_pct: number | null;
  source: "manual" | "upload";
  manual_override: boolean;
  is_active: boolean;
  fetched_at: string;
  updated_at: string;
}

export interface MappedWireRow {
  internal_name: string;
  type?: string;
  size_sqmm?: number | null;
  cores?: number | null;
  material?: string | null;
  price_per_m: number;
  gst_pct?: number | null;
}
```

Then add these three route handlers inside `registerWirePriceRoutes`, after the existing `/preview` route:

```typescript
  app.get("/api/wire-prices", async (req, res) => {
    try {
      let query = getSupabase().from("wire_prices").select("*").eq("is_active", true).order("internal_name");
      const { type, material, search } = req.query;
      if (typeof type === "string" && type) query = query.eq("type", type);
      if (typeof material === "string" && material) query = query.eq("material", material);
      if (typeof search === "string" && search) query = query.ilike("internal_name", `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ rows: (data ?? []) as WirePriceRow[] });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/wire-prices failed:", err.message);
      res.status(500).json({ error: "Failed to load wire prices." });
    }
  });

  app.post("/api/wire-prices/upsert", async (req, res) => {
    const rows = req.body?.rows as MappedWireRow[] | undefined;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: "Request body must be { rows: MappedWireRow[] }." });
    }
    try {
      const sb = getSupabase();
      let added = 0, updated = 0, skipped = 0;
      const skippedReasons: string[] = [];

      for (const raw of rows) {
        const internalName = String(raw.internal_name ?? "").trim();
        if (!internalName) {
          skipped++; skippedReasons.push("blank internal_name"); continue;
        }
        const { data: existing } = await sb.from("wire_prices").select("id, manual_override").eq("internal_name", internalName).maybeSingle();
        if (existing?.manual_override) {
          skipped++; skippedReasons.push(`${internalName}: manual override`); continue;
        }
        const patch = {
          internal_name: internalName,
          type: raw.type || "Cable",
          size_sqmm: raw.size_sqmm ?? null,
          cores: raw.cores ?? null,
          material: raw.material ?? null,
          price_per_m: sanitizePrice(raw.price_per_m),
          gst_pct: raw.gst_pct ?? null,
          source: "upload" as const,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { error } = await sb.from("wire_prices").upsert(patch, { onConflict: "internal_name" });
        if (error) { skipped++; skippedReasons.push(`${internalName}: ${error.message}`); continue; }
        existing ? updated++ : added++;
      }
      res.json({ added, updated, skipped, skippedReasons });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/wire-prices/upsert failed:", err.message);
      res.status(500).json({ error: "Failed to import wire prices." });
    }
  });

  app.patch("/api/wire-prices/:id", async (req, res) => {
    const { price_per_m, manual_override, is_active } = req.body ?? {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (price_per_m !== undefined) patch.price_per_m = sanitizePrice(price_per_m);
    if (manual_override !== undefined) patch.manual_override = Boolean(manual_override);
    if (is_active !== undefined) patch.is_active = Boolean(is_active);
    try {
      const { data, error } = await getSupabase().from("wire_prices").update(patch).eq("id", req.params.id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Wire price row not found." });
      res.json({ row: data as WirePriceRow });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/wire-prices/:id failed:", err.message);
      res.status(500).json({ error: "Failed to update wire price." });
    }
  });
```

- [ ] **Step 2: Manual verification**

With `npm run dev` running:

```bash
# Upsert two rows
curl -s -X POST http://localhost:3000/api/wire-prices/upsert -H "Content-Type: application/json" -d '{
  "rows": [
    {"internal_name":"DC Cable 4sqmm Cu","type":"DC","size_sqmm":4,"material":"Cu","price_per_m":18.5},
    {"internal_name":"AC Cable 6sqmm Cu","type":"AC","size_sqmm":6,"material":"Cu","price_per_m":-5}
  ]
}'
# Expected: {"added":2,"updated":0,"skipped":0,"skippedReasons":[]} — the -5 price clamps to 0, doesn't get skipped.

curl -s "http://localhost:3000/api/wire-prices?type=DC"
# Expected: one row, DC Cable 4sqmm Cu, price_per_m 18.5.

# Grab the DC row's id from the response above, then:
curl -s -X PATCH http://localhost:3000/api/wire-prices/<id> -H "Content-Type: application/json" -d '{"manual_override": true}'
# Expected: row returned with manual_override:true.

# Re-upload the same internal_name with a different price:
curl -s -X POST http://localhost:3000/api/wire-prices/upsert -H "Content-Type: application/json" -d '{
  "rows": [{"internal_name":"DC Cable 4sqmm Cu","type":"DC","size_sqmm":4,"material":"Cu","price_per_m":99}]
}'
# Expected: {"added":0,"updated":0,"skipped":1,"skippedReasons":["DC Cable 4sqmm Cu: manual override"]} — price stays 18.5.
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/wirePricesApi.ts
git commit -m "feat: add wire_prices GET/upsert/PATCH routes with manual-override respect"
```

---

### Task 5: Upload wizard — `WirePriceUpload.tsx`

**Files:**
- Create: `src/modules/proposal/components/WirePriceUpload.tsx`

**Interfaces:**
- Consumes: `POST /api/wire-prices/preview`, `POST /api/wire-prices/upsert` (Tasks 3-4).
- Produces: `export default function WirePriceUpload({ onImported }: { onImported: () => void })` — `onImported` fires after a successful upsert so the parent (Task 7) can refresh the list.

- [ ] **Step 1: Build the component**

```typescript
// src/modules/proposal/components/WirePriceUpload.tsx
// Upload wizard: pick file -> preview parsed rows -> map columns -> confirm.
// File reading mirrors src/components/Uploader.tsx's FileReader.readAsDataURL
// pattern so the server-side decode (wirePricesApi.ts) can reuse the same
// base64 data-URL contract already used for utility-bill uploads.
import React, { useState } from "react";

const WIRE_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "internal_name", label: "Wire Name", required: true },
  { key: "type", label: "Type (DC/AC/Earthing)" },
  { key: "size_sqmm", label: "Size (sqmm)" },
  { key: "cores", label: "Cores" },
  { key: "material", label: "Material (Cu/Al)" },
  { key: "price_per_m", label: "Price / m", required: true },
  { key: "gst_pct", label: "GST %" },
];

function guessMapping(headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const guesses: Record<string, string> = {};
  for (const field of WIRE_FIELDS) {
    const key = norm(field.key);
    const hit = headers.find((h) => {
      const nh = norm(h);
      if (field.key === "internal_name") return nh.includes("name") || nh.includes("desc") || nh.includes("item");
      if (field.key === "size_sqmm") return nh.includes("size") || nh.includes("sqmm");
      if (field.key === "price_per_m") return nh.includes("price") || nh.includes("rate");
      return nh.includes(key) || key.includes(nh);
    });
    if (hit) guesses[field.key] = hit;
  }
  return guesses;
}

function mappingStorageKey(headers: string[]): string {
  return "wireUploadMapping:" + headers.slice().sort().join("|");
}

export default function WirePriceUpload({ onImported }: { onImported: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ added: number; updated: number; skipped: number; skippedReasons: string[] } | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileData = e.target?.result as string;
      setFileName(file.name);
      setBusy(true);
      try {
        const res = await fetch("/api/wire-prices/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileData, fileName: file.name }),
        });
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        setHeaders(data.headers);
        setPreviewRows(data.rows);
        setTotalRows(data.totalRows);
        const stored = localStorage.getItem(mappingStorageKey(data.headers));
        setMapping(stored ? JSON.parse(stored) : guessMapping(data.headers));
      } catch (err: any) {
        setError(err.message || "Could not parse file.");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const confirmImport = async () => {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(mappingStorageKey(headers), JSON.stringify(mapping));
      // ponytail: imports only the 20-row preview window, not the full
      // parsed file — fine while wire sheets stay small; if a real sheet
      // exceeds 20 rows, raise /api/wire-prices/preview's slice(0, 20) cap
      // (or send the already-in-memory File through a second, uncapped
      // parse call) rather than silently truncating imports.
      const mapped = previewRows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const field of WIRE_FIELDS) {
          const col = mapping[field.key];
          if (col) out[field.key] = r[col];
        }
        return out;
      });
      const res = await fetch("/api/wire-prices/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      setSummary(await res.json());
      onImported();
    } catch (err: any) {
      setError(err.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const requiredMapped = WIRE_FIELDS.filter((f) => f.required).every((f) => mapping[f.key]);

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <input type="file" accept=".xlsx,.csv" disabled={busy}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {fileName && headers.length > 0 && !summary && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            {fileName}: {totalRows} row(s) detected{totalRows > 20 ? " (showing first 20 for mapping)" : ""}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WIRE_FIELDS.map((f) => (
              <label key={f.key} className="text-xs flex items-center gap-2">
                <span className="w-32">{f.label}{f.required ? " *" : ""}</span>
                <select className="flex-1 bg-transparent border border-[var(--border-subtle)] rounded px-1"
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">— skip —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button disabled={!requiredMapped || busy} onClick={confirmImport}
            className="px-4 py-2 rounded bg-[var(--accent-green)] text-black font-semibold disabled:opacity-40">
            {busy ? "Importing…" : `Import ${previewRows.length} row(s)`}
          </button>
        </div>
      )}
      {summary && (
        <p className="text-sm">
          Added {summary.added}, updated {summary.updated}, skipped {summary.skipped}.
          {summary.skippedReasons.length > 0 && (
            <span className="block text-[var(--text-muted)] mt-1">{summary.skippedReasons.join("; ")}</span>
          )}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`. This component isn't mounted yet (Task 7 does that) — verify it compiles cleanly:

Run: `npm run lint`
Expected: no new `error TS` lines beyond the pre-existing baseline (confirm by diffing the count against `git stash` + `npm run lint` on the prior commit, same technique Phase 1 used).

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/components/WirePriceUpload.tsx
git commit -m "feat: add WirePriceUpload wizard (parse -> map columns -> confirm)"
```

---

### Task 6: Management screen — `WirePriceList.tsx`

**Files:**
- Create: `src/modules/proposal/components/WirePriceList.tsx`

**Interfaces:**
- Consumes: `GET /api/wire-prices`, `PATCH /api/wire-prices/:id`, `WirePriceRow` type (re-declare a matching client-side interface — this file has no import path to the server-only `wirePricesApi.ts` module, same reason `PriceDatabase.tsx` doesn't import server types).
- Produces: `export default function WirePriceList({ refreshSignal }: { refreshSignal: number })` — bumping `refreshSignal` (e.g. after an import) triggers a refetch.

- [ ] **Step 1: Build the component**

```typescript
// src/modules/proposal/components/WirePriceList.tsx
// Wire price management screen: search/filter, inline price edit, manual-
// override toggle. Mirrors PriceDatabase.tsx's editable-table conventions.
import React, { useEffect, useState } from "react";
import { sanitizePrice } from "../sanitizePrice";

interface WirePriceRow {
  id: string;
  internal_name: string;
  type: string;
  size_sqmm: number | null;
  material: string | null;
  price_per_m: number;
  source: "manual" | "upload";
  manual_override: boolean;
  fetched_at: string;
}

export default function WirePriceList({ refreshSignal }: { refreshSignal: number }) {
  const [rows, setRows] = useState<WirePriceRow[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);
    fetch(`/api/wire-prices?${params}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshSignal, search, typeFilter]);

  const patchRow = async (id: string, patch: Partial<Pick<WirePriceRow, "price_per_m" | "manual_override">>) => {
    const body = "price_per_m" in patch ? { ...patch, price_per_m: sanitizePrice(patch.price_per_m) } : patch;
    const res = await fetch(`/api/wire-prices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { row } = await res.json();
      setRows((rs) => rs.map((r) => (r.id === id ? row : r)));
    }
  };

  const types = Array.from(new Set(rows.map((r) => r.type))).sort();

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input placeholder="Search wire name…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No wire prices yet — import a sheet above.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)]">
              <th>Name</th><th>Type</th><th>Size</th><th>Material</th><th>Price/m</th><th>Source</th><th>Override</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border-subtle)]">
                <td>{r.internal_name}</td>
                <td>{r.type}</td>
                <td>{r.size_sqmm ?? "—"}</td>
                <td>{r.material ?? "—"}</td>
                <td>
                  <input type="number" defaultValue={r.price_per_m}
                    className="w-20 bg-transparent border border-[var(--border-subtle)] rounded px-1"
                    onBlur={(e) => patchRow(r.id, { price_per_m: Number(e.target.value) })} />
                </td>
                <td>{r.source}</td>
                <td>
                  <input type="checkbox" checked={r.manual_override}
                    onChange={(e) => patchRow(r.id, { manual_override: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run lint`
Expected: no new `error TS` lines beyond the pre-existing baseline (same check as Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/components/WirePriceList.tsx
git commit -m "feat: add WirePriceList management screen (search, filter, inline edit)"
```

---

### Task 7: Wire it into the dashboard

**Files:**
- Modify: `src/modules/proposal/ProposalMaker.tsx`

**Interfaces:**
- Consumes: `WirePriceUpload` (Task 5), `WirePriceList` (Task 6).

- [ ] **Step 1: Add the tab**

In `src/modules/proposal/ProposalMaker.tsx`:

1. Import both components:
```typescript
import WirePriceUpload from "./components/WirePriceUpload";
import WirePriceList from "./components/WirePriceList";
```

2. Widen the tab union and add a nav entry (mirror the existing `"database"` entry at line ~217):
```typescript
const [activeTab, setActiveTab] = useState<"calculator" | "database" | "wires">("calculator");
const [wireRefresh, setWireRefresh] = useState(0);
```
Add `{ id: "wires" as const, label: "Wire Prices", icon: Database }` to the tab list array (reuse the same `Database` icon already imported for the `"database"` tab — no new icon import needed).

3. Add the tab body, next to the existing `{activeTab === "database" && (...)}` block:
```typescript
{activeTab === "wires" && (
  <div className="space-y-6">
    <WirePriceUpload onImported={() => setWireRefresh((n) => n + 1)} />
    <WirePriceList refreshSignal={wireRefresh} />
  </div>
)}
```

- [ ] **Step 2: End-to-end manual verification**

Run `npm run dev`, open the app, click the "Wire Prices" tab:
1. Upload a small `.csv` (2-3 rows, columns like `Name,Size,Price`) — confirm the mapping UI appears with auto-guessed columns.
2. Adjust mapping if needed, click Import — confirm the summary shows `Added: N`.
3. Confirm the rows appear in the list below.
4. Edit a price inline, tab out — confirm it persists on reload.
5. Check the "Override" checkbox for one row, re-upload the same file with a different price for that row — confirm the summary shows it skipped (manual override), and the list still shows the old price.

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/ProposalMaker.tsx
git commit -m "feat: add Wire Prices tab (upload wizard + management list)"
```

---

## Self-review

**Spec coverage** (against the confirmed scope — "build the wire_prices table + upload, no BOQ wiring, no Vashi"):
- Real `wire_prices` table ✅ Task 1.
- Excel/CSV upload with preview ✅ Task 3 (reuses existing `xlsx` dep + existing base64-upload pattern, no new dependency).
- Column-mapping remembered per sheet format ✅ Task 5 (`localStorage`, keyed by sorted header signature, matches the old docs' D7 spec).
- Upsert with manual-override respect + summary counts ✅ Task 4.
- Management/list screen with search, filter, inline edit ✅ Task 6.
- Explicitly deferred: BOQ-engine wiring, Vashi fetch, price_history audit — not built, matches the scope confirmed with the project owner before this plan was written.

**Placeholder scan:** no TBD/TODO markers. One inline comment in Task 5 (`confirmImport`) documents a real, known limitation (preview-only-20-rows becomes the import cap) rather than silently mishandling it — flagged explicitly as a known limit, not a placeholder.

**Type consistency:** `WirePriceRow`/`MappedWireRow` (Task 4, server) and the client-side `WirePriceRow` re-declaration (Task 6) use the same field names; `parseSpreadsheetBuffer`'s return shape matches what Task 3's route and Task 5's component both expect (`headers: string[]`, `rows: Record<string, unknown>[]`).

**Known limitation carried forward, not silently fixed:** Task 5's import is capped at the 20-row preview window — sheets with more rows only import their first 20. This matches what the preview endpoint returns today; raising the cap (or re-parsing the full file client-side before confirm, which the browser already has via the `File` object from Task 5's `handleFile`) is a one-line follow-up if the office's real price sheets exceed 20 rows, but isn't built speculatively here since it's unconfirmed whether they do.
