// src/modules/projects/billAnalysisRules.ts
// Pure rules for saving a reviewed bill worksheet to a project (migration
// 0018). The server sanitizes the client's worksheet and derives the summary
// numbers itself — through summariseHistory (worksheetModel.ts), the same model behind the
// xlsx and Google Sheets exports — so a saved bill can never disagree with
// what its worksheet exports, and a client can't post a made-up capacity.
// C&I bills go through the commercial module's own pure functions (the same
// ones its screen and Excel export use) — never a re-derived copy.
//
// A saved bill is standalone (project_id null) or linked to one project.
import { summariseHistory } from "../../worksheetModel";
import { buildBlankCommercialBillData, type CommercialBillData } from "../commercial/types";
import { sizingFrom } from "../commercial/commercialCalculations";
import { analyseCommercial } from "../commercial/consumptionSizing";
import { toChargeLines, toTodRows } from "../commercial/chargeMapping";
import type { CustomerType, SystemInput } from "./projectRules";

export const BILL_CATEGORIES = [
  { value: "home", label: "Home" },
  { value: "society", label: "Society" },
  { value: "commercial", label: "Commercial & Industrial" },
] as const;
export type BillCategory = (typeof BILL_CATEGORIES)[number]["value"];

type Num = number | "";
export interface WorksheetRow { month: string; units: Num; billAmount: Num; unitCost: Num }
export interface WorksheetSlot {
  consumerName: string;
  consumerNumber: string;
  fixedCharges: Num;
  sanctionedLoadKw: Num;
  connectionType: string;
  contractDemandKva: string;
  history: WorksheetRow[];
}
export interface ResidentialBillData { slot: WorksheetSlot; solarPanelUsed: number }
/**
 * Same shape as CommercialAnalysisResult (CommercialBillAnalysis.tsx). `data` is
 * the bill being sized (single mode) or the latest bill of the sized connection
 * (several bills, all in `bills`). Sizing settings are the visible ones.
 */
export interface CommercialBillSnapshot {
  data: CommercialBillData;
  bills?: CommercialBillData[];
  panelWatt: number;
  specificYield: number;
  offsetPct: number;
  marginPct: number;
  systemCost: number | "";
}

export interface BillAnalysisInput {
  category: BillCategory;
  consumer_name: string | null;
  consumer_number: string | null;
  sanctioned_load_kw: number | null;
  phase: 1 | 3 | null;
  avg_monthly_units: number | null;
  recommended_kw: number | null;
  source_file_name: string | null;
  data: ResidentialBillData | CommercialBillSnapshot;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Blank stays blank; anything non-finite or negative is dropped rather than stored.
const num = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : "");
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

const inRange = (v: unknown, lo: number, hi: number, dflt: number) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= lo && x <= hi ? x : dflt;
};

export function validateBillAnalysis(raw: any): Result<BillAnalysisInput> {
  if (raw?.category === "commercial") return validateCommercial(raw);
  if (raw?.category !== "home" && raw?.category !== "society") return { ok: false, error: "Unknown bill category." };
  const s = raw?.data?.slot;
  if (!s || typeof s !== "object" || !Array.isArray(s.history)) return { ok: false, error: "The bill worksheet is missing." };
  if (s.history.length > 24) return { ok: false, error: "A bill worksheet has at most 24 months." };

  const slot: WorksheetSlot = {
    consumerName: str(s.consumerName, 160),
    consumerNumber: str(s.consumerNumber, 40),
    fixedCharges: num(s.fixedCharges),
    sanctionedLoadKw: num(s.sanctionedLoadKw),
    connectionType: str(s.connectionType, 80),
    contractDemandKva: str(s.contractDemandKva, 20),
    history: s.history.map((h: any) => ({ month: str(h?.month, 20), units: num(h?.units), billAmount: num(h?.billAmount), unitCost: num(h?.unitCost) })),
  };
  const solarPanelUsed = inRange(raw.data.solarPanelUsed, 50, 1000, 600);
  const phase = raw.phase === 1 || raw.phase === 3 ? raw.phase : null;

  const { avgUnits: avg, capacity: kw } = summariseHistory(slot, solarPanelUsed);

  return {
    ok: true,
    value: {
      category: raw.category,
      consumer_name: slot.consumerName || null,
      consumer_number: slot.consumerNumber || null,
      sanctioned_load_kw: slot.sanctionedLoadKw === "" ? null : slot.sanctionedLoadKw,
      phase,
      avg_monthly_units: typeof avg === "number" ? round(avg, 2) : null,
      recommended_kw: typeof kw === "number" && kw > 0 ? round(kw, 3) : null,
      source_file_name: str(raw.source_file_name, 200) || null,
      data: { slot, solarPanelUsed },
    },
  };
}

// Commercial values: finite numbers (credits can be negative), else blank.
const cnum = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : "");

const LOAD_UNITS = ["HP", "kW", "kVA"];
const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : "");

/** Only the known CommercialBillData keys, each coerced to its own kind; null when it isn't a bill. */
function coerceCommercialBill(b: any): CommercialBillData | null {
  if (!b || typeof b !== "object" || !Array.isArray(b.billingHistory) || b.billingHistory.length > 24) return null;
  const blank = buildBlankCommercialBillData();
  const bill = { ...blank } as any;
  for (const key of Object.keys(blank) as (keyof CommercialBillData)[]) {
    const v = b[key];
    if (key === "billingHistory" || key === "todSlots") continue;
    if (typeof blank[key] === "boolean") bill[key] = v === true;
    else if (typeof v === "string") bill[key] = v.trim().slice(0, 200);
    else if (typeof v === "number") bill[key] = cnum(v);
  }
  if (bill.connectionType !== "LT" && bill.connectionType !== "HT") bill.connectionType = "";
  if (!LOAD_UNITS.includes(bill.sanctionedLoadUnit)) bill.sanctionedLoadUnit = "";
  if (!LOAD_UNITS.includes(bill.connectedLoadUnit)) bill.connectedLoadUnit = "";
  if (bill.billingHistoryUnit !== "kWh" && bill.billingHistoryUnit !== "kVAh") bill.billingHistoryUnit = "unknown";
  if (bill.billedDemandUnit !== "kVA" && bill.billedDemandUnit !== "kW") bill.billedDemandUnit = "";
  bill.readingFrom = isoDay(bill.readingFrom);
  bill.readingTo = isoDay(bill.readingTo);
  bill.billingHistory = b.billingHistory.map((r: any) => ({ monthLabel: str(r?.monthLabel, 20), units: num(r?.units), billAmount: num(r?.billAmount) }));
  // Evidence arrays: re-read and re-classified here, never trusted as sent.
  bill.chargeLines = toChargeLines(b.chargeLines).slice(0, 80);
  bill.todRows = toTodRows(b.todRows).slice(0, 12);
  bill.todSlots = blank.todSlots.map((slot) => ({ slot: slot.slot, units: num((Array.isArray(b.todSlots) ? b.todSlots : []).find((t: any) => t?.slot === slot.slot)?.units) }));
  return bill;
}

function validateCommercial(raw: any): Result<BillAnalysisInput> {
  const bill = coerceCommercialBill(raw?.data?.data);
  if (!bill) return { ok: false, error: Array.isArray(raw?.data?.data?.billingHistory) ? "A bill analysis has at most 24 months." : "The bill analysis is missing." };
  const rawBills = raw.data.bills;
  if (rawBills !== undefined && (!Array.isArray(rawBills) || rawBills.length > 24)) return { ok: false, error: "A bill analysis has at most 24 bills." };
  const bills = rawBills ? rawBills.map(coerceCommercialBill) : null;
  if (bills && bills.some((b: CommercialBillData | null) => !b)) return { ok: false, error: "One of the bills in this analysis is not valid." };

  const sizing = sizingFrom(raw.data);
  // Exactly the screen's analysis (consumptionSizing.analyseCommercial): kWh from
  // the meter tables only, consolidated across the bills of one connection.
  const all: CommercialBillData[] = bills ?? [bill];
  const a = analyseCommercial(all.map((d, i) => ({ data: d, sourceId: d.filename || `bill ${i + 1}` })), sizing);
  // The recommendation (office workbook formula): TOD consideration × calculated capacity, whole panels.
  const kw = a.pipeline.recommendedKwp;

  return {
    ok: true,
    value: {
      category: "commercial",
      consumer_name: bill.consumerName || null,
      consumer_number: bill.consumerNo || null,
      // In kW: an HP load is converted (× 0.746); a kVA or unit-less load is not stored as kW.
      sanctioned_load_kw: a.sanctioned.kw !== null ? round(a.sanctioned.kw, 3) : null,
      phase: null,
      avg_monthly_units: a.baseline ? round(a.baseline.avgMonthlyKwh, 2) : null,
      recommended_kw: kw > 0 ? round(kw, 3) : null,
      source_file_name: str(raw.source_file_name, 200) || null,
      data: { data: bill, ...(bills ? { bills: bills as CommercialBillData[] } : {}), ...sizing },
    },
  };
}

/** Panel wattage a saved bill was sized with, whichever pipeline produced it. */
export function billPanelWp(data: BillAnalysisInput["data"]): number | null {
  if (!data) return null;
  return "slot" in data ? data.solarPanelUsed : data.panelWatt;
}

/** Customer type a new project's customer starts with, from the bill (editable in the dialog). */
export function billCustomerType(category: BillCategory, ciCategory?: string): CustomerType {
  if (category === "society") return "RESIDENTIAL_SOCIETY";
  if (category === "commercial") return /industr/i.test(ciCategory ?? "") ? "INDUSTRIAL" : "COMMERCIAL";
  return "INDIVIDUAL_HOUSE";
}

/** What "Use for a new system" pre-fills — the vendor reviews it in the system dialog before saving. */
export function billToSystemInput(bill: Pick<BillAnalysisInput, "recommended_kw" | "phase" | "consumer_number" | "data">): Partial<SystemInput> {
  return {
    name: bill.consumer_number ? `Meter ${bill.consumer_number}` : "Main rooftop",
    capacity_kw: bill.recommended_kw,
    phase: bill.phase,
    panel_wp: billPanelWp(bill.data),
  };
}
