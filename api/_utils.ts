// Shared utilities for Vercel serverless API functions.
// Extracted from server.ts — all pure functions, no Express dependency.

import { GoogleGenAI } from "@google/genai";
import { calculateUnitCost, DEFAULT_MSEDCL_LT1_SLABS, TariffSlab } from "../src/services/tariffCalculator.js";

// ─── Gemini client pool with multi-key fallback ──────────────────────────────
// Reads GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ... (in that order)
// from the environment. When the active key's daily quota is exhausted (or it
// hits a rate limit), the next configured key is tried automatically instead
// of failing the whole request — one exhausted free-tier key no longer takes
// down OCR extraction.
function getGeminiApiKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.GEMINI_API_KEY;
  if (primary && primary.trim()) keys.push(primary.trim());
  for (let i = 2; i <= 5; i++) {
    const extra = process.env[`GEMINI_API_KEY_${i}`];
    if (extra && extra.trim()) keys.push(extra.trim());
  }
  return keys;
}

const geminiClientsByKey = new Map<string, GoogleGenAI>();
function getGeminiClientForKey(apiKey: string): GoogleGenAI {
  let client = geminiClientsByKey.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    geminiClientsByKey.set(apiKey, client);
  }
  return client;
}

// Back-compat single-client accessor (used only before any Gemini request is
// attempted, e.g. by code that just needs *a* client instance).
export function getGeminiClient(): GoogleGenAI {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    console.warn("[EnergyBae] WARNING: GEMINI_API_KEY is not set.");
    return getGeminiClientForKey("MOCK_KEY");
  }
  return getGeminiClientForKey(keys[0]);
}

// ─── API key validation ──────────────────────────────────────────────────────
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
      reason: "GEMINI_API_KEY looks too short. Generate one at https://aistudio.google.com/apikey.",
    };
  }
  return { valid: true };
}

// True if at least one configured Gemini API key (GEMINI_API_KEY, GEMINI_API_KEY_2, ...)
// looks well-formed. Used at the top of each handler instead of checking only the primary key.
export function validateConfiguredGeminiApiKeys(): { valid: boolean; reason?: string } {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    return { valid: false, reason: "GEMINI_API_KEY is missing or empty." };
  }
  if (keys.some((k) => validateGeminiApiKeyFormat(k).valid)) {
    return { valid: true };
  }
  return validateGeminiApiKeyFormat(keys[0]);
}

// ─── Gemini error classification ─────────────────────────────────────────────
// Gemini/Google API errors surface as `ApiError` whose `.message` is the raw
// JSON-stringified Google error body (see @google/genai's throwErrorIfNotOK),
// e.g. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[...]}}.
// A 429 can mean two very different things:
//   - a per-minute rate limit / momentary 503 overload → worth retrying, recovers in seconds
//   - a per-DAY quota (free tier: 20 requests/day for gemini-2.5-flash) → retrying is
//     pointless, it will not recover until the quota resets, likely hours away
// This distinguishes the two so we don't retry uselessly and don't tell the user
// "wait 1-2 minutes" when the real wait is until the daily quota resets.
export type GeminiErrorClass = {
  kind: "daily-quota" | "transient" | "other";
  retryDelaySeconds?: number;
};

export function classifyGeminiError(err: any): GeminiErrorClass {
  const messages: string[] = [];
  let cur = err;
  let depth = 0;
  while (cur && depth < 5) {
    if (cur.message) messages.push(String(cur.message));
    if (cur.code) messages.push(String(cur.code));
    cur = cur.cause;
    depth++;
  }
  const lower = messages.join(" ").toLowerCase();
  const status: number | undefined = err?.status ?? err?.code;

  let quotaId = "";
  let retryDelaySeconds: number | undefined;
  for (const m of messages) {
    try {
      const details = JSON.parse(m)?.error?.details;
      if (!Array.isArray(details)) continue;
      const quotaFailure = details.find((d: any) => d["@type"]?.includes("QuotaFailure"));
      if (quotaFailure?.violations?.[0]?.quotaId) quotaId = quotaFailure.violations[0].quotaId;
      const retryInfo = details.find((d: any) => d["@type"]?.includes("RetryInfo"));
      const secs = retryInfo?.retryDelay ? parseFloat(String(retryInfo.retryDelay)) : undefined;
      if (Number.isFinite(secs)) retryDelaySeconds = secs;
    } catch {
      // not a structured Google error body — ignore
    }
  }

  const isRateLimited = status === 429 || lower.includes("429") || lower.includes("resource_exhausted");
  if (isRateLimited && (quotaId.toLowerCase().includes("perday") || lower.includes("per day"))) {
    return { kind: "daily-quota", retryDelaySeconds };
  }

  const isTransient =
    status === 503 || status === 429 ||
    lower.includes("503") || lower.includes("unavailable") || lower.includes("overloaded") ||
    lower.includes("429") || lower.includes("rate") || lower.includes("quota") ||
    lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("enotfound") ||
    lower.includes("eai_again") || lower.includes("socket") || lower.includes("fetch failed") || lower.includes("network");

  return isTransient ? { kind: "transient", retryDelaySeconds } : { kind: "other" };
}

// Back-compat boolean view — true for anything worth surfacing as a demand/rate issue.
export function isTransientError(err: any): boolean {
  return classifyGeminiError(err).kind !== "other";
}

// ─── Exponential-backoff retry ───────────────────────────────────────────────
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 2000
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) console.log(`[EnergyBae][${label}] Retry attempt ${attempt}/${maxAttempts}...`);
      const result = await fn();
      if (attempt > 1) console.log(`[EnergyBae][${label}] Succeeded on attempt ${attempt}.`);
      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`[EnergyBae][${label}] Attempt ${attempt} failed: ${err?.message || String(err)}`);
      const classification = classifyGeminiError(err);
      if (classification.kind !== "transient") {
        console.error(
          `[EnergyBae][${label}] ${classification.kind === "daily-quota" ? "Daily quota exhausted" : "Non-transient error"} — will not retry.`
        );
        throw err;
      }
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`[EnergyBae][${label}] Waiting ${delay}ms before retry...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

// ─── Multi-key Gemini call with automatic fallback ───────────────────────────
// Runs `fn` against each configured Gemini API key (GEMINI_API_KEY, GEMINI_API_KEY_2, ...)
// in order, retrying transient errors within a key via withRetry. Only moves on to
// the next key when the current key's error is quota/rate-limit related — a genuine
// request error (bad schema, invalid file, etc.) would fail identically on every key,
// so those are not retried across keys.
export async function withGeminiKeyFallback<T>(
  label: string,
  fn: (client: GoogleGenAI) => Promise<T>,
  maxAttemptsPerKey = 2,
  baseDelayMs = 2000
): Promise<T> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) throw new Error("GEMINI_API_KEY is not set.");

  let lastError: any;
  for (let i = 0; i < keys.length; i++) {
    const client = getGeminiClientForKey(keys[i]);
    const keyLabel = keys.length > 1 ? `${label} key${i + 1}/${keys.length}` : label;
    try {
      return await withRetry(keyLabel, () => fn(client), maxAttemptsPerKey, baseDelayMs);
    } catch (err: any) {
      lastError = err;
      const classification = classifyGeminiError(err);
      const hasNextKey = i < keys.length - 1;
      if (hasNextKey && classification.kind !== "other") {
        console.warn(
          `[EnergyBae][${label}] Key ${i + 1}/${keys.length} exhausted (${classification.kind}) — falling back to key ${i + 2}/${keys.length}.`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ─── PDF page-count detector ─────────────────────────────────────────────────
export function detectPdfPageCount(buffer: Buffer): number {
  try {
    const text = buffer.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    const count = matches ? matches.length : 0;
    return count > 0 ? count : 1;
  } catch {
    return 1;
  }
}

// ─── Month label parser ──────────────────────────────────────────────────────
const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function parseMonthYearKey(label: string): number | null {
  if (!label) return null;
  const match = label.trim().match(/([A-Za-z]+)\D*(\d{4})/);
  if (!match) return null;
  const key = match[1].toLowerCase();
  const monthIdx = MONTH_NAME_TO_INDEX[key] ?? MONTH_NAME_TO_INDEX[key.slice(0, 3)];
  const year = Number(match[2]);
  if (monthIdx === undefined || !Number.isFinite(year)) return null;
  return year * 12 + monthIdx;
}

function toPositiveNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ─── Data sanitizer ──────────────────────────────────────────────────────────
export function sanitizeExtractedData(raw: any): any {
  const consumerNumber = String(raw.consumerNumber || "").replace(/\D/g, "");
  const sanctionedLoadKw = toPositiveNumber(raw.sanctionedLoadKw);
  const fixedCharges = toPositiveNumber(raw.fixedCharges);
  const currentUnits = Math.round(toPositiveNumber(raw.currentUnits));
  const currentBillAmount = toPositiveNumber(raw.currentBillAmount);

  const tariffSlabs: TariffSlab[] = Array.isArray(raw.tariffSlabs)
    ? raw.tariffSlabs
        .filter((s: any) => s && Number.isFinite(Number(s.energyRate)))
        .map((s: any) => ({
          minUnits: toPositiveNumber(s.minUnits) || 0,
          maxUnits: s.maxUnits === null || s.maxUnits === undefined || s.maxUnits === "" ? null : Number(s.maxUnits),
          energyRate: toPositiveNumber(s.energyRate),
          wheelingRate: toPositiveNumber(s.wheelingRate),
        }))
    : [];

  const effectiveSlabs = tariffSlabs.length > 0 ? tariffSlabs : DEFAULT_MSEDCL_LT1_SLABS;

  const byMonth = new Map<string, any>();
  for (const row of Array.isArray(raw.billingHistory) ? raw.billingHistory : []) {
    if (!row || typeof row.month !== "string" || !row.month.trim()) continue;
    const consumption = Math.round(toPositiveNumber(row.consumption));
    const amount = toPositiveNumber(row.amount);
    byMonth.set(row.month.trim(), {
      month: row.month.trim(),
      consumption,
      amount,
      unitCost: calculateUnitCost(consumption, effectiveSlabs),
    });
  }

  const currentMonthLabel = typeof raw.billingMonth === "string" ? raw.billingMonth.trim() : "";
  if (currentMonthLabel && currentUnits > 0) {
    byMonth.set(currentMonthLabel, {
      month: currentMonthLabel,
      consumption: currentUnits,
      amount: currentBillAmount,
      unitCost: calculateUnitCost(currentUnits, effectiveSlabs),
    });
  }

  let billingHistory = Array.from(byMonth.values());
  const keyed = billingHistory.map((row) => ({ row, key: parseMonthYearKey(row.month) }));
  if (keyed.every((k) => k.key !== null)) {
    keyed.sort((a, b) => (a.key as number) - (b.key as number));
    billingHistory = keyed.map((k) => k.row);
  }
  if (billingHistory.length > 12) {
    billingHistory = billingHistory.slice(billingHistory.length - 12);
  }

  let connectionType = typeof raw.connectionType === "string" ? raw.connectionType.trim() : "";
  if (!connectionType) {
    const tariffCategory = typeof raw.tariffCategory === "string" ? raw.tariffCategory.trim() : "";
    const phaseType = typeof raw.phaseType === "string" ? raw.phaseType.trim() : "";
    connectionType = [tariffCategory, phaseType].filter(Boolean).join(" ").trim();
  }

  return {
    ...raw,
    consumerNumber: consumerNumber || "",
    consumerAddress: typeof raw.consumerAddress === "string" ? raw.consumerAddress.trim() : "",
    connectionType,
    dueDate: typeof raw.dueDate === "string" ? raw.dueDate.trim() : "",
    sanctionedLoadKw,
    fixedCharges,
    currentUnits,
    currentBillAmount,
    tariffSlabs,
    billingHistory,
  };
}
