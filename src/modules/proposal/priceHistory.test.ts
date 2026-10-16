// src/modules/proposal/priceHistory.test.ts
// Run with: npx tsx src/modules/proposal/priceHistory.test.ts
import assert from "node:assert/strict";
import { diffCatalogue } from "./priceHistory";
import { DEFAULT_CATALOGUE } from "./defaultCatalogue";
import { Catalogue } from "./types";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

function clone(cat: Catalogue): Catalogue {
  return JSON.parse(JSON.stringify(cat));
}

// Adding a brand-new panel row (not present in the prior catalogue) logs it
// with old_value null.
{
  const before = clone(DEFAULT_CATALOGUE);
  const after: Catalogue = { ...clone(before), panels: [...before.panels, { id: 999, brand: "Adani", wp: 550, pricePerWp: 18, type: "DCR" }] };
  check("a newly added panel logs old_value null", diffCatalogue(before, after), [
    { entity_type: "catalogue", entity_key: "panels.999.pricePerWp", old_value: null, new_value: 18 },
  ]);
}

// No prior catalogue at all (first-ever save) — every already-nonzero seeded
// value (e.g. the default overhead charges) is logged; still-zero fields
// (unpriced BOS items) are not, since there's nothing meaningful to record.
{
  const rows = diffCatalogue(null, clone(DEFAULT_CATALOGUE));
  check("first-ever save skips still-zero fields", rows.some((r) => r.entity_key.startsWith("bos.")), false);
  check("first-ever save logs the seeded overhead charges", rows.find((r) => r.entity_key === "charges.installation"), {
    entity_type: "catalogue",
    entity_key: "charges.installation",
    old_value: null,
    new_value: DEFAULT_CATALOGUE.charges.installation,
  });
}

// Identical catalogue — no changes, no rows.
{
  const cat = clone(DEFAULT_CATALOGUE);
  check("no price changes produces no rows", diffCatalogue(cat, clone(cat)), []);
}

// A single panel price edit.
{
  const before: Catalogue = { ...clone(DEFAULT_CATALOGUE), panels: [{ id: 1, brand: "Adani", wp: 550, pricePerWp: 18, type: "DCR" }] };
  const after: Catalogue = { ...clone(before), panels: [{ id: 1, brand: "Adani", wp: 550, pricePerWp: 22, type: "DCR" }] };
  check("changed panel price is logged", diffCatalogue(before, after), [
    { entity_type: "catalogue", entity_key: "panels.1.pricePerWp", old_value: 18, new_value: 22 },
  ]);
}

// Non-price field changes (brand rename) never produce a history row.
{
  const before: Catalogue = { ...clone(DEFAULT_CATALOGUE), panels: [{ id: 1, brand: "Adani", wp: 550, pricePerWp: 18, type: "DCR" }] };
  const after: Catalogue = { ...clone(before), panels: [{ id: 1, brand: "Waaree", wp: 550, pricePerWp: 18, type: "DCR" }] };
  check("renaming a brand with unchanged price logs nothing", diffCatalogue(before, after), []);
}

// A BOS scalar field change.
{
  const before = clone(DEFAULT_CATALOGUE);
  const after = { ...clone(before), bos: { ...before.bos, dcCable: before.bos.dcCable + 5 } };
  check("changed BOS price is logged", diffCatalogue(before, after), [
    { entity_type: "catalogue", entity_key: "bos.dcCable", old_value: before.bos.dcCable, new_value: before.bos.dcCable + 5 },
  ]);
}

// An overhead charge change.
{
  const before = clone(DEFAULT_CATALOGUE);
  const after = { ...clone(before), charges: { ...before.charges, installation: before.charges.installation + 100 } };
  check("changed overhead charge is logged", diffCatalogue(before, after), [
    { entity_type: "catalogue", entity_key: "charges.installation", old_value: before.charges.installation, new_value: before.charges.installation + 100 },
  ]);
}

console.log(`\n${passed} checks passed.`);
