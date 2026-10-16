// src/modules/society/societyBatch.test.ts
// Run with: npx tsx src/modules/society/societyBatch.test.ts
import assert from "node:assert/strict";
import { slotFromExtraction, sizeMeter, societyTotals, duplicateConsumer } from "./societyBatch";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const months = (units: number[]) => units.map((u, i) => ({ month: `M${i + 1}`, consumption: u, amount: u * 10, unitCost: 10 }));
const lift = slotFromExtraction({ consumerName: "Lift", consumerNumber: "1700 0001", fixedCharges: 130, sanctionedLoadKw: 5, billingHistory: months([300, 320]) });

check("maps consumption → units", lift.history.map((h) => h.units), [300, 320]);
check("blank fields stay blank, not 0", slotFromExtraction({}).fixedCharges, "");
check("no history → empty list", slotFromExtraction({ billingHistory: null }).history, []);

// avg 310 → 310/106.060606 = 2.9229 kW → 2922.9/600 = 4.87 → 5 panels → 3 kW
const m = sizeMeter(lift, 600);
check("meter average", m.avgUnits, 310);
check("meter panels round up", m.panels, 5);
check("meter capacity", m.capacityKw, 3);

const pump = sizeMeter(slotFromExtraction({ billingHistory: months([100]) }), 600); // 0.943 kW → 1.57 → 2 panels
const empty = sizeMeter(slotFromExtraction({}), 600);
const t = societyTotals([m, pump, empty], 600);
check("total panels = sum of per-meter (each rounded up)", t.panels, 7);
check("total capacity = panels × Wp", t.capacityKw, 4.2);
check("meter with no units counts as unsized", t.unsized, 1);
check("summing per meter ≥ sizing the sum once", t.panels >= sizeMeter(slotFromExtraction({ billingHistory: months([410]) }), 600).panels, true);

check("same consumer no. despite spaces is a duplicate", duplicateConsumer("17000001", ["1700 0001"]), true);
check("blank consumer no. is never a duplicate", duplicateConsumer("", [""]), false);

console.log(`\n${passed} passed`);
