// src/modules/boqEngine/quantityNames.ts
// Business names for the BOQ engine's internal quantity keys, and a formatter
// that reads a rule tree out loud in those names.
//
// The engine keeps calcBOQ's own keys (B7, B22, dc16, …, borrowed from the
// source workbook's cell addresses) because legacyV1.ts must stay readable
// side by side with calcBOQ — renaming them would buy nothing and risk parity.
// So naming is PRESENTATION ONLY: this file never evaluates anything, and the
// stored rule format is untouched. formatExpr (ruleEngine.ts) stays the
// technical view.
//
// Every label below was traced to the workbook row that defines it (the
// `source` field; row numbers are the Ananda/Celebration layout calcBOQ was
// ported from — the older Aaryan sheets sit one row lower from row 24 down)
// and to its expression in legacyV1.ts. A key with no entry is shown as
// "Unnamed value (key)" — never guessed — and quantityNames.test.ts fails
// until it is named.

import type { Cond, Expr, TemplateDefinition } from "./ruleEngine";
import { BOS_ITEM_DEFS } from "../proposal/defaultCatalogue";

export interface NameInfo {
  label: string;
  unit?: string;
  /** What the value is and where it comes from, in plain words. */
  role: string;
  /** Workbook row (label as written in the source BOQ sheets), when there is one. */
  source?: string;
}

/** Named quantities (`{ ref }`) of the built-in legacy-v1 engine. */
export const QUANTITY_NAMES: Record<string, NameInfo> = {
  B1: { label: "Required Solar Capacity", unit: "kW", role: "Capacity entered on the System Inputs form.", source: "B1 Required Solar Capacity" },
  B2: { label: "Panel Price per Wp", unit: "₹/Wp", role: "Panel price per watt-peak entered on the form.", source: "B2 Panel Price/Wp" },
  B3: { label: "Solar Module Size", unit: "Wp", role: "Rated power of one solar module.", source: "B3 Solar Module Size (W)" },
  B4: { label: "Number of Phases", role: "3 for a 3-phase connection, otherwise 1.", source: "B4 System Connection Phase" },
  B5: { label: "Building Floors", unit: "floors", role: "Number of floors in the building, entered on the form.", source: "B5 Building No. of Floors" },
  B6: { label: "Inverter Installation Floor", unit: "floor", role: "Floor the inverter is installed on, entered on the form.", source: "B6 Inverter Installation Floor" },
  B7: { label: "Inverter Quantity", unit: "Nos.", role: "Number of inverters entered on the form.", source: "B7 No. of Inverter" },
  B9: { label: "Panel Rows", unit: "rows", role: "Number of panel rows entered on the form.", source: "B9 No. of Panel Rows" },
  B15: { label: "Battery Quantity", unit: "Nos.", role: "Number of batteries entered on the form (Battery → Qty). Not sized automatically.", source: "B15 No. of Batteries" },
  B16: { label: "DC Cable Length (before spare)", unit: "m", role: "Run length from the panel layout, per string.", source: "B16 DC Cable Length (MTS.)" },
  B17: { label: "AC Cable Length – Inverter to Meter/DB", unit: "m", role: "Run length from the inverter floor, per inverter.", source: "B17 AC Cable Length (MTS.)" },
  B18: { label: "Structure Earthing Cable Length", unit: "m", role: "Run length from the building height, per inverter.", source: "B18 Earthing Cable Length for Structure (MTS.)" },
  B19: { label: "Inverter Earthing Cable Length", unit: "m", role: "Run length from the inverter floor, per inverter.", source: "B19 Earthing Cable Length for Inverter (MTS.)" },
  B20: { label: "Lightning Arrester Earthing Cable Length", unit: "m", role: "Run length from the building height.", source: "B20 LA Earthing Cable Length (MTS.)" },
  B21: { label: "Earth Pit Quantity", unit: "Nos.", role: "From the earthing rule (inverters and lightning arrester type); not typed by the user.", source: "B21 No. of Earthing Pit" },
  B22: { label: "Solar Module Quantity", unit: "Nos.", role: "Panels needed to reach the required capacity.", source: "B22 No. of Solar Panels" },
  B23: { label: "Panels per Row", unit: "Nos.", role: "Solar modules divided across the panel rows.", source: "B23 No. of Panels in a Line" },
  B30: { label: "Voltage per String", unit: "V", role: "49.82 V per panel (workbook note: “for 550Wp PV”) × panels per string.", source: "B30 Voltage per String" },
  B32: { label: "String Quantity", unit: "Nos.", role: "Number of strings entered on the form.", source: "B32 No. of Strings" },
  B33: { label: "MC4 Connector Quantity", unit: "Nos.", role: "4 per string. The workbook counts connectors; the BOQ line is priced per pair.", source: "B33 No. of MC4 Connectors" },
  B35: { label: "DC Cable Cores", unit: "cores", role: "Always 2.", source: "B35 DC Cable Size (No. of Cores)" },
  B37: { label: "AC Cable Cores", unit: "cores", role: "4 for 3-phase, 2 for single-phase.", source: "B37 AC Cable Size (No. of Cores)" },
  B46: { label: "DC Cable Current", unit: "A", role: "Design current per string with a 1.5 safety factor; picks the DC cable size.", source: "B46 DC Cable Current" },
  dcSz: { label: "DC Cable Size", unit: "sq.mm", role: "Conductor size chosen from the DC cable current." },
  batP: { label: "Battery Unit Cost", unit: "₹", role: "Battery unit cost entered on the form." },
  legs: { label: "Structure Legs", unit: "Nos.", role: "Structure legs entered on the form (blank = 0)." },
  J46: { label: "Base Plate Quantity", unit: "Nos.", role: "2 base plates per structure leg.", source: "Structure sub-table, base plates (J46)" },
  dcSpare: { label: "DC Cable Spare Allowance", unit: "m", role: "Extra DC cable added to the run (form; blank = 15 m)." },
  acSpare: { label: "AC Cable Spare Allowance", unit: "m", role: "Extra AC cable added to the run (form; blank = 40 m)." },
  earthSpare: { label: "Earthing Cable Spare Allowance", unit: "m", role: "Extra earthing cable added to each earthing run (form; blank = 40 m)." },
  acdbSpec: { label: "ACDB Specification", role: "From the Price DB ACDB table for this capacity and phase." },
  acdbPrice: { label: "ACDB Price", unit: "₹", role: "From the Price DB ACDB table for this capacity and phase." },
  dcdbSpd: { label: "DCDB SPD Count", role: "From the Price DB DCDB table for this string count and voltage." },
  dcdbVoltage: { label: "DCDB Voltage Rating", unit: "V", role: "From the Price DB DCDB table for this string count and voltage." },
  dcdbPrice: { label: "DCDB Price", unit: "₹", role: "From the Price DB DCDB table for this string count and voltage." },
  laType: { label: "Lightning Arrester Type", role: "ESE, Conventional or NA (not applicable), as chosen on the form; blank counts as ESE." },
  dc16: { label: "DC Cable Length", unit: "m", role: "DC cable run plus the DC spare allowance.", source: "B16 DC Cable Length (MTS.) + spare" },
  condQ: { label: "Conduit Length", unit: "m", role: "DC cable plus both earthing cables (with spares), rounded up to whole 3 m lengths." },
};

/** Proposal form inputs (`{ input }`) read by the engine. Labels follow ProposalForm.tsx. */
export const INPUT_NAMES: Record<string, NameInfo> = {
  capacity: { label: "Required Capacity", unit: "kW", role: "System Inputs form." },
  panelPriceWp: { label: "Panel Price / Wp", unit: "₹", role: "System Inputs form." },
  panelWp: { label: "Solar Module Size", unit: "Wp", role: "System Inputs form." },
  panelType: { label: "Panel Type", role: "System Inputs form." },
  panelBrand: { label: "Panel Brand", role: "System Inputs form." },
  phase: { label: "Phase", role: "System Inputs form." },
  buildingFloors: { label: "Building Floors", role: "System Inputs form." },
  inverterFloor: { label: "Inverter Floor No.", role: "System Inputs form." },
  numInverters: { label: "Inverter Qty", unit: "Nos.", role: "System Inputs form." },
  inverterBrand: { label: "Inverter Brand", role: "System Inputs form." },
  inverterUnitCost: { label: "Inverter Unit Cost", unit: "₹", role: "System Inputs form / price list." },
  panelRows: { label: "Panel Rows", role: "System Inputs form." },
  numStrings: { label: "No. of Strings", role: "System Inputs form." },
  numBatteries: { label: "Battery Qty", unit: "Nos.", role: "System Inputs form." },
  batteryMake: { label: "Battery Make", role: "System Inputs form." },
  batteryAh: { label: "Battery Ah", role: "System Inputs form." },
  batteryV: { label: "Battery Voltage", unit: "V", role: "System Inputs form." },
  batteryType: { label: "Battery Type", role: "System Inputs form." },
  batteryUnitCost: { label: "Battery Unit Cost", unit: "₹", role: "System Inputs form." },
  structureLegs: { label: "Structure Legs", role: "System Inputs form." },
  structureType: { label: "Structure Type", role: "System Inputs form." },
  dcSpareM: { label: "DC Cable Spare", unit: "m", role: "System Inputs form." },
  acSpareM: { label: "AC Cable Spare", unit: "m", role: "System Inputs form." },
  earthSpareM: { label: "Earthing Cable Spare", unit: "m", role: "System Inputs form." },
  laType: { label: "Lightning Arrester (LA)", role: "System Inputs form." },
  dcCableBrand: { label: "DC Cable Brand", role: "System Inputs form." },
  dcCableUnitCost: { label: "DC Cable Unit Cost", unit: "₹", role: "System Inputs form / wire prices." },
  acCableBrand: { label: "AC Cable Brand", role: "System Inputs form." },
  acCableUnitCost: { label: "AC Cable Unit Cost", unit: "₹", role: "System Inputs form / wire prices." },
  acCable2Brand: { label: "AC Cable (Inv–ACDB) Brand", role: "System Inputs form." },
  acCable2UnitCost: { label: "AC Cable (Inv–ACDB) Unit Cost", unit: "₹", role: "System Inputs form / wire prices." },
};

const BOS_LABELS: Record<string, string> = Object.fromEntries(BOS_ITEM_DEFS.map((d) => [d.key, d.label]));
/** Text values compared in rules, spelled out. */
const VALUE_LABELS: Record<string, string> = { NA: "Not applicable (NA)", "3-Phase": "3-phase", None: "None" };

export const refLabel = (k: string) => QUANTITY_NAMES[k]?.label ?? `Unnamed value (${k})`;
export const inputLabel = (k: string) => INPUT_NAMES[k]?.label ?? `Unnamed input (${k})`;
const bosLabel = (k: string) => BOS_LABELS[k] ?? `Unnamed Price DB item (${k})`;

const DCDB_FIELDS: Record<string, string> = { spd: "SPD count", voltage: "voltage rating", price: "price" };
const ACDB_FIELDS: Record<string, string> = { spec: "specification", price: "price" };

/** `{ calc }` calls, described with their (already described) arguments. */
function describeCalc(e: Extract<Expr, { calc: string }>): string {
  const a = e.args.map((x) => d(x, 0));
  switch (e.calc) {
    case "earthingPits": return `earthing pit rule (2 × ${a[0]} + 1; +2 for ESE, −1 for NA, 0 with no inverters)`;
    case "earthingType": return `${a[0]} (blank counts as ESE)`;
    case "dcCableSize": return `DC cable size for ${a[0]}`;
    case "acdb": return `ACDB ${ACDB_FIELDS[e.field ?? ""] ?? e.field} from the Price DB for ${a[0]} and ${a[1]}`;
    case "dcdb": return `DCDB ${DCDB_FIELDS[e.field ?? ""] ?? e.field} from the Price DB for ${a[0]} and ${a[1]}`;
    case "inputOr": return `${a[0]} (${a[1]} if blank)`;
    case "structureLabel": return `${a[0]} name`;
  }
  return `calculation “${e.calc}”(${a.join(", ")})`;
}

// Precedence: 0 = conditional (always parenthesised when nested), 1 = + −, 2 = × ÷, 3 = atom.
const wrap = (s: string, own: number, parent: number) => (own < parent ? `(${s})` : s);
const isNumLit = (e: Expr) => "lit" in e && typeof e.lit === "number";

function d(e: Expr, parent: number): string {
  if ("lit" in e) return typeof e.lit === "number" ? String(e.lit) : `“${VALUE_LABELS[e.lit] ?? e.lit}”`;
  if ("input" in e) return e.as === "int" ? `${inputLabel(e.input)} (whole number)` : inputLabel(e.input);
  if ("ref" in e) return refLabel(e.ref);
  if ("calc" in e) return describeCalc(e);
  if ("bos" in e) return `Price DB rate for ${bosLabel(e.bos)}`;
  if ("bosName" in e) return bosLabel(e.bosName);
  switch (e.op) {
    case "add": return wrap(`${d(e.args[0], 1)} + ${d(e.args[1], 1)}`, 1, parent);
    case "sub": return wrap(`${d(e.args[0], 1)} − ${d(e.args[1], 2)}`, 1, parent);
    case "mul": {
      // Display only: put a constant factor first ("2 × Solar Module Quantity").
      const [x, y] = isNumLit(e.args[1]) && !isNumLit(e.args[0]) ? [e.args[1], e.args[0]] : e.args;
      return wrap(`${d(x, 2)} × ${d(y, 2)}`, 2, parent);
    }
    case "div": return wrap(`${d(e.args[0], 2)} ÷ ${d(e.args[1], 3)}`, 2, parent);
    case "or": return `${d(e.args[0], 3)} (${d(e.args[1], 3)} if not set)`;
    case "ceil": return `round up (${d(e.arg, 0)})`;
    case "trunc": return `whole number of (${d(e.arg, 0)})`;
    case "round": return `round (${d(e.arg, 0)})`;
    case "if": return wrap(`${d(e.then, 1)} if ${dc(e.cond)}, otherwise ${d(e.else, 1)}`, 0, parent);
    case "concat": return e.parts.map((p) => describeText(p)).join("");
  }
  return "Unrecognised rule";
}

function dc(k: Cond): string {
  switch (k.op) {
    case "gt": return `${d(k.args[0], 1)} is more than ${d(k.args[1], 1)}`;
    case "lt": return `${d(k.args[0], 1)} is less than ${d(k.args[1], 1)}`;
    case "eq": return `${d(k.args[0], 1)} is ${d(k.args[1], 1)}`;
    case "ne": return `${d(k.args[0], 1)} is not ${d(k.args[1], 1)}`;
    case "and": return k.all.map(dc).join(" and ");
    case "truthy": return `${d(k.arg, 1)} is set`;
  }
  return "unrecognised condition";
}

/** A quantity / cost rule in business words. The rule itself is unchanged. */
export const describeExpr = (e: Expr): string => d(e, 0);

/** A text rule (line name / spec) as display text: literals verbatim, other parts described. */
export function describeText(e: Expr): string {
  if ("lit" in e) return String(e.lit);
  if ("bosName" in e) return bosLabel(e.bosName);
  if ("op" in e && e.op === "concat") return e.parts.map(describeText).join("");
  return `[${describeExpr(e)}]`;
}

/** Quantities and form inputs a rule reads directly (not through other quantities). */
export function namesIn(e: Expr, out = { refs: new Set<string>(), inputs: new Set<string>() }) {
  const walkCond = (k: Cond) => ("all" in k ? k.all.forEach(walkCond) : "arg" in k ? namesIn(k.arg, out) : k.args.forEach((a) => namesIn(a, out)));
  if ("ref" in e) out.refs.add(e.ref);
  else if ("input" in e) out.inputs.add(e.input);
  else if ("calc" in e) e.args.forEach((a) => namesIn(a, out));
  else if ("op" in e) {
    if ("args" in e) e.args.forEach((a) => namesIn(a, out));
    else if ("arg" in e) namesIn(e.arg, out);
    else if ("parts" in e) e.parts.forEach((p) => namesIn(p, out));
    else { walkCond(e.cond); namesIn(e.then, out); namesIn(e.else, out); }
  }
  return out;
}

/** Every key in a definition that has no business name yet (audit; [] = fully named). */
export function unnamedKeys(def: TemplateDefinition): string[] {
  const all = { refs: new Set<string>(), inputs: new Set<string>() };
  def.quantities.forEach((q) => { all.refs.add(q.key); namesIn(q.expr, all); });
  def.items.forEach((it) => [it.qty, it.unitCost, it.name, it.spec, it.make].forEach((e) => namesIn(e, all)));
  return [...[...all.refs].filter((k) => !QUANTITY_NAMES[k]), ...[...all.inputs].filter((k) => !INPUT_NAMES[k]).map((k) => `input:${k}`)];
}
