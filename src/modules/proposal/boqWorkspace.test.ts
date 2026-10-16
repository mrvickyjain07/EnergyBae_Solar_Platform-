// src/modules/proposal/boqWorkspace.test.ts
// Run with: npx tsx src/modules/proposal/boqWorkspace.test.ts
import assert from "node:assert/strict";
import { itemStatus, filterBOQ, boqStats } from "./boqWorkspace";
import { BOQItem } from "./types";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const mk = (over: Partial<BOQItem> = {}): BOQItem => ({
  sr: 1, group: "Main Equipment", name: "Solar Module", spec: "600 Wp Mono Perc", make: "ACB",
  unit: "Nos.", qty: 0, unitCost: 0, price: 0, ...over,
});

// ── Status: three states, and every row lands in exactly one ──────────────
check("no qty and no cost is pending", itemStatus(mk()), "pending");
check("qty but no cost is configured", itemStatus(mk({ qty: 9 })), "configured");
check("cost but no qty is configured", itemStatus(mk({ unitCost: 1200 })), "configured");
check("qty and cost is priced", itemStatus(mk({ qty: 9, unitCost: 1200, price: 10800 })), "priced");

// ── Stats drive the header chips; priced + pending must equal total ───────
{
  const items = [mk({ sr: 1, qty: 9, unitCost: 100, price: 900 }), mk({ sr: 2, qty: 5 }), mk({ sr: 3 })];
  const s = boqStats(items);
  check("total counts every row", s.total, 3);
  check("priced counts rows with a line price", s.priced, 1);
  check("pending is everything not priced", s.pending, 2);
  check("priced + pending equals total", s.priced + s.pending, s.total);
  check("completion is priced share, rounded", s.completionPct, 33);
  check("material total sums line prices", s.matTotal, 900);
}
check("empty BOQ reports 0% rather than NaN", boqStats([]).completionPct, 0);

// ── Filtering ─────────────────────────────────────────────────────────────
const catalogue = [
  mk({ sr: 1, name: "Solar Module", group: "Main Equipment", qty: 9, unitCost: 100, price: 900 }),
  mk({ sr: 2, name: "DC Cable", group: "DC Side", spec: "2C×4 sq.mm XLPO", qty: 15 }),
  mk({ sr: 3, name: "AC Cable", group: "AC Side", spec: "1.1kV Al.XLPE" }),
  mk({ sr: 4, name: "Cable Tags", group: "Conduit & Accessories" }),
];

check("search matches the material name", filterBOQ(catalogue, { search: "cable" }).map((i) => i.sr), [2, 3, 4]);
check("search is case-insensitive", filterBOQ(catalogue, { search: "SOLAR" }).map((i) => i.sr), [1]);
check("search also matches specification text", filterBOQ(catalogue, { search: "xlpe" }).map((i) => i.sr), [3]);
check("category filter narrows to one group", filterBOQ(catalogue, { category: "DC Side" }).map((i) => i.sr), [2]);
check("category 'All' keeps everything", filterBOQ(catalogue, { category: "All" }).length, 4);
check("status filter finds priced rows", filterBOQ(catalogue, { status: "priced" }).map((i) => i.sr), [1]);
check("status filter finds configured rows", filterBOQ(catalogue, { status: "configured" }).map((i) => i.sr), [2]);
check("status filter finds pending rows", filterBOQ(catalogue, { status: "pending" }).map((i) => i.sr), [3, 4]);
check("onlyIncomplete hides fully-priced rows", filterBOQ(catalogue, { onlyIncomplete: true }).map((i) => i.sr), [2, 3, 4]);
check("filters combine (search + category)", filterBOQ(catalogue, { search: "cable", category: "AC Side" }).map((i) => i.sr), [3]);
check("no filters returns the original list", filterBOQ(catalogue, {}).length, 4);

console.log(`\n${passed} checks passed.`);
