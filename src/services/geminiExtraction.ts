// src/services/geminiExtraction.ts
// Shared Gemini document-extraction helpers — originally written for the
// utility-bill OCR route (server.ts's /api/extract), extracted here so any
// route module can reuse the same MIME-aware, retry-with-backup-key pipeline
// without importing from server.ts (which would create a circular import,
// since server.ts imports registerXRoutes from route modules already).
import { GoogleGenAI } from "@google/genai";

// Single source of truth for the extraction model, overridable per-deployment
// with GEMINI_MODEL so switching never needs a code change. Both extraction
// routes (server.ts's /api/extract and /api/commercial/extract) read this —
// they used to hardcode their own model string, which silently defeated the
// override and pointed both routes at the same small quota bucket.
//
// Measured on the 15-bill eval harness in .agent/ (2026-08-11, extended
// 2026-08-13). Re-run with:
//   node .agent/run_eval2.cjs <model> && node .agent/score.cjs <model>
// NOTE the harness must be run from the repo root — it loads .env.local via a
// CWD-relative path, and from .agent/ it silently injects zero env vars.
//
//   model              score   avg time   free-tier RPD
//   3.6-flash          83.4    40.6s       20
//   3.1-flash-lite     83.2     2.6s      500   <- default
//   2.5-flash          83.1    21.2s       20
//   2.5-flash-lite     80.3     9.2s       20
//   3.5-flash-lite     78.0     5.7s      500
//
// The RPD column decides this, and an earlier version of this comment got it
// wrong — it claimed 2.5-flash had a "far higher limit" than 3.6-flash. They are
// both 20. Every full-flash model is capped at 20/day, so switching among them
// buys no headroom at all; only the newer *-flash-lite models have any. That
// mistake is what stranded a 42-bill batch run at 10 bills on 2026-08-12.
//
// 3.1-flash-lite is the default because it is not a compromise: equal accuracy
// to 2.5-flash, 8x faster, 25x the quota. Its 83.2 was measured WITHOUT the
// thinkingBudget the extraction routes actually send (the harness omits it), and
// it does spend thinking tokens when asked — so production should land at or
// above that figure, not below.
//
// One caveat the average hides: 3.1-flash-lite is more bimodal than 2.5-flash —
// it scores 100 on ten bills but drops to 41-75 on three. The batch queue's
// reconcile-to-±Rs.10 check (commercialBatchQueue.ts deriveStatus) is what
// catches those as "Partially Extracted" for manual review, so keep that guard
// in place. bill12 scores ~0 on every model tested; that is a bad scan, not a
// model regression.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
// Second model, used only when GEMINI_MODEL keeps answering 503 "high demand".
// That error is capacity on ONE model, so a backup key on the same model
// rarely helps — a different model usually does. 3.5-flash-lite: the other
// *-flash-lite with the 500/day free quota in the CLAUDE.md eval (78.0 vs
// 83.2), so a rare fallback scan is slightly less accurate but succeeds.
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

// ─── API key format validation ─────────────────────────────────────────────
// Catches the most common misconfiguration early: a missing key, or a value
// that isn't shaped like a real Gemini Developer API key (e.g. a leftover
// AI-Studio-sandbox token, which looks nothing like the real "AIzaSy..."
// format issued at https://aistudio.google.com/apikey).
export function validateGeminiApiKeyFormat(apiKey: string | undefined): { valid: boolean; reason?: string } {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, reason: "GEMINI_API_KEY is missing or empty." };
  }
  if (apiKey !== apiKey.trim()) {
    return { valid: false, reason: "GEMINI_API_KEY has leading/trailing whitespace." };
  }
  if (apiKey.length < 20) {
    return {
      valid: false,
      reason: "GEMINI_API_KEY looks too short to be a real key. Generate one at https://aistudio.google.com/apikey.",
    };
  }
  return { valid: true };
}

// Lazy initializer for Gemini Client
let geminiClient: GoogleGenAI | null = null;
export function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Real OCR/AI extraction will fail.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// Lazy initializer for the backup Gemini client (GEMINI_API_KEY_BACKUP).
// Returns null when no backup key is configured, so callers can skip the
// fallback attempt entirely rather than retrying against a mock client.
let geminiBackupClient: GoogleGenAI | null = null;
export function getGeminiBackupClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY_BACKUP;
  if (!apiKey || !apiKey.trim()) return null;
  if (!geminiBackupClient) {
    geminiBackupClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiBackupClient;
}

// ─── Retry utility ──────────────────────────────────────────────────────────
// Returns true if the error is a transient model-side issue (503, rate limit,
// quota exceeded, or network reset) that is worth retrying.
export function isTransientError(err: any): boolean {
  // Node's `fetch` wraps the real network failure in `.cause` (e.g. ECONNRESET,
  // ETIMEDOUT, ENOTFOUND, EAI_AGAIN) and only exposes "fetch failed" on the
  // top-level error message — so the cause chain must be inspected too, or
  // transient network blips get misclassified as permanent failures.
  const messages: string[] = [];
  let cur = err;
  let depth = 0;
  while (cur && depth < 5) {
    if (cur.message) messages.push(String(cur.message).toLowerCase());
    if (cur.code) messages.push(String(cur.code).toLowerCase());
    cur = cur.cause;
    depth++;
  }
  const msg = messages.join(" ");
  const status: number | undefined = err?.status ?? err?.code;

  // HTTP 503, 429 (rate-limit) or explicit UNAVAILABLE status from Gemini SDK
  if (status === 503 || status === 429) return true;
  // Gemini SDK wraps errors as { error: { code: 503, status: "UNAVAILABLE" } }
  if (msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded")) return true;
  if (msg.includes("429") || msg.includes("rate") || msg.includes("quota")) return true;
  if (
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("eai_again") ||
    msg.includes("socket") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  ) return true;
  return false;
}

// Exponential-backoff retry wrapper.
// maxAttempts: total attempts (first call + retries).
// baseDelayMs: initial wait before first retry (doubles each retry).
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 2000
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[EnergyBae][${label}] Retry attempt ${attempt}/${maxAttempts}...`);
      }
      const result = await fn();
      if (attempt > 1) {
        console.log(`[EnergyBae][${label}] Succeeded on attempt ${attempt}.`);
      }
      return result;
    } catch (err: any) {
      lastError = err;
      const errMsg: string = err?.message || String(err);
      console.warn(`[EnergyBae][${label}] Attempt ${attempt} failed: ${errMsg}`);

      if (!isTransientError(err)) {
        console.error(`[EnergyBae][${label}] Non-transient error — will not retry.`);
        throw err;
      }
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        console.log(`[EnergyBae][${label}] Transient error. Waiting ${delay}ms before retry...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

// Thrown when both the primary and backup Gemini keys have exhausted their
// retries (or no backup is configured) — a distinct type from a generic
// transient error so callers can surface a "switch to manual entry" response
// instead of a plain "try again later" message.
export class ExtractionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionUnavailableError";
  }
}

// ─── Gemini call with key + model fallback ─────────────────────────────────
// Tries, in order, each with the existing withRetry backoff, moving on only
// after a TRANSIENT failure (503 / 429 / network):
//   1. primary key  × GEMINI_MODEL
//   2. backup key   × GEMINI_MODEL           (only if GEMINI_API_KEY_BACKUP is set)
//   3. primary key  × GEMINI_FALLBACK_MODEL  (503 = that model is overloaded)
// A non-transient error (bad request, auth) is thrown straight away. If every
// step fails transiently, throws ExtractionUnavailableError so the route can
// offer manual entry instead of a dead end. Callers must use the `model`
// argument, never a hardcoded string, so both overrides keep working.
export async function generateWithGeminiFallback<T>(
  label: string,
  callWithClient: (ai: GoogleGenAI, model: string) => Promise<T>
): Promise<T> {
  const backup = getGeminiBackupClient();
  const steps: { tag: string; client: GoogleGenAI; model: string }[] = [
    { tag: label, client: getGeminiClient(), model: GEMINI_MODEL },
    ...(backup ? [{ tag: `${label}-backup-key`, client: backup, model: GEMINI_MODEL }] : []),
    ...(GEMINI_FALLBACK_MODEL !== GEMINI_MODEL
      ? [{ tag: `${label}-${GEMINI_FALLBACK_MODEL}`, client: getGeminiClient(), model: GEMINI_FALLBACK_MODEL }]
      : []),
  ];
  for (let i = 0; i < steps.length; i++) {
    const { tag, client, model } = steps[i];
    if (i > 0) console.warn(`[EnergyBae][${label}] Falling back → ${tag}...`);
    try {
      return await withRetry(tag, () => callWithClient(client, model), 2, 2000);
    } catch (err: any) {
      if (!isTransientError(err)) throw err;
    }
  }
  throw new ExtractionUnavailableError(
    "The AI scanner is busy right now (Google's AI service is under high demand). " +
    "Please try again in a minute, or fill in the bill details manually."
  );
}

// ─── PDF page-count detector (pure Buffer — no external library needed) ──────
// Scans the raw PDF bytes for "/Type /Page" dictionary entries, which appear
// once per page object in both digitally-generated and scanned PDFs.
// Falls back to 1 if the pattern is not found (e.g. for images).
export function detectPdfPageCount(buffer: Buffer): number {
  try {
    const text = buffer.toString("latin1"); // latin1 is safe for binary scan
    // Count occurrences of "/Type /Page" or "/Type/Page" (PDF spec allows both)
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    const count = matches ? matches.length : 0;
    return count > 0 ? count : 1;
  } catch {
    return 1;
  }
}
