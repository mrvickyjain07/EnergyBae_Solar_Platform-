// src/modules/proposal/boqGrouping.ts
// Groups BOQ rows by category with per-category subtotals, so BOQTable can
// render 10 collapsible sections instead of one 38-row wall. Pure//no React
// so the subtotal math is unit-testable without rendering.
import { BOQItem } from "./types";

export interface BOQGroup {
  group: string;
  items: BOQItem[];
  subtotal: number;
  /** rows with a non-zero line price — drives the "N of M priced" badge */
  pricedCount: number;
  count: number;
}

export function groupBOQ(items: BOQItem[]): BOQGroup[] {
  // Map preserves insertion order, so groups come out in first-appearance
  // (engineering) order while still merging any non-contiguous rows —
  // custom items append to "Optional / Special" after the standard ones.
  const byGroup = new Map<string, BOQItem[]>();
  for (const item of items) {
    const bucket = byGroup.get(item.group);
    if (bucket) bucket.push(item);
    else byGroup.set(item.group, [item]);
  }
  return Array.from(byGroup, ([group, groupItems]) => ({
    group,
    items: groupItems,
    subtotal: groupItems.reduce((s, i) => s + (i.price || 0), 0),
    pricedCount: groupItems.filter((i) => (i.price || 0) > 0).length,
    count: groupItems.length,
  }));
}
