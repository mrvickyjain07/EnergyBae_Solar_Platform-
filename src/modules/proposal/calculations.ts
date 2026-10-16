// Proposal Maker — BOQ pricing engine.
// Formulas ported 1:1 from the reference energybae_boq_v2.html tool's
// calcBOQ()/getACDB()/getDCDB()/getDCSize() functions — this is an exact
// structural-engineering + electrical-BOM sizing formula set, not something
// to redesign. Only the surrounding types/inputs were reshaped to fit the
// app's TypeScript module conventions. (Inverter catalogue lookup used to
// live here as getInvPrice()/resolveInverterUnitCost() — it moved to the
// dedicated inverter_prices table + matchInverter.ts, see
// supabase/migrations/0006_inverter_prices.sql; calcBOQ itself still just
// reads inp.inverterUnitCost/inp.numInverters as plain resolved numbers.)

import { BOQItem, BOQOverrides, Catalogue, PricingSummary, ProposalInputs } from "./types";
import { BOS_ITEM_DEFS, LOCALSTORAGE_COUNTER_KEY } from "./defaultCatalogue";
import { sanitizePrice } from "./sanitizePrice";
import { computeEarthingPits, normalizeEarthingType } from "./earthingRules";
import { structureTypeLabel } from "./structureTypes";

// Fallback labels for when a Catalogue is constructed without bosNames
// (e.g. an older cached copy that predates the field).
const BOS_LABEL_FALLBACK: Partial<Record<keyof Catalogue["bos"], string>> = Object.fromEntries(
  BOS_ITEM_DEFS.map((d) => [d.key, d.label])
);

const n = (v: number | ""): number => (v === "" ? 0 : v);

export function getACDB(cat: Catalogue, cap: number | "", phase: ProposalInputs["phase"]): { spec: string; price: number } {
  const ph = phase === "3-Phase" ? 3 : 1;
  const c = n(cap);
  const rows = cat.acdb.filter((r) => r.phase === ph && c >= r.capMin && c <= r.capMax);
  if (!rows.length) return { spec: "Standard", price: 1200 };
  return rows.sort((a, b) => a.price - b.price)[0];
}

export function getDCDB(cat: Catalogue, strings: number | "", vStr: number): { spd: number; io: string; voltage: number; price: number } {
  const s = strings === "" ? 1 : Math.trunc(strings) || 1;
  const v = vStr || 0;
  const voltage = v > 600 ? 1000 : 600;
  const io = s <= 1 ? "1/1" : s <= 2 ? "2/2" : s <= 3 ? "3/3" : s <= 4 ? "4/4" : "6/6";
  return cat.dcdb.find((r) => r.io === io && r.voltage >= voltage) || { spd: 1, io: "1/1", voltage: 600, price: 1800 };
}

export function getDCSize(cur: number): string {
  if (cur <= 24) return "1.5 sq.mm";
  if (cur <= 33) return "2.5 sq.mm";
  if (cur <= 44) return "4 sq.mm";
  if (cur <= 57) return "6 sq.mm";
  return "10 sq.mm";
}

/** Optional per-quote input: blank / missing (older proposals) → the default, so a typed 0 still means 0. */
export const inputOr = (v: number | "" | undefined, d: number): number => (v === "" || v === undefined ? d : v);

export function calcBOQ(inp: ProposalInputs, cat: Catalogue, ov: BOQOverrides): BOQItem[] {
  const B1 = n(inp.capacity);
  const B2 = n(inp.panelPriceWp);
  const B3 = n(inp.panelWp);
  const B4 = inp.phase === "3-Phase" ? 3 : 1;
  const B5 = Math.trunc(n(inp.buildingFloors));
  const B6 = Math.trunc(n(inp.inverterFloor));
  const B7 = Math.trunc(n(inp.numInverters));
  const B9 = Math.trunc(n(inp.panelRows));
  // Earthing pits are DERIVED (inverter count + earthing/LA type), never
  // taken from inp.earthingPits — see earthingRules.ts. Still overridable per
  // quote via the BOQ row's qty override (o(16, …) below).
  const B21 = computeEarthingPits(inp.numInverters, inp.laType);
  const B32 = Math.trunc(n(inp.numStrings));
  const B15 = Math.trunc(n(inp.numBatteries));
  const batP = n(inp.batteryUnitCost);

  const B22 = B3 > 0 ? Math.ceil((B1 * 1000) / B3) : 0;
  const B23 = B9 > 0 ? B22 / B9 : 0;
  const B30 = B32 > 0 ? 49.82 * (B22 / B32) : 0;
  const B33 = B32 * 4;
  const B16 = B7 > 0 && B9 > 0 ? Math.ceil(B23 * 1.2 + B9 * 2.3) * B32 : 0; // × strings, as the workbooks (was × inverters, defect D3)
  const B17 = B7 > 0 ? Math.ceil((B6 + 1) * 3.5) * B7 : 0;
  const B18 = B7 > 0 ? Math.ceil((B5 + 2) * 3.5 + 5) * B7 : 0;
  const B19 = B7 > 0 ? Math.ceil(B6 * 3.5 + 5) * B7 : 0;
  const B20 = Math.ceil((B5 + 1) * 3.5 + 10);
  const B46 = B30 > 0 && B32 > 0 ? ((B3 * B22) / B30 / B32) * 1.5 : 0;
  const dcSz = getDCSize(B46);
  const B37 = B4 === 3 ? 4 : 2;
  const B35 = 2; // DC cable cores, as the workbooks (was the DC-MCB count, defect D2)
  // Structure legs are typed per project, as in the workbooks' hand-filled leg
  // sub-table; 2 base plates per leg, 4 anchor bolts per plate (defect D1 fixed
  // 2026-10-05 — was the rounded structure length used as the leg count).
  const legs = Math.trunc(inputOr(inp.structureLegs, 0));
  const J46 = legs * 2;
  // Spare cable metres, typed per project in the workbooks; blank = the old fixed spares.
  const dcSpare = inputOr(inp.dcSpareM, 15);
  const acSpare = inputOr(inp.acSpareM, 40);
  const earthSpare = inputOr(inp.earthSpareM, 40);

  const acR = getACDB(cat, inp.capacity, inp.phase);
  const dcR = getDCDB(cat, inp.numStrings, B30);
  const b = cat.bos;
  // Item name for a given BOS key — reflects the editable name from the
  // Price Database's "BOS Item Prices" section so a rename there updates
  // this BOQ line's description (Excel/Word exports read `name` from here).
  const bn = (k: keyof Catalogue["bos"]) => cat.bosNames?.[k] || BOS_LABEL_FALLBACK[k] || k;
  const o = (k: string | number, d: number) => (ov[k] !== undefined ? ov[k] : d);
  const laType = normalizeEarthingType(inp.laType);
  const dc16 = B16 + dcSpare;
  const condQ = Math.ceil((dc16 + (B18 + earthSpare) + (B19 + earthSpare)) / 3) * 3;

  const items: BOQItem[] = [
    { sr: 1, group: "Main Equipment", name: "Solar Module", spec: `${B3 || "—"} Wp Mono Perc ${inp.panelType || "DCR"}`, make: inp.panelBrand || "As selected", unit: "Nos.", qty: o(1, B22), unitCost: o("c1", B2 * B3), price: 0 },
    { sr: 2, group: "Main Equipment", name: "Solar Inverter", spec: `${B1 || "—"} kW String Inverter`, make: inp.inverterBrand || "As selected", unit: "Nos.", qty: o(2, B7), unitCost: o("c2", n(inp.inverterUnitCost)), price: 0 },
    { sr: 3, group: "Main Equipment", name: "Data Logger", spec: "Ethernet/WiFi/GPRS", make: "As per inverter brand", unit: "Nos.", qty: o(3, 0), unitCost: o("c3", 0), price: 0 },
    { sr: 4, group: "Main Equipment", name: "Battery", spec: inp.batteryMake && inp.batteryMake !== "None" ? `${inp.batteryAh || 0}Ah ${inp.batteryV || 0}V ${inp.batteryType || ""}` : "-", make: inp.batteryMake && inp.batteryMake !== "None" ? inp.batteryMake : "-", unit: "Nos.", qty: o(4, B15), unitCost: o("c4", batP), price: 0 },
    { sr: 5, group: "Protection Devices", name: "DCDB", spec: `${dcR.spd}IN/${dcR.spd}OUT IP66 DC SPD ${dcR.voltage}V`, make: "Whole Solar / ABB", unit: "Nos.", qty: o(5, B7 || 0), unitCost: o("c5", dcR.price), price: 0 },
    { sr: 6, group: "Protection Devices", name: "ACDB", spec: acR.spec || "Standard", make: "Whole Solar / ABB", unit: "Nos.", qty: o(6, 1), unitCost: o("c6", acR.price || 1200), price: 0 },
    { sr: 7, group: "Protection Devices", name: bn("mcb"), spec: "32A 2P OC/SC/EF", make: "ABB / L&T", unit: "Nos.", qty: o(7, 1), unitCost: o("c7", b.mcb), price: 0 },
    { sr: 8, group: "DC Side", name: bn("dcCable"), spec: `2C×${dcSz} XLPO EN50618 FRLS`, make: inp.dcCableBrand || "Polycab", unit: "MTS", qty: o(8, dc16), unitCost: o("c8", n(inp.dcCableUnitCost) || b.dcCable), price: 0 },
    { sr: 9, group: "DC Side", name: bn("mc4"), spec: "4sq.mm 1000V DC IP68", make: "Elmex", unit: "Pair", qty: o(9, B33), unitCost: o("c9", b.mc4), price: 0 },
    { sr: 10, group: "AC Side", name: `${bn("acCable")} (Inv–Meter–DB)`, spec: `1.1kV Al.XLPE ${B37}C×4sq.mm FRLS Armoured`, make: inp.acCableBrand || "Polycab", unit: "MTS", qty: o(10, B17 + acSpare), unitCost: o("c10", n(inp.acCableUnitCost) || b.acCable), price: 0 },
    { sr: 11, group: "AC Side", name: "AC Cable (Inv–ACDB)", spec: "3C×4sq.mm Cu Flexible", make: inp.acCable2Brand || "Polycab", unit: "MTS", qty: o(11, 5 * (B7 || 0)), unitCost: o("c11", n(inp.acCable2UnitCost)), price: 0 },
    // LA type (Building & Installation). Blank = ESE, the original row, so
    // proposals saved before this field existed price exactly as before.
    // Conventional has no catalogue price (b.la is the ESE unit) — its rate
    // is left at 0 for the office to enter rather than guessed. NA = no LA.
    { sr: 12, group: "Earthing & Lightning", name: bn("la"), spec: laType === "Conventional" ? "Conventional LA (Franklin rod)" : laType === "NA" ? "Not applicable" : "ESE 25sq.mm 3M CPRI 70kA", make: laType === "ESE" ? "Vasudha/Jenflex" : laType === "NA" ? "-" : "Standard", unit: "Nos.", qty: o(12, laType === "NA" ? 0 : 1), unitCost: o("c12", laType === "ESE" ? b.la : 0), price: 0 },
    { sr: 13, group: "Earthing & Lightning", name: `${bn("earthCable6")} — Structure`, spec: "Cu FRLS 1C×6sq.mm IS694", make: "Polycab", unit: "MTS", qty: o(13, B18 + earthSpare), unitCost: o("c13", b.earthCable6), price: 0 },
    { sr: 14, group: "Earthing & Lightning", name: `${bn("earthCable6")} — Inverter`, spec: "Cu FRLS 1C×6sq.mm IS694", make: "Polycab", unit: "MTS", qty: o(14, B19 + earthSpare), unitCost: o("c14", b.earthCable6), price: 0 },
    { sr: 15, group: "Earthing & Lightning", name: `${bn("earthCable25")} — LA`, spec: "Cu FRLS 1C×25sq.mm IS694", make: "Polycab", unit: "MTS", qty: o(15, laType === "NA" ? 0 : B20 + earthSpare), unitCost: o("c15", b.earthCable25), price: 0 },
    { sr: 16, group: "Earthing & Lightning", name: bn("earthPit"), spec: "Chemical IS3043 17.2mm Cu-rod", make: "Standard", unit: "Nos.", qty: o(16, B21), unitCost: o("c16", b.earthPit), price: 0 },
    { sr: 17, group: "Lugs & Terminals", name: bn("lugCuRing6"), spec: "Panel-panel earthing", make: "Standard", unit: "Nos.", qty: o(17, B22 * 2), unitCost: o("c17", b.lugCuRing6), price: 0 },
    { sr: 18, group: "Lugs & Terminals", name: bn("lugCuPin6"), spec: "Inverter earthing", make: "Standard", unit: "Nos.", qty: o(18, (B7 || 0) * 2), unitCost: o("c18", b.lugCuPin6), price: 0 },
    { sr: 19, group: "Lugs & Terminals", name: bn("lugAlRing16"), spec: "LA earthing", make: "Standard", unit: "Nos.", qty: o(19, B21 + 1), unitCost: o("c19", b.lugAlRing16), price: 0 },
    { sr: 20, group: "Lugs & Terminals", name: `${bn("lugCuRing4")} (Long Barrel)`, spec: "ACDB & DCDB input", make: "Standard", unit: "Nos.", qty: o(20, B35 * 2 + B37 * 2), unitCost: o("c20", b.lugCuRing4), price: 0 },
    { sr: 21, group: "Lugs & Terminals", name: bn("gland"), spec: "Cable entries", make: "Hummel", unit: "Nos.", qty: o(21, 0), unitCost: o("c21", b.gland), price: 0 },
    { sr: 22, group: "Hardware", name: bn("anchorBolt"), spec: "For base plates", make: "Standard", unit: "Nos.", qty: o(22, J46 * 4), unitCost: o("c22", b.anchorBolt), price: 0 },
    { sr: 23, group: "Hardware", name: bn("nutBolt"), spec: "Inverter earthing", make: "Standard", unit: "Nos.", qty: o(23, (B7 || 0) * 6), unitCost: o("c23", b.nutBolt), price: 0 },
    { sr: 24, group: "Hardware", name: bn("jBolt"), spec: "Site specific", make: "SS-304", unit: "Nos.", qty: o(24, 0), unitCost: o("c24", b.jBolt), price: 0 },
    { sr: 25, group: "Hardware", name: bn("uClamp"), spec: "Panel mounting", make: "Standard", unit: "Nos.", qty: o(25, B22 > 0 ? Math.ceil(B22 * 1.5) : 0), unitCost: o("c25", b.uClamp), price: 0 },
    { sr: 26, group: "Hardware", name: bn("zClamp"), spec: "Panel mounting", make: "Standard", unit: "Nos.", qty: o(26, B22 > 0 ? Math.ceil(B22 * 2) : 0), unitCost: o("c26", b.zClamp), price: 0 },
    { sr: 27, group: "Conduit & Accessories", name: bn("conduit"), spec: "UV resistant", make: "Tiger/Apollo", unit: "MTS", qty: o(27, condQ), unitCost: o("c27", b.conduit), price: 0 },
    { sr: 28, group: "Conduit & Accessories", name: bn("teeBend"), spec: "Conduit routing", make: "Standard", unit: "Nos.", qty: o(28, Math.ceil(condQ / 2)), unitCost: o("c28", b.teeBend), price: 0 },
    { sr: 29, group: "Conduit & Accessories", name: bn("cableTag"), spec: "2C×6sq.mm Cu", make: "Standard", unit: "Nos.", qty: o(29, B37 + B35 * 2 + 2), unitCost: o("c29", b.cableTag), price: 0 },
    { sr: 30, group: "Conduit & Accessories", name: bn("ferrule"), spec: "1–2 string", make: "Standard", unit: "Set", qty: o(30, B32), unitCost: o("c30", b.ferrule), price: 0 },
    { sr: 31, group: "Conduit & Accessories", name: bn("tape"), spec: "R,Y,B,Black,Green", make: "3M", unit: "Nos.", qty: o(31, 6), unitCost: o("c31", b.tape), price: 0 },
    { sr: 32, group: "Conduit & Accessories", name: bn("cableTie"), spec: "300×4.8mm", make: "Standard", unit: "Pkt", qty: o(32, 1), unitCost: o("c32", b.cableTie), price: 0 },
    { sr: 33, group: "Structure", name: bn("bracing"), spec: "GI 80 microns ISI", make: "Standard", unit: "MTS", qty: o(33, B1 > 0 ? 18 : 0), unitCost: o("c33", b.bracing), price: 0 },
    { sr: 34, group: "Structure", name: bn("walkway"), spec: "Access walkway", make: "Standard", unit: "MTS", qty: o(34, B1 > 0 ? 5 : 0), unitCost: o("c34", b.walkway), price: 0 },
    { sr: 35, group: "Structure", name: bn("alStructure"), spec: structureTypeLabel(inp.structureType) || "Flush Mount", make: "Standard", unit: "kW", qty: o(35, B1), unitCost: o("c35", b.alStructure), price: 0 },
    { sr: 36, group: "Optional / Special", name: bn("birdSpike"), spec: "Anti-bird", make: "Standard", unit: "MTS", qty: o(36, 0), unitCost: o("c36", b.birdSpike), price: 0 },
    { sr: 37, group: "Optional / Special", name: bn("parnali"), spec: "Rainwater mgmt", make: "Standard", unit: "Nos.", qty: o(37, 0), unitCost: o("c37", b.parnali), price: 0 },
    { sr: 38, group: "Optional / Special", name: bn("sprinkler"), spec: "Auto cleaning", make: "Standard", unit: "kW", qty: o(38, 0), unitCost: o("c38", b.sprinkler), price: 0 },
  ];

  (cat.customBOS || []).forEach((ci, idx) => {
    const sr = 39 + idx;
    items.push({
      sr,
      // Custom items are added from within a category in the BOQ workspace;
      // rows saved before that shipped carry no group and keep their original
      // home. groupBOQ() merges them into the matching section even though
      // they're appended at the end of the array.
      group: ci.group || "Optional / Special",
      name: ci.label || "Custom Item",
      spec: "User added (Price Database tab)",
      make: "Standard",
      unit: ci.unit || "/Nos.",
      qty: o(sr, 0),
      unitCost: o(`c${sr}`, ci.price || 0),
      price: 0,
    });
  });

  items.forEach((it) => {
    // Single choke point for every qty/unitCost this function produces —
    // whether from an auto-calculated default, a ProposalForm field (e.g.
    // Inverter Unit Cost), or a BOQTable override — so a stray negative
    // value can never reach a line price no matter which path it came in on.
    it.qty = sanitizePrice(it.qty);
    it.unitCost = sanitizePrice(it.unitCost);
    it.price = it.qty * it.unitCost;
  });
  // Rows the user removed from this quote (BOQTable's delete on a standard
  // item sets `x<sr>`). Filtered here, at the engine's single exit, so a
  // removed line disappears from the material total, the pricing summary and
  // the Excel/Word exports too — not merely from the on-screen list.
  // Removal is per-proposal and reversible: clearing `x<sr>` restores the row
  // with its formula-derived quantity intact.
  return items.filter((it) => !ov[`x${it.sr}`]);
}

export function computePricingSummary(boq: BOQItem[], inp: ProposalInputs, cat: Catalogue): PricingSummary {
  const matTotal = boq.reduce((s, i) => s + (i.price || 0), 0);
  const B1 = n(inp.capacity);
  const ch = cat.charges;
  const install = (ch.installation || 5500) * B1;
  const transport = (matTotal * (ch.transport || 3)) / 100;
  const liaison = (ch.liaisoning || 3500) * B1;
  const subTotal = matTotal + install + transport + liaison;
  const insurance = ((subTotal * 1.2) / 1000) * 3 * 5;
  const profPct = (ch.profit || 15) / 100;
  const profit = (subTotal / (1 - profPct)) * profPct;
  const totalExGST = subTotal + insurance + profit;
  const rateKW = B1 > 0 ? totalExGST / B1 : 0;
  const gstPct = (ch.gst || 8.9) / 100;
  const gstAmt = totalExGST * gstPct;
  const final = totalExGST + gstAmt;
  const firstQuoteRate = B1 > 0 ? Math.ceil(rateKW / 1000) * 1000 + 2000 : 0;
  const isDCR = inp.panelType === "DCR";
  const subsidy = isDCR ? ch.subsidy || 78000 : 0;
  const effective = final - subsidy;
  // The Discount field was removed from the form, so it's always 0 here —
  // a value saved on an older proposal would otherwise keep lowering the
  // price with no field to edit it. (Still stored, not deleted.)
  const discountPct = 0;
  const discountAmt = (effective * discountPct) / 100;
  const finalAfterDiscount = effective - discountAmt;
  const annualGen = B1 * 1450;
  const unitCostN = n(inp.unitCost);
  const lifeSavings = annualGen * unitCostN * 25;
  const shadowArea = B1 * 75;

  return {
    matTotal, install, transport, liaison, subTotal, insurance, profit, totalExGST,
    firstQuoteRate, gstAmt, final, discountAmt, finalAfterDiscount, isDCR, subsidy,
    effective, rateKW, annualGen, lifeSavings, shadowArea,
  };
}

// Simple payback = effective amount payable ÷ estimated annual savings.
// lifeSavings is a 25-year total, so annual savings = lifeSavings / 25.
export function computePaybackPeriod(summary: PricingSummary): string {
  const annualSavings = summary.lifeSavings / 25;
  const effectiveCost = summary.discountAmt > 0 ? summary.finalAfterDiscount : summary.effective;
  if (annualSavings <= 0 || effectiveCost <= 0) return "—";
  const years = effectiveCost / annualSavings;
  const wholeYears = Math.floor(years);
  const months = Math.round((years - wholeYears) * 12);
  const yr = (n: number) => `${n} Year${n === 1 ? "" : "s"}`;
  const mo = (n: number) => `${n} Month${n === 1 ? "" : "s"}`;
  if (months >= 12) return `< ${yr(wholeYears + 1)}`;
  if (months === 0) return `< ${yr(wholeYears)}`;
  if (wholeYears === 0) return `< ${mo(months)}`;
  return `< ${yr(wholeYears)} ${mo(months)}`;
}

// ─── Proposal number / date / number-to-words helpers ──────────────────────

export function generateProposalNumber(): string {
  const now = new Date();
  const month = now.getMonth();
  const yr = now.getFullYear();
  const fyStart = month >= 3 ? yr : yr - 1;
  const fy = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
  let counter = parseInt(localStorage.getItem(LOCALSTORAGE_COUNTER_KEY) || "0", 10) + 1;
  try {
    localStorage.setItem(LOCALSTORAGE_COUNTER_KEY, String(counter));
  } catch {
    // Storage unavailable (private mode, quota) — proposal number still works this session.
  }
  return `EBAE/QUO/${fy}/${String(counter).padStart(3, "0")}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatProposalDate(iso: string): string {
  const d = iso ? new Date(iso + "T00:00:00") : new Date();
  const day = d.getDate();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  return `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function numberToWords(num: number): string {
  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (!num || num === 0) return "Zero Rupees Only";
  function b1000(v: number): string {
    if (v < 20) return units[v];
    if (v < 100) return tens[Math.floor(v / 10)] + (v % 10 ? " " + units[v % 10] : "");
    return units[Math.floor(v / 100)] + " Hundred" + (v % 100 ? " " + b1000(v % 100) : "");
  }
  let result = "";
  let rem = Math.round(num);
  if (rem >= 10000000) {
    result += b1000(Math.floor(rem / 10000000)) + " Crore ";
    rem %= 10000000;
  }
  if (rem >= 100000) {
    result += b1000(Math.floor(rem / 100000)) + " Lakh ";
    rem %= 100000;
  }
  if (rem >= 1000) {
    result += b1000(Math.floor(rem / 1000)) + " Thousand ";
    rem %= 1000;
  }
  if (rem > 0) result += b1000(rem);
  return result.trim() + " Rupees Only";
}

export const fmtINR = (val: number): string => "₹" + Math.round(val).toLocaleString("en-IN");
export const fmtNum = (val: number): string => Math.round(val).toLocaleString("en-IN");
