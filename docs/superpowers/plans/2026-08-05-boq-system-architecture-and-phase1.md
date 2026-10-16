# BOQ Dashboard — System Architecture & Phase 1 (Price DB Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the real system architecture (correcting where the existing planning docs assumed infra that isn't there), then ship Phase 1 — moving the Price Database off per-browser localStorage onto the shared Supabase backend, with server + client validation that kills the negative/absurd-price bug class.

**Architecture:** Express (not Vercel serverless — see below) serves both the Vite SPA and `/api/*` routes from one process (`server.ts`), following the existing `registerCommercialRoutes(app, deps)` module pattern. Supabase Postgres is the shared store, accessed only server-side via the secret key (no RLS, no client-side Supabase calls — matches the existing `schema.sql` comment and `src/services/supabaseClient.ts`). No auth in Phase 1 — deferred to a later phase, matching the original plan's own sequencing.

**Tech Stack:** Express 4 · Vite 6 (dev middleware) · React 19 · `@supabase/supabase-js` (server-only) · Supabase Postgres · `tsx` for dev/scripts · `node:assert` for tests (no test framework installed — see existing `proposalEngine.test.ts`).

## Global Constraints

- Reuse the existing route-registration pattern (`export function registerXRoutes(app: Express, deps: XApiDeps)` in a module file, called once from `server.ts`) — do not introduce a router library or restructure `server.ts`.
- No client-side Supabase access, ever. All DB reads/writes go through Express routes using `getSupabase()` from `src/services/supabaseClient.ts` (server-only secret key).
- No new test framework. Follow `src/modules/proposal/proposalEngine.test.ts`'s convention: a plain `node:assert/strict` script run via `npx tsx <file>.test.ts`.
- No auth/login work in this plan — Phase 1 ships with the same trust model the app already has (anyone who can reach the server can read/write the catalogue), same as every other `/api/*` route today.
- Don't add a schema-validation library (zod/ajv/etc.) for one endpoint — a shallow shape check is enough (see Task 3).

---

## Corrections to the existing planning docs

`BOQ_Revised_Implementation_Plan.md` and `BOQ_Dashboard_8Week_Daily_Plan.md` (already in the repo root) are good sequencing references but were written against an assumed stack that doesn't match reality. Read this before trusting those docs' file-level details:

1. **"Vercel serverless functions" → doesn't apply.** The app already runs a single long-lived Express server (`server.ts`) that mounts Vite in dev and serves `dist/` in prod. New backend work is new Express routes in this same process, not `api/*.ts` serverless handlers.
2. **The relational `components` / `wire_prices` / `proposal_items` schema in the docs was never built.** What actually exists in `supabase/schema.sql` is simpler: `users` (custom `password_hash`, unused so far), `activity_logs` (generic jsonb audit log), `price_catalogue` (flat `category/item_name/unit_price`, only ever seeded with 6 overhead rows), `proposals` (jsonb `data` blob), `proposal_versions` (jsonb `snapshot`). Supabase env vars and a server-only client (`src/services/supabaseClient.ts`) already exist; **nothing yet calls it** — zero routes use Supabase today.
3. **`price_catalogue` as designed can't hold the real catalogue.** The app's actual `Catalogue` type (`src/modules/proposal/types.ts`) is a nested object — panels (brand/wp/type/category/pricePerWp), inverters (brand/phase/kw/model/price), batteries, ACDB/DCDB range tables, BOS prices, custom BOS items, overhead charges — currently persisted as **one JSON blob** via `saveCatalogue()`/`loadCatalogue()` in `src/modules/proposal/storage.ts`. A flat `(category, item_name, unit_price)` table can't represent that without reshaping every screen and the calculation engine (`calculations.ts`) that consumes the whole object at once. Building the docs' fully-relational `components` table now would be speculative complexity for a query pattern (server-side filtering) the app doesn't use — everything is fetched whole and computed client-side.
4. **Decision: ship the catalogue as one jsonb row, not a normalized table.** This is a straight swap of storage layer under `loadCatalogue`/`saveCatalogue` — zero changes to `calculations.ts`, `PriceDatabase.tsx`'s row-editing logic, or any other consumer of `Catalogue`. The half-built `price_catalogue` table is superseded and can be dropped later; nothing depends on it yet (only the 6 seed rows exist, unread by any code).
5. **Wire prices (`wire_prices` table, Excel/Vashi upload) are genuinely tabular** — hundreds of SKU rows, filtered by type/size/material, uploaded in bulk. That one *does* warrant a real table, matching the docs. **Not built in this plan** — it's Phase 2, once Phase 1's pattern (routes + storage-layer swap) is proven.
6. **Auth: when it's built, prefer Supabase Auth over the scaffolded `password_hash` column.** `@supabase/supabase-js` is already a dependency; Supabase Auth needs no bcrypt/session code of our own. The `users.password_hash` column in `schema.sql` predates this decision and should be dropped in favor of Supabase's own `auth.users` + a slim `profiles(id, role)` table when that phase starts. Flagging now so nobody builds custom password hashing later by momentum.

## Phase roadmap (this plan covers Phase 1 only)

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Price DB → shared Supabase backend, price validation | **This plan** |
| 2 | Wire prices: upload parser + `wire_prices` table (Vashi fetch optional) | Not planned yet — write a separate plan once Phase 1 ships |
| 3 | BOQ dashboard stepped-layout redesign | Not planned yet |
| 4 | Auto-calc engine consolidation + inverter manual/auto + full input validation | Not planned yet |
| 5 | Proposals persistence (reuse existing `proposals`/`proposal_versions` tables — already right-shaped), templates, auth, exports | Not planned yet |

Per the writing-plans scope rule: these are independent subsystems and each gets its own plan when it's actually next, grounded in whatever Phase 1 changes. Don't pre-write their task lists now — they'd drift before anyone executes them.

---

## Phase 1 tasks

### Task 1: `catalogue_state` table

**Files:**
- Create: `supabase/migrations/0001_catalogue_state.sql`

**Interfaces:**
- Produces: a table `catalogue_state(id boolean primary key default true check (id), data jsonb not null, updated_at timestamptz not null default now())` — singleton via the `check (id)` trick (only `true` is a valid PK value, so at most one row can ever exist).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_catalogue_state.sql
-- Singleton row holding the whole Price DB Catalogue object (panels, inverters,
-- batteries, ACDB/DCDB, BOS, custom BOS, overhead charges) as one jsonb blob —
-- mirrors the existing client-side Catalogue shape (src/modules/proposal/types.ts)
-- exactly, so the storage-layer swap in Task 4 needs zero reshaping.
-- Supersedes the flat `price_catalogue` table (never built out past 6 seed rows).
create table if not exists catalogue_state (
  id boolean primary key default true check (id),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Apply it**

Run in the Supabase SQL Editor (same process used for `supabase/schema.sql`), or via `mcp__supabase__apply_migration` if using the Supabase MCP tools against this project. Confirm with:

```sql
select * from catalogue_state;
```

Expected: table exists, 0 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_catalogue_state.sql
git commit -m "db: add catalogue_state singleton table for Price DB backend"
```

---

### Task 2: Shared price sanitizer (kills the negative/absurd-price bug at the root)

**Files:**
- Create: `src/modules/proposal/sanitizePrice.ts`
- Test: `src/modules/proposal/sanitizePrice.test.ts`

**Interfaces:**
- Produces: `sanitizePrice(raw: unknown, opts?: { min?: number; max?: number }): number` — used by both the client (`PriceDatabase.tsx`, Task 5) and the server route (Task 3), so "reject negative Price/Wp" and "flag the ₹80000/Wp typo" are enforced in exactly one place instead of once per input handler.

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/proposal/sanitizePrice.test.ts
// Run with: npx tsx src/modules/proposal/sanitizePrice.test.ts
import assert from "node:assert/strict";
import { sanitizePrice } from "./sanitizePrice";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
  console.log(`  ok — ${label}: ${actual}`);
}

check("plain positive number passes through", sanitizePrice(42), 42);
check("negative number clamps to 0", sanitizePrice(-3), 0);
check("non-numeric string becomes 0", sanitizePrice("abc"), 0);
check("blank string becomes 0", sanitizePrice(""), 0);
check("numeric string is parsed", sanitizePrice("18.5"), 18.5);
check("value above max clamps to max", sanitizePrice(80000, { min: 5, max: 60 }), 60);
check("value below min clamps to min", sanitizePrice(1, { min: 5, max: 60 }), 5);
check("value inside range passes through", sanitizePrice(25, { min: 5, max: 60 }), 25);

console.log(`\n${passed} checks passed.`);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx src/modules/proposal/sanitizePrice.test.ts`
Expected: fails with a module-not-found error (`sanitizePrice.ts` doesn't exist yet).

- [ ] **Step 3: Implement it**

```typescript
// src/modules/proposal/sanitizePrice.ts
// Single source of truth for "is this a legal price/qty number" — used by both
// PriceDatabase.tsx (client) and the /api/catalogue route (server) so the
// AC-Cable-at-"-1" / Adani-at-"80000/Wp" class of bug can't recur through some
// other input we forgot to guard individually.
export function sanitizePrice(raw: unknown, opts?: { min?: number; max?: number }): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Infinity;
  return Math.min(Math.max(n, min), max);
}
```

- [ ] **Step 4: Run it again to confirm it passes**

Run: `npx tsx src/modules/proposal/sanitizePrice.test.ts`
Expected: all 8 checks print `ok`, final line `8 checks passed.`

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/sanitizePrice.ts src/modules/proposal/sanitizePrice.test.ts
git commit -m "feat: add shared sanitizePrice guard for Price DB inputs"
```

---

### Task 3: `/api/catalogue` GET/PUT routes

**Files:**
- Create: `src/modules/proposal/catalogueApi.ts`
- Modify: `server.ts` (register the route module, mirroring the existing `registerCommercialRoutes` call at line ~595)

**Interfaces:**
- Consumes: `getSupabase()` from `src/services/supabaseClient.ts` (existing); `sanitizePrice` from Task 2; `Catalogue` type + `DEFAULT_CATALOGUE` from `src/modules/proposal/types.ts` / `defaultCatalogue.ts` (existing).
- Produces: `export function registerCatalogueRoutes(app: Express): void` — same shape as `registerCommercialRoutes(app, deps)`, but no `deps` needed since this route only touches Supabase, not Gemini.
  - `GET /api/catalogue` → `200 { catalogue: Catalogue }` (returns `DEFAULT_CATALOGUE` if no row saved yet).
  - `PUT /api/catalogue` → body `{ catalogue: Catalogue }`, sanitizes every numeric price/rate field via `sanitizePrice`, upserts the singleton row, returns `200 { catalogue: Catalogue }` (the sanitized version actually stored — the client should adopt this as its new state, not assume its own payload was stored verbatim).

- [ ] **Step 1: Write the route module**

```typescript
// src/modules/proposal/catalogueApi.ts
// Price DB backend: GET/PUT the whole Catalogue object as one jsonb row in
// catalogue_state (see supabase/migrations/0001_catalogue_state.sql). No
// per-field CRUD endpoints — the client already edits the whole object in
// memory (PriceDatabase.tsx) and saves it as one unit, same as the old
// localStorage write; this keeps that exact shape.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { sanitizePrice } from "./sanitizePrice";
import { Catalogue } from "./types";
import { DEFAULT_CATALOGUE } from "./defaultCatalogue";

// Only the scalar price/rate fields need clamping — everything else (brand,
// model, category strings, ids) passes through untouched.
function sanitizeCatalogue(raw: Catalogue): Catalogue {
  return {
    ...raw,
    panels: raw.panels.map((p) => ({ ...p, pricePerWp: sanitizePrice(p.pricePerWp, { min: 0, max: 60 }) })),
    inverters: raw.inverters.map((i) => ({ ...i, price: sanitizePrice(i.price) })),
    batteries: raw.batteries.map((b) => ({ ...b, price: sanitizePrice((b as any).price) })),
    acdb: raw.acdb.map((r) => ({ ...r, price: sanitizePrice(r.price) })),
    dcdb: raw.dcdb.map((r) => ({ ...r, price: sanitizePrice(r.price) })),
    bos: Object.fromEntries(Object.entries(raw.bos).map(([k, v]) => [k, sanitizePrice(v as number)])) as Catalogue["bos"],
    customBOS: raw.customBOS.map((c) => ({ ...c, price: sanitizePrice((c as any).price) })),
    charges: Object.fromEntries(Object.entries(raw.charges).map(([k, v]) => [k, sanitizePrice(v as number)])) as Catalogue["charges"],
  };
}

export function registerCatalogueRoutes(app: Express) {
  app.get("/api/catalogue", async (_req, res) => {
    try {
      const { data, error } = await getSupabase().from("catalogue_state").select("data").eq("id", true).maybeSingle();
      if (error) throw error;
      res.json({ catalogue: (data?.data as Catalogue) ?? DEFAULT_CATALOGUE });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/catalogue failed:", err.message);
      res.status(500).json({ error: "Failed to load price catalogue." });
    }
  });

  app.put("/api/catalogue", async (req, res) => {
    const raw = req.body?.catalogue as Catalogue | undefined;
    if (!raw || !Array.isArray(raw.panels) || !Array.isArray(raw.inverters) || !raw.charges) {
      return res.status(400).json({ error: "Request body must be { catalogue: Catalogue }." });
    }
    try {
      const clean = sanitizeCatalogue(raw);
      const { error } = await getSupabase()
        .from("catalogue_state")
        .upsert({ id: true, data: clean, updated_at: new Date().toISOString() });
      if (error) throw error;
      res.json({ catalogue: clean });
    } catch (err: any) {
      console.error("[EnergyBae] PUT /api/catalogue failed:", err.message);
      res.status(500).json({ error: "Failed to save price catalogue." });
    }
  });
}
```

- [ ] **Step 2: Register it in `server.ts`**

Add near the existing `registerCommercialRoutes(app, {...})` call (server.ts:595):

```typescript
import { registerCatalogueRoutes } from "./src/modules/proposal/catalogueApi";
// ...
registerCatalogueRoutes(app);
```

- [ ] **Step 3: Manual verification (no test framework for Express routes in this repo — follow existing convention of manual curl checks, same as how `/api/status` is verified)**

Run: `npm run dev`, then in another terminal:

```bash
curl -s http://localhost:3000/api/catalogue | head -c 200
curl -s -X PUT http://localhost:3000/api/catalogue -H "Content-Type: application/json" \
  -d '{"catalogue":{"panels":[{"id":1,"brand":"Adani","wp":540,"pricePerWp":80000,"type":"DCR","category":"Main Equipment"}],"inverters":[],"acdb":[],"dcdb":[],"batteries":[],"bos":{},"bosNames":{},"customBOS":[],"charges":{}}}'
```

Expected: GET returns `DEFAULT_CATALOGUE` on first call. PUT returns the same panel with `pricePerWp` clamped to `60`, not `80000` — confirms the sanitizer is live server-side.

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal/catalogueApi.ts server.ts
git commit -m "feat: add GET/PUT /api/catalogue backed by Supabase catalogue_state"
```

---

### Task 4: Swap `storage.ts`'s catalogue persistence from localStorage to the API

**Files:**
- Modify: `src/modules/proposal/storage.ts:30-65` (`loadCatalogue`, `saveCatalogue`, `resetCatalogue`)
- Modify: `src/modules/proposal/ProposalMaker.tsx:33,65-73` (catalogue load/save call sites — currently synchronous `useState(() => loadCatalogue())` + a `useEffect` calling `saveCatalogue` on every change)

**Interfaces:**
- Consumes: `GET`/`PUT /api/catalogue` from Task 3.
- Produces: `loadCatalogueAsync(): Promise<Catalogue>`, `saveCatalogueAsync(cat: Catalogue): Promise<Catalogue>` — replace the old synchronous `loadCatalogue`/`saveCatalogue`. Callers become async; `ProposalMaker.tsx` gains a loading state for the catalogue instead of assuming it's available synchronously on first render (it currently is, from localStorage — that assumption breaks once the source is a network call).

- [ ] **Step 1: Replace the storage functions**

In `src/modules/proposal/storage.ts`, replace `loadCatalogue`/`saveCatalogue`/`resetCatalogue` (lines 30-65):

```typescript
export async function loadCatalogueAsync(): Promise<Catalogue> {
  try {
    const res = await fetch("/api/catalogue");
    if (!res.ok) throw new Error(`GET /api/catalogue failed: ${res.status}`);
    const { catalogue } = await res.json();
    return catalogue as Catalogue;
  } catch {
    // Network/server down — fall back to whatever local copy exists so the
    // app still opens; the next successful save re-syncs the backend.
    try {
      const raw = localStorage.getItem(LOCALSTORAGE_CATALOGUE_KEY);
      if (raw) return JSON.parse(raw) as Catalogue;
    } catch {
      // ignore
    }
    return structuredCloneCat(DEFAULT_CATALOGUE);
  }
}

export async function saveCatalogueAsync(cat: Catalogue): Promise<Catalogue> {
  // Mirror to localStorage too — cheap offline fallback for loadCatalogueAsync above.
  try {
    localStorage.setItem(LOCALSTORAGE_CATALOGUE_KEY, JSON.stringify(cat));
  } catch {
    // ignore quota/private-mode failures
  }
  const res = await fetch("/api/catalogue", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ catalogue: cat }),
  });
  if (!res.ok) throw new Error(`PUT /api/catalogue failed: ${res.status}`);
  const { catalogue } = await res.json();
  return catalogue as Catalogue;
}

export async function resetCatalogueAsync(): Promise<Catalogue> {
  const fresh = structuredCloneCat(DEFAULT_CATALOGUE);
  return saveCatalogueAsync(fresh);
}
```

Keep `structuredCloneCat` as-is (still used above). Remove the old synchronous `loadCatalogue`/`saveCatalogue`/`resetCatalogue` — nothing else in the repo calls them besides `ProposalMaker.tsx` (Step 2).

- [ ] **Step 2: Update `ProposalMaker.tsx` call sites**

Replace the synchronous init (line 33: `const [catalogue, setCatalogue] = useState<Catalogue>(() => loadCatalogue());`) with an async-loaded state, and replace the autosave `useEffect` (lines 65-67ish: `useEffect(() => { saveCatalogue(catalogue); }, [catalogue]);`) with a debounced async save — same debounce pattern already used for drafts a few lines below it:

```typescript
const [catalogue, setCatalogue] = useState<Catalogue>(() => buildBlankCatalogueForFirstRender()); // placeholder until load resolves — see below
const [catalogueLoaded, setCatalogueLoaded] = useState(false);

useEffect(() => {
  loadCatalogueAsync().then((c) => {
    setCatalogue(c);
    setCatalogueLoaded(true);
  });
}, []);

useEffect(() => {
  if (!catalogueLoaded) return; // don't save the placeholder back over a real backend row
  const t = setTimeout(() => {
    saveCatalogueAsync(catalogue).catch((err) => pushToast("error", "Could not save price changes: " + err.message));
  }, 900);
  return () => clearTimeout(t);
}, [catalogue, catalogueLoaded]);
```

Import `loadCatalogueAsync`, `saveCatalogueAsync` instead of `loadCatalogue`, `saveCatalogue` from `./storage`. For the placeholder, reuse `DEFAULT_CATALOGUE` directly (already imported transitively via `defaultCatalogue.ts` — import it into `ProposalMaker.tsx` if not already, or just call `structuredClone(DEFAULT_CATALOGUE)`-equivalent by importing `DEFAULT_CATALOGUE` from `./defaultCatalogue`) — no new helper function needed, drop the `buildBlankCatalogueForFirstRender` name above and use `DEFAULT_CATALOGUE` directly.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open the Price Database tab, edit a panel's brand or price, wait ~1s, reload the page — the edit should persist (now coming from Supabase, not localStorage). Open the same URL in a different browser (or incognito window) — the edit should be visible there too, proving it's shared, not per-browser.

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal/storage.ts src/modules/proposal/ProposalMaker.tsx
git commit -m "feat: migrate Price DB catalogue from localStorage to shared /api/catalogue"
```

---

### Task 5: Client-side price guard in `PriceDatabase.tsx`

**Files:**
- Modify: `src/modules/proposal/components/PriceDatabase.tsx` (the `upd*` callbacks, e.g. lines 68-99 — `updPanel`, `updInv`, `updBat`, `updACDB`, `updDCDB`, `updBOS`, `updCharge`, `updCustomBOS`)

**Interfaces:**
- Consumes: `sanitizePrice` from Task 2.

This is the client-side half of Task 3's server guard — same rule, applied immediately on keystroke so the office sees the clamp happen instead of finding out only after the autosave round-trip.

- [ ] **Step 1: Wrap the numeric fields**

Every `upd*` callback that currently does `Number(e.target.value) || 0` for a price/rate field switches to `sanitizePrice(e.target.value, { min: 0, max: <field-appropriate cap> })`. Concretely, in the `<input type="number">` `onChange` handlers (not the `upd*` functions themselves, since those are generic `Partial<T>` patchers — the sanitizing has to happen at the call site where the field's meaning, and therefore its sane range, is known):

```typescript
// Panel pricePerWp (line ~149): was `Number(e.target.value) || 0`
onChange={(e) => updPanel(p.id, { pricePerWp: sanitizePrice(e.target.value, { min: 0, max: 60 }) })}

// Inverter price (in the inverter row, same pattern): no fixed per-Wp ceiling,
// just reject negatives
onChange={(e) => updInv(i.id, { price: sanitizePrice(e.target.value) })}
```

Apply the same `sanitizePrice(e.target.value)` (no max) swap to every other bare `Number(e.target.value) || 0` price field in this file: battery price, ACDB price, DCDB price, BOS values (`updBOS`), overhead charges (`updCharge`), custom BOS price. Import `sanitizePrice` from `../sanitizePrice` at the top of the file.

- [ ] **Step 2: Manual verification**

Run `npm run dev`, open Price Database → Solar Panels, type `80000` into a Price/Wp field, tab out. Expected: value snaps to `60`, not `80000`. Type `-5` into any price field — expected: snaps to `0`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/components/PriceDatabase.tsx
git commit -m "feat: clamp Price DB numeric inputs client-side via sanitizePrice"
```

---

## Self-review

**Spec coverage** (against this plan's own goal — "migrate Price DB off localStorage onto shared backend, with validation killing the negative/absurd-price bug"):
- Shared backend ✅ Tasks 1, 3, 4.
- Every existing screen (panels/inverters/batteries/ACDB/DCDB/BOS/overheads) stays intact ✅ Task 4 swaps only the storage layer, not `Catalogue`'s shape or any component.
- One-time import of existing localStorage data ✅ Task 4's `loadCatalogueAsync` fallback path means the very first successful `saveCatalogueAsync` (which fires from the existing autosave effect) carries whatever was already in each browser's localStorage into the new backend row — no separate migration script needed since the merge happens naturally on next edit. Flagging this explicitly: **the first office member to open the app after this ships determines what seeds the shared catalogue.** Worth a heads-up to the user before deploying, not something to silently script around.
- Validation (reject negative/blank/non-numeric, sane Price/Wp range, fix the AC Cable / Adani class of bug) ✅ Tasks 2, 3, 5 — one shared function, enforced twice (client feel + server truth).
- `price_history` audit trail — **not included**, matches this plan's scope decision (Phase 1 = storage migration + validation only; audit trail can reuse the existing generic `activity_logs` table in a later phase without any schema change, so deferring it isn't a wall).

**Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact manual-verification command.

**Type consistency:** `Catalogue`, `sanitizePrice`, `loadCatalogueAsync`/`saveCatalogueAsync` names match across Tasks 2-5.
