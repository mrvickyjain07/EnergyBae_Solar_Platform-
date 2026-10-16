# EnergyBae eBill Scanner (standalone, public)

The EnergyBae electricity-bill scanner as its own **public** web app: anyone
with the link can upload an MSEDCL bill and get a solar sizing — no sign-in,
no SaaS dashboard.

It is a copy of the EnergyBae SaaS codebase (taken 2026-10-16) trimmed to the
scanner. Bill-analysis fixes made here are NOT in the SaaS repo and vice
versa — port them deliberately.

## What it does

- **Residential → House / Housing society**: one MSEDCL LT bill →
  `/api/extract` (Gemini) → editable worksheet (avg units ÷ 106.06, panels
  rounded up) → Excel download. Housing society also has **Several bills**
  (one per meter, each sized, then summed). Sample bill button for a quick try.
- **Commercial & Industrial**: single or several bills →
  `/api/commercial/extract`; LT/HT, TOD, contract demand, charge
  reconciliation, consumption-based sizing → Excel download.

Not in this app (present in the code, unreachable): sign-in, saved bills /
projects, Google Drive import, Google Sheets export.

## Security model

There is no login. `requireAuth` (`src/services/authMiddleware.ts`) treats
every visitor as an anonymous **guest** that may call ONLY these routes:

| Route | Purpose |
|---|---|
| `POST /api/extract` | Residential extraction |
| `POST /api/enhance-bill` | Optional "Enhance" image clean-up |
| `POST /api/download-excel` | Residential Excel |
| `POST /api/commercial/extract` | C&I extraction |
| `POST /api/commercial/export`, `/api/commercial/batch-export` | C&I Excel |

Every other `/api` route (saved bills, projects, pricing, users, …) returns
**401** — including any route added later (allowlist, not blocklist).
`src/services/authMiddleware.guest.test.ts` pins this. None of the public
routes touch the database; bills are processed in memory and not stored.

Server-side guards: only PDF / PNG / JPG / WebP / HEIC reach Gemini (415
otherwise); per-IP rate limit of 20 scans per 10 minutes on the three
Gemini routes; consumer names/numbers are not logged.

## Environment

See `.env.example` (placeholders only). **Required:** `GEMINI_API_KEY`,
`JWT_SECRET` (`openssl rand -hex 32`). Optional: `GEMINI_MODEL`,
`GEMINI_FALLBACK_MODEL`, `GEMINI_API_KEY_BACKUP`. Supabase and Google OAuth
variables are not needed.

When Google answers 503 "high demand", extraction retries, then tries the
backup key (if set), then `GEMINI_FALLBACK_MODEL` (default
`gemini-3.5-flash-lite`), and finally offers manual entry.

## Commands

```bash
npm ci                 # install from the lockfile
npm run dev            # http://localhost:3000 (Express + Vite, needs .env.local)
npm run lint           # TypeScript check
npm run build          # dist/ + dist/server.cjs (for `npm start` / Docker)
npm run build:vercel   # dist/ + api/_server.mjs (what Vercel runs)
npx tsx src/services/authMiddleware.guest.test.ts   # tests are plain tsx scripts
```

## Deploying to Vercel (separate project)

1. Put this folder in its own **new** GitHub repository (or deploy it
   directly with `npx vercel` from this folder).
2. Vercel → Add New Project → import it. Do **not** reuse the SaaS project.
   `vercel.json` already sets install/build commands, output directory, the
   `/api/*` → function rewrite and a 60 s function timeout.
3. Project → Settings → Environment Variables (Production + Preview):
   `GEMINI_API_KEY`, `JWT_SECRET`.
4. Deploy. On the public URL (ideally in a private window): try the sample
   bill, scan a real residential and a C&I bill, download Excel, and check
   that `https://<your-domain>/api/projects` returns 401.

### Limits to know

- **Uploads ≤ 3 MB per file.** Vercel rejects request bodies over 4.5 MB and
  bills travel as base64 JSON (×1.33). The browser compresses larger photos
  automatically; PDFs over 3 MB are rejected with a message (never
  re-encoded). Bigger PDFs would need direct-to-storage uploads (not built).
- **Gemini quota is shared by every visitor.** The free tier is roughly 500
  requests/day on the flash-lite models; check your Google AI Studio quota
  and enable billing on the key if public traffic will exceed it.
- **The rate limiter is in-memory per Vercel instance** — it slows abuse but
  is not a global cap. For a hard cap use Vercel Firewall rate-limit rules
  or a shared store (e.g. Upstash Redis).
- File logs (`logs/*.log`) are skipped on Vercel (read-only disk); use the
  function logs in the Vercel dashboard.
