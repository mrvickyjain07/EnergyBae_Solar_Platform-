// src/modules/proposal/inverterPriceExtraction.ts
// AI extraction path for inverter-price uploads: turns a scanned/PDF supplier
// pricelist into structured rows, reusing the same Gemini pipeline
// wirePriceExtraction.ts already uses. Brand and System Type are NOT
// extracted here — every vendor pricelist seen so far (Deye On-Grid, Deye
// Hybrid, ...) is one brand and one system type per document, so those are
// picked once by the office before upload (see InverterPriceUpload.tsx),
// same as Wire's file-wide Company/Category selects.
import { Type } from "@google/genai";
import { generateWithGeminiFallback, GEMINI_MODEL } from "../../services/geminiExtraction";

export interface ExtractedInverterRow {
  model: string;
  phase: string;
  kw: number;
  price: number;
}

const INVERTER_PRICE_PROMPT = `
You are reading an inverter price list — a supplier's rate card, usually a table with
columns like Sr.No, Model No, Phase, KW, Rate. Extract EVERY priced model as its own row.

## Fields

- model: the model number exactly as printed, e.g. "SUN-5K-G03" or "SUN-4K-G03(1 MPPT)".
  Keep suffixes like "(1 MPPT)" as part of the model string.
- phase: the phase text from the Phase column, e.g. "Single Phase", "Three Phase",
  "Three Phase (LV)", "Three Phase (HV)". If the KW column redundantly repeats the phase
  (e.g. a KW cell reading "5KW, 3Ph"), ignore that repetition — the Phase column is the
  source of truth.
- kw: the numeric capacity in kW, as a bare number. Strip units and any trailing phase
  repetition from the KW cell (e.g. "5KW, 3Ph" -> 5, "12 KW, 3Ph" -> 12). These sheets
  sometimes use a comma instead of a decimal point by typo — "3,3 Kw" means 3.3 and
  "3,6Kw" means 3.6, not 33 or 3600. Use the Model column's own number as a sanity check
  when a KW value looks ambiguous (a model named "SUN-3.3K-G03" has kw 3.3, not 33).
- price: the rate exactly as printed, with no currency symbol, no commas, no arithmetic.

Skip anything that isn't a priced inverter row (title rows, warranty footnotes, section
headers like "8 Year Warranty"). If a price genuinely can't be read, skip that row rather
than guessing a number.
`;

const INVERTER_PRICE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          model: { type: Type.STRING },
          phase: { type: Type.STRING },
          kw: { type: Type.NUMBER },
          price: { type: Type.NUMBER },
        },
        required: ["model", "kw", "price"],
      },
    },
  },
  required: ["rows"],
};

export async function extractInverterPricesFromDocument(buffer: Buffer, mimeType: string): Promise<ExtractedInverterRow[]> {
  const encoded = buffer.toString("base64");
  const filePart = { inlineData: { mimeType, data: encoded } };
  const textPart = { text: INVERTER_PRICE_PROMPT };

  const response = await generateWithGeminiFallback("InverterPriceExtraction", (client) =>
    client.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts: [filePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: INVERTER_PRICE_RESPONSE_SCHEMA,
        temperature: 0,
        maxOutputTokens: 65536,
      },
    })
  );

  const text = response.text ?? "{}";
  let parsed: { rows?: Array<{ model?: string; phase?: string; kw?: number; price?: number }> };
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    const truncated = /Unterminated|Expected .* after property value|Unexpected end/i.test(err.message || "");
    const e = new Error(truncated ? "The price sheet is too large to extract in one pass — the response was cut off. Split the PDF into fewer pages and upload them one at a time." : "Could not read the extraction result.");
    e.name = "ExtractionUnavailableError";
    throw e;
  }
  const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];

  return rawRows
    .filter((r) => r.model && typeof r.kw === "number" && Number.isFinite(r.kw) && typeof r.price === "number" && Number.isFinite(r.price))
    .map((r) => ({
      model: String(r.model),
      phase: String(r.phase ?? ""),
      kw: r.kw as number,
      price: r.price as number,
    }));
}
