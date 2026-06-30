/**
 * Types and interfaces for the EnergyBae Solar Platform
 */

import { TariffSlab } from "./services/tariffCalculator";

export interface BillingHistoryItem {
  month: string;
  consumption: number; // in kWh / Units
  amount: number;       // in INR — net payable amount for that bill, excluding arrears/security deposit
}

export interface ExtractedBillData {
  consumerName: string;
  consumerNumber: string;
  consumerAddress: string;
  billingUnit: string;
  tariffCategory: string;
  connectionType: string; // raw connection/tariff code exactly as printed, e.g. "92/LT I Res 3-Phase"
  fixedCharges: number;   // ₹ — standing/fixed charge as printed on the bill, never assumed
  sanctionedLoadKw: number;
  phaseType: '1-Phase' | '3-Phase' | string;
  meterNumber: string;
  billingMonth: string;
  dueDate: string;
  currentUnits: number;
  currentBillAmount: number; // net payable amount, excludes arrears/security deposit/total outstanding
  billingHistory: BillingHistoryItem[];
  tariffSlabs: TariffSlab[]; // slab table as printed on the bill, if legible

  // High-value derived solar recommendations
  solarSizingKw: number;
  annualGenerationKwh: number;
  estimatedAnnualSavingsInr: number;
  paybackPeriodYears: number;
  carbonReductionTons: number;
}

export interface ExtractionResponse {
  success: boolean;
  data?: ExtractedBillData;
  error?: string;
  confidenceScore: number; // e.g., 94.5%
}
