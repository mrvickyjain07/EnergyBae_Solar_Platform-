// src/modules/proposal/proposalRecord.test.ts
// Run with: npx tsx src/modules/proposal/proposalRecord.test.ts
import assert from "node:assert/strict";
import { buildProposalItemRows, isProposalStatus } from "./proposalRecord";
import { BOQItem } from "./types";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const item = (over: Partial<BOQItem> = {}): BOQItem => ({
  sr: 1,
  group: "Main Equipment",
  name: "Panel",
  spec: "540Wp",
  make: "Adani",
  unit: "Nos",
  qty: 10,
  unitCost: 15,
  price: 150,
  ...over,
});

check("valid row maps through unchanged", buildProposalItemRows([item()]), [
  { sr: 1, group: "Main Equipment", name: "Panel", spec: "540Wp", make: "Adani", unit: "Nos", qty: 10, unit_cost: 15, price: 150 },
]);

// The class of bug CLAUDE.md documents (inverter unit cost -3 -> negative line
// price): a bad computed value must never freeze into the DB as-is.
check(
  "negative unit cost is clamped to 0 and price is recomputed, not trusted",
  buildProposalItemRows([item({ unitCost: -3, price: -30 })]),
  [{ sr: 1, group: "Main Equipment", name: "Panel", spec: "540Wp", make: "Adani", unit: "Nos", qty: 10, unit_cost: 0, price: 0 }]
);

check("negative qty is clamped to 0", buildProposalItemRows([item({ qty: -5 })])[0].qty, 0);

check("empty boq yields empty rows", buildProposalItemRows([]), []);

check("isProposalStatus accepts draft/final", [isProposalStatus("draft"), isProposalStatus("final")], [true, true]);
check("isProposalStatus rejects anything else", isProposalStatus("done"), false);
check("isProposalStatus rejects non-strings", isProposalStatus(undefined), false);

console.log(`\n${passed} checks passed.`);
