// src/modules/proposal/priceHistory.ts
// Pure diff used by catalogueApi.ts to build price_history rows (see
// supabase/migrations/0004_price_history.sql) before every catalogue PUT.
// Kept side-effect free so it's unit-testable without a DB.
import { Catalogue } from "./types";

export interface PriceHistoryRow {
  entity_type: "catalogue";
  entity_key: string;
  old_value: number | null;
  new_value: number;
}

// A field with no prior value (old_value null) that's still 0 isn't a real
// change to audit — it's just an unset default showing up in a first save
// (e.g. every never-priced BOS item). Anything else, log it.
function isNoop(oldValue: number | null, newValue: number): boolean {
  return oldValue === newValue || (oldValue === null && newValue === 0);
}

function diffRows(oldById: Map<number, number>, newRows: { id: number }[], priceOf: (r: any) => number, fieldName: string, prefix: string): PriceHistoryRow[] {
  const out: PriceHistoryRow[] = [];
  for (const row of newRows) {
    const newValue = priceOf(row);
    const oldValue = oldById.get(row.id) ?? null;
    if (!isNoop(oldValue, newValue)) out.push({ entity_type: "catalogue", entity_key: `${prefix}.${row.id}.${fieldName}`, old_value: oldValue, new_value: newValue });
  }
  return out;
}

function byId(rows: { id: number }[] | undefined, priceOf: (r: any) => number): Map<number, number> {
  const m = new Map<number, number>();
  (rows ?? []).forEach((r) => m.set(r.id, priceOf(r)));
  return m;
}

function diffScalars(oldObj: Record<string, number> | undefined, newObj: Record<string, number>, prefix: string): PriceHistoryRow[] {
  const out: PriceHistoryRow[] = [];
  for (const key of Object.keys(newObj)) {
    const newValue = newObj[key];
    const oldValue = oldObj?.[key] ?? null;
    if (!isNoop(oldValue, newValue)) out.push({ entity_type: "catalogue", entity_key: `${prefix}.${key}`, old_value: oldValue, new_value: newValue });
  }
  return out;
}

// old === null means "no prior catalogue row" (first-ever save) — every
// price is logged as a fresh entry with old_value null, same as any other
// change with no prior value.
export function diffCatalogue(old: Catalogue | null, next: Catalogue): PriceHistoryRow[] {
  return [
    ...diffRows(byId(old?.panels, (r) => r.pricePerWp), next.panels, (r) => r.pricePerWp, "pricePerWp", "panels"),
    ...diffRows(byId(old?.batteries, (r) => r.price), next.batteries, (r) => r.price, "price", "batteries"),
    ...diffRows(byId(old?.acdb, (r) => r.price), next.acdb, (r) => r.price, "price", "acdb"),
    ...diffRows(byId(old?.dcdb, (r) => r.price), next.dcdb, (r) => r.price, "price", "dcdb"),
    ...diffRows(byId(old?.customBOS, (r) => r.price), next.customBOS, (r) => r.price, "price", "customBOS"),
    ...diffScalars(old?.bos as unknown as Record<string, number>, next.bos as unknown as Record<string, number>, "bos"),
    ...diffScalars(old?.charges as unknown as Record<string, number>, next.charges as unknown as Record<string, number>, "charges"),
  ];
}
