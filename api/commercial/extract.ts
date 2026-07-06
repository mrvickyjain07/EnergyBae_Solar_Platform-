// POST /api/commercial/extract — Commercial/Industrial MSEDCL bill OCR via Gemini
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Type } from "@google/genai";
import {
  getGeminiClient,
  validateGeminiApiKeyFormat,
  isTransientError,
  withRetry,
  detectPdfPageCount,
} from "../_utils";
import { buildBillingHistoryWindow } from "../../src/modules/commercial/commercialCalculations";
import type { CommercialBillData } from "../../src/modules/commercial/types";

const COMMERCIAL_PROMPT = `
You are a highly precise document parsing engine for EnergyBae, a solar platform.
Analyze this MSEDCL COMMERCIAL, INDUSTRIAL, HT, or LT-Commercial electricity bill — including Time-of-Day (TOD) billed and Demand-billed accounts.
This is NOT a residential bill. Every field must be read fresh from THIS document. Translate Marathi terms to English.
Never fabricate or guess a value — return "" for strings or 0 for numbers if a field is not legible.

Extract these fields: consumerNo, consumerName, address, connectionType ("LT" or "HT"),
category ("Commercial" or "Industrial"), contractDemand (KVA), fixedCharges (₹),
sanctionedLoad (kW), edCode, securityDeposit (₹), meterNo,
prevReading, currReading, multiplyingFactor, kvahReading, recordedMD (KVA),
energyCharges, demandCharges, fac, ed, tose, wheelingCharges,
delayedPayment, arrears, creditAdjustment, otherCharges, billAmount,
billingMonth ("Mon-YYYY"), billingHistory (array of {monthLabel, units, billAmount}),
todSlots (array of {slot: "A"|"B"|"C"|"D", units}), confidence (0-100).

Return a flat JSON object matching this schema exactly.
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
    "consumerNo", "consumerName", "connectionType", "contractDemand",
    "fixedCharges", "billAmount", "billingMonth", "billingHistory", "todSlots",
  ],
};

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
  } as unknown as CommercialBillData;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileData, fileName } = req.body;
  const startedAt = Date.now();

  if (!fileData) {
    return res.status(400).json({ success: false, error: "No file data provided." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const keyCheck = validateGeminiApiKeyFormat(apiKey);
  if (!keyCheck.valid) {
    return res.status(400).json({
      success: false,
      error: `Gemini API key is missing or invalid. ${keyCheck.reason} Configure GEMINI_API_KEY in Vercel Environment Variables.`,
    });
  }

  try {
    const mimeMatch = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+);base64,/);
    const detectedMime = mimeMatch ? mimeMatch[1] : "application/pdf";
    const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, "");
    if (!cleanBase64) throw new Error("Base64 payload is empty after stripping data URL prefix.");

    const fileBuffer = Buffer.from(cleanBase64, "base64");
    if (fileBuffer.length === 0) throw new Error("Empty file — decoded buffer has zero bytes.");

    const fileSizeMB = fileBuffer.length / (1024 * 1024);
    if (fileSizeMB > 20) {
      return res.status(413).json({ success: false, error: `File too large (${fileSizeMB.toFixed(1)} MB). Max 20 MB.` });
    }

    const isPdf = detectedMime === "application/pdf";
    const pageCount = isPdf ? detectPdfPageCount(fileBuffer) : 1;
    const ai = getGeminiClient();

    console.log(`[EnergyBae][Commercial] Sending to Gemini (pages: ${pageCount}, size: ${fileSizeMB.toFixed(2)} MB)`);

    const response = await withRetry(
      `Gemini-Commercial-OCR-${pageCount}pg`,
      () => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: [{ inlineData: { mimeType: detectedMime, data: fileBuffer.toString("base64") } }, { text: COMMERCIAL_PROMPT }] },
        config: { responseMimeType: "application/json", responseSchema: COMMERCIAL_RESPONSE_SCHEMA, temperature: 0, thinkingConfig: { thinkingBudget: 512 } },
      }),
      2, 2000
    );

    let parsedJson: any = {};
    const rawText = response.text || "";
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsedJson = JSON.parse(cleaned || "{}");
    } catch {
      throw new Error("The AI model returned a response that could not be parsed as JSON. Try a clearer scan.");
    }

    const sanitized = sanitizeCommercialData(parsedJson);
    console.log(`[EnergyBae][Commercial] ✓ Done in ${Date.now() - startedAt}ms`);
    return res.status(200).json({ success: true, data: sanitized });

  } catch (error: any) {
    const rawMessage: string = error?.message || String(error);
    console.error("[EnergyBae][Commercial] ✗ Failed:", rawMessage);
    const userMessage = isTransientError(error)
      ? "The AI model is experiencing high demand. Please wait 1–2 minutes and try again."
      : "Unable to extract bill. Please upload a higher quality document.";
    return res.status(500).json({ success: false, error: userMessage });
  }
}
