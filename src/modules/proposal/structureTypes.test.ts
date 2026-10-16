// src/modules/proposal/structureTypes.test.ts
// Run with: npx tsx src/modules/proposal/structureTypes.test.ts
import assert from "node:assert/strict";
import { DEFAULT_CATALOGUE } from "./defaultCatalogue";
import { buildBlankProposalInputs, type ProposalInputs } from "./types";
import { calcBOQ, computePricingSummary } from "./calculations";
import { systemToProposalInputs } from "../projects/projectRules";
import {
  STRUCTURE_TYPE_DEFS, applyStructureType, isLegacyStructure, structureDef, structureFields, structureOptions, structureTypeLabel,
} from "./structureTypes";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

// 1–2. Exactly the five options, stable codes, exact display names
check("five types, in order", STRUCTURE_TYPE_DEFS.map((d) => [d.code, d.label]), [
  ["S-F", "Shed Flush"], ["S-T", "Shed Tilted"], ["N-E", "Non-Elevated"], ["E", "Elevated"], ["GM", "Ground Mounted"],
]);
check("codes are unique", new Set(STRUCTURE_TYPE_DEFS.map((d) => d.code)).size, 5);

// 3–4. Structure Details follow the type
check("shed types ask only for legs", ["S-F", "S-T"].map((c) => structureFields(c)), [["structureLegs"], ["structureLegs"]]);
check("raised / ground types ask for heights and legs", ["N-E", "E", "GM"].map((c) => structureFields(c)), Array(3).fill(["structLowerFt", "structUpperFt", "structureLegs"]));
check("no type yet shows every field (as before)", structureFields(""), ["structLowerFt", "structUpperFt", "structureLegs"]);
check("every type keeps Structure Legs (anchor bolts, D1)", STRUCTURE_TYPE_DEFS.every((d) => d.fields.includes("structureLegs")), true);

// 5. No stale values leak across types
const filled = { structureType: "E", structLowerFt: 7 as number | "", structUpperFt: 9 as number | "", structureLegs: 12 as number | "" };
check("Elevated → Shed Flush clears heights, keeps legs", applyStructureType(filled, "S-F"), { structureType: "S-F", structLowerFt: "", structUpperFt: "", structureLegs: 12 });
check("Elevated → Non-Elevated keeps heights", applyStructureType(filled, "N-E"), { ...filled, structureType: "N-E" });
check("shed and back doesn't resurrect old heights", applyStructureType(applyStructureType(filled, "S-T"), "E").structUpperFt, "");
check("input object is not mutated", filled.structUpperFt, 9);

// 6. Older saved values: shown as themselves, never mapped
for (const old of ["Flush Mount (Default)", "Single Tilt", "Elevated"]) {
  check(`"${old}" is an earlier option`, [isLegacyStructure(old), structureDef(old), structureTypeLabel(old)], [true, null, old]);
}
check("legacy value stays selectable in <select>", structureOptions("Single Tilt").at(-1), { value: "Single Tilt", label: "Single Tilt (earlier option)" });
check("codes display their label", structureTypeLabel("GM"), "Ground Mounted");
check("blank stays blank", [structureTypeLabel(""), structureTypeLabel(null), isLegacyStructure("")], ["", "", false]);
check("project system passes the code to the BOQ", systemToProposalInputs({ name: "A", phone: null, address: null, customer_type: null } as any,
  { capacity_kw: 5, system_type: "On-Grid", phase: 1, structure_type: "N-E", panel_brand: null, panel_wp: null, inverter_brand: null, site_address: null }).structureType, "N-E");

// 7–8. Structure type changes no quantity, cost or total — only line 35's spec text
const base: ProposalInputs = {
  ...buildBlankProposalInputs(), capacity: 10, panelWp: 545, panelPriceWp: 25, phase: "3-Phase", numInverters: 1, inverterUnitCost: 60000,
  numStrings: 2, panelRows: 3, buildingFloors: 2, inverterFloor: 1, structureLegs: 8, laType: "ESE", structLowerFt: 7, structUpperFt: 9,
};
const run = (structureType: string) => {
  const inp = { ...base, structureType };
  const boq = calcBOQ(inp, DEFAULT_CATALOGUE, {});
  return { lines: boq.map((b) => [b.sr, b.qty, b.unitCost, b.price]), summary: computePricingSummary(boq, inp, DEFAULT_CATALOGUE), spec35: boq.find((b) => b.sr === 35)!.spec };
};
const ref = run("");
for (const v of [...STRUCTURE_TYPE_DEFS.map((d) => d.code), "Flush Mount (Default)", "Single Tilt", "Elevated", "unknown"]) {
  const r = run(v);
  check(`${v}: same quantities, costs and totals as no type`, [r.lines, r.summary], [ref.lines, ref.summary]);
}
check("line 35 spec: label for codes, old text unchanged, default when blank",
  ["GM", "Elevated", "Flush Mount (Default)", ""].map((v) => run(v).spec35), ["Ground Mounted", "Elevated", "Flush Mount (Default)", "Flush Mount"]);

// 9. Pending D1 inputs (heights) move nothing; anchor bolts stay on the approved rule (legs × 2 × 4) for every type
const heightRun = (structLowerFt: number | "", structUpperFt: number | "") =>
  calcBOQ({ ...base, structureType: "E", structLowerFt, structUpperFt }, DEFAULT_CATALOGUE, {}).map((b) => [b.sr, b.qty, b.price]);
check("heights 0 / 0, 3 / 5, 12 / 15, blank: same BOQ as 7 / 9", [heightRun(0, 0), heightRun(3, 5), heightRun(12, 15), heightRun("", "")], Array(4).fill(heightRun(7, 9)));
check("anchor bolts = legs × 8 for every type", STRUCTURE_TYPE_DEFS.map((d) => [5, 12].map((legs) =>
  calcBOQ({ ...base, structureType: d.code, structureLegs: legs }, DEFAULT_CATALOGUE, {}).find((b) => b.sr === 22)!.qty)), Array(5).fill([40, 96]));

// Proposal values are text only — nothing numeric that a quote could pick up
check("proposal values are display strings", STRUCTURE_TYPE_DEFS.every((d) => Object.values(d.proposal).every((v) => typeof v === "string" || typeof v === "boolean")), true);

console.log(`\n${passed} checks passed.`);
