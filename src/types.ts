/**
 * Types and interfaces for the EnergyBae Solar Platform
 */

export interface BillingHistoryItem {
  month: string;
  consumption: number; // in kWh / Units
  amount: number;       // in INR
}

export interface ExtractedBillData {
  consumerName: string;
  consumerNumber: string;
  billingUnit: string;
  tariffCategory: string;
  sanctionedLoadKw: number;
  phaseType: '1-Phase' | '3-Phase' | string;
  meterNumber: string;
  billingMonth: string;
  currentUnits: number;
  currentBillAmount: number;
  billingHistory: BillingHistoryItem[];
  
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

export type ConsumerSlot = 'Column D' | 'Column H';
