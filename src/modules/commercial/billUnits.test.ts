// src/modules/commercial/billUnits.test.ts
// Run with: npx tsx src/modules/commercial/billUnits.test.ts
import assert from "node:assert/strict";
import { HP_TO_KW, normalizeLoad, parseLoadUnit } from "./billUnits";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

// HP → kW
check("factor", HP_TO_KW, 0.746);
check("200 HP → 149.2 kW, original kept", normalizeLoad(200, "HP"),
  { originalValue: 200, originalUnit: "HP", kw: 149.2, method: "HP × 0.746", warning: null });
check("other HP values", [1, 10, 7.5, 150].map((v) => normalizeLoad(v, "HP").kw), [0.746, 7.46, 5.595, 111.9]);
check("0 HP → 0 kW (a real zero, not missing)", normalizeLoad(0, "HP").kw, 0);

// Never converted twice / never across kinds
check("kW passes through unchanged", normalizeLoad(80, "kW"), { originalValue: 80, originalUnit: "kW", kw: 80, method: "as printed (kW)", warning: null });
check("kVA (contract demand) is not converted", [normalizeLoad(186, "kVA").kw, normalizeLoad(186, "kVA").originalValue], [null, 186]);
check("unknown unit is not assumed", [normalizeLoad(200, "unknown").kw, !!normalizeLoad(200, "unknown").warning], [null, true]);

// Missing / invalid input is explicit
check("blank → null, no warning", normalizeLoad("", "HP"), { originalValue: null, originalUnit: "HP", kw: null, method: null, warning: null });
check("null → null", normalizeLoad(null, "kW").kw, null);
check("negative → null with warning", [normalizeLoad(-5, "HP").kw, !!normalizeLoad(-5, "HP").warning], [null, true]);
check("NaN → null with warning", [normalizeLoad(Number.NaN, "HP").kw, !!normalizeLoad(Number.NaN, "HP").warning], [null, true]);

// Unit labels as printed
check("HP spellings", ["HP", "hp", "H.P.", "Horse Power"].map(parseLoadUnit), ["HP", "HP", "HP", "HP"]);
check("kW / kVA labels", ["KW", "kW", "KVA", "kva"].map(parseLoadUnit), ["kW", "kW", "kVA", "kVA"]);
check("kWh / kVAh / blank are not load units", ["kWh", "KVAH", "", undefined].map(parseLoadUnit), ["unknown", "unknown", "unknown", "unknown"]);

console.log(`\n${passed} checks passed.`);
