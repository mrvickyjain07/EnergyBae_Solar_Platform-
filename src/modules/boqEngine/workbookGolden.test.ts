// src/modules/boqEngine/workbookGolden.test.ts
// Run with: npx tsx src/modules/boqEngine/workbookGolden.test.ts
// Golden test over the 14 real BOQ sheets. Pins the full legacy-v1 vs workbook
// comparison (fixtures/expected-comparison.json, written by
// scripts/boqGoldenReport.ts), so any change to the engine, the fixtures or the
// mapping shows up as a reviewed diff — never silently. Also asserts the key
// facts independently, so a regenerated snapshot can't hide them.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { compareFixture, workbookFindings, type Fixture } from "./workbookGolden";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const dir = new URL("./fixtures/workbooks/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const fx = (f: string) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Fixture;
const expected = JSON.parse(readFileSync(new URL("./fixtures/expected-comparison.json", import.meta.url), "utf8"));

check("14 BOQ sheet fixtures", files.length, 14);
check("snapshot covers the same sheets", Object.keys(expected).sort(), files);

for (const f of files) {
  const lines = compareFixture(fx(f)).lines;
  check(`${f}: every workbook row mapped to a line`, lines.filter((l) => l.key.startsWith("Unmapped")).map((l) => l.label), []);
  check(`${f}: comparison equals snapshot`, lines.map((l) => ({ key: l.key, result: l.result, workbookQty: l.workbookQty, calcQty: l.calcQty })), expected[f]);
}

// Key facts, asserted independently of the snapshot.
const ash = compareFixture(fx("ashwini--3-kw-raised-structure-solar-boq.json")).lines;
const line = (k: string) => ash.find((l) => l.key === k)!;
check("Ashwini 3 kW panels match (5)", [line("1").workbookQty, line("1").calcQty, line("1").result], [5, 5, "MATCH"]);
check("D1 fixed: anchor bolts 32 = 32 (4 legs × 2 plates × 4)", [line("22").workbookQty, line("22").calcQty], [32, 32]);
check("D2 fixed: 4 mm² lugs 8 = 8, cable tags 8 = 8", [line("20").workbookQty, line("20").calcQty, line("29").workbookQty, line("29").calcQty], [8, 8, 8, 8]);
check("DC cable 18 = 18 (8 + typed spare 10)", [line("8").workbookQty, line("8").calcQty], [18, 18]);
check("earthing pits 3 typed vs 5 (rule, ESE)", [line("16").workbookQty, line("16").calcQty], [3, 5]);

const ananda = compareFixture(fx("ananda--34.2kw-non-raised-strucutre-sol.json")).lines.find((l) => l.key === "8")!;
check("D3 fixed: length × strings (Ananda 34.2: 162 + spare 60)", [ananda.workbookQty, ananda.calcQty], [222, 222]);

const f40 = workbookFindings(fx("ananda--40.2kw-non-raised-strucutre-sol.json")).map((x) => x.row);
check("workbook findings: Ananda 40.2 unpriced AC rows 32/33 and wrong-row price at 36", [...new Set(f40)], [32, 33, 36]);
check("Ashwini 3 kW workbook is internally consistent", workbookFindings(fx("ashwini--3-kw-raised-structure-solar-boq.json")), []);

console.log(`\n${passed} passed`);
