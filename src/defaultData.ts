import { SlotData, BillHistoryRow } from "./components/ComparativeSheet";

// Builds 12 blank history rows. Month stays blank until a bill is extracted
// and fills it in — we never pre-fill a guessed date range.
export function buildTrailing12Months(): BillHistoryRow[] {
  const rows: BillHistoryRow[] = [];
  for (let i = 0; i < 12; i++) {
    rows.push({
      month: "",
      units: "",
      billAmount: "",
      unitCost: ""
    });
  }
  return rows;
}

export function buildBlankSlotData(): SlotData {
  return {
    consumerName: "",
    consumerNumber: "",
    fixedCharges: "",
    sanctionedLoadKw: "",
    connectionType: "",
    contractDemandKva: "",
    history: buildTrailing12Months()
  };
}
