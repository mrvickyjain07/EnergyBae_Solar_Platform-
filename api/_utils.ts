// Shared utilities for Vercel serverless API functions.
// Extracted from server.ts — all pure functions, no Express dependency.

import { GoogleGenAI } from "@google/genai";
import { calculateUnitCost, DEFAULT_MSEDCL_LT1_SLABS, TariffSlab } from "../src/services/tariffCalculator";

// ─── Gemini client (lazy singleton) ─────────────────────────────────────────
let geminiClient: GoogleGenAI | null = null;
export function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[EnergyBae] WARNING: GEMINI_API_KEY is not set.");
    }
    geminiClient = new GoogleGenAI({ apiKey: apiKey || "MOCK_KEY" });
  }
  return geminiClient;
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

// ─── Transient error detection ───────────────────────────────────────────────
export function isTransientError(err: any): boolean {
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
  if (status === 503 || status === 429) return true;
  if (msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded")) return true;
  if (msg.includes("429") || msg.includes("rate") || msg.includes("quota")) return true;
  if (
    msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("enotfound") ||
    msg.includes("eai_again") || msg.includes("socket") || msg.includes("fetch failed") || msg.includes("network")
  ) return true;
  return false;
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
      if (!isTransientError(err)) {
        console.error(`[EnergyBae][${label}] Non-transient error — will not retry.`);
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
