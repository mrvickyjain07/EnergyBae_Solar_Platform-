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
  edCode: string;
  securityDeposit: number | "";
  meterNo: string;

  // Meter readings
  prevReading: number | "";
  currReading: number | "";
  multiplyingFactor: number | "";
  kvahReading: number | "";
  recordedMD: number | "";

  // Charge components
  energyCharges: number | "";
  demandCharges: number | "";
  fac: number | "";
  ed: number | "";
  tose: number | "";
  wheelingCharges: number | "";
  delayedPayment: number | "";
  arrears: number | "";
  creditAdjustment: number | "";
  otherCharges: number | "";
  billAmount: number | "";

  // Current bill period — used server-side to merge this period into
  // billingHistory as its latest entry (the printed history table on most
  // commercial bills excludes the bill's own current period, same gap fixed
  // for Residential). Format "Mon-YYYY", e.g. "Feb-2026".
  billingMonth: string;

  // Tables
  billingHistory: CommercialBillingHistoryRow[]; // up to 12, oldest first
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
    edCode: "",
    securityDeposit: "",
    meterNo: "",
    prevReading: "",
    currReading: "",
    multiplyingFactor: 1,
    kvahReading: "",
    recordedMD: "",
    energyCharges: "",
    demandCharges: "",
    fac: "",
    ed: "",
    tose: "",
    wheelingCharges: "",
    delayedPayment: "",
    arrears: "",
    creditAdjustment: "",
    otherCharges: "",
    billAmount: "",
    billingMonth: "",
    billingHistory: [],
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
