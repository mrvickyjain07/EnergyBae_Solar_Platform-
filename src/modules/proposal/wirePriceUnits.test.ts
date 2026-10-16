// src/modules/proposal/wirePriceUnits.test.ts
// Run with: npx tsx src/modules/proposal/wirePriceUnits.test.ts
import assert from "node:assert/strict";
import { normalizeToPerMetre } from "./wirePriceUnits";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
  console.log(`  ok — ${label}`);
}

// The bug this fixes: the Polycab sheet is headed "Rate Per/100 mtr", so a
// cell reading 2040 is ₹20.40/m — not ₹2040/m. Mixing the two in one column
// puts a 100x error straight into a customer quote.
check("per-100m rate converts to per-metre", normalizeToPerMetre(2040, 100), 20.4);
check("per-100m 10-core cell converts", normalizeToPerMetre(23950, 100), 239.5);
check("305m LAN drum converts", normalizeToPerMetre(18585, 305), 60.93);
check("90m telephone coil converts", normalizeToPerMetre(1040, 90), 11.56);
check("already per-metre is untouched", normalizeToPerMetre(18.5, 1), 18.5);

// Defensive: a missing/garbage basis must never silently divide by zero or
// NaN the price into oblivion — fall back to treating it as per-metre.
check("zero metres falls back to the raw price", normalizeToPerMetre(500, 0), 500);
check("negative metres falls back to the raw price", normalizeToPerMetre(500, -5), 500);
check("null metres falls back to the raw price", normalizeToPerMetre(500, null), 500);
check("undefined metres falls back to the raw price", normalizeToPerMetre(500, undefined), 500);
check("NaN metres falls back to the raw price", normalizeToPerMetre(500, NaN), 500);

// Rounded to paise — cable rates are quoted to 2 decimals downstream.
check("result is rounded to two decimals", normalizeToPerMetre(1000, 3), 333.33);

console.log(`\n${passed} checks passed.`);
