// src/modules/proposal/filterOptions.test.ts
// Run with: npx tsx src/modules/proposal/filterOptions.test.ts
import assert from "node:assert/strict";
import { filterOptions } from "./filterOptions";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const opts = [
  "Polycab Industrial Flexible Cable 4 sqmm 2 core",
  "Polycab Industrial Flexible Cable 4 sqmm 3 core",
  "Polycab Industrial Flexible Cable 40 sqmm 2 core",
  "House Wire 1.5 Sqmm FRLF",
  "Coaxial Cable RG-11 CU",
];

check("no query returns everything", filterOptions(opts, "", (s) => s).length, 5);
check("blank query returns everything", filterOptions(opts, "   ", (s) => s).length, 5);
check("single term is a substring match", filterOptions(opts, "coaxial", (s) => s), ["Coaxial Cable RG-11 CU"]);
check("matching is case-insensitive", filterOptions(opts, "HOUSE", (s) => s), ["House Wire 1.5 Sqmm FRLF"]);

// Every term must match somewhere — that's what makes "4 3core"-style
// narrowing work on a 181-row list without an exact phrase.
check("all terms must match", filterOptions(opts, "4 3 core", (s) => s), ["Polycab Industrial Flexible Cable 4 sqmm 3 core"]);
check("terms may appear in any order", filterOptions(opts, "core 3 4", (s) => s), ["Polycab Industrial Flexible Cable 4 sqmm 3 core"]);
check("a term that matches nothing drops the option", filterOptions(opts, "coaxial house", (s) => s), []);

// Conductor sizes run 0.5 / 4 / 40 / 400, so a NUMERIC term matches whole
// numbers only — typing "4" must not drag in every 40 and 400 row. Text terms
// keep loose substring behaviour ("coax" still finds "Coaxial").
check("a numeric term does not match a longer number", filterOptions(opts, "4 sqmm 2", (s) => s), ["Polycab Industrial Flexible Cable 4 sqmm 2 core"]);
check("the longer number is still findable", filterOptions(opts, "40", (s) => s), ["Polycab Industrial Flexible Cable 40 sqmm 2 core"]);
check("decimal sizes match exactly", filterOptions(opts, "1.5", (s) => s), ["House Wire 1.5 Sqmm FRLF"]);
check("partial words still match loosely", filterOptions(opts, "coax", (s) => s), ["Coaxial Cable RG-11 CU"]);

// Objects are supported through the accessor.
{
  const rows = [{ name: "Alpha", price: 1 }, { name: "Beta", price: 2 }];
  check("accessor pulls the searchable text", filterOptions(rows, "bet", (r) => r.name), [{ name: "Beta", price: 2 }]);
}

console.log(`\n${passed} checks passed.`);
