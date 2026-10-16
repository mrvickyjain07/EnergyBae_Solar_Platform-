// Commercial Bill Analysis — flat data contract.
// Deliberately flat (not nested) because it must match exactly what the
// bill-analysis-v3.html reference UI's cbaApplyOCR(data) consumes via
// data-ocr-field attributes — the UI is the source of truth, not redesigned.
// Completely separate from the Residential ExtractedBillData (src/types.ts).

export interface CommercialBillingHistoryRow {
  monthLabel: string; // e.g. "Jan-26"
  units: number | "";
  billAmount: number | "";
}

export type TodSlotId = "A" | "B" | "C" | "D";

export interface CommercialTodSlotReading {
  slot: TodSlotId;
  units: number | "";
}

export interface CommercialBillData {
  // Consumer identity
  consumerNo: string;
  consumerName: string;
  address: string;

  // Technical parameters
  connectionType: "LT" | "HT" | "";
  category: string; // "Commercial" | "Industrial" | ...
  contractDemand: number | "";
  fixedCharges: number | "";
  sanctionedLoad: number | "";
  /** Unit printed beside the sanctioned load ("HP" on many LT industrial bills); "" = not stated. */
  sanctionedLoadUnit: "HP" | "kW" | "kVA" | "";
  connectedLoad: number | "";
  connectedLoadUnit: "HP" | "kW" | "kVA" | "";
  edCode: string;
  securityDeposit: number | "";
  meterNo: string;

  // Existing solar already installed on THIS bill (nameplate or generation
  // evidence) — independent of the §05 recommended NEW-solar sizing pipeline.
  hasSolar: boolean;
  solarCapacityKw: number | ""; // nameplate: HT "Solar Capacity" / LT "Solar Generation Capacity (KW)"
  solarGenerationUnits: number | ""; // HT-only fallback signal: "Total Solar Generation Units"
  solarSourceField: string; // audit trail: which label/table this was read from

  // Meter readings
  /** KWH register readings (cumulative, before the multiplying factor) — never consumption. */
  prevReading: number | "";
  currReading: number | "";
  multiplyingFactor: number | "";
  /** KVAH register readings (cumulative, before the multiplying factor) — never consumption. */
  kvahPrevReading: number | "";
  kvahCurrReading: number | "";
  /** Apparent energy CONSUMED this period (KVAH "Total Consumption", kVAh) — not a register reading. */
  kvahReading: number | "";
  /** Recorded maximum demand, kVA ("KVA (MD)" column). */
  recordedMD: number | "";
  /** Recorded maximum demand, kW ("KW (MD)" column). */
  recordedMdKw: number | "";
  /** Billed demand exactly as the bill reports it; never replaced by a derived tariff rule. */
  billedDemand: number | "";
  billedDemandUnit: "kVA" | "kW" | "";
  /** Power factors as printed by the bill (no PF is ever computed from register readings). */
  avgPowerFactor: number | ""; // "Avg. P.F." / assessed
  billedPowerFactor: number | ""; // "Billed P.F."
  /** Active energy (kWh) "Total Consumption" of the meter table — the only sizing input. */
  activeKwh: number | "";
  /** Reading dates of this period, ISO "YYYY-MM-DD"; "" when not printed. */
  readingFrom: string;
  readingTo: string;

  // Charge components — each printed line in exactly one field
  energyCharges: number | ""; // base "Energy Charges" only
  /** "TOD Tariff EC" — a separate, signed line (a rebate is negative). */
  todCharges: number | "";
  demandCharges: number | "";
  fac: number | "";
  ed: number | "";
  tose: number | "";
  wheelingCharges: number | "";
  delayedPayment: number | "";
  arrears: number | "";
  creditAdjustment: number | "";
  otherCharges: number | "";
  /** "TOTAL CURRENT BILL" — the unrounded sum of this period's charges. */
  currentBillTotal: number | "";
  billAmount: number | ""; // "Total Bill Amount (Rounded)"

  // Current bill period — used server-side to merge this period into
  // billingHistory as its latest entry (the printed history table on most
  // commercial bills excludes the bill's own current period, same gap fixed
  // for Residential). Format "Mon-YYYY", e.g. "Feb-2026".
  billingMonth: string;

  // Tables
  billingHistory: CommercialBillingHistoryRow[]; // up to 12, oldest first
  /** What the printed history "Units" measure (MSEDCL industrial: billed kVAh). Reference only — never sized on. */
  billingHistoryUnit: "kWh" | "kVAh" | "unknown";
  todSlots: CommercialTodSlotReading[]; // A, B, C, D

  // Meta
  confidence: number;
  filename: string;
}

export function buildBlankCommercialBillData(): CommercialBillData {
  return {
    consumerNo: "",
    consumerName: "",
    address: "",
    connectionType: "",
    category: "",
    contractDemand: "",
    fixedCharges: "",
    sanctionedLoad: "",
    sanctionedLoadUnit: "",
    connectedLoad: "",
    connectedLoadUnit: "",
    edCode: "",
    securityDeposit: "",
    meterNo: "",
    hasSolar: false,
    solarCapacityKw: "",
    solarGenerationUnits: "",
    solarSourceField: "",
    prevReading: "",
    currReading: "",
    multiplyingFactor: 1,
    kvahPrevReading: "",
    kvahCurrReading: "",
    kvahReading: "",
    recordedMD: "",
    recordedMdKw: "",
    billedDemand: "",
    billedDemandUnit: "",
    avgPowerFactor: "",
    billedPowerFactor: "",
    activeKwh: "",
    readingFrom: "",
    readingTo: "",
    energyCharges: "",
    todCharges: "",
    demandCharges: "",
    fac: "",
    ed: "",
    tose: "",
    wheelingCharges: "",
    delayedPayment: "",
    arrears: "",
    creditAdjustment: "",
    otherCharges: "",
    currentBillTotal: "",
    billAmount: "",
    billingMonth: "",
    billingHistory: [],
    billingHistoryUnit: "unknown",
    todSlots: [
      { slot: "A", units: "" },
      { slot: "B", units: "" },
      { slot: "C", units: "" },
      { slot: "D", units: "" },
    ],
    confidence: 0,
    filename: "",
  };
}
