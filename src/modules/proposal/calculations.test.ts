// src/modules/proposal/calculations.test.ts
// Run with: npx tsx src/modules/proposal/calculations.test.ts
// Reproduces the "inverter unit cost -3 -> negative line price" bug from
// BOQ_Dashboard_Implementation_Plan.md #2 and the Day 30 fix: no negative
// qty/unitCost should ever reach a BOQItem.price, regardless of whether the
// bad number came from a ProposalForm field or a BOQTable override.
import assert from "node:assert/strict";
import { calcBOQ } from "./calculations";
import { DEFAULT_CATALOGUE } from "./defaultCatalogue";
import { buildBlankProposalInputs } from "./types";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
  console.log(`  ok — ${label}: ${actual}`);
}

console.log("Negative inverter unit cost (form field) must not produce a negative line price");
{
  const inputs = { ...buildBlankProposalInputs(), capacity: 5, phase: "1-Phase" as const, numInverters: 1, inverterUnitCost: -3 };
  const boq = calcBOQ(inputs, DEFAULT_CATALOGUE, {});
  const inverterRow = boq.find((i) => i.sr === 2)!;
  check("inverter unitCost clamped to 0", inverterRow.unitCost, 0);
  check("inverter price is not negative", inverterRow.price, 0);
}

console.log("\nNegative BOQTable qty override must not produce a negative line price");
{
  const inputs = { ...buildBlankProposalInputs(), capacity: 5, phase: "1-Phase" as const, panelBrand: "Waaree", panelWp: 600, panelPriceWp: 15 };
  const boq = calcBOQ(inputs, DEFAULT_CATALOGUE, { 1: -5 });
  const panelRow = boq.find((i) => i.sr === 1)!;
  check("panel qty clamped to 0", panelRow.qty, 0);
  check("panel price is not negative", panelRow.price, 0);
}

console.log("\nRemoved BOQ rows (x<sr> override) drop out of the BOQ entirely");
{
  const inputs = { ...buildBlankProposalInputs(), capacity: 5, phase: "1-Phase" as const, panelBrand: "Waaree", panelWp: 600, panelPriceWp: 15 };
  const full = calcBOQ(inputs, DEFAULT_CATALOGUE, {});
  // sr 6 (ACDB) carries a real default price, so removing it must move the
  // material total — proving exclusion reaches the pricing summary and the
  // Excel/Word exports, not just the on-screen list.
  const acdbPrice = full.find((i) => i.sr === 6)!.price;
  const totalBefore = full.reduce((s, i) => s + i.price, 0);

  const pruned = calcBOQ(inputs, DEFAULT_CATALOGUE, { x6: 1 });
  check("removed row is absent from the BOQ", pruned.some((i) => i.sr === 6), false);
  check("every other row survives", pruned.length, full.length - 1);
  check("material total drops by exactly the removed row's price", totalBefore - pruned.reduce((s, i) => s + i.price, 0), acdbPrice);
  check("a restored row comes back", calcBOQ(inputs, DEFAULT_CATALOGUE, {}).some((i) => i.sr === 6), true);
  check("x0 falsy value does not remove anything", calcBOQ(inputs, DEFAULT_CATALOGUE, { x6: 0 }).some((i) => i.sr === 6), true);
  check("removing a row leaves qty overrides on others intact", calcBOQ(inputs, DEFAULT_CATALOGUE, { x6: 1, 1: 7 }).find((i) => i.sr === 1)!.qty, 7);
}

console.log("\nCustom BOQ items land in the category they were added to");
{
  const inputs = { ...buildBlankProposalInputs(), capacity: 5, phase: "1-Phase" as const };
  const cat = {
    ...DEFAULT_CATALOGUE,
    customBOS: [
      { id: 1, label: "Crane Hire", unit: "Nos.", price: 5000, group: "Main Equipment" },
      { id: 2, label: "Site Cleanup", unit: "Nos.", price: 800 }, // no group — legacy row
    ],
  };
  const boq = calcBOQ(inputs, cat, { 39: 1, 40: 2 });
  const crane = boq.find((i) => i.name === "Crane Hire")!;
  const cleanup = boq.find((i) => i.name === "Site Cleanup")!;
  check("a custom item uses its own category", crane.group, "Main Equipment");
  check("a legacy custom item without a group still defaults", cleanup.group, "Optional / Special");
  check("custom item keeps its rate", crane.unitCost, 5000);
  check("custom item line price still computes", crane.price, 5000);
}


console.log("\nLA type drives the LA row (sr 12) and its earthing cable (sr 15)");
{
  const base = { ...buildBlankProposalInputs(), capacity: 5, phase: "1-Phase" as const, buildingFloors: 2 };
  // The default catalogue's LA price is 0 (real prices live in the DB), so
  // use a non-zero one or the price checks can't fail.
  const cat = { ...DEFAULT_CATALOGUE, bos: { ...DEFAULT_CATALOGUE.bos, la: 12500 } };
  const row = (laType: any, sr: number) => calcBOQ({ ...base, laType }, cat, {}).find((i) => i.sr === sr)!;
  // Blank must equal ESE: proposals saved before the field existed are unchanged.
  check("blank LA prices like ESE", row("", 12).price, 12500);
  check("ESE uses the catalogue LA price", row("ESE", 12).unitCost, 12500);
  check("Conventional qty 1", row("Conventional", 12).qty, 1);
  check("Conventional rate left for office (0)", row("Conventional", 12).unitCost, 0);
  check("NA zeroes the LA", row("NA", 12).qty, 0);
  check("NA zeroes the LA earthing cable", row("NA", 15).qty, 0);
  check("ESE keeps the LA earthing cable", row("ESE", 15).qty > 0, true);
}

console.log("\nEarthing pits (sr 16) are derived from inverters + earthing type, never the typed field");
{
  const base = { ...buildBlankProposalInputs(), capacity: 10, phase: "3-Phase" as const, numInverters: 3 };
  const pits = (extra: object, ov = {}) => calcBOQ({ ...base, ...extra } as any, DEFAULT_CATALOGUE, ov).find((i) => i.sr === 16)!.qty;
  check("3 inverters, ESE → 9", pits({ laType: "ESE" }), 9);
  check("3 inverters, Conventional → 7", pits({ laType: "Conventional" }), 7);
  check("3 inverters, NA → 6", pits({ laType: "NA" }), 6);
  check("client-supplied earthingPits is ignored", pits({ laType: "ESE", earthingPits: 99 }), 9);
  check("BOQ qty override still wins (advanced)", pits({ laType: "ESE" }, { 16: 4 }), 4);
}

console.log(`\n${passed} checks passed.`);
