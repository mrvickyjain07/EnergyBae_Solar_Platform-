// src/modules/proposal/earthingRules.test.ts
// Run with: npx tsx src/modules/proposal/earthingRules.test.ts
import assert from "node:assert/strict";
import { computeEarthingPits, normalizeEarthingType, EarthingRule } from "./earthingRules";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}: ${actual}`);
}

// Base table from the spec (Conventional = base).
[[1, 3], [2, 5], [3, 7], [4, 9], [5, 11], [6, 13], [7, 15], [8, 17]].forEach(([inv, pits]) =>
  check(`${inv} inverter(s), Conventional`, computeEarthingPits(inv, "Conventional"), pits),
);

// Worked examples from the spec.
check("2 inv ESE", computeEarthingPits(2, "ESE"), 7);
check("2 inv NA", computeEarthingPits(2, "NA"), 4);
check("3 inv ESE", computeEarthingPits(3, "ESE"), 9);
check("3 inv NA", computeEarthingPits(3, "NA"), 6);

// Edge cases.
check("no inverters entered → 0", computeEarthingPits("", "ESE"), 0);
check("zero inverters → 0", computeEarthingPits(0, "Conventional"), 0);
check("negative inverters treated as 0", computeEarthingPits(-4, "ESE"), 0);
check("fractional inverters truncated", computeEarthingPits(2.9, "Conventional"), 5);
check("numeric string accepted", computeEarthingPits("3", "ESE"), 9);
check("blank type defaults to ESE", computeEarthingPits(2, ""), 7);
check("garbage type defaults to ESE", computeEarthingPits(2, "<script>"), 7);
check("normalize keeps valid types", normalizeEarthingType("NA"), "NA");

// Never negative, even under a rule that would go below zero.
const harsh: EarthingRule = { id: "t", label: "t", base: () => 0, adjust: { ESE: 0, Conventional: 0, NA: -5 } };
check("custom rule clamps to 0", computeEarthingPits(1, "NA", harsh), 0);

console.log(`\n${passed} checks passed.`);
