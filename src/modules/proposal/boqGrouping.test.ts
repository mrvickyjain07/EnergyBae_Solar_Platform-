// src/modules/proposal/boqGrouping.test.ts
// Run with: npx tsx src/modules/proposal/boqGrouping.test.ts
import assert from "node:assert/strict";
import { groupBOQ } from "./boqGrouping";
import { BOQItem } from "./types";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const item = (sr: number, group: string, price: number): BOQItem => ({
  sr, group, name: `Item ${sr}`, spec: "", make: "", unit: "Nos.",
  qty: price > 0 ? 1 : 0, unitCost: price, price,
});

check("empty BOQ produces no groups", groupBOQ([]), []);

// Group order follows first appearance, not alphabetical — the BOQ's row
// order is the engineering order and must survive grouping.
{
  const groups = groupBOQ([item(1, "Main Equipment", 100), item(2, "DC Side", 50), item(3, "Main Equipment", 25)]);
  check("groups follow first-appearance order", groups.map((g) => g.group), ["Main Equipment", "DC Side"]);
  check("non-contiguous rows still land in one group", groups[0].items.map((i) => i.sr), [1, 3]);
  check("subtotal sums every row in the group", groups[0].subtotal, 125);
}

// pricedCount drives the "N of M priced" badge and the hide-unpriced filter.
{
  const groups = groupBOQ([item(1, "Hardware", 0), item(2, "Hardware", 300), item(3, "Hardware", 0)]);
  check("pricedCount counts only rows with a price", groups[0].pricedCount, 1);
  check("count is every row in the group", groups[0].count, 3);
  check("subtotal ignores zero rows naturally", groups[0].subtotal, 300);
}

// A group where nothing is priced — collapsed by default in the UI.
{
  const groups = groupBOQ([item(1, "Optional / Special", 0), item(2, "Optional / Special", 0)]);
  check("all-zero group reports zero subtotal", groups[0].subtotal, 0);
  check("all-zero group reports zero priced", groups[0].pricedCount, 0);
}

console.log(`\n${passed} checks passed.`);
