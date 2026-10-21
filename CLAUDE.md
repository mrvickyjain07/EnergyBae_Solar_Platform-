# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## THIS IS THE STANDALONE eBILL SCANNER (not the SaaS)

A copy of the EnergyBae SaaS made 2026-10-16 so the bill scanner can deploy
on its own (separate GitHub repo + Vercel project). See README.md for the
exact list of differences. Rules specific to this copy:

- The app opens on `bill-analysis`; only `SCANNER_ROUTES` (`src/navigation.ts`)
  can be navigated to — `App.tsx` clamps every route change. Don't re-add SaaS
  routes to the sidebar here.
- Vercel: `api/index.js` re-exports `api/_server.mjs`, an esbuild bundle of
  `server.ts` built by `npm run build:vercel`. `server.ts` must keep
  `export default app` and must not `listen()` when `process.env.VERCEL` is set.
- The rest of the SaaS code is kept (shared components, saved-bill → project
  links, auth, permissions). Bill-analysis fixes made here are NOT in the SaaS
  repo and vice versa — port them deliberately.
- **PUBLIC, NO LOGIN (2026-10-16).** Everyone is the guest in
  `AuthContext.tsx` (`bill_analysis.create`/`.view` only). Server-side,
  `requireAuth` lets session-less requests reach ONLY `GUEST_PATHS` in
  `authMiddleware.ts` (the scan + Excel routes); everything else is 401.
  A new public route must be added there AND to
  `authMiddleware.guest.test.ts`. Never widen the guest's permissions.
  Sign-in UI, Google Drive import, Sheets export and saving are removed or
  unreachable — don't re-add them without a sign-in decision.
- Upload limit is `src/uploadLimits.ts` (3 MB — Vercel's 4.5 MB body cap
  after base64); `Uploader.tsx` compresses big photos, never PDFs.
- A single bill can be several pages (PDF + photos, front/back, camera).
  `BillEnhancer.tsx` keeps the ordered page list and `src/billPages.ts` merges
  it in the browser into ONE PDF ≤ 3 MB, so `/api/extract` and
  `/api/commercial/extract` still take one file = one analysis. Don't add an
  array upload to the routes. Enhancement is per page (`/api/enhance-bill`
  takes one page per request, returns JPEG) — a failure never blocks a scan.
- Gemini calls go through `generateWithGeminiFallback` (key → backup key →
  `GEMINI_FALLBACK_MODEL`); pass its `model` argument, never a literal.
- **Billing history rule, ALL bills (Home, Society, C&I — 2026-10-21):** averages
  use exactly the months printed in the bill's history table (12, 13, any count);
  the bill's own month is never added. Home/Society figures come only from
  `summariseHistory` (`worksheetModel.ts`): unread months are skipped, not 0, and
  unit cost = (bill − fixed charges) ÷ units, as in the office workbook. Pinned
  by `src/billingHistoryAverage.test.ts`.
- Light theme is the default (`ThemeContext.tsx`, own storage key).

## Direction: multi-tenant SaaS for solar vendors

Each vendor company is an **organization** (migration `0015`, decided
2026-09-29: per-row `organization_id` in one database — not schema- or
project-per-tenant). Every business table (`catalogue_state`, `wire_prices`,
`inverter_prices`, `price_history`, `proposals`, `organization_settings`)
carries a NOT NULL `organization_id` (plus `customers`, `projects`,
`project_systems` from `0017`, linked by composite `(id, organization_id)`
foreign keys so the DB itself refuses cross-company links); natural keys (`internal_name`,
`proposal_no`) are unique **per organization**. A user can belong to several
organizations via `organization_memberships`, with a role **per organization**
(`users.role`/`users.is_active` are unused since 0015).

**Authorization is permission-based** (migration `0016`, `src/permissions.ts`).
Permissions (`proposal.approve`, `pricing.import`, …) are the only security
primitive; roles are bundles of them. Built-in roles (owner, admin,
sales_manager, sales_executive, engineering, procurement, finance) are defined
in code; companies' custom roles live in `custom_roles`. Every `/api` route
declares `requirePermission(...)` (or `requireMember`) **on the route itself**
— `src/routePermissions.test.ts` fails if one doesn't. Routes in untouched
Bill Analysis files are gated from `server.ts` before their registrar. Never
check role names (`role === "admin"`) anywhere; use `can(permission)` in the UI
and `requirePermission`/`hasPermission` on the server. Anti-escalation: nobody
can grant a role, or build/edit a custom role, containing permissions they don't
hold (`canGrant`); a company always keeps one active Owner.

**Tenant boundary = the server.** The app talks to Supabase only with the
service-role key (bypasses RLS), so isolation is enforced by:
`requireAuth` (`services/authMiddleware.ts`) re-reading the caller's
membership for the session's active org on **every** request (fails closed),
and every route filtering by `orgOf(req)`. RLS is deny-all for anon/
authenticated. `src/tenantScope.test.ts` statically fails on any query of a
tenant table that doesn't mention `organization_id` — **any new tenant-owned
table must be added to its `TENANT_TABLES` list, and every query on it must
filter by `orgOf(req)`.** Never scope in the client only.

New vendors are onboarded with `scripts/createOrganization.ts` until
self-serve signup exists. Browser caches of tenant data (catalogue copy, BOQ
draft, editor handoffs) are cleared when a different organization loads in
the browser (`syncTenantCache` in `modules/proposal/storage.ts`) — any new
localStorage key holding company data must be added to `clearTenantLocalData`.

⚠ Migrations `0015`–`0018` (0018 applied to EnergyBae Dev only) were dry-run against the live DB (rolled back)
on 2026-09-29 but **not applied**. It must be applied together with deploying
the code that expects it (branch `saas-redesign`).

## Commands

```bash
npm run dev      # tsx server.ts — Express + Vite middleware on ONE port (3000)
npm run build    # vite build + esbuild bundle of server.ts -> dist/server.cjs
npm start        # node dist/server.cjs (production)
npm run lint     # tsc --noEmit — this is the typecheck; there is no ESLint
```

**Do not run `vite dev` directly.** Express is the entry point; it mounts Vite as
middleware in dev (`startApp()` at the bottom of `server.ts`) and serves `dist/`
statically in production. Running Vite alone gives you a frontend with no `/api`.

### Tests

Tests are standalone `tsx` scripts using `node:assert/strict` and a local
`check(label, actual, expected)` helper — **no Jest, no Vitest, no test runner.**
Do not introduce one.

```bash
npx tsx src/modules/proposal/matchWirePrice.test.ts   # run one test file
npm run test:engine                                    # only proposalEngine is wired to a script
```

There are 15 `*.test.ts` files under `src/modules/proposal/` (37 across `src/`); only one has an npm
script. Run the sibling test directly after changing any pure module.

## Architecture

### One server, three independent modules

`App.tsx` is a four-tab shell (`overview` | `ocr` | `commercial` | `proposal`).
The tabs are **not** a shared workflow:

- **`ocr`** (residential/society) — state lives in `App.tsx` itself
- **`commercial`** — `src/modules/commercial/`, owns all its own state
- **`proposal`** — `src/modules/proposal/`, owns all its own state

Commercial and Proposal never read residential state. Don't lift state up to
`App.tsx` to "share" it between them.

### Route registration

Route modules export `registerXRoutes(app: Express)` and are called from
`server.ts`. Routes must never import from `server.ts` — that's circular, since
`server.ts` already imports the registrars. Shared server logic goes in
`src/services/` (see `geminiExtraction.ts`, which was extracted from `server.ts`
for exactly this reason).

API surface: `/api/extract`, `/api/export` (in `server.ts`),
`/api/commercial/*`, `/api/catalogue`, `/api/wire-prices/*`.

### Two pricing engines — keep them straight

| File | Does |
|---|---|
| `modules/proposal/calculations.ts` | **BOQ material pricing** — panel/inverter/ACDB/DCDB/cable sizing + BOM cost |
| `modules/proposal/proposalEngine.ts` | **Customer financials** — subsidy, AD tax benefit, payback, lifetime savings |

Both were ported 1:1 from external references (`energybae_boq_v2.html` and
`Proposal Field Calculator (1).xlsx` respectively). The formulas are domain
ground truth, not design decisions — **do not "clean up" or restructure the
math.** `proposalEngine` has `mode: 'legacy'` (reproduces the Excel bit-exact,
quirks included) and `mode: 'enhanced'`; legacy must stay bit-exact.

### BOQ template engine (Phase 5A/5B — not wired into the app yet)

`src/modules/boqEngine/`: `ruleEngine.ts` evaluates BOQ templates written as
typed JSON expressions (no eval; anything else goes through a fixed `CALCS`
registry of existing functions). `legacyV1.ts` is today's `calcBOQ` as
template data — a transcription, defects included — and
`legacyParity.test.ts` proves it equals `calcBOQ` exactly (change both
together or not at all). `calcBOQ` remains the live engine.

Workbook golden tests: `scripts/extractBoqFixtures.ts` freezes the 14 source
BOQ sheets into `fixtures/workbooks/*.json` (raw cells only);
`workbookGolden.ts` maps them to legacy-v1 lines (mappings marked as
inferences) and `scripts/boqGoldenReport.ts` regenerates
`docs/phase5/boq-golden-report.md` + `fixtures/expected-comparison.json`,
which `workbookGolden.test.ts` pins. The report documents three confirmed
legacy defects, all FIXED in calcBOQ + legacyV1 on 2026-10-05 with business
approval: D1 anchor bolts (now typed `structureLegs` × 2 × 4), D2 4 mm² lugs/
cable tags (DC cores = 2), D3 DC cable length (× strings). Cable spares are
editable (`dcSpareM`/`acSpareM`/`earthSpareM`, blank = 15/40/40 via `inputOr`). Business
rules (F/B/SH/Prestructure, earthing, commercial, kW basis, ranges,
structure) are not implemented pending sign-off; 5C (migrations 0019/0020)
waits for it.

### BOQ templates (Phase 5C, migration 0019 — stored, not yet used for quotes)

`src/modules/boqTemplates/`: per-company `capacity_ranges` (system capacity in
`(min_kw, max_kw]`, last open-ended; validated contiguous from 0) →
`boq_templates` (variant keys, one default per range) → `boq_template_versions`
(draft → published). **Published versions are immutable in the database**
(trigger); only `purge_boq_templates()` (whole-company removal / tests) may
delete them. The version `definition` is a `TemplateDocument`
(`templateRules.ts`): engine ref (only built-in `legacy-v1` today), engineering
defaults, commercial settings (null rate = inherit the company's Price DB
charges). Each company is seeded with its own copy by `seed_boq_templates()`
(migration, `createOrganization.ts`, and lazily on first API read). Nothing in
the live calculator reads these tables; selection/generation are 5D/5E.

### Persistence: four different stores, deliberately

1. **`catalogue_state`** (Supabase) — the entire Price DB catalogue as a single
   jsonb singleton row, shaped exactly like the client `Catalogue` type. It is a
   blob because it's a nested object, not a table.
2. **`wire_prices`** (Supabase) — a real table; genuinely tabular (many SKUs).
   `internal_name` is the upsert-match key for repeat supplier uploads.
3. **`proposals` + `proposal_items`** (Supabase, migration `0007`) — saved
   quotes. `proposals` is one row per quote keyed by `proposal_no` (upsert
   target), holding the editable `inputs`/`overrides`/`finance_settings` plus a
   frozen `pricing_summary`. `proposal_items` is the frozen computed BOQ rows
   for that save — see "Proposal freeze" below. Client API in
   `modules/proposal/storage.ts` (`saveProposalAsync`/`loadProposalAsync`/
   `listProposalsAsync`); server in `modules/proposal/proposalsApi.ts`.
4. **`localStorage`** — the single per-browser autosave draft and editor
   handoff, via `modules/proposal/storage.ts`. Direct `localStorage` calls in
   try/catch; the codebase has no `useLocalStorage` hook by choice. This is
   separate from (3): it's a convenience autosave of whatever's on-screen, not
   a named saved proposal.

`price_catalogue` and the `users`/`proposals`/`proposal_items` tables in
`supabase/schema.sql` are superseded/aspirational — the real `proposals`/
`proposal_items` shape is migration `0007`, not `schema.sql`. `catalogue_state`
(migration `0001`) is what the code actually uses for the Price DB.

Stores 1–3 are organization-scoped (see Direction); 4 is per-browser and cleared when a different organization loads.

Auth is real: Google Sign-In → server-verified ID token (`services/googleIdentity.ts`)
→ HMAC-signed session cookie carrying the active organization (`services/authService.ts`) → per-organization
permission checks (`services/authMiddleware.ts`'s `requireAuth` + per-route
`requirePermission`). See `src/modules/auth/`, `src/contexts/AuthContext.tsx`, and
migrations `0008`-`0010`.

### Customers, projects, systems (0017)

`src/modules/projects/`: a customer has many projects; a project has MANY
solar systems (different sites/capacities/equipment). Customers and projects
are archived (`archived_at`), never hard-deleted; a system can't be deleted
while a proposal references it. "Start BOQ" on a system prefills the BOQ
calculator via the pure `systemToProposalInputs` (`projectRules.ts`) and the
saved proposal stores `project_id`/`project_system_id` (carried in
`ProposalMeta`). The project holds decisions (capacity, phase, structure,
brands), not engineering results — those stay in the BOQ. Consolidated
multi-system BOQ/proposal is NOT built yet.

**Bill analyses (0018):** a bill analysis is STANDALONE (`project_id` null)
or linked to one project — project is never mandatory; it can be linked later
(`PATCH /api/bill-analyses/:id`). `data` = the analysis snapshot (Home/Society
worksheet, or exactly what the C&I Excel export posts). The server derives
`avg_monthly_units`/`recommended_kw` itself (`billAnalysisRules.ts`) via
`buildWorksheetModel` or the commercial module's own pure functions — never
trust client numbers, never re-derive C&I math. C&I hands its result up via
the one additive `onResult` prop on the frozen `CommercialBillAnalysis`; a
saved C&I bill can't be reopened into that screen (it takes no state back in).
A bill feeds a system by COPYING its recommendation, not by FK.
C&I sizing (2026-10-21, office workbook "Metal Junction E-Bill Analysis.xlsx" — replaces the
2026-10-15 kWh-only rules): `commercial/consumptionSizing.analyseCommercial` is the one engine for
the screen (single + several bills), both exports and this save check. Default baseline = the
average of the printed billing-history months AS PRINTED (kWh or billed kVAh, 6+ months; else the
meter kWh, which stays selectable). Calculated capacity = avg × 12 × (1 + margin, default 10 %) ÷
yield (1400); TOD consideration = B+C share × 1.1 (`TOD_UPLIFT`); recommended = consideration ×
calculated capacity, ROUND to whole panels (`pipeline.recommendedKwp`, saved as `recommended_kw`;
full capacity when there's no complete TOD table). Metal Junction Sep-2026 = 399 panels / 239.4 kWp,
pinned in `src/billingHistoryAverage.test.ts`. HP loads convert × 0.746 (`billUnits.ts`); kVA never. Each printed bill line has one field: register readings ≠ period consumption
(kWh and kVAh), PF and billed demand are read as printed (never computed — the 75 % CD floor is a
screening warning only), demand charges ≠ the printed Fixed Charges line (separate fields), but the "Fixed Charges" shown on
screen and in the export is `monthlyFixedOf` = Demand + any Fixed line (office workbook, 2026-10-21),
TOD Tariff EC is its own signed field. Billing history = the printed months only; the bill's own month
is never merged in (2026-10-21).
`reconcileCharges` documents the rounding rule; a bill that doesn't add up is flagged and left
out of the ₹/kWh savings rate. `julyBillRegression.test.ts` pins all of this on one real bill.
`billAnalyses.integration.test.ts` runs the real routes against the Dev DB
only (refuses any other `SUPABASE_URL`).

### Proposal freeze (D21)

`calcBOQ`/`computePricingSummary` (`calculations.ts`) derive the BOQ live from
`ProposalInputs` + `BOQOverrides` against whatever catalogue is currently
loaded — so saving those alone isn't enough to freeze a quote; a later
catalogue price change would silently change the recompute. `POST
/api/proposals` (`proposalsApi.ts`) instead computes the BOQ **server-side**
against the current catalogue at save time and writes the resolved
`BOQItem[]` to `proposal_items` via `proposalRecord.ts`'s
`buildProposalItemRows` (which re-derives `price` from sanitized `qty`/
`unit_cost` rather than trusting the computed value — same class of guard as
`sanitizePrice`, see below). A `status: 'final'` proposal's frozen rows are
the source of truth; `status: 'draft'` is expected to keep being reopened,
edited, and recomputed live like today. The client UI currently restores
either status into the live editable form on "Open" (`ProposalMaker.tsx`'s
`handleOpenProposal`) — a genuinely read-only frozen render for `final`
proposals isn't wired up yet.

Some localStorage keys are fixed by the standalone `proposal-editor.html` tool
(notably `energybae_proposal_data`). Renaming them breaks that file's prefill.

### Price history is the only undo

`catalogueApi.ts` diffs the incoming catalogue against the stored one via the
pure `priceHistory.ts` and writes `price_history` rows **before** every PUT. This
audit trail is the only recovery path for overwritten or deleted prices. Any new
write path that touches prices must log to it too.

`DELETE /api/wire-prices` (bulk, no `:id`) exists — always confirm the filter
with a SELECT before running an equivalent query by hand.

### Migrations

`supabase/migrations/` currently runs `0001` through `0020` (`0003` does not
exist — skip it, don't reuse it). Next migration is `0021`. `0020` adds the
`proposals_review_lock` trigger: a final proposal that is pending or approved
can only have its review columns changed — any backfill migration on
`proposals` must disable that trigger around it. Each file opens with a
comment explaining why the shape was chosen; follow that.

### Gemini extraction

`services/geminiExtraction.ts` is the single MIME-aware extraction pipeline:
retry with backoff, then fall back from `GEMINI_API_KEY` to
`GEMINI_API_KEY_BACKUP`, then raise `ExtractionUnavailableError` (surfaced to the
UI as `code: "EXTRACTION_UNAVAILABLE"`, which unlocks manual entry rather than
dead-ending the user).

Model is pinned via `GEMINI_MODEL` in `services/geminiExtraction.ts`, and **both**
extraction routes must read that constant — never hardcode a model string, or the
override silently stops working (they both did, which is how residential OCR
ended up on a model nobody chose).

Default is `gemini-3.1-flash-lite`. Measured, not arbitrary — from the `.agent/`
harness on 15 bills:

| Model | Score | Avg time | Free RPD |
|---|---|---|---|
| 3.6-flash | 83.4 | 40.6s | 20 |
| **3.1-flash-lite** | **83.2** | **2.6s** | **500** |
| 2.5-flash | 83.1 | 21.2s | 20 |
| 2.5-flash-lite | 80.3 | 9.2s | 20 |
| 3.5-flash-lite | 78.0 | 5.7s | 500 |

**Every full-flash model is capped at 20 requests/day on free tier** — switching
among them buys no headroom. Only the newer `*-flash-lite` models get 500. A bulk
job over ~20 bills needs one of those, a billing-enabled key, or a configured
`GEMINI_API_KEY_BACKUP` (currently unset).

Re-run before changing the default:
`node .agent/run_eval2.cjs <model> && node .agent/score.cjs <model>` — **from the
repo root**, since the harness loads `.env.local` CWD-relative and silently
injects nothing when run from `.agent/`. The harness omits the `responseSchema`
that production sends, so its score is a floor, not a prediction. Production
sends NO thinking config (model default) — `thinkingBudget: 512` made Gemini 3
think for ~63k tokens (144 s+) on a C&I bill; see `GEMINI_MODEL`'s comment.

Uploads are base64 data-URLs (hence `express.json({ limit: "50mb" })`), not
multipart. New upload routes should reuse that pattern rather than adding multer.

### Shared export model

`src/worksheetModel.ts` builds the sizing-worksheet layout and is consumed by
both the server-side `xlsx` generation and the Google Sheets export, so the two
outputs can't drift. Change the layout there, not in either consumer.

## Domain rules that look like bugs but aren't

- **`matchWirePrice.ts` never substitutes a smaller conductor.** If the exact
  cable size isn't stocked it steps *up*, else returns `null`. An unpriced line
  the office notices beats a silently under-spec'd circuit.
- **`sanitizePrice.ts`** guards every price entering the pricing path. Route new
  price inputs through it.
- Blank spreadsheet cells arrive as `""` from `parseSpreadsheet`, which is
  neither `null` nor `undefined` and will break numeric Postgres columns — coerce
  with the existing `numOrNull` pattern.

## Conventions

- Path alias `@/*` → `./src/*` (both `vite.config.ts` and `tsconfig.json`).
- Module CSS is a plain `.css` file colocated with its module
  (`boq-workspace.css`, `proposal-maker.css`), imported directly. Tailwind v4 via
  the Vite plugin — there is no `tailwind.config.js`.
- Pure logic is split out of components into its own file specifically so it can
  have a `.test.ts` sibling (`boqWorkspace.ts`, `filterOptions.ts`,
  `boqGrouping.ts`). Keep doing this instead of testing through React.
- Files carry a header comment explaining *why* the approach was chosen. Match
  that when adding modules.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
