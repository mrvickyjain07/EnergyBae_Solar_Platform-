// src/modules/boqEngine/quantityNames.test.ts
// Run with: npx tsx src/modules/boqEngine/quantityNames.test.ts
import assert from "node:assert/strict";
import { LEGACY_V1 } from "./legacyV1";
import type { Expr } from "./ruleEngine";
import { describeExpr, describeText, namesIn, refLabel, unnamedKeys } from "./quantityNames";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const qty = (sr: number) => describeExpr(LEGACY_V1.items.find((i) => i.sr === sr)!.qty);
const name = (sr: number) => describeText(LEGACY_V1.items.find((i) => i.sr === sr)!.name);
const quantity = (k: string) => describeExpr(LEGACY_V1.quantities.find((q) => q.key === k)!.expr);

// Every key legacy-v1 uses has a business name — a new unnamed key fails here.
check("legacy-v1 is fully named", unnamedKeys(LEGACY_V1), []);

// Item quantity rules (the screens' "Quantity rule" column)
check("1 Solar Module", qty(1), "Solar Module Quantity");
check("2 Solar Inverter", qty(2), "Inverter Quantity");
check("3 Data Logger", qty(3), "0");
check("4 Battery", qty(4), "Battery Quantity");
check("5 DCDB", qty(5), "Inverter Quantity (0 if not set)");
check("8 DC cable", qty(8), "DC Cable Length");
check("9 MC4", qty(9), "MC4 Connector Quantity");
check("10 AC cable + spare", qty(10), "AC Cable Length – Inverter to Meter/DB + AC Cable Spare Allowance");
check("11 constant first", qty(11), "5 × Inverter Quantity (0 if not set)");
check("12 LA conditional", qty(12), "0 if Lightning Arrester Type is “Not applicable (NA)”, otherwise 1");
check("13 structure earthing", qty(13), "Structure Earthing Cable Length + Earthing Cable Spare Allowance");
check("15 nested conditional + sum", qty(15), "0 if Lightning Arrester Type is “Not applicable (NA)”, otherwise Lightning Arrester Earthing Cable Length + Earthing Cable Spare Allowance");
check("17 lugs", qty(17), "2 × Solar Module Quantity");
check("20 sum of products", qty(20), "2 × DC Cable Cores + 2 × AC Cable Cores");
check("22 anchor bolts", qty(22), "4 × Base Plate Quantity");
check("25 guarded round-up", qty(25), "round up (1.5 × Solar Module Quantity) if Solar Module Quantity is more than 0, otherwise 0");
check("28 division", qty(28), "round up (Conduit Length ÷ 2)");

// Named quantities (the "Why?" detail)
check("B15 is the typed battery count", quantity("B15"), "Battery Qty (whole number)");
check("B22 panels", quantity("B22"), "round up (1000 × Required Solar Capacity ÷ Solar Module Size) if Solar Module Size is more than 0, otherwise 0");
check("B21 earthing rule", quantity("B21"), "earthing pit rule (2 × Inverter Qty + 1; +2 for ESE, −1 for NA, 0 with no inverters)");
check("acSpare default", quantity("acSpare"), "AC Cable Spare (40 if blank)");
check("B16 nesting keeps grouping", quantity("B16"),
  "round up (1.2 × Panels per Row + 2.3 × Panel Rows) × String Quantity if Inverter Quantity is more than 0 and Panel Rows is more than 0, otherwise 0");

// Line names: no more name(mcb)
check("bos name", name(7), "MCB at LT Panel");
check("bos name + suffix", name(13), "Earthing Cable 6sq.mm — Structure");

// Unknown keys are flagged, never guessed
check("unknown ref", refLabel("B99"), "Unnamed value (B99)");
const unknown: Expr = { op: "add", args: [{ ref: "B99" }, { input: "mystery" }] };
check("unknown in a rule", describeExpr(unknown), "Unnamed value (B99) + Unnamed input (mystery)");
check("audit lists unknowns", unnamedKeys({ id: "t", quantities: [{ key: "B99", expr: { input: "mystery" } }], items: [] }), ["B99", "input:mystery"]);

// Nested conditions / precedence on synthetic rules
const r = (ref: string): Expr => ({ ref });
check("sub keeps right grouping", describeExpr({ op: "sub", args: [r("B1"), { op: "sub", args: [r("B7"), r("B9")] }] }), "Required Solar Capacity − (Inverter Quantity − Panel Rows)");
check("nested if is parenthesised in arithmetic", describeExpr({ op: "mul", args: [{ lit: 2 }, { op: "if", cond: { op: "truthy", arg: r("B7") }, then: r("B7"), else: { lit: 1 } }] }),
  "2 × (Inverter Quantity if Inverter Quantity is set, otherwise 1)");
check("namesIn walks conditions", [...namesIn(LEGACY_V1.items[14].qty).refs].sort(), ["B20", "earthSpare", "laType"]);

console.log(`\n${passed} checks passed.`);
