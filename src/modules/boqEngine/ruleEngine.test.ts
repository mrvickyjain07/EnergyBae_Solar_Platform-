// src/modules/boqEngine/ruleEngine.test.ts
// Run with: npx tsx src/modules/boqEngine/ruleEngine.test.ts
import assert from "node:assert/strict";
import { DEFAULT_CATALOGUE } from "../proposal/defaultCatalogue";
import { evalExpr, runTemplate, validateDefinition, type Expr, type TemplateDefinition } from "./ruleEngine";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const ctx = (inputs: Record<string, unknown> = {}, values: Record<string, any> = {}) => ({ inputs, cat: DEFAULT_CATALOGUE, values });
const ev = (e: Expr, inputs = {}, values = {}) => evalExpr(e, ctx(inputs, values));

// Arithmetic and JavaScript semantics
check("add/mul order as written", ev({ op: "add", args: [{ lit: 1 }, { op: "mul", args: [{ lit: 2 }, { lit: 3 }] }] }), 7);
check("division by zero follows JS (Infinity)", ev({ op: "div", args: [{ lit: 1 }, { lit: 0 }] }), Infinity);
check("or = JS || (0 falls through)", ev({ op: "or", args: [{ lit: 0 }, { lit: "—" }] }), "—");
check("ceil / round / trunc", [ev({ op: "ceil", arg: { lit: 2.1 } }), ev({ op: "round", arg: { lit: 2.5 } }), ev({ op: "trunc", arg: { lit: -2.7 } })], [3, 3, -2]);
check("input num: blank → 0", ev({ input: "x", as: "num" }, { x: "" }), 0);
check("input int truncates", ev({ input: "x", as: "int" }, { x: 2.7 }), 2);
check("input raw keeps strings", ev({ input: "x" }, { x: "3-Phase" }), "3-Phase");
check("concat stringifies like a template literal", ev({ op: "concat", parts: [{ lit: 600 }, { lit: " Wp" }] }), "600 Wp");
check("if/eq", ev({ op: "if", cond: { op: "eq", args: [{ input: "p" }, { lit: "3-Phase" }] }, then: { lit: 3 }, else: { lit: 1 } }, { p: "3-Phase" }), 3);
check("and/truthy/ne", ev({ op: "if", cond: { op: "and", all: [{ op: "truthy", arg: { input: "m" } }, { op: "ne", args: [{ input: "m" }, { lit: "None" }] }] }, then: { lit: 1 }, else: { lit: 0 } }, { m: "None" }), 0);
check("ref reads an earlier quantity", ev({ ref: "B22" }, {}, { B22: 5 }), 5);
check("bos price from catalogue", ev({ bos: "mc4" }), DEFAULT_CATALOGUE.bos.mc4);
check("bosName falls back to built-in label", ev({ bosName: "mc4" }, {}), DEFAULT_CATALOGUE.bosNames.mc4 || "MC4 Connectors");
check("calc earthingPits = existing rule (2 inverters, ESE)", ev({ calc: "earthingPits", args: [{ lit: 2 }, { lit: "ESE" }] }), 7);
check("calc field selects one property", ev({ calc: "dcdb", args: [{ lit: 1 }, { lit: 300 }], field: "io" }), "1/1");

// No code execution: strings are data, unknown nodes throw
check("a formula-looking string is just a value", ev({ lit: "=1+1" }), "=1+1");
assert.throws(() => ev({ op: "pow", args: [{ lit: 2 }, { lit: 3 }] } as any), /Unknown expression/);
assert.throws(() => ev({ calc: "eval", args: [] } as any), /Unknown calc/);
assert.throws(() => ev({ ref: "nope" }), /Unknown quantity/);
passed += 3;
console.log("  ok — unknown op / calc / ref throw");

// Validator
const def = (quantities: any[], items: any[] = []): TemplateDefinition => ({ id: "t", quantities, items });
check("valid definition", validateDefinition(def([{ key: "a", expr: { lit: 1 } }, { key: "b", expr: { ref: "a" } }])), []);
check("forward reference rejected", validateDefinition(def([{ key: "b", expr: { ref: "a" } }, { key: "a", expr: { lit: 1 } }])), ['quantity b: "a" is used before it is defined']);
check("unknown op rejected", validateDefinition(def([{ key: "a", expr: { op: "pow", args: [{ lit: 1 }, { lit: 2 }] } }])).length, 1);
check("unknown calc rejected", validateDefinition(def([{ key: "a", expr: { calc: "eval", args: [] } }])), ['quantity a: unknown calc "eval"']);
check("duplicate quantity rejected", validateDefinition(def([{ key: "a", expr: { lit: 1 } }, { key: "a", expr: { lit: 2 } }])), ['quantity "a" is defined twice']);
const item = (key: string) => ({ key, sr: 1, group: "g", name: { lit: "n" }, spec: { lit: "" }, make: { lit: "" }, unit: "Nos.", qty: { lit: 1 }, unitCost: { lit: 1 } });
check("duplicate item key rejected", validateDefinition(def([], [item("1"), item("1")])), ['item key "1" is used twice']);

// runTemplate: shared per-quote behaviour
const tpl = def([{ key: "q", expr: { lit: 4 } }], [{ ...item("1"), qty: { ref: "q" }, unitCost: { lit: 10 } }, { ...item("2"), sr: 2, unitCost: { lit: -5 } }]);
check("qty × cost", runTemplate(tpl, {}, DEFAULT_CATALOGUE, {}).items[0].price, 40);
check("overrides by item key", runTemplate(tpl, {}, DEFAULT_CATALOGUE, { 1: 2, c1: 3 }).items[0].price, 6);
check("negative unit cost sanitized to 0", runTemplate(tpl, {}, DEFAULT_CATALOGUE, {}).items[1].unitCost, 0);
check("removal hides the line", runTemplate(tpl, {}, DEFAULT_CATALOGUE, { x1: 1 }).items.map((i) => i.sr), [2]);
check("trace exposes every quantity", runTemplate(tpl, {}, DEFAULT_CATALOGUE, {}).values, { q: 4 });

console.log(`\n${passed} passed`);
