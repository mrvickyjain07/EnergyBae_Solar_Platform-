# Wire Price AI Extraction + Category Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the office import wire prices from a PDF or photo (not just Excel/CSV) by reusing this app's existing Gemini-based document extraction, and scope every wire-price import to exactly the office's 3 relevant categories (Single Core Cable, Multi Core Cable, Aluminium Armoured Cable) instead of a free-text type field.

**Not in scope, and why:** Automated background sync from `vashiisl.com` was requested but is not being built — the site returns `403 Forbidden` to non-browser requests (Cloudflare/bot protection), confirmed by a direct fetch during planning, and the project owner confirmed there is no official Vashi vendor API/export account to integrate against instead. Building a scraper to work around that protection would be a Terms-of-Service risk this plan does not take. The legitimate substitute this plan ships: the office checks Vashi manually (as they do today) and imports the result — now via PDF/screenshot/photo in addition to Excel/CSV — in seconds instead of retyping it.

**Architecture:** This app already has a working Gemini-based document-extraction pipeline (used today for utility-bill OCR in `server.ts`: MIME detection, PDF page counting, retry-with-backup-key, a strict `responseSchema` for reliable structured output). That pipeline's helper functions are currently private to `server.ts`. Task 1 extracts them into `src/services/geminiExtraction.ts` (matching the existing `src/services/supabaseClient.ts` convention) so the wire-price route module can reuse them without creating a circular import (`server.ts` already imports `registerWirePriceRoutes` from `wirePricesApi.ts` — that module importing back from `server.ts` would create a cycle). Tasks 2-3 add a second extraction path alongside the existing spreadsheet parser in `/api/wire-prices/preview`. Tasks 4-5 update the upload wizard: a required category selector (replacing free-text type) and an "extracted rows" review view for the AI path.

**Tech Stack:** Express 4 · React 19 · `@google/genai` (already a dependency, already used for bill OCR) · Supabase Postgres · `tsx` for dev/scripts · `node:assert` for tests.

## Global Constraints

- No new dependencies. PDF/image extraction reuses `@google/genai` (already installed) via the helpers extracted in Task 1 — do not add a PDF-parsing or OCR library.
- No new test framework — plain `node:assert/strict` via `npx tsx`, matching `sanitizePrice.test.ts`/`parseSpreadsheet.test.ts`.
- No client-side Supabase access, no client-side Gemini calls — all extraction happens server-side via the existing `/api/wire-prices/preview` route.
- Task 1's refactor must be a pure move: every function's name, signature, and behavior stays identical. `server.ts`'s own use of these functions (the `/api/extract` bill-OCR route) must keep working unmodified except for the import statement.
- The three allowed categories are exactly: `"Single Core Cable"`, `"Multi Core Cable"`, `"Aluminium Armoured Cable"` (matching Vashi's own category names, including the UK spelling "Armoured" — confirmed from the site's own navigation).
- No live browser-automation tool is available in this environment (established in the prior Phase 2 plan) — manual verification steps use `npm run lint` diffing plus live curl against the dev server, same as every prior task in this codebase's Express routes.

---

## Task 1: Extract Gemini helpers into a shared service module

**Files:**
- Create: `src/services/geminiExtraction.ts`
- Modify: `server.ts:1-230` (remove the moved code, import from the new module instead)

**Interfaces:**
- Produces (all moved verbatim from `server.ts`, same names/signatures):
  `validateGeminiApiKeyFormat(apiKey: string | undefined): { valid: boolean; reason?: string }`,
  `getGeminiClient(): GoogleGenAI`,
  `getGeminiBackupClient(): GoogleGenAI | null`,
  `isTransientError(err: any): boolean`,
  `withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts?: number, baseDelayMs?: number): Promise<T>`,
  `class ExtractionUnavailableError extends Error`,
  `generateWithGeminiFallback<T>(label: string, callWithClient: (ai: GoogleGenAI) => Promise<T>): Promise<T>`,
  `detectPdfPageCount(buffer: Buffer): number`.

- [ ] **Step 1: Create the new module**

Create `src/services/geminiExtraction.ts` containing an exact copy of `server.ts`'s current lines 38-230 (from `export function validateGeminiApiKeyFormat` through the end of `detectPdfPageCount`), with this import header:

```typescript
// src/services/geminiExtraction.ts
// Shared Gemini document-extraction helpers — originally written for the
// utility-bill OCR route (server.ts's /api/extract), extracted here so any
// route module can reuse the same MIME-aware, retry-with-backup-key pipeline
// without importing from server.ts (which would create a circular import,
// since server.ts imports registerXRoutes from route modules already).
import { GoogleGenAI } from "@google/genai";
```

Then paste `server.ts`'s existing `validateGeminiApiKeyFormat`, the `geminiClient`/`getGeminiClient` pair, the `geminiBackupClient`/`getGeminiBackupClient` pair, `isTransientError`, `withRetry`, `ExtractionUnavailableError`, `generateWithGeminiFallback`, and `detectPdfPageCount` — unmodified, in the same order they appear in `server.ts` today.

- [ ] **Step 2: Update `server.ts` to import from the new module**

Remove the moved function/class/variable definitions from `server.ts` (they were at lines 38-230 before this edit — re-locate by searching for `export function validateGeminiApiKeyFormat` through the end of `detectPdfPageCount`'s closing brace). In their place, add near the top imports (after the existing `import { GoogleGenAI, Type } from "@google/genai";` line):

```typescript
import {
  validateGeminiApiKeyFormat,
  getGeminiClient,
  getGeminiBackupClient,
  isTransientError,
  withRetry,
  ExtractionUnavailableError,
  generateWithGeminiFallback,
  detectPdfPageCount,
} from "./src/services/geminiExtraction";
```

`server.ts` still uses `GoogleGenAI` and `Type` directly elsewhere (e.g. building `MSEDCL_RESPONSE_SCHEMA`), so keep the existing `@google/genai` import — just drop `GoogleGenAI` from it only if nothing else in `server.ts` references the type directly (check before removing; if any remaining code in `server.ts` still types a variable as `GoogleGenAI`, keep the import).

- [ ] **Step 3: Verify nothing broke**

Run: `npm run lint`
Expected: identical error count/content to the pre-change baseline (25 pre-existing errors as of the last Phase 2 merge) — confirm via `git stash` + re-run + `git stash pop`, same technique used throughout Phase 2.

Run `npm run dev`, then in another terminal:
```bash
curl -s http://localhost:3002/api/wire-prices | head -c 100
```
Expected: a normal `{"rows":[...]}"` response (proves `server.ts` still boots and existing routes still work after the refactor). Also spot-check the bill-OCR route still responds (doesn't need a real file — an empty/malformed request should get the same 400-class error it gave before this change, proving the route handler still executes):
```bash
curl -s -X POST http://localhost:3002/api/extract -H "Content-Type: application/json" -d '{}'
```
Expected: a 4xx JSON error response (not a 500 crash, not a "module not found" stack trace) — confirms `server.ts` still starts cleanly with the new import.

- [ ] **Step 4: Commit**

```bash
git add src/services/geminiExtraction.ts server.ts
git commit -m "refactor: extract Gemini document-extraction helpers into a shared service module"
```

---

## Task 2: Wire-price extraction prompt, schema, and function

**Files:**
- Create: `src/modules/proposal/wirePriceExtraction.ts`

**Interfaces:**
- Consumes: `generateWithGeminiFallback`, `detectPdfPageCount` from `src/services/geminiExtraction.ts` (Task 1).
- Produces: `extractWirePricesFromDocument(buffer: Buffer, mimeType: string): Promise<ExtractedWireRow[]>`, where `ExtractedWireRow = { internal_name: string; size_sqmm: number | null; cores: number | null; material: string | null; price_per_m: number }` — the exact shape Task 3's route will hand to the existing upsert contract, so no extra mapping step is needed downstream.

- [ ] **Step 1: Write the module**

```typescript
// src/modules/proposal/wirePriceExtraction.ts
// AI extraction path for wire-price uploads: turns a photographed/scanned/
// PDF price list into structured rows, reusing the same Gemini pipeline
// server.ts already uses for utility-bill OCR (src/services/geminiExtraction.ts).
import { Type } from "@google/genai";
import { generateWithGeminiFallback } from "../../services/geminiExtraction";

export interface ExtractedWireRow {
  internal_name: string;
  size_sqmm: number | null;
  cores: number | null;
  material: string | null;
  price_per_m: number;
}

const WIRE_PRICE_PROMPT = `
You are reading a wire/cable price list — this could be a supplier's price sheet, a
screenshot of a product listing page, or a photographed printed list. Extract every
distinct wire/cable item you can find as a row with these fields:

- name: the full product name/description exactly as shown (e.g. "4 Sqmm X 1 Core Black/Red Atc Cond." or "1.5 Sqmm, 1 Core, Flexible Copper Conductor, FRLSH Pvc")
- size_sqmm: the conductor size in square millimeters as a bare number (e.g. 4, 1.5, 6). Null if not stated.
- cores: the number of cores as a bare integer (e.g. 1, 2, 3, 4). Null if not stated.
- material: "Cu" if copper, "Al" if aluminium, null if not stated or not applicable.
- price_per_m: the price in Indian Rupees, as a bare number with no currency symbol or
  commas (e.g. 18.5, not "₹18.50" or "Rs. 18.50"). If the price shown is "per meter" or
  "/Meter" use it directly. If a price is shown per coil/roll/piece instead of per meter,
  still extract the raw number shown (do not attempt unit conversion) — the office will
  review before confirming import.

Skip rows that are clearly not a priced wire/cable product (headers, category labels,
out-of-stock placeholders with no price). If a row's price cannot be determined at all,
skip that row rather than guessing.
`;

const WIRE_PRICE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          size_sqmm: { type: Type.NUMBER },
          cores: { type: Type.NUMBER },
          material: { type: Type.STRING },
          price_per_m: { type: Type.NUMBER },
        },
        required: ["name", "price_per_m"],
      },
    },
  },
  required: ["rows"],
};

export async function extractWirePricesFromDocument(buffer: Buffer, mimeType: string): Promise<ExtractedWireRow[]> {
  const encoded = buffer.toString("base64");
  const filePart = { inlineData: { mimeType, data: encoded } };
  const textPart = { text: WIRE_PRICE_PROMPT };

  const response = await generateWithGeminiFallback("WirePriceExtraction", (client) =>
    client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [filePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: WIRE_PRICE_RESPONSE_SCHEMA,
        temperature: 0,
      },
    })
  );

  const text = response.text ?? "{}";
  const parsed = JSON.parse(text) as { rows?: Array<{ name?: string; size_sqmm?: number; cores?: number; material?: string; price_per_m?: number }> };
  const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];

  return rawRows
    .filter((r) => r.name && typeof r.price_per_m === "number" && Number.isFinite(r.price_per_m))
    .map((r) => ({
      internal_name: String(r.name),
      size_sqmm: typeof r.size_sqmm === "number" && Number.isFinite(r.size_sqmm) ? r.size_sqmm : null,
      cores: typeof r.cores === "number" && Number.isFinite(r.cores) ? Math.round(r.cores) : null,
      material: r.material ? String(r.material) : null,
      price_per_m: r.price_per_m as number,
    }));
}
```

- [ ] **Step 2: Manual verification**

No automated test — this function's correctness depends on a live Gemini call against real document content, which this codebase's existing convention (the bill-OCR route) also verifies manually rather than with mocks. Confirm the file compiles:

Run: `npm run lint`
Expected: no new `error TS` lines beyond the current baseline (same before/after diffing technique as prior tasks).

Live verification happens as part of Task 3's route-level curl check (a text-only PDF is enough to prove the pipeline runs end-to-end; real accuracy on a photographed Vashi price list is validated by the project owner after this ships, same as how bill-OCR accuracy was validated in production, not in this task).

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/wirePriceExtraction.ts
git commit -m "feat: add Gemini-based wire price extraction for PDF/image uploads"
```

---

## Task 3: Branch `/api/wire-prices/preview` on file type

**Files:**
- Modify: `src/modules/proposal/wirePricesApi.ts` (the `POST /api/wire-prices/preview` handler)

**Interfaces:**
- Consumes: `extractWirePricesFromDocument` from Task 2.
- Produces: `POST /api/wire-prices/preview` gains a second response shape. Existing behavior (`.xlsx`/`.csv`, detected by everything that ISN'T `application/pdf` or `image/*`) is unchanged: `200 { headers, rows, totalRows }`. New behavior for `application/pdf` or `image/*` MIME types: `200 { extracted: true, rows: ExtractedWireRow[], totalRows: number }` (no `headers` — there's nothing to map, the rows are already in the upsert-ready shape).

- [ ] **Step 1: Update the route**

In `src/modules/proposal/wirePricesApi.ts`, add the import:

```typescript
import { extractWirePricesFromDocument } from "./wirePriceExtraction";
```

Replace the existing `/preview` handler body with:

```typescript
  app.post("/api/wire-prices/preview", async (req, res) => {
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
        return res.status(err.name === "ExtractionUnavailableError" ? 503 : 400).json({
          error: err.message || "Could not extract wire prices from the uploaded document.",
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
```

(Note: this also removes the pre-existing `rows.slice(0, 20)` cap from the spreadsheet branch's response construction — that cap was already removed in the Phase 2 final-review fix; this rewrite must preserve the uncapped `rows` as-is, not reintroduce slicing.)

- [ ] **Step 2: Manual verification**

Run `npm run dev`, then:

```bash
# Spreadsheet path still works (regression check)
printf 'Name,Size,Price\nDC Cable 4sqmm,4,18.5\n' > /tmp/wire-test.csv
B64=$(base64 -w0 /tmp/wire-test.csv)
curl -s -X POST http://localhost:3002/api/wire-prices/preview -H "Content-Type: application/json" \
  -d "{\"fileData\":\"data:text/csv;base64,$B64\"}"
# Expected: {"headers":["Name","Size","Price"],"rows":[...],"totalRows":1} — no "extracted" key.

# PDF path: create a minimal real PDF (any tool available in this environment that can
# produce one is fine — e.g. if `wkhtmltopdf`/similar isn't available, use Node's `pdfkit`
# if it's a transitive dependency already, or simplest: manually verify the MIME-branch
# and error-handling path with a PDF that has NO wire-price content, confirming it doesn't
# crash and returns an empty or near-empty rows array rather than an error, then note in
# your report that photographed-real-content accuracy needs a real sample from the
# project owner, same caveat Task 2 documented):
B64PDF=$(base64 -w0 /tmp/some-small-sample.pdf)   # any small existing PDF in the repo/system is fine for this smoke test
curl -s -X POST http://localhost:3002/api/wire-prices/preview -H "Content-Type: application/json" \
  -d "{\"fileData\":\"data:application/pdf;base64,$B64PDF\"}"
# Expected: {"extracted":true,"rows":[...],"totalRows":N} — no 500, no crash, valid JSON back.
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/wirePricesApi.ts
git commit -m "feat: extract wire prices from PDF/image uploads via Gemini"
```

---

## Task 4: Category selector + extracted-rows review in the upload wizard

**Files:**
- Modify: `src/modules/proposal/components/WirePriceUpload.tsx`

**Interfaces:**
- Consumes: the new `{ extracted: true, rows, totalRows }` response shape from Task 3, alongside the existing `{ headers, rows, totalRows }` shape.
- Produces: the same `WirePriceUpload({ onImported: () => void })` export — no signature change, only internal behavior.

- [ ] **Step 1: Add the category constant and selector**

Add near the top of the file, alongside `WIRE_FIELDS`:

```typescript
const WIRE_CATEGORIES = ["Single Core Cable", "Multi Core Cable", "Aluminium Armoured Cable"] as const;
```

Add state: `const [category, setCategory] = useState<string>("");` and `const [extracted, setExtracted] = useState(false);`.

Update the file `<input>`'s `accept` attribute to `".xlsx,.csv,.pdf,.jpg,.jpeg,.png"`.

Render a required category `<select>` above the file input:

```typescript
<label className="text-xs flex items-center gap-2">
  <span>Category *</span>
  <select className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1"
    value={category} onChange={(e) => setCategory(e.target.value)}>
    <option value="">— select —</option>
    {WIRE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
  </select>
</label>
```

- [ ] **Step 2: Branch the preview-response handling**

In `handleFile`'s success path, after `const data = await res.json();`, branch on `data.extracted`:

```typescript
if (data.extracted) {
  setExtracted(true);
  setHeaders([]);
  setPreviewRows(data.rows);   // already MappedWireRow-shaped: internal_name, size_sqmm, cores, material, price_per_m
  setTotalRows(data.totalRows);
  setMapping({});               // no column mapping needed for the AI path
} else {
  setExtracted(false);
  setHeaders(data.headers);
  setPreviewRows(data.rows);
  setTotalRows(data.totalRows);
  const stored = localStorage.getItem(mappingStorageKey(data.headers));
  setMapping(stored ? JSON.parse(stored) : guessMapping(data.headers));
}
```

- [ ] **Step 3: Render an extracted-rows review instead of the mapping UI when `extracted` is true**

Replace the existing mapping-UI conditional block (`{fileName && headers.length > 0 && !summary && (...)}`) with two branches — keep the existing mapping UI for the non-extracted case, and add this for the extracted case:

```typescript
{fileName && extracted && previewRows.length > 0 && !summary && (
  <div className="space-y-3">
    <p className="text-sm text-[var(--text-muted)]">
      Extracted {previewRows.length} row(s) from {fileName}. Review below, then import.
    </p>
    <div className="max-h-64 overflow-auto text-xs">
      <table className="w-full">
        <thead><tr className="text-left text-[var(--text-muted)]"><th>Name</th><th>Size</th><th>Cores</th><th>Material</th><th>₹/m</th></tr></thead>
        <tbody>
          {previewRows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-[var(--border-subtle)]">
              <td>{r.internal_name}</td><td>{r.size_sqmm ?? "—"}</td><td>{r.cores ?? "—"}</td><td>{r.material ?? "—"}</td><td>{r.price_per_m}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <button disabled={!category || busy} onClick={confirmImport}
      className="px-4 py-2 rounded bg-[var(--accent-green)] text-black font-semibold disabled:opacity-40">
      {busy ? "Importing…" : `Import ${previewRows.length} row(s)`}
    </button>
  </div>
)}
```

Also gate the existing (non-extracted) mapping UI's condition on `!extracted` (`{fileName && !extracted && headers.length > 0 && !summary && (...)}`) so the two views never render simultaneously, and add `disabled={!category || ...}` to that path's existing Import button too (category is now required on both paths).

- [ ] **Step 4: Stamp the category onto every row at confirm time**

In `confirmImport`, after building `mapped` (or directly using `previewRows` for the extracted path, since those rows already have the right field names), set `type` on every row before sending to `/upsert`:

```typescript
const rowsToImport = extracted
  ? previewRows
  : previewRows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const field of WIRE_FIELDS) {
        const col = mapping[field.key];
        if (col) out[field.key] = (r as Record<string, unknown>)[col];
      }
      return out;
    });
const mapped = rowsToImport.map((r: any) => ({ ...r, type: category }));
```

Replace the existing `const mapped = previewRows.map(...)` block with the above, and keep the rest of `confirmImport` (the `fetch("/api/wire-prices/upsert", ...)` call and summary handling) unchanged. Also remove the now-inapplicable `mappingStorageKey`/`localStorage.setItem` call at the top of `confirmImport` when `extracted` is true (there's no mapping to remember) — wrap that one line in `if (!extracted) { localStorage.setItem(...); }`.

- [ ] **Step 5: Manual verification**

Run: `npm run lint`
Expected: no new `error TS` lines beyond the current baseline (before/after diff, same technique as every prior task).

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal/components/WirePriceUpload.tsx
git commit -m "feat: add required category selector and AI-extraction review to wire price upload"
```

---

## Task 5: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full-flow curl verification**

With `npm run dev` running:

1. Spreadsheet regression: repeat Task 3's CSV curl check — confirm `headers`/`rows`/`totalRows` still returned correctly (no `extracted` key), and that a subsequent `POST /api/wire-prices/upsert` with `{"rows":[{"internal_name":"DC Cable 4sqmm","price_per_m":18.5,"type":"Single Core Cable"}]}` succeeds and the row's `type` matches whichever category was sent.
2. Extraction path: repeat Task 3's PDF smoke test, confirm `extracted:true` and a well-formed `rows` array.
3. Confirm `GET /api/wire-prices?type=Single%20Core%20Cable` filters correctly once a row with that exact type string exists (proves the category string round-trips through upsert → storage → filter unchanged).
4. Clean up any test rows created during this verification from the live Supabase project (`ipuptvlxorkerkgjvvnb`), same courtesy every prior task in this codebase has shown, and stop the dev server.

- [ ] **Step 2: Note the real-content-accuracy caveat in your report**

State explicitly: extraction *pipeline* correctness (routing, error handling, response shape, upsert integration) is verified above; extraction *accuracy* against a real photographed or scanned Vashi price list has not been — that requires the project owner to try a real document after this ships, the same way this codebase's existing bill-OCR feature was validated against real bills in production rather than in an automated test.

---

## Self-review

**Spec coverage** (against the goal — "PDF/image upload via existing AI extraction, category-scoped to 3 wire types, no Vashi scraping/sync"):
- PDF/image upload reusing existing Gemini pipeline ✅ Tasks 1-3.
- No new dependency for extraction (reuses `@google/genai`) ✅ Task 2.
- Category scoping to the exact 3 requested categories ✅ Task 4 (`WIRE_CATEGORIES` constant, required selector, stamped onto every imported row regardless of source).
- No Vashi scraping/automated sync — explicitly not built, with the reasoning (403 response, no vendor API access, ToS risk) stated up front in this plan's header rather than silently dropped.
- Existing Excel/CSV path preserved unchanged (regression-checked in Task 5) ✅.

**Placeholder scan:** no TBD/TODO markers. Task 3/5's PDF curl steps note that real-content accuracy validation happens post-ship with a real document from the project owner — this is stated explicitly as a scope boundary (matching how the existing bill-OCR feature was validated), not a vague "test this later."

**Type consistency:** `ExtractedWireRow` (Task 2) fields (`internal_name`, `size_sqmm`, `cores`, `material`, `price_per_m`) match `MappedWireRow`'s fields from the existing `wirePricesApi.ts` (Phase 2) exactly, so Task 3's route needs no extra field renaming, and Task 4's `confirmImport` can send extracted rows to `/upsert` with only a `type` field added.
