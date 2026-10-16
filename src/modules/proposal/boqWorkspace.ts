// src/modules/proposal/boqWorkspace.ts
// Status derivation, filtering and roll-up stats for the Interactive BOQ
// Workspace (BOQTable.tsx). Pure — no React, no side effects — so the
// "what's done / what's missing / what does it cost" logic is unit-testable
// without rendering. Reads BOQItem only; never mutates it, so every existing
// calculation in calculations.ts stays the single source of truth.
import { BOQItem } from "./types";

export type BOQStatus = "pending" | "configured" | "priced";

export interface BOQFilters {
  search?: string;
  category?: string;
  status?: BOQStatus | "all";
  onlyIncomplete?: boolean;
}

export interface BOQStats {
  total: number;
  priced: number;
  pending: number;
  completionPct: number;
  matTotal: number;
}

// pending  — untouched: no quantity and no rate.
// configured — partial: quantity OR rate known, but the line carries no value.
// priced   — complete: quantity x rate produces a real line price.
export function itemStatus(item: BOQItem): BOQStatus {
  const qty = item.qty || 0;
  const cost = item.unitCost || 0;
  if (qty > 0 && cost > 0) return "priced";
  if (qty > 0 || cost > 0) return "configured";
  return "pending";
}

export function boqStats(items: BOQItem[]): BOQStats {
  const total = items.length;
  const priced = items.filter((i) => itemStatus(i) === "priced").length;
  return {
    total,
    priced,
    // Deliberately binary against `priced` so the header chips always add up
    // to the item count — "configured" is a per-row nuance, not a fourth bucket.
    pending: total - priced,
    completionPct: total === 0 ? 0 : Math.round((priced / total) * 100),
    matTotal: items.reduce((s, i) => s + (i.price || 0), 0),
  };
}

export function filterBOQ(items: BOQItem[], filters: BOQFilters): BOQItem[] {
  const q = (filters.search || "").trim().toLowerCase();
  return items.filter((item) => {
    if (q && !`${item.name} ${item.spec}`.toLowerCase().includes(q)) return false;
    if (filters.category && filters.category !== "All" && item.group !== filters.category) return false;
    if (filters.status && filters.status !== "all" && itemStatus(item) !== filters.status) return false;
    // "Show only incomplete" — anything still missing a quantity or a rate,
    // i.e. every row that isn't fully priced.
    if (filters.onlyIncomplete && itemStatus(item) === "priced") return false;
    return true;
  });
}
