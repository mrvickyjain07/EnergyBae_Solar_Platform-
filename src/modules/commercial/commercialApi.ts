// Commercial Bill Analysis — server-side routes, prompt, schema, and logging.
// Fully isolated from Residential's /api/extract and /api/download-excel:
// separate prompt, separate schema, separate sanitizer, separate log file.
// Generic infra (Gemini client, retry/backoff, PDF page detection, API-key
// validation) is injected from server.ts rather than imported, so this file
// never creates a circular dependency on server.ts.
import { isAcceptedBillMime } from "../../uploadLimits";
import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import * as xlsx from "xlsx";
// Batch export only. Plain `xlsx` (SheetJS CE) silently drops cell styles on
// write, so the batch sheet's shaded separator/header bands would vanish; this
// fork writes them. The single-bill route deliberately stays on `xlsx` — its
// output has no styling and must not change.
import xlsxStyle from "xlsx-js-style";
import { GoogleGenAI, Type } from "@google/genai";
import { buildCommercialWorksheetModel } from "./commercialWorksheetModel";
import {
  buildCommercialBatchWorksheetModel,
  BATCH_HEADER_FILL,
  BatchBillEntry,
} from "./commercialBatchWorksheetModel";
import { buildBillingHistoryWindow, sizingFrom } from "./commercialCalculations";
import { CommercialBillData, buildBlankCommercialBillData } from "./types";
import { parseLoadUnit } from "./billUnits";
// Direct import, unlike the injected deps below: GEMINI_MODEL is a plain
// constant on a service module, not infra owned by server.ts, so importing it
// here creates no circular dependency. Relative path, not the "@/" alias — the
// server bundle is built by esbuild with no alias config.
import { GEMINI_MODEL, generateWithGeminiFallback } from "../../services/geminiExtraction";

export interface CommercialApiDeps {
  getGeminiClient: () => GoogleGenAI;
  withRetry: <T>(label: string, fn: () => Promise<T>, maxAttempts?: number, baseDelayMs?: number) => Promise<T>;
  isTransientError: (err: any) => boolean;
  detectPdfPageCount: (buffer: Buffer) => number;
  validateGeminiApiKeyFormat: (apiKey: string | undefined) => { valid: boolean; reason?: string };
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
6. contractDemand — Contract Demand in KVA
7. fixedCharges — ONLY a line literally labelled "Fixed Charges" / "स्थिर आकार" in ₹. Demand Charges are a
   different line: never copy them here. Most Demand-billed / TOD bills print no Fixed Charges line — return 0.
8. sanctionedLoad — the number printed beside "Sanctioned Load", exactly as printed (do NOT convert units).
8a. sanctionedLoadUnit — the unit printed beside that number: "HP", "kW" or "kVA". "" if no unit is printed.
    Many LT industrial bills print "200.00 HP" — report 200 and "HP"; the app converts HP to kW itself.
8b. connectedLoad / connectedLoadUnit — same for "Connected Load". Never copy Contract Demand (kVA) into either.
9. edCode — Electricity Duty code (e.g. "06 PART B")
10. securityDeposit — Security Deposit amount in ₹ ("Security Deposit Held")
11. meterNo — Meter Number

EXISTING SOLAR INSTALLATION (already installed on THIS bill — nothing to do with any new solar you might
size/recommend elsewhere)
12. hasSolar — true only if you find real evidence of an existing installation per rule G below; false otherwise.
    Never default to true just because the bill is HT, TOD-billed, or otherwise "solar-looking".
13. solarCapacityKw — nameplate capacity in kW, from whichever label pattern rule G says applies to this bill.
    0 if blank/absent.
14. solarGenerationUnits — the figure from "Total Solar Generation Units : <n>" in the Messages/remarks text (HT
    bills only), used as a fallback signal per rule G. 0 if absent.
15. solarSourceField — short audit string naming exactly what you read hasSolar/solarCapacityKw from: one of
    "ht_nameplate", "lt_nameplate", "ht_generation_signal", or "none".

METER READINGS
The "CURRENT CONSUMPTION DETAILS" table has columns KWH, KVAH, RKVAH (LAG), RKVAH (LEAD), KW (MD), KVA (MD)
and rows Current, Previous, Difference, Multiplying Factor, Consumption, Add if L.T. Metering, Adjustment,
Assessed Consumption, Total Consumption. "Current"/"Previous" are cumulative REGISTER readings (e.g. 23456.780);
"Total Consumption" is the period's energy after the multiplying factor (e.g. 46265.00). Never swap them.
16. prevReading — KWH column, "Previous" register reading (e.g. 22300.120)
17. currReading — KWH column, "Current" register reading (e.g. 23456.780)
17a. kvahPrevReading / kvahCurrReading — KVAH column, "Previous" and "Current" register readings
18. multiplyingFactor — the "Multiplying Factor" row (commonly 1 for HT-metered, e.g. 40 for LT CT meters)
19. kvahReading — apparent energy CONSUMED this period: KVAH column, "Total Consumption" row (e.g. 49810.00).
    NEVER a register reading — if your number equals kvahCurrReading or kvahPrevReading, it is wrong.
19a. activeKwh — ACTIVE energy for this period: the "Total Consumption" row of the KWH column of the consumption
    table (after the multiplying factor). Not the KVAH column, not the billed "Units" of the charge block (which
    is kVAh on kVAh-billed tariffs), not the billing-history table.
19b. readingFrom / readingTo — the "Previous" and "Current" reading dates printed under "Reading Date"
    (e.g. "Current 31/03/2025", "Previous 28/02/2025"), returned as "YYYY-MM-DD". "" if not printed.
20. recordedMD — recorded Maximum Demand in KVA: the KVA (MD) column, "Total Consumption" row (e.g. 98.00).
20a. recordedMdKw — recorded Maximum Demand in KW: the KW (MD) column, "Total Consumption" row (e.g. 95.00).
    Two different numbers — never copy one into the other.
20b. billedDemand — the "Billed Demand" figure exactly as printed in BILLING DETAILS (e.g. 80). Do not compute it.
20c. billedDemandUnit — "kVA" or "kW" only if printed beside it, else "".
20d. avgPowerFactor — the "Avg. P.F." / "Assessed P.F." value as printed (e.g. 0.9650).
20e. billedPowerFactor — the "Billed P.F." value as printed (e.g. 0.9420). Never compute a PF yourself; 0 if
    not printed.

CHARGE COMPONENTS (each as a separate ₹ line item for the CURRENT bill only — do not sum them yourself)
21. energyCharges — the "Energy Charges" line only (e.g. 351204.50).
21a. todCharges — the ₹ amount on the "TOD Tariff EC" line of the charge block (the same Amount column as
    Demand Charges and Energy Charges), SIGNED as printed. Read that line; do NOT add up the "TOD Tariffs" slot
    table's Charges column — it is a breakdown and is not this field. 0 if the line is not printed. Never add it
    into energyCharges or otherCharges.
22. demandCharges — Demand Charges
23. fac — Fuel Adjustment Charge (FAC)
24. ed — Electricity Duty
25. tose — Tax on Sale of Electricity (ToSE)
26. wheelingCharges — Wheeling Charges
27. delayedPayment — Delayed Payment Charges that are ALREADY included in this bill's current total (i.e. the
    consumer has actually incurred them). Most bills only show delayed-payment charges as a HYPOTHETICAL
    "if paid after [date], amount = X" note for a future due date — that hypothetical note is NOT this field;
    return 0 in that common case. Only report a non-zero value if a late fee is shown as already applied to
    the bill currently due.
28. arrears — prior-period dues the consumer still OWES (a POSITIVE carryover balance only). If the bill's
    arrears/outstanding-balance line is NEGATIVE (i.e. it is actually a credit/refund in the consumer's favour,
    sometimes labeled "Principal Arrears: -X" or "निव्वळ थकबाकी/जमा: -X"), that is NOT arrears — report arrears
    as 0 and put the absolute value of that credit into creditAdjustment instead.
29. creditAdjustment — any credit/adjustment in the consumer's favour for this bill (security-deposit interest
    credit, a negative arrears/outstanding line as described above, debit/credit bill adjustments, etc.) —
    always report as a POSITIVE number representing the credit amount, never the future-looking discounts
    offered only for early/digital payment (those are not yet applied).
30. otherCharges — never the "TOD Tariff EC" line (that is todCharges). ONLY these specific CURRENTLY-APPLIED line items, summed together if more than one is
    nonzero: "P.F. Penal Charges / P.F. Incentive", "Charges For Excess Demand", "Debit Bill Adjustment". Do
    NOT include — and do not re-add — any value you already reported in energyCharges, demandCharges, fac, ed,
    tose, wheelingCharges, delayedPayment, arrears, or creditAdjustment above; each printed ₹ line item belongs
    in exactly ONE field, never two. If none of the three items listed above are printed on the bill, return 0.
31a. currentBillTotal — "TOTAL CURRENT BILL" (the unrounded total of this period's charges, e.g. 512330.47).
31. billAmount — the bill's own STANDARD headline total for this billing cycle — typically labeled "Total Bill
    Amount (Rounded)" / "Net Bill Amount" / "पूर्णांक देयक". This must be the figure BEFORE any late-payment
    penalty is added (i.e. NOT the "if paid after [date]" / "या तारखे नंतर भरल्यास" amount) and AFTER arrears/
    credit adjustments are already netted in by the bill itself.

BILLING HISTORY (every month printed on the bill — commonly 12 or 13 rows, sometimes more)
32. billingHistory — array of { monthLabel, units, billAmount }, read from a "BILLING HISTORY" table if the bill
    has one (columns commonly: Bill / Units / Bill Demand / Bill Amount). Include EVERY row printed in that
    table — do not cap at 12 or drop the oldest rows if there are 13+. monthLabel format: "Mon-YYYY" with a
    FULL 4-digit year exactly as printed (e.g. "Jan-2026", not "Jan-26"). units = consumption in kWh/kVAh for
    that month. billAmount = that month's net billed amount (never arrears/security deposit). Do NOT include
    the bill's own current period in this array — it is captured separately by fields 35/36/31 below and will
    be merged in automatically.
32a. billingHistoryUnit — what that table's "Units" measure. Compare this bill's own billed units (the "Units"
    in the Consumption / charge block) with the KWH and KVAH "Total Consumption": if they equal the KVAH total
    the tariff bills on kVAh and the history is "kVAh"; if they equal the KWH total it is "kWh"; otherwise
    "unknown". (MSEDCL industrial bills bill on kVAh.)

TOD SLOT DATA (4 slots — only present on TOD-billed bills; if this bill is not TOD-billed, return all 4 slots
with units = 0)
33. todSlots — read from the "TOD Tariffs" table (columns: time range / Rate / Units / Demand / Charges) if
    present. Return exactly 4 entries: { slot: "A", units }, { slot: "B", units }, { slot: "C", units },
    { slot: "D", units } corresponding to the rows for 00:00–06:00 (A), 06:00–09:00 (B), 09:00–17:00 (C),
    17:00–24:00 (D). units = that row's "Units" column value (NOT its Charges column).

CURRENT BILL PERIOD
34. billingMonth — the bill's own period in "Mon-YYYY" format (e.g. "Feb-2026"), from the "BILL OF SUPPLY FOR
    THE MONTH" header or equivalent. This is a DIFFERENT month from the last row of billingHistory.

META
35. confidence — your own confidence (0-100) in the overall extraction quality of this document

Read every digit character-by-character — Indian utility bills often mix Devanagari and Latin numerals and have
visually similar digits (1/7, 3/8, 0/6). Cross-check figures against any totals/tables shown twice on the bill.

KNOWN MISREADS — CHECK EACH ONE BEFORE YOU ANSWER
These are extraction errors actually observed on MSEDCL bills. Re-read the document to avoid each:

A. WHEELING IS NOT ENERGY. The "Wheeling Charge @ <rate>" line is its own separate ₹ line item and belongs ONLY
   in wheelingCharges. energyCharges = the "Energy Charges" figure only; "TOD Tariff EC" goes in todCharges.
B. kvahReading comes from the KVAH column of the consumption table — NOT from RKVAH (LAG) and NOT from
   RKVAH (LEAD), which are adjacent reactive-energy columns holding similar-looking values.
C. recordedMD comes from the "KVA (MD)" column and recordedMdKw from the "KW (MD)" column — the Total
   Consumption row of each (after the multiplying factor), not the small Current/Previous register values.
D. TOD SLOTS MAP BY PRINTED TIME RANGE, NOT ROW ORDER. Read each row's time label: 00:00-06:00 -> A,
   06:00-09:00 -> B, 09:00-17:00 -> C, 17:00-24:00 -> D. Do not assume the rows are printed in A,B,C,D order.
E. creditAdjustment accepts ONLY a credit printed as a real ₹ LINE ITEM in the charge block and therefore already
   netted into this bill's total (typically the E-Bill / "Go-green" discount, e.g. -120.00 in the Other Charges
   area). EXCLUDE anything that appears only inside the free-text "Message:" paragraph — "# Credit Bill
   Adjustment Amount = X", "# Prev Prompt Payment Credit: X", "# Prompt Discount of Rs. X if paid on or before
   <date>", "# Digital Payment Discount of Rs. X" — those belong to a different cycle or are conditional future
   offers. Also exclude the tiny ±0.01-9.99 rounding figure that lands the total on a round Rs.10.
F. FINAL SELF-CHECK BEFORE YOU RETURN — this catches most of the above:
     energyCharges + todCharges + demandCharges + fac + ed + tose + wheelingCharges + otherCharges
   must equal currentBillTotal ("TOTAL CURRENT BILL") to within about Rs.1, and that plus delayedPayment +
   arrears - creditAdjustment must equal billAmount to within Rs.10 (rounded to the nearest Rs.10).
   If the sum does not reconcile, you have mis-assigned a line item — re-read the charge block and fix the
   assignment. Do NOT "balance" the figures by inventing or padding a value; only re-assign what is actually
   printed.
G. EXISTING SOLAR HAS TWO DIFFERENT LABEL PATTERNS DEPENDING ON TARIFF FORMAT — read the correct one, and never
   confuse "no solar" with "failed to find":
     - HT bills print "Solar Conn./ Type" + "Solar Capacity" + "Inst month" together in the technical/metering
       block, near Feeder Name / Substation Name / MIDC Zone. If this bill is HT and this whole row is MISSING
       from the document (not blank — literally absent), that is a confident "no solar":
       hasSolar=false, solarCapacityKw=0, solarSourceField="none". Do NOT infer a capacity from Contract Demand,
       Connected Load, MIDC Zone, or any other nearby field.
     - LT bills (LT-I, LT-II, etc.) always print a "Solar Generation Capacity (KW):" label in the header block
       near Sanctioned Load / Connected Load / Contract Demand — even when the consumer has no solar, in which
       case its printed value is blank. A blank LT value is a confident "no solar" reading, not a missed
       extraction: hasSolar=false, solarCapacityKw=0, solarSourceField="lt_nameplate".
     - On HT bills specifically, also check for generation signals even when the nameplate "Solar Capacity"
       field is blank or absent: a "Total Solar Generation Units : <n>" line in the Messages/remarks text, a
       "TOD SOLAR GENERATION METER" reading table, a "Rooftop RE Energy Settlement" table, or a small negative
       "Adjustment-Solar" row inside Current Consumption Details. If ANY of these are present, set
       hasSolar=true and solarGenerationUnits to the "Total Solar Generation Units" figure (or that table's
       Total Consumption figure if the Messages line isn't printed), even though solarCapacityKw may be 0 —
       set solarSourceField="ht_generation_signal" in that case.
     - Never fabricate a capacity number. If neither a nameplate label nor a generation signal exists anywhere
       on the bill, hasSolar=false, solarCapacityKw=0, solarGenerationUnits=0, solarSourceField="none".

Generate a JSON object matching this exact flat schema (no nested objects):
{
  "consumerNo": "string", "consumerName": "string", "address": "string",
  "connectionType": "LT" or "HT", "category": "string", "contractDemand": number,
  "fixedCharges": number, "sanctionedLoad": number, "sanctionedLoadUnit": "string",
  "connectedLoad": number, "connectedLoadUnit": "string", "edCode": "string",
  "securityDeposit": number, "meterNo": "string",
  "hasSolar": boolean, "solarCapacityKw": number, "solarGenerationUnits": number, "solarSourceField": "string",
  "prevReading": number, "currReading": number, "kvahPrevReading": number, "kvahCurrReading": number, "multiplyingFactor": number,
  "kvahReading": number, "recordedMD": number, "recordedMdKw": number, "billedDemand": number, "billedDemandUnit": "string",
  "avgPowerFactor": number, "billedPowerFactor": number, "activeKwh": number, "readingFrom": "string", "readingTo": "string",
  "energyCharges": number, "todCharges": number, "demandCharges": number, "fac": number, "ed": number, "tose": number,
  "wheelingCharges": number, "delayedPayment": number, "arrears": number, "creditAdjustment": number,
  "otherCharges": number, "currentBillTotal": number, "billAmount": number, "billingMonth": "string",
  "billingHistory": [ { "monthLabel": "string", "units": number, "billAmount": number } ], "billingHistoryUnit": "string",
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
    sanctionedLoadUnit: { type: Type.STRING },
    connectedLoad: { type: Type.NUMBER },
    connectedLoadUnit: { type: Type.STRING },
    edCode: { type: Type.STRING },
    securityDeposit: { type: Type.NUMBER },
    meterNo: { type: Type.STRING },
    hasSolar: { type: Type.BOOLEAN },
    solarCapacityKw: { type: Type.NUMBER },
    solarGenerationUnits: { type: Type.NUMBER },
    solarSourceField: { type: Type.STRING },
    prevReading: { type: Type.NUMBER },
    currReading: { type: Type.NUMBER },
    multiplyingFactor: { type: Type.NUMBER },
    kvahPrevReading: { type: Type.NUMBER },
    kvahCurrReading: { type: Type.NUMBER },
    kvahReading: { type: Type.NUMBER },
    recordedMD: { type: Type.NUMBER },
    recordedMdKw: { type: Type.NUMBER },
    billedDemand: { type: Type.NUMBER },
    billedDemandUnit: { type: Type.STRING },
    avgPowerFactor: { type: Type.NUMBER },
    billedPowerFactor: { type: Type.NUMBER },
    activeKwh: { type: Type.NUMBER },
    readingFrom: { type: Type.STRING },
    readingTo: { type: Type.STRING },
    energyCharges: { type: Type.NUMBER },
    todCharges: { type: Type.NUMBER },
    demandCharges: { type: Type.NUMBER },
    fac: { type: Type.NUMBER },
    ed: { type: Type.NUMBER },
    tose: { type: Type.NUMBER },
    wheelingCharges: { type: Type.NUMBER },
    delayedPayment: { type: Type.NUMBER },
    arrears: { type: Type.NUMBER },
    creditAdjustment: { type: Type.NUMBER },
    otherCharges: { type: Type.NUMBER },
    currentBillTotal: { type: Type.NUMBER },
    billAmount: { type: Type.NUMBER },
    billingMonth: { type: Type.STRING },
    billingHistoryUnit: { type: Type.STRING },
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
    "hasSolar", "solarSourceField",
  ],
};

// ─── Sanitization ───────────────────────────────────────────────────────────
function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
/** Signed (a TOD rebate is negative); "" when absent or 0. */
const signed = (v: any): number | "" => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : "";
};

const loadUnit = (v: unknown): CommercialBillData["sanctionedLoadUnit"] => {
  const u = parseLoadUnit(typeof v === "string" ? v : "");
  return u === "unknown" ? "" : u;
};
/** "YYYY-MM-DD" or "DD/MM/YYYY" → "YYYY-MM-DD"; "" otherwise. */
export function isoDate(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const out = iso ? t : dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : "";
  return out && Number.isFinite(Date.parse(out)) ? out : "";
}

// Exported for the sanitizer self-check in commercialSolarExtraction.test.ts.
export function sanitizeCommercialData(raw: any): CommercialBillData {
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

  const kvahPrevReading = toNum(raw.kvahPrevReading);
  const kvahCurrReading = toNum(raw.kvahCurrReading);
  // A consumption figure equal to a register reading IS the register reading
  // (observed: 13,007.89 shown as "apparent energy"). Leave it blank for the
  // reviewer rather than keep a wrong number.
  const isRegister = (v: number, regs: number[]) => v > 0 && regs.some((r) => r > 0 && Math.abs(r - v) < 0.01);
  const activeRaw = toNum(raw.activeKwh);
  const activeKwh = isRegister(activeRaw, [prevReading, currReading]) ? 0 : activeRaw;
  // kVAh consumed can never be below kWh consumed (power factor ≤ 1) either.
  const kvahRaw = toNum(raw.kvahReading);
  const kvahReading = isRegister(kvahRaw, [kvahPrevReading, kvahCurrReading]) || (activeKwh > 0 && kvahRaw > 0 && kvahRaw < activeKwh) ? 0 : kvahRaw;
  const billingHistoryUnit: CommercialBillData["billingHistoryUnit"] = raw.billingHistoryUnit === "kVAh" || raw.billingHistoryUnit === "kWh" ? raw.billingHistoryUnit : "unknown";

  // The printed "BILLING HISTORY" table on most commercial bills excludes the
  // bill's own current period — merge it in as the latest entry (same gap
  // fixed for Residential), then de-dupe/sort/window to the trailing 12. The
  // merged figure must be in the table's own unit: kVAh on kVAh-billed tariffs
  // (it used to be kWh, mixing two units in one column).
  const kwhFromReadings = currReading > prevReading ? (currReading - prevReading) * multiplyingFactor : 0;
  const currentPeriodUnits = billingHistoryUnit === "kVAh" ? kvahReading : activeKwh || kwhFromReadings;
  // An unknown current figure is not merged as 0 — the row would read as a zero-consumption month.
  const mergedHistory = billingMonth && currentPeriodUnits > 0
    ? [...printedHistory.filter((r: any) => r.monthLabel !== billingMonth), { monthLabel: billingMonth, units: currentPeriodUnits, billAmount }]
    : printedHistory;
  const billingHistory = buildBillingHistoryWindow(mergedHistory);

  // Never trust the model's bare boolean over its own evidence — hasSolar is
  // only true when backed by a real nameplate capacity or generation signal,
  // matching rule G's "never fabricate" instruction even if the model slips.
  const solarCapacityKw = toNum(raw.solarCapacityKw);
  const solarGenerationUnits = toNum(raw.solarGenerationUnits);
  const solarSourceField = typeof raw.solarSourceField === "string" ? raw.solarSourceField.trim() : "";
  const hasSolar = raw.hasSolar === true && (solarCapacityKw > 0 || solarGenerationUnits > 0);

  // Demand charges are NOT fixed charges (decided 2026-10-15): each printed line
  // lives in exactly one field. A model that copies demand into fixed is undone.
  const demandCharges = toNum(raw.demandCharges);
  const fixedChargesRaw = toNum(raw.fixedCharges);
  const fixedCharges = fixedChargesRaw > 0 && Math.abs(fixedChargesRaw - demandCharges) >= 0.01 ? fixedChargesRaw : 0;

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
    fixedCharges: fixedCharges || "",
    sanctionedLoad: toNum(raw.sanctionedLoad) || "",
    sanctionedLoadUnit: loadUnit(raw.sanctionedLoadUnit),
    connectedLoad: toNum(raw.connectedLoad) || "",
    connectedLoadUnit: loadUnit(raw.connectedLoadUnit),
    edCode: typeof raw.edCode === "string" ? raw.edCode.trim() : "",
    securityDeposit: toNum(raw.securityDeposit) || "",
    meterNo: typeof raw.meterNo === "string" ? raw.meterNo.trim() : "",
    hasSolar,
    solarCapacityKw: solarCapacityKw || "",
    solarGenerationUnits: solarGenerationUnits || "",
    solarSourceField: solarSourceField || (hasSolar ? "unspecified" : "none"),
    prevReading: prevReading || "",
    currReading: currReading || "",
    multiplyingFactor,
    kvahPrevReading: kvahPrevReading || "",
    kvahCurrReading: kvahCurrReading || "",
    kvahReading: kvahReading || "",
    recordedMD: toNum(raw.recordedMD) || "",
    recordedMdKw: toNum(raw.recordedMdKw) || "",
    billedDemand: toNum(raw.billedDemand) || "",
    billedDemandUnit: raw.billedDemandUnit === "kVA" || raw.billedDemandUnit === "kW" ? raw.billedDemandUnit : "",
    // As printed — an impossible PF (> 1) is kept and flagged by the checks, never clamped.
    avgPowerFactor: toNum(raw.avgPowerFactor) || "",
    billedPowerFactor: toNum(raw.billedPowerFactor) || "",
    activeKwh: activeKwh || "",
    readingFrom: isoDate(raw.readingFrom),
    readingTo: isoDate(raw.readingTo),
    energyCharges: toNum(raw.energyCharges) || "",
    todCharges: signed(raw.todCharges),
    demandCharges: demandCharges || "",
    fac: toNum(raw.fac) || "",
    ed: toNum(raw.ed) || "",
    tose: toNum(raw.tose) || "",
    wheelingCharges: toNum(raw.wheelingCharges) || "",
    delayedPayment: toNum(raw.delayedPayment) || "",
    arrears: toNum(raw.arrears) || "",
    creditAdjustment: toNum(raw.creditAdjustment) || "",
    otherCharges: toNum(raw.otherCharges) || "",
    currentBillTotal: toNum(raw.currentBillTotal) || "",
    billAmount: billAmount || "",
    billingMonth,
    billingHistory,
    billingHistoryUnit,
    todSlots,
    confidence: toNum(raw.confidence),
    filename: "",
  };
}

// ─── Append-only processing log (separate file from Residential's) ────────
const COMMERCIAL_LOG_FILE_PATH = path.join(process.cwd(), "logs", "commercial-processing.log");

function appendCommercialProcessingLog(entry: Record<string, any>) {
  if (process.env.VERCEL) return; // read-only filesystem on Vercel
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
  const { getGeminiClient, withRetry, isTransientError, detectPdfPageCount, validateGeminiApiKeyFormat } = deps;

  app.post("/api/commercial/extract", async (req, res) => {
    const { fileData, fileName } = req.body;
    const startedAt = Date.now();

    console.log(`[EnergyBae][Commercial] ── New extraction request ──────────────────`);
    console.log(`[EnergyBae][Commercial] File: "${fileName || "unnamed file"}"`);

    if (!fileData) {
      return res.status(400).json({ success: false, error: "No file data provided." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const keyCheck = validateGeminiApiKeyFormat(apiKey);
    if (!keyCheck.valid) {
      return res.status(400).json({
        success: false,
        error: `Gemini API key is missing or invalid. ${keyCheck.reason} Please configure GEMINI_API_KEY in your environment Secrets.`,
      });
    }

    try {
      const mimeMatch = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+);base64,/);
      const detectedMime = mimeMatch ? mimeMatch[1].toLowerCase() : "application/pdf";
      // Public endpoint: only bill formats reach Gemini (no HTML/zip/etc.).
      if (!isAcceptedBillMime(detectedMime)) {
        return res.status(415).json({ success: false, error: "Unsupported file type — upload a PDF, PNG or JPG bill." });
      }
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

      console.log(`[EnergyBae][Commercial] Sending document to ${GEMINI_MODEL} (pages: ${pageCount}, size: ${fileSizeMB.toFixed(2)} MB)...`);

      // Same key + model fallback as residential (was primary-key-only, so a
      // 503 "high demand" spike failed the scan outright).
      const response = await generateWithGeminiFallback(
        `Gemini-Commercial-OCR-${pageCount}pg`,
        (client, model) =>
          client.models.generateContent({
            model,
            contents: { parts: [filePart, textPart] },
            config: {
              responseMimeType: "application/json",
              responseSchema: COMMERCIAL_RESPONSE_SCHEMA,
              temperature: 0,
              thinkingConfig: { thinkingBudget: 512 },
            },
          })
      );

      let parsedJson: any = {};
      const rawText = response.text || "";
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        parsedJson = JSON.parse(cleaned || "{}");
      } catch (parseErr: any) {
        console.error("[EnergyBae][Commercial] JSON parse error:", parseErr.message);
        throw new Error(
          "The AI model returned a response that could not be parsed as JSON. This usually happens when the " +
          "bill scan quality is too low or the document contains non-bill content."
        );
      }

      const sanitized = sanitizeCommercialData(parsedJson);

      appendCommercialProcessingLog({
        filename: fileName || "unnamed file",
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

      // Spec-mandated generic message — never crash the app, never expose raw API errors.
      // A daily-quota 429 is separated from ordinary overload: it is NOT worth
      // retrying for hours, and Batch Bill Analysis reports it as its own status
      // so a quota stall is never mistaken for a bad scan.
      const isQuota =
        /resource_exhausted|exceeded your current quota|quotafailure|per\s*day/i.test(rawMessage);

      let userMessage = "Unable to extract bill. Please upload a higher quality document.";
      let code = "EXTRACTION_FAILED";
      if (isQuota) {
        userMessage =
          "Daily AI quota reached for this API key. Extraction will work again after the quota resets, or with a billing-enabled key.";
        code = "QUOTA_EXCEEDED";
      } else if (isTransientError(error)) {
        userMessage =
          "The AI model is experiencing high demand and did not respond after retrying. Please wait 1–2 minutes and try again.";
        code = "TRANSIENT";
      }

      res.status(500).json({ success: false, error: userMessage, code });
    }
  });

  app.post("/api/commercial/export", (req, res) => {
    const { data } = req.body;
    const exportStartedAt = Date.now();

    if (!data) {
      return res.status(400).json({ error: "Missing commercial bill data for worksheet generation." });
    }

    try {
      const wb = xlsx.utils.book_new();
      const ws: any = {};

      const model = buildCommercialWorksheetModel({ ...buildBlankCommercialBillData(), ...(data as CommercialBillData) }, sizingFrom(req.body));

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

      // Client-supplied → header-safe characters only.
      const consumerNo = String((data as CommercialBillData).consumerNo || "").replace(/[^\w-]/g, "") || "Untitled";
      res.setHeader("Content-Disposition", `attachment; filename="Commercial_Bill_Analysis_${consumerNo}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);

      appendCommercialProcessingLog({
        filename: "Commercial_Bill_Analysis.xlsx",
        excelGenerationTimeMs: Date.now() - exportStartedAt,
        exportStatus: "success",
        googleSheetStatus: "n/a",
        errors: null,
      });
    } catch (error: any) {
      console.error("[EnergyBae][Commercial] Excel generation error:", error);
      appendCommercialProcessingLog({
        filename: "unknown",
        excelGenerationTimeMs: Date.now() - exportStartedAt,
        exportStatus: "failed",
        googleSheetStatus: "n/a",
        errors: error?.message || String(error),
      });
      res.status(500).json({ error: "Failed to assemble commercial XLSX workbook file." });
    }
  });

  // Batch Bill Analysis — every bill on ONE sheet of ONE workbook.
  // Extraction still happens one bill at a time through /api/commercial/extract;
  // this endpoint only lays the finished results out.
  app.post("/api/commercial/batch-export", (req, res) => {
    const { bills } = req.body;
    const exportStartedAt = Date.now();

    if (!Array.isArray(bills) || bills.length === 0) {
      return res.status(400).json({ error: "No bills supplied for batch export." });
    }

    try {
      const model = buildCommercialBatchWorksheetModel(
        (bills as BatchBillEntry[]).map((b) => ({ ...b, data: { ...buildBlankCommercialBillData(), ...b.data } })),
        sizingFrom(req.body)
      );

      const ws: any = {};
      for (const cell of model.cells) {
        const out: any =
          typeof cell.value === "number"
            ? { t: "n", v: cell.value }
            : { t: "s", v: cell.value === null || cell.value === undefined ? "" : String(cell.value) };

        if (cell.bold || cell.fill) {
          const onDark = cell.fill === BATCH_HEADER_FILL;
          out.s = {
            font: { bold: !!cell.bold, color: { rgb: onDark ? "FFFFFFFF" : "FF1A1A1A" } },
            ...(cell.fill ? { fill: { patternType: "solid", fgColor: { rgb: cell.fill } } } : {}),
          };
        }
        // Internal link back to this bill's detail block further down the sheet.
        if (cell.link) {
          out.l = { Target: cell.link, Tooltip: "Jump to this bill's detail block" };
        }
        ws[cell.ref] = out;
      }

      ws["!ref"] = `A1:I${model.endRow}`;
      ws["!cols"] = model.colWidths.map((wch) => ({ wch }));

      const wb = xlsxStyle.utils.book_new();
      xlsxStyle.utils.book_append_sheet(wb, ws, model.sheetTitle);
      const buf = xlsxStyle.write(wb, { type: "buffer", bookType: "xlsx" });

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Disposition", `attachment; filename="Commercial_Bill_Batch_Analysis_${stamp}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);

      appendCommercialProcessingLog({
        filename: `Commercial_Bill_Batch_Analysis_${stamp}.xlsx`,
        consumerNumber: `${bills.length} bills`,
        excelGenerationTimeMs: Date.now() - exportStartedAt,
        exportStatus: "success",
        googleSheetStatus: "n/a",
        errors: null,
      });
    } catch (error: any) {
      console.error("[EnergyBae][Commercial] Batch Excel generation error:", error);
      appendCommercialProcessingLog({
        filename: "batch",
        consumerNumber: `${Array.isArray(bills) ? bills.length : 0} bills`,
        excelGenerationTimeMs: Date.now() - exportStartedAt,
        exportStatus: "failed",
        googleSheetStatus: "n/a",
        errors: error?.message || String(error),
      });
      res.status(500).json({ error: "Failed to assemble the batch XLSX workbook file." });
    }
  });
}
