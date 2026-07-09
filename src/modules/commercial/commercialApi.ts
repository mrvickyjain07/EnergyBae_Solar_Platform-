// Commercial Bill Analysis — server-side routes, prompt, schema, and logging.
// Fully isolated from Residential's /api/extract and /api/download-excel:
// separate prompt, separate schema, separate sanitizer, separate log file.
// Generic infra (Gemini client, retry/backoff, PDF page detection, API-key
// validation) is injected from server.ts rather than imported, so this file
// never creates a circular dependency on server.ts.
import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import * as xlsx from "xlsx";
import { GoogleGenAI, Type } from "@google/genai";
import { buildCommercialWorksheetModel } from "./commercialWorksheetModel";
import { buildBillingHistoryWindow } from "./commercialCalculations";
import { CommercialBillData } from "./types";

export interface CommercialApiDeps {
  withGeminiKeyFallback: <T>(
    label: string,
    fn: (client: GoogleGenAI) => Promise<T>,
    maxAttemptsPerKey?: number,
    baseDelayMs?: number
  ) => Promise<T>;
  classifyGeminiError: (err: any) => { kind: "daily-quota" | "transient" | "other"; retryDelaySeconds?: number };
  detectPdfPageCount: (buffer: Buffer) => number;
  validateConfiguredGeminiApiKeys: () => { valid: boolean; reason?: string };
}

// ─── Prompt + schema (commercial/industrial/HT/TOD bills only) ────────────
const COMMERCIAL_PROMPT = `
You are a highly precise document parsing engine for EnergyBae, a solar platform.
Analyze this MSEDCL (Maharashtra State Electricity Distribution Co. Ltd.) COMMERCIAL, INDUSTRIAL, HT, or
LT-Commercial electricity bill — including Time-of-Day (TOD) billed and Demand-billed accounts.
This is NOT a residential bill — do not apply residential tariff assumptions. Every field below varies
bill-to-bill and must be read fresh from THIS document. Translate Marathi terms to English. Never fabricate or
guess a value — if a field is not legible or not printed anywhere on the bill, return "" for strings or 0 for
numbers rather than inventing a plausible-looking figure.

Extract exactly these fields:

CONSUMER IDENTITY
1. consumerNo — Consumer Number ("ग्राहक क्रमांक" / "Consumer No")
2. consumerName — Consumer Name
3. address — full postal address block

TECHNICAL PARAMETERS
4. connectionType — "LT" or "HT" only (derive from the tariff/category code or the "Supply at:" field: anything
   containing "HT" is "HT", everything else — including LT-II, LT-V, LT-Commercial, LT-Industrial — is "LT")
5. category — "Commercial" or "Industrial" as printed
6. contractDemand — Contract Demand in KVA (a critical field for the 75% billed-demand-floor rule)
7. fixedCharges — the standing/fixed charge line item in ₹, if one is separately printed (labeled "Fixed
   Charges" / "स्थिर आकार"). IMPORTANT: many Demand-billed / TOD commercial tariffs do NOT print a separate
   fixed charge at all — "Demand Charges" serves that role instead on those bills. If no distinct "Fixed
   Charges" line exists anywhere on the bill, return 0 — do not substitute Demand Charges or invent a value.
8. sanctionedLoad — Sanctioned/Connected Load in kW
9. edCode — Electricity Duty code (e.g. "06 PART B")
10. securityDeposit — Security Deposit amount in ₹ ("Security Deposit Held")
11. meterNo — Meter Number

METER READINGS
12. prevReading — previous meter reading (kWh) for the current billing period
13. currReading — current meter reading (kWh) for the current billing period
14. multiplyingFactor — CT/PT multiplying factor (commonly 1 for LT, often >1 for HT)
15. kvahReading — apparent energy (kVAh) reading/consumption for this billing period, if shown
16. recordedMD — recorded Maximum Demand in KVA specifically. If the bill prints both a "KW (MD)" column and a
    separate "KVA (MD)" column (these are two different numbers, not interchangeable), use the "KVA (MD)" one.

CHARGE COMPONENTS (each as a separate ₹ line item for the CURRENT bill only — do not sum them yourself)
17. energyCharges — the combined energy-related charge for this period. If the bill shows a base "Energy
    Charges" line AND a separate "TOD Tariff EC" (or similarly named TOD energy adjustment) line, ADD THEM
    TOGETHER into one number — the TOD adjustment is a surcharge/rebate layered on top of base energy charges,
    not an independent charge. If only one such line exists, use that.
18. demandCharges — Demand Charges
19. fac — Fuel Adjustment Charge (FAC)
20. ed — Electricity Duty
21. tose — Tax on Sale of Electricity (ToSE)
22. wheelingCharges — Wheeling Charges
23. delayedPayment — Delayed Payment Charges that are ALREADY included in this bill's current total (i.e. the
    consumer has actually incurred them). Most bills only show delayed-payment charges as a HYPOTHETICAL
    "if paid after [date], amount = X" note for a future due date — that hypothetical note is NOT this field;
    return 0 in that common case. Only report a non-zero value if a late fee is shown as already applied to
    the bill currently due.
24. arrears — prior-period dues the consumer still OWES (a POSITIVE carryover balance only). If the bill's
    arrears/outstanding-balance line is NEGATIVE (i.e. it is actually a credit/refund in the consumer's favour,
    sometimes labeled "Principal Arrears: -X" or "निव्वळ थकबाकी/जमा: -X"), that is NOT arrears — report arrears
    as 0 and put the absolute value of that credit into creditAdjustment instead.
25. creditAdjustment — any credit/adjustment in the consumer's favour for this bill (security-deposit interest
    credit, a negative arrears/outstanding line as described above, debit/credit bill adjustments, etc.) —
    always report as a POSITIVE number representing the credit amount, never the future-looking discounts
    offered only for early/digital payment (those are not yet applied).
26. otherCharges — ONLY these specific CURRENTLY-APPLIED line items, summed together if more than one is
    nonzero: "P.F. Penal Charges / P.F. Incentive", "Charges For Excess Demand", "Debit Bill Adjustment". Do
    NOT include — and do not re-add — any value you already reported in energyCharges, demandCharges, fac, ed,
    tose, wheelingCharges, delayedPayment, arrears, or creditAdjustment above; each printed ₹ line item belongs
    in exactly ONE field, never two. If none of the three items listed above are printed on the bill, return 0.
27. billAmount — the bill's own STANDARD headline total for this billing cycle — typically labeled "Total Bill
    Amount (Rounded)" / "Net Bill Amount" / "पूर्णांक देयक". This must be the figure BEFORE any late-payment
    penalty is added (i.e. NOT the "if paid after [date]" / "या तारखे नंतर भरल्यास" amount) and AFTER arrears/
    credit adjustments are already netted in by the bill itself.

BILLING HISTORY (up to 12 months)
28. billingHistory — array of { monthLabel, units, billAmount }, read from a "BILLING HISTORY" table if the bill
    has one (columns commonly: Bill / Units / Bill Demand / Bill Amount). monthLabel format: "Mon-YYYY" with a
    FULL 4-digit year exactly as printed (e.g. "Jan-2026", not "Jan-26"). units = consumption in kWh/kVAh for
    that month. billAmount = that month's net billed amount (never arrears/security deposit). Do NOT include
    the bill's own current period in this array — it is captured separately by fields 31/32/27 below and will
    be merged in automatically.

TOD SLOT DATA (4 slots — only present on TOD-billed bills; if this bill is not TOD-billed, return all 4 slots
with units = 0)
29. todSlots — read from the "TOD Tariffs" table (columns: time range / Rate / Units / Demand / Charges) if
    present. Return exactly 4 entries: { slot: "A", units }, { slot: "B", units }, { slot: "C", units },
    { slot: "D", units } corresponding to the rows for 00:00–06:00 (A), 06:00–09:00 (B), 09:00–17:00 (C),
    17:00–24:00 (D). units = that row's "Units" column value (NOT its Charges column).

CURRENT BILL PERIOD
30. billingMonth — the bill's own period in "Mon-YYYY" format (e.g. "Feb-2026"), from the "BILL OF SUPPLY FOR
    THE MONTH" header or equivalent. This is a DIFFERENT month from the last row of billingHistory.

META
31. confidence — your own confidence (0-100) in the overall extraction quality of this document

Read every digit character-by-character — Indian utility bills often mix Devanagari and Latin numerals and have
visually similar digits (1/7, 3/8, 0/6). Cross-check figures against any totals/tables shown twice on the bill.

Generate a JSON object matching this exact flat schema (no nested objects):
{
  "consumerNo": "string", "consumerName": "string", "address": "string",
  "connectionType": "LT" or "HT", "category": "string", "contractDemand": number,
  "fixedCharges": number, "sanctionedLoad": number, "edCode": "string",
  "securityDeposit": number, "meterNo": "string",
  "prevReading": number, "currReading": number, "multiplyingFactor": number,
  "kvahReading": number, "recordedMD": number,
  "energyCharges": number, "demandCharges": number, "fac": number, "ed": number, "tose": number,
  "wheelingCharges": number, "delayedPayment": number, "arrears": number, "creditAdjustment": number,
  "otherCharges": number, "billAmount": number, "billingMonth": "string",
  "billingHistory": [ { "monthLabel": "string", "units": number, "billAmount": number } ],
  "todSlots": [ { "slot": "A", "units": number }, { "slot": "B", "units": number }, { "slot": "C", "units": number }, { "slot": "D", "units": number } ],
  "confidence": number
}
`;

const COMMERCIAL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    consumerNo: { type: Type.STRING },
    consumerName: { type: Type.STRING },
    address: { type: Type.STRING },
    connectionType: { type: Type.STRING },
    category: { type: Type.STRING },
    contractDemand: { type: Type.NUMBER },
    fixedCharges: { type: Type.NUMBER },
    sanctionedLoad: { type: Type.NUMBER },
    edCode: { type: Type.STRING },
    securityDeposit: { type: Type.NUMBER },
    meterNo: { type: Type.STRING },
    prevReading: { type: Type.NUMBER },
    currReading: { type: Type.NUMBER },
    multiplyingFactor: { type: Type.NUMBER },
    kvahReading: { type: Type.NUMBER },
    recordedMD: { type: Type.NUMBER },
    energyCharges: { type: Type.NUMBER },
    demandCharges: { type: Type.NUMBER },
    fac: { type: Type.NUMBER },
    ed: { type: Type.NUMBER },
    tose: { type: Type.NUMBER },
    wheelingCharges: { type: Type.NUMBER },
    delayedPayment: { type: Type.NUMBER },
    arrears: { type: Type.NUMBER },
    creditAdjustment: { type: Type.NUMBER },
    otherCharges: { type: Type.NUMBER },
    billAmount: { type: Type.NUMBER },
    billingMonth: { type: Type.STRING },
    billingHistory: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          monthLabel: { type: Type.STRING },
          units: { type: Type.NUMBER },
          billAmount: { type: Type.NUMBER },
        },
        required: ["monthLabel", "units", "billAmount"],
      },
    },
    todSlots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slot: { type: Type.STRING },
          units: { type: Type.NUMBER },
        },
        required: ["slot", "units"],
      },
    },
    confidence: { type: Type.NUMBER },
  },
  required: [
    "consumerNo", "consumerName", "connectionType", "contractDemand", "fixedCharges",
    "billAmount", "billingMonth", "billingHistory", "todSlots",
  ],
};

// ─── Sanitization ───────────────────────────────────────────────────────────
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function sanitizeCommercialData(raw: any): CommercialBillData {
  const connectionType = raw.connectionType === "HT" ? "HT" : raw.connectionType === "LT" ? "LT" : "";

  const billingMonth = typeof raw.billingMonth === "string" ? raw.billingMonth.trim() : "";
  const billAmount = toNum(raw.billAmount);
  const prevReading = toNum(raw.prevReading);
  const currReading = toNum(raw.currReading);
  const multiplyingFactor = toNum(raw.multiplyingFactor) || 1;

  const printedHistory = (Array.isArray(raw.billingHistory) ? raw.billingHistory : [])
    .filter((r: any) => r && typeof r.monthLabel === "string" && r.monthLabel.trim())
    .map((r: any) => ({
      monthLabel: r.monthLabel.trim(),
      units: toNum(r.units),
      billAmount: toNum(r.billAmount),
    }));

  // The printed "BILLING HISTORY" table on most commercial bills excludes the
  // bill's own current period — merge it in as the latest entry (same gap
  // fixed for Residential), then de-dupe/sort/window to the trailing 12.
  const currentPeriodUnits = currReading > prevReading ? (currReading - prevReading) * multiplyingFactor : 0;
  const mergedHistory = billingMonth
    ? [...printedHistory.filter((r: any) => r.monthLabel !== billingMonth), { monthLabel: billingMonth, units: currentPeriodUnits, billAmount }]
    : printedHistory;
  const billingHistory = buildBillingHistoryWindow(mergedHistory, 12);

  const slotIds = ["A", "B", "C", "D"] as const;
  const todSlots = slotIds.map((id) => {
    const match = Array.isArray(raw.todSlots) ? raw.todSlots.find((s: any) => s?.slot === id) : null;
    return { slot: id, units: match ? toNum(match.units) : 0 };
  });

  return {
    consumerNo: String(raw.consumerNo || "").replace(/[^0-9]/g, "") || "",
    consumerName: typeof raw.consumerName === "string" ? raw.consumerName.trim() : "",
    address: typeof raw.address === "string" ? raw.address.trim() : "",
    connectionType,
    category: typeof raw.category === "string" ? raw.category.trim() : "",
    contractDemand: toNum(raw.contractDemand) || "",
    fixedCharges: toNum(raw.fixedCharges) || "",
    sanctionedLoad: toNum(raw.sanctionedLoad) || "",
    edCode: typeof raw.edCode === "string" ? raw.edCode.trim() : "",
    securityDeposit: toNum(raw.securityDeposit) || "",
    meterNo: typeof raw.meterNo === "string" ? raw.meterNo.trim() : "",
    prevReading: prevReading || "",
    currReading: currReading || "",
    multiplyingFactor,
    kvahReading: toNum(raw.kvahReading) || "",
    recordedMD: toNum(raw.recordedMD) || "",
    energyCharges: toNum(raw.energyCharges) || "",
    demandCharges: toNum(raw.demandCharges) || "",
    fac: toNum(raw.fac) || "",
    ed: toNum(raw.ed) || "",
    tose: toNum(raw.tose) || "",
    wheelingCharges: toNum(raw.wheelingCharges) || "",
    delayedPayment: toNum(raw.delayedPayment) || "",
    arrears: toNum(raw.arrears) || "",
    creditAdjustment: toNum(raw.creditAdjustment) || "",
    otherCharges: toNum(raw.otherCharges) || "",
    billAmount: billAmount || "",
    billingMonth,
    billingHistory,
    todSlots,
    confidence: toNum(raw.confidence),
    filename: "",
  };
}

// ─── Append-only processing log (separate file from Residential's) ────────
const COMMERCIAL_LOG_FILE_PATH = path.join(process.cwd(), "logs", "commercial-processing.log");

function appendCommercialProcessingLog(entry: Record<string, any>) {
  try {
    const dir = path.dirname(COMMERCIAL_LOG_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      COMMERCIAL_LOG_FILE_PATH,
      JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n",
      "utf8"
    );
  } catch (err) {
    console.error("[EnergyBae][Commercial] Failed to write processing log:", err);
  }
}

// ─── Route registration ────────────────────────────────────────────────────
export function registerCommercialRoutes(app: Express, deps: CommercialApiDeps) {
  const { withGeminiKeyFallback, classifyGeminiError, detectPdfPageCount, validateConfiguredGeminiApiKeys } = deps;

  app.post("/api/commercial/extract", async (req, res) => {
    const { fileData, fileName } = req.body;
    const startedAt = Date.now();

    console.log(`[EnergyBae][Commercial] ── New extraction request ──────────────────`);
    console.log(`[EnergyBae][Commercial] File: "${fileName || "unnamed file"}"`);

    if (!fileData) {
      return res.status(400).json({ success: false, error: "No file data provided." });
    }

    const keyCheck = validateConfiguredGeminiApiKeys();
    if (!keyCheck.valid) {
      return res.status(400).json({
        success: false,
        error: `Gemini API key is missing or invalid. ${keyCheck.reason} Please configure GEMINI_API_KEY in your environment Secrets.`,
      });
    }

    try {
      const mimeMatch = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1] : "application/pdf";
      const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, "");
      if (!cleanBase64) throw new Error("Base64 payload is empty after stripping the data URL prefix.");

      const fileBuffer = Buffer.from(cleanBase64, "base64");
      if (fileBuffer.length === 0) throw new Error("Empty file — decoded buffer has zero bytes.");

      const fileSizeMB = fileBuffer.length / (1024 * 1024);
      if (fileSizeMB > 20) {
        return res.status(413).json({
          success: false,
          error: `File too large (${fileSizeMB.toFixed(1)} MB). Please upload a file under 20 MB.`,
        });
      }

      const isPdf = detectedMime === "application/pdf";
      const pageCount = isPdf ? detectPdfPageCount(fileBuffer) : 1;

      const filePart = { inlineData: { mimeType: detectedMime, data: fileBuffer.toString("base64") } };
      const textPart = { text: COMMERCIAL_PROMPT };

      console.log(`[EnergyBae][Commercial] Sending document to Gemini 2.5-flash (pages: ${pageCount}, size: ${fileSizeMB.toFixed(2)} MB)...`);

      const response = await withGeminiKeyFallback(
        `Gemini-Commercial-OCR-${pageCount}pg`,
        (ai) =>
          ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [filePart, textPart] },
            config: {
              responseMimeType: "application/json",
              responseSchema: COMMERCIAL_RESPONSE_SCHEMA,
              temperature: 0,
              thinkingConfig: { thinkingBudget: 512 },
            },
          }),
        2,
        2000
      );

      let parsedJson: any = {};
      const rawText = response.text || "";
      console.log(
        `[EnergyBae][Commercial] Gemini response received — ${rawText.length} chars` +
          (response.usageMetadata
            ? ` | tokens: prompt=${response.usageMetadata.promptTokenCount ?? "?"} output=${response.usageMetadata.candidatesTokenCount ?? "?"} total=${response.usageMetadata.totalTokenCount ?? "?"}`
            : "")
      );
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        parsedJson = JSON.parse(cleaned || "{}");
      } catch (parseErr: any) {
        console.error("[EnergyBae][Commercial] JSON parse error:", parseErr.message);
        console.error("[EnergyBae][Commercial] Raw model text (first 500 chars):", rawText.slice(0, 500));
        throw new Error(
          "The AI model returned a response that could not be parsed as JSON. This usually happens when the " +
          "bill scan quality is too low or the document contains non-bill content."
        );
      }

      const sanitized = sanitizeCommercialData(parsedJson);

      appendCommercialProcessingLog({
        filename: fileName || "unnamed file",
        consumerNumber: sanitized.consumerNo || "N/A",
        ocrTimeMs: Date.now() - startedAt,
        extractionTimeMs: Date.now() - startedAt,
        exportStatus: "n/a",
        googleSheetStatus: "n/a",
        errors: null,
      });

      res.json({ success: true, data: sanitized });
    } catch (error: any) {
      const rawMessage: string = error?.message || String(error);
      console.error("[EnergyBae][Commercial] ✗ Extraction failed:", rawMessage);

      appendCommercialProcessingLog({
        filename: fileName || "unnamed file",
        consumerNumber: "N/A",
        ocrTimeMs: Date.now() - startedAt,
        extractionTimeMs: Date.now() - startedAt,
        exportStatus: "n/a",
        googleSheetStatus: "n/a",
        errors: rawMessage,
      });

      const classification = classifyGeminiError(error);
      let userMessage: string;
      if (classification.kind === "daily-quota") {
        userMessage =
          "Daily Gemini API quota exhausted (free-tier limit is 20 requests/day for gemini-2.5-flash) on all configured API keys. " +
          "It resets at midnight Pacific Time — try again later, add another GEMINI_API_KEY_2/3 fallback key, or upgrade your Google AI Studio billing plan for a higher limit.";
      } else if (classification.kind === "transient") {
        const waitSeconds = classification.retryDelaySeconds ? Math.max(1, Math.ceil(classification.retryDelaySeconds)) : 60;
        userMessage = `The AI model is experiencing high demand. Please wait about ${waitSeconds} seconds and try again.`;
      } else if (rawMessage.toLowerCase().includes("could not be parsed")) {
        userMessage = rawMessage;
      } else {
        userMessage = `Unable to extract bill. Please upload a higher quality document. (Detail: ${rawMessage})`;
      }

      res.status(500).json({ success: false, error: userMessage });
    }
  });

  app.post("/api/commercial/export", (req, res) => {
    const { data, panelWatt, sunHours, buffer, systemCost } = req.body;
    const exportStartedAt = Date.now();

    if (!data) {
      return res.status(400).json({ error: "Missing commercial bill data for worksheet generation." });
    }

    try {
      const wb = xlsx.utils.book_new();
      const ws: any = {};

      const model = buildCommercialWorksheetModel(data as CommercialBillData, {
        panelWatt: Number(panelWatt) || 600,
        sunHours: Number(sunHours) || 1400,
        buffer: Number(buffer) || 1.1,
        systemCost: Number(systemCost) || 0,
      });

      let maxRow = 1;
      for (const cell of model.cells) {
        const rowNum = Number(cell.ref.match(/\d+/)?.[0] || 1);
        if (rowNum > maxRow) maxRow = rowNum;
        if (typeof cell.value === "number") {
          ws[cell.ref] = { t: "n", v: cell.value };
        } else if (cell.value === null || cell.value === undefined) {
          ws[cell.ref] = { t: "s", v: "" };
        } else {
          ws[cell.ref] = { t: "s", v: String(cell.value) };
        }
      }
      ws["!ref"] = `A1:F${maxRow}`;
      ws["!cols"] = model.colWidths.map((wch) => ({ wch }));

      xlsx.utils.book_append_sheet(wb, ws, model.sheetTitle);
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      const consumerNo = (data as CommercialBillData).consumerNo || "Untitled";
      res.setHeader("Content-Disposition", `attachment; filename="Commercial_Bill_Analysis_${consumerNo}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);

      appendCommercialProcessingLog({
        filename: `Commercial_Bill_Analysis_${consumerNo}.xlsx`,
        consumerNumber: consumerNo,
        excelGenerationTimeMs: Date.now() - exportStartedAt,
        exportStatus: "success",
        googleSheetStatus: "n/a",
        errors: null,
      });
    } catch (error: any) {
      console.error("[EnergyBae][Commercial] Excel generation error:", error);
      appendCommercialProcessingLog({
        filename: "unknown",
        consumerNumber: (data as CommercialBillData)?.consumerNo || "N/A",
        excelGenerationTimeMs: Date.now() - exportStartedAt,
        exportStatus: "failed",
        googleSheetStatus: "n/a",
        errors: error?.message || String(error),
      });
      res.status(500).json({ error: "Failed to assemble commercial XLSX workbook file." });
    }
  });
}
