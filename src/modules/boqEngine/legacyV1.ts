// src/modules/boqEngine/legacyV1.ts
// legacy-v1: today's calcBOQ() (calculations.ts) expressed as template data.
//
// This is a faithful TRANSCRIPTION, not a correction. Every quantity, text
// and operator order mirrors calcBOQ line for line — including the known
// fixes approved on 2026-10-05 (D1 anchor bolts from typed legs, D2 DC cable
// cores = 2, D3 DC cable length × strings, editable cable spares). legacyParity.test.ts proves runTemplate(LEGACY_V1) equals
// calcBOQ() exactly; if you change calcBOQ, this file and that test must
// change together.
//
// The `B..`, `S53`, `R53`, `J46` names are calcBOQ's own variable names
// (which in turn borrow workbook cell addresses), kept so the two files can
// be read side by side.

import type { Cond, Expr, TemplateDefinition, TemplateItem } from "./ruleEngine";

// Tiny builders — they only produce JSON, the definition below is plain data.
const L = (lit: number | string): Expr => ({ lit });
const IN = (input: string): Expr => ({ input });
const N = (input: string): Expr => ({ input, as: "num" });
const I = (input: string): Expr => ({ input, as: "int" });
const R = (ref: string): Expr => ({ ref });
const add = (a: Expr, b: Expr): Expr => ({ op: "add", args: [a, b] });
const mul = (a: Expr, b: Expr): Expr => ({ op: "mul", args: [a, b] });
const div = (a: Expr, b: Expr): Expr => ({ op: "div", args: [a, b] });
const or = (a: Expr, b: Expr): Expr => ({ op: "or", args: [a, b] });
const ceil = (arg: Expr): Expr => ({ op: "ceil", arg });
const iff = (cond: Cond, then: Expr, els: Expr): Expr => ({ op: "if", cond, then, else: els });
const cat = (...parts: (Expr | string)[]): Expr => ({ op: "concat", parts: parts.map((p) => (typeof p === "string" ? L(p) : p)) });
const gt = (a: Expr, b: Expr): Cond => ({ op: "gt", args: [a, b] });
const lt = (a: Expr, b: Expr): Cond => ({ op: "lt", args: [a, b] });
const eq = (a: Expr, b: Expr): Cond => ({ op: "eq", args: [a, b] });
const ne = (a: Expr, b: Expr): Cond => ({ op: "ne", args: [a, b] });
const and = (...all: Cond[]): Cond => ({ op: "and", all });
const truthy = (arg: Expr): Cond => ({ op: "truthy", arg });
const bos = (key: string): Expr => ({ bos: key });
const bn = (key: string): Expr => ({ bosName: key });
const inputOr = (input: string, d: number): Expr => ({ calc: "inputOr", args: [IN(input), L(d)] });
const ZERO = L(0);
const B7or0 = or(R("B7"), ZERO);
const laIs = (t: string) => eq(R("laType"), L(t));
const hasBattery = and(truthy(IN("batteryMake")), ne(IN("batteryMake"), L("None")));

const quantities: { key: string; expr: Expr }[] = [
  { key: "B1", expr: N("capacity") },
  { key: "B2", expr: N("panelPriceWp") },
  { key: "B3", expr: N("panelWp") },
  { key: "B4", expr: iff(eq(IN("phase"), L("3-Phase")), L(3), L(1)) },
  { key: "B5", expr: I("buildingFloors") },
  { key: "B6", expr: I("inverterFloor") },
  { key: "B7", expr: I("numInverters") },
  { key: "B9", expr: I("panelRows") },
  // Earthing pits are derived, never read from inp.earthingPits (earthingRules.ts).
  { key: "B21", expr: { calc: "earthingPits", args: [IN("numInverters"), IN("laType")] } },
  { key: "B32", expr: I("numStrings") },
  { key: "B15", expr: I("numBatteries") },
  { key: "batP", expr: N("batteryUnitCost") },
  { key: "B22", expr: iff(gt(R("B3"), ZERO), ceil(div(mul(R("B1"), L(1000)), R("B3"))), ZERO) },
  { key: "B23", expr: iff(gt(R("B9"), ZERO), div(R("B22"), R("B9")), ZERO) },
  { key: "B30", expr: iff(gt(R("B32"), ZERO), mul(L(49.82), div(R("B22"), R("B32"))), ZERO) },
  { key: "B33", expr: mul(R("B32"), L(4)) },
  { key: "B16", expr: iff(and(gt(R("B7"), ZERO), gt(R("B9"), ZERO)), mul(ceil(add(mul(R("B23"), L(1.2)), mul(R("B9"), L(2.3)))), R("B32")), ZERO) },
  { key: "B17", expr: iff(gt(R("B7"), ZERO), mul(ceil(mul(add(R("B6"), L(1)), L(3.5))), R("B7")), ZERO) },
  { key: "B18", expr: iff(gt(R("B7"), ZERO), mul(ceil(add(mul(add(R("B5"), L(2)), L(3.5)), L(5))), R("B7")), ZERO) },
  { key: "B19", expr: iff(gt(R("B7"), ZERO), mul(ceil(add(mul(R("B6"), L(3.5)), L(5))), R("B7")), ZERO) },
  { key: "B20", expr: ceil(add(mul(add(R("B5"), L(1)), L(3.5)), L(10))) },
  { key: "B46", expr: iff(and(gt(R("B30"), ZERO), gt(R("B32"), ZERO)), mul(div(div(mul(R("B3"), R("B22")), R("B30")), R("B32")), L(1.5)), ZERO) },
  { key: "dcSz", expr: { calc: "dcCableSize", args: [R("B46")] } },
  { key: "B37", expr: iff(eq(R("B4"), L(3)), L(4), L(2)) },
  { key: "B35", expr: L(2) },
  { key: "legs", expr: { op: "trunc", arg: inputOr("structureLegs", 0) } },
  { key: "J46", expr: mul(R("legs"), L(2)) },
  { key: "dcSpare", expr: inputOr("dcSpareM", 15) },
  { key: "acSpare", expr: inputOr("acSpareM", 40) },
  { key: "earthSpare", expr: inputOr("earthSpareM", 40) },
  { key: "acdbSpec", expr: { calc: "acdb", args: [IN("capacity"), IN("phase")], field: "spec" } },
  { key: "acdbPrice", expr: { calc: "acdb", args: [IN("capacity"), IN("phase")], field: "price" } },
  { key: "dcdbSpd", expr: { calc: "dcdb", args: [IN("numStrings"), R("B30")], field: "spd" } },
  { key: "dcdbVoltage", expr: { calc: "dcdb", args: [IN("numStrings"), R("B30")], field: "voltage" } },
  { key: "dcdbPrice", expr: { calc: "dcdb", args: [IN("numStrings"), R("B30")], field: "price" } },
  { key: "laType", expr: { calc: "earthingType", args: [IN("laType")] } },
  { key: "dc16", expr: add(R("B16"), R("dcSpare")) },
  { key: "condQ", expr: mul(ceil(div(add(add(R("dc16"), add(R("B18"), R("earthSpare"))), add(R("B19"), R("earthSpare"))), L(3))), L(3)) },
];

type Row = [sr: number, group: string, name: Expr | string, spec: Expr | string, make: Expr | string, unit: string, qty: Expr, unitCost: Expr];
const t = (x: Expr | string): Expr => (typeof x === "string" ? L(x) : x);
const ME = "Main Equipment", PD = "Protection Devices", DC = "DC Side", AC = "AC Side", EL = "Earthing & Lightning";
const LT = "Lugs & Terminals", HW = "Hardware", CA = "Conduit & Accessories", ST = "Structure", OS = "Optional / Special";

const rows: Row[] = [
  [1, ME, "Solar Module", cat(or(R("B3"), L("—")), " Wp Mono Perc ", or(IN("panelType"), L("DCR"))), or(IN("panelBrand"), L("As selected")), "Nos.", R("B22"), mul(R("B2"), R("B3"))],
  [2, ME, "Solar Inverter", cat(or(R("B1"), L("—")), " kW String Inverter"), or(IN("inverterBrand"), L("As selected")), "Nos.", R("B7"), N("inverterUnitCost")],
  [3, ME, "Data Logger", "Ethernet/WiFi/GPRS", "As per inverter brand", "Nos.", ZERO, ZERO],
  [4, ME, "Battery", iff(hasBattery, cat(or(IN("batteryAh"), ZERO), "Ah ", or(IN("batteryV"), ZERO), "V ", or(IN("batteryType"), L(""))), L("-")), iff(hasBattery, IN("batteryMake"), L("-")), "Nos.", R("B15"), R("batP")],
  [5, PD, "DCDB", cat(R("dcdbSpd"), "IN/", R("dcdbSpd"), "OUT IP66 DC SPD ", R("dcdbVoltage"), "V"), "Whole Solar / ABB", "Nos.", B7or0, R("dcdbPrice")],
  [6, PD, "ACDB", or(R("acdbSpec"), L("Standard")), "Whole Solar / ABB", "Nos.", L(1), or(R("acdbPrice"), L(1200))],
  [7, PD, bn("mcb"), "32A 2P OC/SC/EF", "ABB / L&T", "Nos.", L(1), bos("mcb")],
  [8, DC, bn("dcCable"), cat("2C×", R("dcSz"), " XLPO EN50618 FRLS"), or(IN("dcCableBrand"), L("Polycab")), "MTS", R("dc16"), or(N("dcCableUnitCost"), bos("dcCable"))],
  [9, DC, bn("mc4"), "4sq.mm 1000V DC IP68", "Elmex", "Pair", R("B33"), bos("mc4")],
  [10, AC, cat(bn("acCable"), " (Inv–Meter–DB)"), cat("1.1kV Al.XLPE ", R("B37"), "C×4sq.mm FRLS Armoured"), or(IN("acCableBrand"), L("Polycab")), "MTS", add(R("B17"), R("acSpare")), or(N("acCableUnitCost"), bos("acCable"))],
  [11, AC, "AC Cable (Inv–ACDB)", "3C×4sq.mm Cu Flexible", or(IN("acCable2Brand"), L("Polycab")), "MTS", mul(L(5), B7or0), N("acCable2UnitCost")],
  [12, EL, bn("la"), iff(laIs("Conventional"), L("Conventional LA (Franklin rod)"), iff(laIs("NA"), L("Not applicable"), L("ESE 25sq.mm 3M CPRI 70kA"))), iff(laIs("ESE"), L("Vasudha/Jenflex"), iff(laIs("NA"), L("-"), L("Standard"))), "Nos.", iff(laIs("NA"), ZERO, L(1)), iff(laIs("ESE"), bos("la"), ZERO)],
  [13, EL, cat(bn("earthCable6"), " — Structure"), "Cu FRLS 1C×6sq.mm IS694", "Polycab", "MTS", add(R("B18"), R("earthSpare")), bos("earthCable6")],
  [14, EL, cat(bn("earthCable6"), " — Inverter"), "Cu FRLS 1C×6sq.mm IS694", "Polycab", "MTS", add(R("B19"), R("earthSpare")), bos("earthCable6")],
  [15, EL, cat(bn("earthCable25"), " — LA"), "Cu FRLS 1C×25sq.mm IS694", "Polycab", "MTS", iff(laIs("NA"), ZERO, add(R("B20"), R("earthSpare"))), bos("earthCable25")],
  [16, EL, bn("earthPit"), "Chemical IS3043 17.2mm Cu-rod", "Standard", "Nos.", R("B21"), bos("earthPit")],
  [17, LT, bn("lugCuRing6"), "Panel-panel earthing", "Standard", "Nos.", mul(R("B22"), L(2)), bos("lugCuRing6")],
  [18, LT, bn("lugCuPin6"), "Inverter earthing", "Standard", "Nos.", mul(B7or0, L(2)), bos("lugCuPin6")],
  [19, LT, bn("lugAlRing16"), "LA earthing", "Standard", "Nos.", add(R("B21"), L(1)), bos("lugAlRing16")],
  [20, LT, cat(bn("lugCuRing4"), " (Long Barrel)"), "ACDB & DCDB input", "Standard", "Nos.", add(mul(R("B35"), L(2)), mul(R("B37"), L(2))), bos("lugCuRing4")],
  [21, LT, bn("gland"), "Cable entries", "Hummel", "Nos.", ZERO, bos("gland")],
  [22, HW, bn("anchorBolt"), "For base plates", "Standard", "Nos.", mul(R("J46"), L(4)), bos("anchorBolt")],
  [23, HW, bn("nutBolt"), "Inverter earthing", "Standard", "Nos.", mul(B7or0, L(6)), bos("nutBolt")],
  [24, HW, bn("jBolt"), "Site specific", "SS-304", "Nos.", ZERO, bos("jBolt")],
  [25, HW, bn("uClamp"), "Panel mounting", "Standard", "Nos.", iff(gt(R("B22"), ZERO), ceil(mul(R("B22"), L(1.5))), ZERO), bos("uClamp")],
  [26, HW, bn("zClamp"), "Panel mounting", "Standard", "Nos.", iff(gt(R("B22"), ZERO), ceil(mul(R("B22"), L(2))), ZERO), bos("zClamp")],
  [27, CA, bn("conduit"), "UV resistant", "Tiger/Apollo", "MTS", R("condQ"), bos("conduit")],
  [28, CA, bn("teeBend"), "Conduit routing", "Standard", "Nos.", ceil(div(R("condQ"), L(2))), bos("teeBend")],
  [29, CA, bn("cableTag"), "2C×6sq.mm Cu", "Standard", "Nos.", add(add(R("B37"), mul(R("B35"), L(2))), L(2)), bos("cableTag")],
  [30, CA, bn("ferrule"), "1–2 string", "Standard", "Set", R("B32"), bos("ferrule")],
  [31, CA, bn("tape"), "R,Y,B,Black,Green", "3M", "Nos.", L(6), bos("tape")],
  [32, CA, bn("cableTie"), "300×4.8mm", "Standard", "Pkt", L(1), bos("cableTie")],
  [33, ST, bn("bracing"), "GI 80 microns ISI", "Standard", "MTS", iff(gt(R("B1"), ZERO), L(18), ZERO), bos("bracing")],
  [34, ST, bn("walkway"), "Access walkway", "Standard", "MTS", iff(gt(R("B1"), ZERO), L(5), ZERO), bos("walkway")],
  [35, ST, bn("alStructure"), or({ calc: "structureLabel", args: [IN("structureType")] }, L("Flush Mount")), "Standard", "kW", R("B1"), bos("alStructure")],
  [36, OS, bn("birdSpike"), "Anti-bird", "Standard", "MTS", ZERO, bos("birdSpike")],
  [37, OS, bn("parnali"), "Rainwater mgmt", "Standard", "Nos.", ZERO, bos("parnali")],
  [38, OS, bn("sprinkler"), "Auto cleaning", "Standard", "kW", ZERO, bos("sprinkler")],
];

const items: TemplateItem[] = rows.map(([sr, group, name, spec, make, unit, qty, unitCost]) => ({
  key: String(sr), sr, group, name: t(name), spec: t(spec), make: t(make), unit, qty, unitCost,
}));

export const LEGACY_V1: TemplateDefinition = {
  id: "legacy-v1",
  quantities,
  items,
  customCatalogueItems: { startSr: 39, spec: "User added (Price Database tab)", make: "Standard", defaultGroup: "Optional / Special", defaultName: "Custom Item", defaultUnit: "/Nos." },
};
