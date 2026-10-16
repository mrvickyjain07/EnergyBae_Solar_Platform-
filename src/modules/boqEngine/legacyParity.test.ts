// src/modules/boqEngine/legacyParity.test.ts
// Run with: npx tsx src/modules/boqEngine/legacyParity.test.ts
// Proves runTemplate(LEGACY_V1) === calcBOQ() — every field of every line
// (sr, group, name, spec, make, unit, qty, unitCost, price), including blank
// and junk inputs, negative prices, overrides, removals and custom catalogue
// items. Seeded, so a failure reproduces exactly.
import assert from "node:assert/strict";
import { calcBOQ } from "../proposal/calculations";
import { DEFAULT_CATALOGUE } from "../proposal/defaultCatalogue";
import type { Catalogue } from "../proposal/types";
import { runTemplate, validateDefinition } from "./ruleEngine";
import { LEGACY_V1 } from "./legacyV1";
import { legacyInputsFromFixture } from "./workbookGolden";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, label);
  passed++;
}

// mulberry32 — deterministic PRNG
let seed = 20261005;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

const SPACE = {
  capacity: ["", 0, 1, 1.18, 2.5, 3, 4.2, 4.8, 5, 6, 6.5, 10.5, 20, 25, 34, 40, 50, 51, 100, 250, -3],
  panelWp: ["", 0, 535, 540, 590, 600],
  panelPriceWp: ["", 0, 15, 24.6, 25.5],
  phase: ["1-Phase", "3-Phase", ""],
  buildingFloors: ["", 0, 1, 2, 2.7, 6, 12],
  inverterFloor: ["", 0, 1, 2, 6, 12],
  numInverters: ["", 0, 1, 2, 3, 4],
  panelRows: ["", 0, 1, 2, 5, 8],
  structLowerFt: ["", 0, 3, 7],
  structUpperFt: ["", 0, 5, 9],
  numStrings: ["", 0, 1, 2, 3, 6],
  structureLegs: ["", 0, 4, 10, 2.7, undefined],
  dcSpareM: ["", 0, 5, 50, undefined],
  acSpareM: ["", 0, 10, undefined],
  earthSpareM: ["", 0, 14, undefined],
  numBatteries: ["", 0, 1, 10],
  batteryUnitCost: ["", 0, 55000, -5],
  inverterUnitCost: ["", 0, 14600, 75000, -1],
  dcCableUnitCost: ["", 0, 110],
  acCableUnitCost: ["", 0, 140],
  acCable2UnitCost: ["", 0, 1289],
  laType: ["", "ESE", "Conventional", "NA", "bogus", undefined],
  panelType: ["", "DCR", "NDCR"],
  panelBrand: ["", "Waaree"],
  inverterBrand: ["", "Solis"],
  dcCableBrand: ["", "Polycab"],
  acCableBrand: ["", "KEI"],
  acCable2Brand: ["", "Havells"],
  batteryMake: ["", "None", "Exide"],
  batteryAh: ["", 0, 100],
  batteryV: ["", 12, 51.2],
  batteryType: ["", "Lead Acid"],
  structureType: ["", "Elevated", "Flush Mount (Default)", "S-F", "GM"],
} as const;

const RICH: Catalogue = {
  ...DEFAULT_CATALOGUE,
  acdb: [
    { id: 1, capMin: 0, capMax: 5, phase: 1, spec: "2IN/2OUT 25A", price: 1350 },
    { id: 2, capMin: 0, capMax: 5, phase: 1, spec: "", price: 0 },
    { id: 3, capMin: 5, capMax: 50, phase: 3, spec: "4IN/4OUT 63A", price: 5800 },
  ],
  dcdb: [
    { id: 1, spd: 1, io: "1/1", voltage: 600, price: 1600 },
    { id: 2, spd: 2, io: "2/2", voltage: 1000, price: 2900 },
    { id: 3, spd: 4, io: "4/4", voltage: 1000, price: 8600 },
  ],
  bos: Object.fromEntries(Object.keys(DEFAULT_CATALOGUE.bos).map((k, i) => [k, i % 7 === 0 ? -3 : 10 + i * 7])) as unknown as Catalogue["bos"],
  bosNames: { ...DEFAULT_CATALOGUE.bosNames, mcb: "Renamed MCB", la: "" } as Catalogue["bosNames"],
  customBOS: [
    { id: 1, label: "Civil block", unit: "Nos.", price: 350, group: "Structure" },
    { id: 2, label: "", unit: "", price: 0 },
    { id: 3, label: "Bypass switch", unit: "/Nos.", price: -10 },
  ],
};
const NO_NAMES = { ...RICH, bosNames: undefined } as unknown as Catalogue;
const CATALOGUES = [DEFAULT_CATALOGUE, RICH, NO_NAMES];

function randomInputs() {
  return Object.fromEntries(Object.entries(SPACE).map(([k, vs]) => [k, pick(vs as readonly unknown[])]));
}
function randomOverrides() {
  const ov: Record<string, number> = {};
  const count = Math.floor(rnd() * 6);
  for (let i = 0; i < count; i++) {
    const sr = 1 + Math.floor(rnd() * 42);
    const kind = pick(["", "c", "x"]);
    ov[`${kind}${sr}`] = kind === "x" ? 1 : pick([0, 3, 7.5, -2, 120]);
  }
  return ov;
}

check("legacy-v1 definition validates", validateDefinition(LEGACY_V1), []);

const RUNS = 4000;
for (let i = 0; i < RUNS; i++) {
  const inp = randomInputs();
  const cat = pick(CATALOGUES);
  const ov = i % 3 === 0 ? {} : randomOverrides();
  const expected = calcBOQ(inp as any, cat, ov);
  const actual = runTemplate(LEGACY_V1, inp, cat, ov).items;
  check(`run ${i}: ${JSON.stringify({ inp, ov })}`, actual, expected);
}

// The 14 workbook sheets' own inputs (fixtures) — the realistic cases.
import { readdirSync, readFileSync } from "node:fs";
const dir = new URL("./fixtures/workbooks/", import.meta.url);
let sheets = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const fx = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  for (const laType of ["ESE", "Conventional", "NA"]) {
    for (const cat of CATALOGUES) {
      const inp = { ...legacyInputsFromFixture(fx), laType };
      check(`${f} ${laType}`, runTemplate(LEGACY_V1, inp, cat, {}).items, calcBOQ(inp as any, cat, {}));
    }
  }
  sheets++;
}
assert.equal(sheets, 14, "expected 14 workbook fixtures");

console.log(`  ok — ${RUNS} randomized runs + ${sheets} workbook sheets × 3 earthing types × ${CATALOGUES.length} catalogues: legacy-v1 === calcBOQ`);
console.log(`\n${passed} passed`);
