// src/modules/proposal/wireCategory.test.ts
// Run with: npx tsx src/modules/proposal/wireCategory.test.ts
import assert from "node:assert/strict";
import { resolveWireType } from "./wireCategory";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
  console.log(`  ok — ${label}`);
}

// The bug this fixes: a price sheet is a size x core-count matrix, so one
// upload legitimately contains both 1-core and n-core products. Stamping the
// whole file with the single category picked in the form put "10 core
// Polycab Industrial Flexible Cable" into Single Core Cable.
check("1 core stays in Single Core Cable", resolveWireType("Single Core Cable", 1), "Single Core Cable");
check("2 cores routes to Multi Core Cable", resolveWireType("Single Core Cable", 2), "Multi Core Cable");
check("10 cores routes to Multi Core Cable", resolveWireType("Single Core Cable", 10), "Multi Core Cable");
check("1 core routes back out of Multi Core", resolveWireType("Multi Core Cable", 1), "Single Core Cable");
check("4 cores stays in Multi Core Cable", resolveWireType("Multi Core Cable", 4), "Multi Core Cable");

// Armoured is a construction type, not a core count — a 4-core armoured cable
// is still armoured, so that selection is never re-routed.
check("armoured is left alone regardless of cores", resolveWireType("Aluminium Armoured Cable", 4), "Aluminium Armoured Cable");
check("armoured with 1 core is still armoured", resolveWireType("Aluminium Armoured Cable", 1), "Aluminium Armoured Cable");

// Unknown core count can't be routed — fall back to what the user picked.
check("null cores falls back to the selection", resolveWireType("Single Core Cable", null), "Single Core Cable");
check("undefined cores falls back to the selection", resolveWireType("Single Core Cable", undefined), "Single Core Cable");
check("NaN cores falls back to the selection", resolveWireType("Single Core Cable", NaN), "Single Core Cable");
check("zero cores falls back to the selection", resolveWireType("Single Core Cable", 0), "Single Core Cable");

console.log(`\n${passed} checks passed.`);
