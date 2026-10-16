// src/modules/proposal/matchInverter.test.ts
// Run with: npx tsx src/modules/proposal/matchInverter.test.ts
import assert from "node:assert/strict";
import { findBestInverter, InverterCandidate } from "./matchInverter";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const inv = (id: string, brand: string, systemType: InverterCandidate["systemType"], phase: 1 | 3, kw: number, price: number, isActive = true): InverterCandidate => ({
  id, brand, systemType, phase, kw, model: id, price, isActive,
});

const stock: InverterCandidate[] = [
  inv("og-1p-3", "Deye", "On-Grid", 1, 3, 32000),
  inv("og-1p-5", "Deye", "On-Grid", 1, 5, 45000),
  inv("og-1p-6", "Growatt", "On-Grid", 1, 6, 48000),
  inv("og-3p-10", "Solis", "On-Grid", 3, 10, 78000),
  inv("hyb-1p-5", "Deye", "Hybrid", 1, 5, 95000),
  inv("off-1p-5", "Deye", "Off-Grid", 1, 5, 70000),
  inv("og-1p-3-inactive", "Deye", "On-Grid", 1, 3, 30000, false),
];

check("exact kW match", findBestInverter(stock, { systemType: "On-Grid", phase: 1, requiredCapacity: 5 }).candidate?.id, "og-1p-5");
check("exact match returns qty 1 / EXACT", findBestInverter(stock, { systemType: "On-Grid", phase: 1, requiredCapacity: 5 }).matchType, "EXACT");

check("next size up when no exact match", findBestInverter(stock, { systemType: "On-Grid", phase: 1, requiredCapacity: 4 }).candidate?.id, "og-1p-5");
check("next-above returns NEXT_ABOVE", findBestInverter(stock, { systemType: "On-Grid", phase: 1, requiredCapacity: 4 }).matchType, "NEXT_ABOVE");

// No single On-Grid 1-Phase inverter covers 20 kW (largest is 6 kW) — suggest multiples.
{
  const m = findBestInverter(stock, { systemType: "On-Grid", phase: 1, requiredCapacity: 20 });
  check("multiple-unit fallback picks the largest candidate", m.candidate?.id, "og-1p-6");
  check("multiple-unit fallback computes ceil(required/kw)", m.quantity, 4);
  check("multiple-unit fallback is MULTIPLE", m.matchType, "MULTIPLE");
}

// System type is a hard filter — never suggest an On-Grid inverter for a Hybrid system.
check("wrong system type yields no match", findBestInverter(stock, { systemType: "Hybrid", phase: 3, requiredCapacity: 5 }).matchType, "NO_MATCH");
check("Hybrid system only matches Hybrid stock", findBestInverter(stock, { systemType: "Hybrid", phase: 1, requiredCapacity: 5 }).candidate?.id, "hyb-1p-5");

// Phase is a hard filter too — no Off-Grid 3-Phase stock exists.
check("wrong phase yields no match", findBestInverter(stock, { systemType: "Off-Grid", phase: 3, requiredCapacity: 5 }).matchType, "NO_MATCH");

// Brand narrows the pool when provided.
check("brand filter narrows to that brand", findBestInverter(stock, { systemType: "On-Grid", phase: 1, requiredCapacity: 6, brand: "Deye" }).candidate?.id, "og-1p-5");
check("brand filter is case-insensitive", findBestInverter(stock, { systemType: "On-Grid", phase: 1, requiredCapacity: 5, brand: "deye" }).candidate?.id, "og-1p-5");

// Inactive rows are never suggested — an all-inactive pool behaves like an empty one.
check(
  "inactive-only pool yields no match",
  findBestInverter([inv("only-inactive", "Deye", "On-Grid", 1, 3, 30000, false)], { systemType: "On-Grid", phase: 1, requiredCapacity: 3 }).matchType,
  "NO_MATCH"
);

check("empty candidate list yields no match", findBestInverter([], { systemType: "On-Grid", phase: 1, requiredCapacity: 5 }).matchType, "NO_MATCH");

console.log(`\n${passed} checks passed.`);
