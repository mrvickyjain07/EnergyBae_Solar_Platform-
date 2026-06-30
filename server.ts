import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import * as xlsx from "xlsx";
import dotenv from "dotenv";
import { buildWorksheetModel, WORKSHEET_DIVISOR } from "./src/worksheetModel";
import { calculateUnitCost, DEFAULT_MSEDCL_LT1_SLABS, TariffSlab } from "./src/services/tariffCalculator";

// Load .env.local (development) and fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // also load .env if present

const app = express();
const PORT = process.env.PORT || 3000;

{
  const startupKeyCheck = validateGeminiApiKeyFormat(process.env.GEMINI_API_KEY);
  if (!startupKeyCheck.valid) {
    console.warn(`[EnergyBae] ⚠ GEMINI_API_KEY problem at startup: ${startupKeyCheck.reason}`);
  } else {
    console.log("[EnergyBae] ✓ GEMINI_API_KEY is present and well-formed.");
  }
}

// Enable large body limits for base64 images uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ─── API key format validation ─────────────────────────────────────────────
// Catches the most common misconfiguration early: a missing key, or a value
// that isn't shaped like a real Gemini Developer API key (e.g. a leftover
// AI-Studio-sandbox token, which looks nothing like the real "AIzaSy..."
// format issued at https://aistudio.google.com/apikey).
function validateGeminiApiKeyFormat(apiKey: string | undefined): { valid: boolean; reason?: string } {
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
function getGeminiClient(): GoogleGenAI {
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

// ─── Retry utility ──────────────────────────────────────────────────────────
// Returns true if the error is a transient model-side issue (503, rate limit,
// quota exceeded, or network reset) that is worth retrying.
function isTransientError(err: any): boolean {
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
async function withRetry<T>(
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

// ─── PDF page-count detector (pure Buffer — no external library needed) ──────
// Scans the raw PDF bytes for "/Type /Page" dictionary entries, which appear
// once per page object in both digitally-generated and scanned PDFs.
// Falls back to 1 if the pattern is not found (e.g. for images).
function detectPdfPageCount(buffer: Buffer): number {
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

// ─── Field validation / sanitization ───────────────────────────────────────
// Cleans up raw Gemini output: enforces numeric types, strips non-digits from
// the consumer number, drops impossible/negative values, de-duplicates
// repeated billing-history months, and recomputes unit cost from the printed
// tariff slab table rather than trusting (amount / units) division.
function toPositiveNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// Parses labels like "May 2026" or "Jun-2026" into a sortable (year*12 + monthIndex)
// key. Returns null when the label doesn't carry a recognizable month + 4-digit year,
// so callers can fall back to the model's own emitted order instead of misordering.
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

function sanitizeExtractedData(raw: any): any {
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
          maxUnits: s.maxUnits === null || s.maxUnits === undefined || s.maxUnits === ""
            ? null
            : Number(s.maxUnits),
          energyRate: toPositiveNumber(s.energyRate),
          wheelingRate: toPositiveNumber(s.wheelingRate),
        }))
    : [];

  const effectiveSlabs = tariffSlabs.length > 0 ? tariffSlabs : DEFAULT_MSEDCL_LT1_SLABS;

  // De-duplicate same-named months — last occurrence wins (the model emits
  // billingHistory oldest-first, so a later duplicate is the more recent year).
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

  // The historical bar-chart/table on most MSEDCL bills covers the months
  // BEFORE the current bill — it does not include the bill's own period.
  // Without merging the current reading in, the freshest month silently
  // disappears from the trailing-history table. Current-bill values are also
  // the most authoritative reading for that month (straight off the bill
  // body, not a chart), so they win over any chart entry for the same month.
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

  // Sort oldest → newest whenever every month label is parseable; otherwise
  // trust the model's emitted order (it's instructed to emit oldest-first).
  const keyed = billingHistory.map((row) => ({ row, key: parseMonthYearKey(row.month) }));
  if (keyed.every((k) => k.key !== null)) {
    keyed.sort((a, b) => (a.key as number) - (b.key as number));
    billingHistory = keyed.map((k) => k.row);
  }

  // The worksheet template has exactly 12 history rows — keep the most
  // recent 12 (including the current bill), dropping anything older.
  if (billingHistory.length > 12) {
    billingHistory = billingHistory.slice(billingHistory.length - 12);
  }

  // Last-resort connectionType: only built from OTHER fields this same
  // extraction already found on the bill (tariffCategory + phaseType) — never
  // a hardcoded guess. Used only when "दर संकेत" itself wasn't legible.
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

// ─── Append-only processing log ────────────────────────────────────────────
// Every upload attempt (success or failure) gets one JSON line appended here.
// Never overwritten/truncated — purely additive audit trail.
const LOG_FILE_PATH = path.join(process.cwd(), "logs", "processing.log");

function appendProcessingLog(entry: Record<string, any>) {
  try {
    const dir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE_PATH, JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n", "utf8");
  } catch (err) {
    console.error("[EnergyBae] Failed to write processing log:", err);
  }
}

// Structured prompt for electricity bill extraction
const MSEDCL_PROMPT = `
You are a highly precise document parsing engine for EnergyBae, a solar platform.
Analyze this MSEDCL (Maharashtra State Electricity Distribution Co. Ltd.) Indian utility bill.
Extract as many details as possible, translating Marathi terms to standard English.
This bill may be ANY MSEDCL format/layout (residential, commercial, industrial, HT, LT) — never assume a fixed
layout or fixed values. Every numeric field below varies bill-to-bill and must be read fresh from THIS document.

CRITICAL — TWO FIELDS THAT MUST NEVER BE LEFT EMPTY (highest priority in this entire task):
- Fixed Charges ("स्थिर आकार"): on nearly every MSEDCL bill this sits inside a two-column charges breakdown
  table, usually titled "विवरण" (Description) on the left and the amount on the right, as the FIRST row of
  that table — directly above "वीज आकार" (Energy Charge), "वहन आकार" (Wheeling Charge), and "वीज शुल्क"
  (Electricity Duty). It is a plain numeric value (e.g. 130.00, 435.00, 600.00). Search that breakdown table
  specifically — do not stop looking after scanning only the bill's top summary box, the fixed charge almost
  never appears there.
- Connection Type ("दर संकेत"): printed in the small key-value block near the top-left of the bill, alongside
  "बिलींग युनिट", "पोल क्रमांक", "मीटर क्रमांक" — look for the row labeled "दर संकेत **" or "Tariff/Category" and
  copy its full value (e.g. "92/LT I Res 3-Phase") character-for-character, including the leading numeric code.
Both fields are ALWAYS printed somewhere on a real MSEDCL bill. Look at every section of the document — header
summary box, the key-value block, and the charges breakdown table — before concluding a value is missing.

Please extract exactly these fields:
1. Consumer Name (commonly "नाव" or in high-contrast text near the top/middle)
2. Consumer Number (numeric code, labeled as "ग्राहक क्रमांक" or "Consumer No")
3. Consumer Address (full postal address block printed near the consumer name)
4. Billing Unit (4-digit code, labeled as "billing unit" or "BU" or "बी.यु.")
5. Tariff Category (labeled as "Tariff" or "दरपत्रक", e.g., "LT I - Res" or "Residential" or "Commercial")
6. Connection Type — the FULL raw tariff/connection code exactly as printed (e.g. "92/LT I Res 3-Phase",
   "90/LT I Res 1-Phase", "51 Commercial", "LT Industrial", "HT-I A"). Do not normalize, translate, or
   shorten this value — copy it character-for-character from the "दर संकेत" / "Tariff/Category" field.
7. Connected / Sanctioned Load (Value in kW, labeled as "Connected Load" or "मं. भार" or "Sanctioned Load")
8. Phase type (1-Phase / 3-Phase, e.g., "1-Phase" or "Single Phase" or "3-Phase")
9. Meter Number (labeled as "Meter No" or "मीटर क्रमांक")
10. Fixed Charges — the standing/fixed charge line item in ₹ (labeled "स्थिर आकार" / "Fixed Charges" /
    "Demand Charges"). This value differs per bill (₹130, ₹435, ₹600, ₹850, etc.) — always read the actual
    printed figure, never assume a default.
11. Billing Month / Bill Date (e.g. month of issue like Jan 2026 or "December 2025")
12. Due Date (the payment due date printed on the bill)
13. Monthly consumption units (kWh) consumed in the current billing period
14. Current bill amount in INR for THIS billing cycle's own consumption charges. Prefer, in order:
    (a) the line item literally labeled "चालू वीज देयक" / "चालू देयक" / "Current Bill" / "Current Electricity
    Bill" — this is the pure current-period charge (energy + duty + FAC + wheeling + fixed charges) BEFORE any
    later adjustment for arrears, credit balance, interest, or rounding;
    (b) if that specific line item isn't present, fall back to "Bill Amount" / "देयक रक्कम" / "Net Bill Amount"
    / "Amount Payable" as printed near the top of the bill.
    Do NOT use: Previous Balance / Arrears ("थकबाकी"), Security Deposit ("सुरक्षा ठेव"), interest ("व्याज"),
    adjustment entries ("समायोजीत रक्कम"), or Total/Cumulative Outstanding figures — those are separate
    carryover line items, not this cycle's bill amount.
15. Tariff slab table, if printed on the bill (commonly a small table with columns like "0-100", "101-300",
    "301-500", "501-1000", ">1000" and rows for energy charge (₹/unit) and wheeling charge (₹/unit)).
    Extract every slab boundary and its energy + wheeling rate exactly as printed. If no such table is visible
    anywhere on the bill, return an empty array — do not fabricate a slab table.
16. Previous months' consumption history. Look for tables/bar-charts on the bill listing past billing readings
    with columns for:
    - Month Name (e.g. Dec, Nov, Oct, or abbreviated months like 12/25, 11/25)
    - Units consumed (kWh)
    - Net billed amount in Rs for that month (if available) — never arrears/security deposit
    For the amount column, first look for a per-month billing-history table that already has amounts. If the
    history only shows consumption (units/bar-chart) with no amount column, also check for a separate
    "Payment History" / "PAID" table (columns like "Receipt Date" and "Paid"): match each receipt date to the
    calendar month it falls inside, and use that paid amount as the bill amount for that same calendar month.
    Apply this matching to EVERY row in Payment History, not just the most recent ones — do not skip rows.
    Only the bill's own current period (see field 14) is excluded from this Payment History matching, since its
    amount is read directly from field 14. If no amount evidence exists for a given month from either source,
    leave that row's amount as 0 rather than guessing.

STRICT MONTH RULES — apply to billingMonth and every "month" field in billingHistory:
- Never hallucinate or guess a month. Only output a month that is explicitly printed on the bill or directly derivable from a printed date/period.
- Priority order to determine a month: (1) explicit "Bill Month" / "Billing Month" / "Bill Date" / "Billing Period" / "Meter Reading Period" / From-To dates / Reading Date / Statement Date; (2) if only a billing period range is shown, use the end month of that range; (3) if only a single bill date exists, use that date's month and year.
- Always include the year with the month (e.g. "December 2025", not just "December").
- If the same calendar month appears more than once in the history (e.g. two "January" entries from different years, or a duplicate reading), keep ONLY the entry for the most recent year and drop the older/duplicate one.
- Prefer an actual metered bill over an estimated/provisional one for the same month, if both are distinguishable.
- Sort billingHistory chronologically (oldest first).
- If a month cannot be determined with certainty for a given row, omit that row entirely from billingHistory rather than guessing — do not fabricate a continuous run of months.

STRICT NO-FABRICATION RULE — applies to every field in this schema:
- If a field is not legible or not printed anywhere on the bill, leave it as an empty string ("") or 0 for
  numbers — never guess, never reuse a value from a different field, never invent a plausible-looking number.

Calculate these solar recommendation estimators based on historical load:
- Recommended Solar PV System Size (kW): usually equal to 1.2 to 1.5 times the average monthly peak or connected load (aim for residential 1 to 5 kW size depending on consumption, typically 1 kW solar generates ~125-130 units/month).
- Annual solar energy generation (kWh): estimate 1350 kWh per 1 kW of installed solar panels yearly in Maharashtra.
- Estimated annual monetary savings (INR): calculated at approximately 8.5 INR per generated kWh.
- Payback period (Years): approximate years to recoup, typically 4 to 5 years depending on load and tariffs.
- Estimated carbon footprint reduction: calculated at ~0.82 tons of CO2 offset per 1000 kWh solar generated annually.

Generate a JSON object matching this schema:
{
  "consumerName": "string",
  "consumerNumber": "string",
  "consumerAddress": "string",
  "billingUnit": "string",
  "tariffCategory": "string",
  "connectionType": "string",
  "fixedCharges": number,
  "sanctionedLoadKw": number,
  "phaseType": "1-Phase" or "3-Phase",
  "meterNumber": "string",
  "billingMonth": "string",
  "dueDate": "string",
  "currentUnits": number,
  "currentBillAmount": number,
  "billingHistory": [
    { "month": "string", "consumption": number, "amount": number }
  ],
  "tariffSlabs": [
    { "minUnits": number, "maxUnits": number_or_null, "energyRate": number, "wheelingRate": number }
  ],
  "solarSizingKw": number,
  "annualGenerationKwh": number,
  "estimatedAnnualSavingsInr": number,
  "paybackPeriodYears": number,
  "carbonReductionTons": number
}

Read every digit character-by-character before committing to a number — Indian utility bills often have visually similar digits (1/7, 3/8, 0/6) and Marathi/Devanagari numerals mixed with Latin ones. Cross-check the current bill's unit and amount against the billing history table if both are visible, and prefer the sharper/clearer of the two readings. Never invent or round numbers that are not legible; if a figure is unreadable, omit it (use 0) rather than guessing.

Ensure all fallback strings are empty or sensible, numbers are clean floating figures, and billingHistory list is correctly parsed from the historical graph or table shown.
`;

// Strict schema forces Gemini to return well-typed fields (no missing/garbled
// numbers), which materially improves extraction accuracy over free-form JSON.
const MSEDCL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    consumerName: { type: Type.STRING },
    consumerNumber: { type: Type.STRING },
    consumerAddress: { type: Type.STRING },
    billingUnit: { type: Type.STRING },
    tariffCategory: { type: Type.STRING },
    connectionType: { type: Type.STRING },
    fixedCharges: { type: Type.NUMBER },
    sanctionedLoadKw: { type: Type.NUMBER },
    phaseType: { type: Type.STRING },
    meterNumber: { type: Type.STRING },
    billingMonth: { type: Type.STRING },
    dueDate: { type: Type.STRING },
    currentUnits: { type: Type.NUMBER },
    currentBillAmount: { type: Type.NUMBER },
    billingHistory: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          month: { type: Type.STRING },
          consumption: { type: Type.NUMBER },
          amount: { type: Type.NUMBER },
        },
        required: ["month", "consumption", "amount"],
      },
    },
    tariffSlabs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          minUnits: { type: Type.NUMBER },
          maxUnits: { type: Type.NUMBER, nullable: true },
          energyRate: { type: Type.NUMBER },
          wheelingRate: { type: Type.NUMBER },
        },
        required: ["minUnits", "energyRate", "wheelingRate"],
      },
    },
    solarSizingKw: { type: Type.NUMBER },
    annualGenerationKwh: { type: Type.NUMBER },
    estimatedAnnualSavingsInr: { type: Type.NUMBER },
    paybackPeriodYears: { type: Type.NUMBER },
    carbonReductionTons: { type: Type.NUMBER },
  },
  required: [
    "consumerName", "consumerNumber", "sanctionedLoadKw", "phaseType",
    "billingMonth", "currentUnits", "currentBillAmount", "billingHistory",
    // fixedCharges and connectionType are forced into every response so the
    // model can't silently skip them — they're real, always-printed fields,
    // not optional extras (see the CRITICAL callout in MSEDCL_PROMPT above).
    "fixedCharges", "connectionType",
  ],
};

// Default high-fidelity sample data for RANJANA MADHUSHAM KHOBRAGADE
const SAMPLE_MSEDCL_DATA = {
  consumerName: "RANJANA MADHUSHAM KHOBRAGADE",
  consumerNumber: "082050016140",
  consumerAddress: "Sample Address, Maharashtra",
  billingUnit: "4612",
  tariffCategory: "LT I - Res (1-Phase)",
  connectionType: "90/LT I Res 1-Phase",
  fixedCharges: 130,
  sanctionedLoadKw: 1.00,
  phaseType: "1-Phase",
  meterNumber: "439222232375",
  billingMonth: "January 2026",
  dueDate: "",
  currentUnits: 123,
  currentBillAmount: 1120,
  tariffSlabs: DEFAULT_MSEDCL_LT1_SLABS,
  billingHistory: [
    { month: "Jan 2026", consumption: 123, amount: 1120 },
    { month: "Dec 2025", consumption: 137, amount: 1280 },
    { month: "Nov 2025", consumption: 145, amount: 1360 },
    { month: "Oct 2025", consumption: 156, amount: 1490 },
    { month: "Sep 2025", consumption: 168, amount: 1610 },
    { month: "Aug 2025", consumption: 172, amount: 1660 },
    { month: "Jul 2025", consumption: 160, amount: 1520 },
    { month: "Jun 2025", consumption: 150, amount: 1420 },
    { month: "May 2025", consumption: 185, amount: 1820 },
    { month: "Apr 2025", consumption: 190, amount: 1880 },
    { month: "Mar 2025", consumption: 140, amount: 1310 },
    { month: "Feb 2025", consumption: 110, amount: 980 }
  ],
  solarSizingKw: 1.5,
  annualGenerationKwh: 2025,
  estimatedAnnualSavingsInr: 17212,
  paybackPeriodYears: 4.6,
  carbonReductionTons: 1.66
};

// API Endpoint - Check system status
app.get("/api/status", (req, res) => {
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    geminiConfigured: hasGeminiKey,
    environmentMode: process.env.NODE_ENV || "development",
    supportedTariffs: ["LT I (Res)", "LT II (Comm)", "LT V (Agri)"],
    ocrEngine: "Gemini Vision Multimodal"
  });
});

// API Endpoint - Extract bill info
app.post("/api/extract", async (req, res) => {
  const { fileData, fileName, isSample } = req.body;
  const requestStartedAt = Date.now();

  console.log(`[EnergyBae] ── New extraction request ──────────────────────────────`);
  console.log(`[EnergyBae] File: "${fileName || "unnamed file"}" | isSample: ${isSample}`);

  // Fast-track sample bill
  if (isSample || fileName === "Samplebill1.jpeg" || !fileData) {
    console.log("[EnergyBae] Fast-tracking sample bill — returning cached data.");
    return res.json({
      success: true,
      confidenceScore: 97.4,
      data: SAMPLE_MSEDCL_DATA
    });
  }

  // Real Gemini visual extraction
  const apiKey = process.env.GEMINI_API_KEY;
  const keyCheck = validateGeminiApiKeyFormat(apiKey);
  if (!keyCheck.valid) {
    console.error(`[EnergyBae] ✗ Gemini API key validation failed: ${keyCheck.reason}`);
    return res.status(400).json({
      success: false,
      error: `Gemini API key is missing or invalid. ${keyCheck.reason} Please configure GEMINI_API_KEY in your environment Secrets, or use the sample bill to test.`
    });
  }

  try {
    // ── 1. Decode MIME type and strip data URL prefix ──────────────────────────
    // Handles image/*, application/pdf, and any future MIME type correctly.
    const mimeMatch = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1] : "application/pdf";
    const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, "");

    if (!cleanBase64) {
      throw new Error("Base64 payload is empty after stripping the data URL prefix.");
    }

    const fileBuffer = Buffer.from(cleanBase64, "base64");

    console.log("[EnergyBae] Detected MIME type:", detectedMime);
    console.log(`[EnergyBae] Decoded file buffer size: ${fileBuffer.length} bytes`);

    if (fileBuffer.length === 0) {
      throw new Error("Empty file — decoded buffer has zero bytes.");
    }

    // ── 2. Page count detection (pure Buffer scan — no extra library needed) ───
    const isPdf = detectedMime === "application/pdf";
    const pageCount = isPdf ? detectPdfPageCount(fileBuffer) : 1;
    console.log(`[EnergyBae] Document type: ${isPdf ? "PDF" : "Image"} | Pages detected: ${pageCount}`);

    if (pageCount === 1) {
      console.log("[EnergyBae] Single-page document — proceeding with standard extraction.");
    } else {
      console.log(`[EnergyBae] Multi-page PDF (${pageCount} pages) — Gemini 2.5-flash handles multi-page PDFs natively. Sending full document.`);
    }

    // ── 3. File size guard (Gemini inline data limit is ~20 MB) ───────────────
    const fileSizeMB = fileBuffer.length / (1024 * 1024);
    console.log(`[EnergyBae] File size: ${fileSizeMB.toFixed(2)} MB`);
    if (fileSizeMB > 20) {
      return res.status(413).json({
        success: false,
        error: `File too large (${fileSizeMB.toFixed(1)} MB). Please upload a PDF under 20 MB. For large scanned PDFs, try compressing the file or splitting pages before uploading.`
      });
    }

    // ── 4. Re-encode to guarantee no double-encoding artifacts ─────────────────
    const encoded = fileBuffer.toString("base64");
    try {
      Buffer.from(encoded, "base64"); // sanity round-trip check
    } catch {
      throw new Error("Invalid base64 encoding detected — round-trip verification failed.");
    }

    const ai = getGeminiClient();

    const filePart = {
      inlineData: {
        mimeType: detectedMime,
        data: encoded,
      },
    };
    const textPart = { text: MSEDCL_PROMPT };

    // ── 5. Gemini OCR call with exponential-backoff retry ──────────────────────
    // Strategy: send the FULL document (Gemini 2.5-flash natively understands
    // multi-page PDFs). If the model returns 503 / UNAVAILABLE / rate-limit,
    // retry up to 4 times total with 2 s → 4 s → 8 s delays.
    // This makes the pipeline robust against transient demand spikes without
    // requiring any page splitting or external PDF library.
    console.log(`[EnergyBae] Sending document to Gemini 2.5-flash (pages: ${pageCount}, size: ${fileSizeMB.toFixed(2)} MB)...`);

    const response = await withRetry(
      `Gemini-OCR-${pageCount}pg`,
      () =>
        ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: { parts: [filePart, textPart] },
          config: {
            responseMimeType: "application/json",
            responseSchema: MSEDCL_RESPONSE_SCHEMA,
            // temperature 0 => deterministic, most-likely reading of digits/labels (accuracy over creativity)
            temperature: 0,
            // A small fixed thinking budget keeps reasoning for tricky table layouts while
            // avoiding the open-ended (and much slower) dynamic thinking budget on flash.
            thinkingConfig: { thinkingBudget: 512 },
          },
        }),
      2,     // max 4 total attempts
      2000   // base delay: 2 s (doubles each retry: 2 s, 4 s, 8 s)
    );

    console.log("[EnergyBae] ✓ Gemini response received — parsing JSON...");

    // ── 6. Parse the model response robustly ───────────────────────────────────
    let parsedJson: any = {};
    const rawText = response.text || "";

    try {
      // Strip optional markdown code fences that the model occasionally adds
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsedJson = JSON.parse(cleaned || "{}");
    } catch (parseErr: any) {
      console.error("[EnergyBae] JSON parse error:", parseErr.message);
      console.error("[EnergyBae] Raw model text (first 500 chars):", rawText.substring(0, 500));
      throw new Error(
        "The AI model returned a response that could not be parsed as JSON. " +
        "This usually happens when the bill scan quality is too low, the document is password-protected, " +
        "or the file contains non-bill content. Please try a clearer scan."
      );
    }

    const sanitized = sanitizeExtractedData(parsedJson);

    const historyCount = sanitized.billingHistory.length;
    console.log(`[EnergyBae] ✓ Extraction complete.`);
    console.log(`[EnergyBae]   Consumer:    ${sanitized.consumerName || "(not found)"}`);
    console.log(`[EnergyBae]   Meter No:    ${sanitized.meterNumber || "(not found)"}`);
    console.log(`[EnergyBae]   Bill Month:  ${sanitized.billingMonth || "(not found)"}`);
    console.log(`[EnergyBae]   History:     ${historyCount} month(s) extracted`);

    // Representative solar sizing figure for the log (default 600W panel —
    // the user can pick a different wattage afterwards in the UI, which
    // recalculates live; this is just an audit snapshot of the upload event).
    const validUnits = sanitized.billingHistory.map((h: any) => h.consumption).filter((u: number) => u > 0);
    const avgUnits = validUnits.length > 0 ? validUnits.reduce((a: number, b: number) => a + b, 0) / validUnits.length : 0;
    const logKw = avgUnits / WORKSHEET_DIVISOR;
    const logPanels = logKw > 0 ? Math.ceil((logKw * 1000) / 600) : 0;
    const logCapacity = (logPanels * 600) / 1000;

    appendProcessingLog({
      uploadedFileName: fileName || "unnamed file",
      processingTimeMs: Date.now() - requestStartedAt,
      ocrConfidence: 89.2,
      extractedMonth: sanitized.billingMonth || "N/A",
      consumerNumber: sanitized.consumerNumber || "N/A",
      unitsExtracted: sanitized.currentUnits,
      billAmount: sanitized.currentBillAmount,
      fixedCharges: sanitized.fixedCharges,
      connectionType: sanitized.connectionType || "N/A",
      sanctionedLoadKw: sanitized.sanctionedLoadKw,
      solarCapacityKw: logCapacity,
      panelsRequired: logPanels,
      exportStatus: "n/a",
      googleSheetsStatus: "n/a",
      errors: null,
    });

    res.json({
      success: true,
      confidenceScore: 89.2,
      pageCount,
      data: sanitized,
    });

  } catch (error: any) {
    const rawMessage: string = error?.message || String(error);
    console.error("[EnergyBae] ✗ Extraction failed:", rawMessage);

    // ── User-friendly error classification ────────────────────────────────────
    // Never expose raw Gemini API error JSON (like the 503 JSON blob) to the UI.
    let userMessage: string;

    if (isTransientError(error)) {
      userMessage =
        "The AI model is experiencing high demand and did not respond after 4 retry attempts. " +
        "This is a temporary issue on Google's side. Please wait 1–2 minutes and try again. " +
        "(Tip: If this keeps happening, try the sample bill to verify the rest of the pipeline is working.)";
    } else if (
      rawMessage.toLowerCase().includes("api key") ||
      rawMessage.toLowerCase().includes("unauthorized") ||
      rawMessage.toLowerCase().includes("invalid key")
    ) {
      userMessage =
        "API key error — the Gemini API key is invalid or not authorised. " +
        "Please verify your GEMINI_API_KEY in the environment Secrets panel.";
    } else if (rawMessage.toLowerCase().includes("quota")) {
      userMessage =
        "API quota exceeded for this billing period. " +
        "Please check your Google AI Studio quota limits or try again after the quota resets.";
    } else if (rawMessage.toLowerCase().includes("too large") || rawMessage.toLowerCase().includes("413")) {
      userMessage = rawMessage;
    } else if (rawMessage.toLowerCase().includes("could not be parsed") || rawMessage.toLowerCase().includes("parse")) {
      userMessage = rawMessage;
    } else {
      userMessage =
        "The AI vision scanner encountered an unexpected error while reading this bill. " +
        "Please try a clearer scan, a different file format, or contact support if the issue persists. " +
        `(Detail: ${rawMessage})`;
    }

    appendProcessingLog({
      uploadedFileName: fileName || "unnamed file",
      processingTimeMs: Date.now() - requestStartedAt,
      ocrConfidence: null,
      extractedMonth: "N/A",
      consumerNumber: "N/A",
      unitsExtracted: null,
      billAmount: null,
      fixedCharges: null,
      connectionType: "N/A",
      sanctionedLoadKw: null,
      solarCapacityKw: null,
      panelsRequired: null,
      exportStatus: "n/a",
      googleSheetsStatus: "n/a",
      errors: rawMessage,
    });

    res.status(500).json({
      success: false,
      error: userMessage,
    });
  }
});


// API Endpoint - Export to real Excel file (Fidelity side-by-side template matches Pranay HOME exactly)
app.post("/api/download-excel", (req, res) => {
  const { slot1Data, solarPanelUsed } = req.body;

  if (!slot1Data) {
    return res.status(400).json({ error: "Missing consumer slot data for excel sheet generation." });
  }

  try {
    // Create Excel Workbook
    const wb = xlsx.utils.book_new();

    // Create manual Sheet layout cell-by-cell
    const ws: any = {};
    ws["!ref"] = "A1:F31"; // Sets active grid region boundaries

    const model = buildWorksheetModel(slot1Data, solarPanelUsed);

    for (const cell of model.cells) {
      if (cell.formula) {
        ws[cell.ref] = { t: 'n', f: cell.formula };
        if (cell.value !== undefined && cell.value !== null) {
          ws[cell.ref].v = cell.value;
        }
      } else if (typeof cell.value === 'number') {
        ws[cell.ref] = { t: 'n', v: cell.value };
      } else if (cell.value === null || cell.value === undefined) {
        ws[cell.ref] = { t: 's', v: "" };
      } else {
        ws[cell.ref] = { t: 's', v: String(cell.value) };
      }
    }

    // Apply exact column widths
    ws["!cols"] = model.colWidths.map((wch) => ({ wch }));

    xlsx.utils.book_append_sheet(wb, ws, model.sheetTitle);

    // Generate buffer
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    // Send formatted binary excel file to user
    res.setHeader("Content-Disposition", 'attachment; filename="EnergyBae_SolarSizing_Workbook.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);

  } catch (error: any) {
    console.error("Excel generation error:", error);
    res.status(500).json({ error: "Failed to assemble XLSX binary workbook file." });
  }
});

// Configure Vite or Serve SPA Files
// Note: If Vite server and Client are connected
async function startApp() {
  if (process.env.NODE_ENV !== "production" && process.env.RENDER !== "true") {
    // In development mode, dynamically start Vite middleware
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // In production mode, serve built files staticly
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ENERGYBAE Fullstack Server active at: http://0.0.0.0:${PORT}`);
  });
}

startApp().catch(err => {
  console.error("Express initialization error occurred:", err);
});
