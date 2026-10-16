// src/modules/proposal/sanitizePrice.test.ts
// Run with: npx tsx src/modules/proposal/sanitizePrice.test.ts
import assert from "node:assert/strict";
import { sanitizePrice } from "./sanitizePrice";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
  console.log(`  ok — ${label}: ${actual}`);
}

check("plain positive number passes through", sanitizePrice(42), 42);
check("negative number clamps to 0", sanitizePrice(-3), 0);
check("non-numeric string becomes 0", sanitizePrice("abc"), 0);
check("blank string becomes 0", sanitizePrice(""), 0);
check("numeric string is parsed", sanitizePrice("18.5"), 18.5);
check("value above max clamps to max", sanitizePrice(80000, { min: 5, max: 60 }), 60);
check("value below min clamps to min", sanitizePrice(1, { min: 5, max: 60 }), 5);
check("value inside range passes through", sanitizePrice(25, { min: 5, max: 60 }), 25);

console.log(`\n${passed} checks passed.`);
