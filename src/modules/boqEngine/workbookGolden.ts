// src/modules/boqEngine/workbookGolden.ts
// Phase 5B: compares the real BOQ workbooks (frozen as fixtures by
// scripts/extractBoqFixtures.ts) with legacy-v1 (= calcBOQ), line by line.
//
// It REPORTS differences; it does not decide which side is right. Nothing
// here is used to price a quote. Three interpretation steps are needed to
// compare at all, and each is labelled [INF] in the report:
//   1. legacyInputsFromFixture — which workbook cell feeds which engine input
//   2. classifyLine            — which workbook row corresponds to which BOQ line
//   3. REASONS                 — why a known difference exists (evidence-based)
// Pure (no fs, no React) so workbookGolden.test.ts can pin the results.

import type { BOQItem } from "../proposal/types";
import { DEFAULT_CATALOGUE } from "../proposal/defaultCatalogue";
import { runTemplate } from "./ruleEngine";
import { LEGACY_V1 } from "./legacyV1";

export type FxCell = { f?: string; v: string | number | boolean | null };
export interface FxLine {
  row: number; material: string; spec?: FxCell; make?: FxCell; unit?: FxCell;
  qty?: FxCell; rate?: FxCell; price?: FxCell; note?: FxCell;
}
export interface Fixture {
  source: { workbook: string; sheet: string; headerRow: number };
  params: Record<string, { row: number; B?: FxCell; C?: FxCell }>;
  lines: FxLine[];
  commercial: { row: number; I?: FxCell; J?: FxCell; K?: FxCell; L?: FxCell; M?: FxCell; N?: FxCell }[];
  header: Record<string, FxCell>;
  side: Record<string, FxCell>;
}

export const num = (c?: FxCell): number | null => (c && typeof c.v === "number" ? c.v : null);
const txt = (c?: FxCell) => (c && typeof c.v === "string" ? c.v : c?.v == null ? "" : String(c.v));
const pv = (fx: Fixture, label: string) => fx.params[label]?.B?.v ?? null;

/** [INF] Workbook parameter cells → calcBOQ inputs. laType is ESE because every workbook LA row specifies "ESE Type".
 *  Legs = the base-plate line qty ÷ 2 (workbook base plates = legs × 2); spares = the typed C cells of the
 *  DC / AC / structure-earthing length rows (inverter and LA earthing spares can differ; the engine has one). */
export function legacyInputsFromFixture(fx: Fixture): Record<string, unknown> {
  const numOr0 = (label: string) => { const v = pv(fx, label); return typeof v === "number" ? v : 0; };
  const inverter = fx.lines.find((l) => /^solar inverter/i.test(l.material));
  const module = fx.lines.find((l) => /^solar module/i.test(l.material));
  const basePlate = fx.lines.find((l) => classifyLine(l) === "Base plate");
  const spare = (label: string) => num(fx.params[label]?.C) ?? "";
  return {
    capacity: numOr0("Required Solar Capacity"),
    panelPriceWp: numOr0("Panel Price/Wp"),
    panelWp: numOr0("Solar Module Size (W)"),
    phase: pv(fx, "System Connection Phase") === 3 ? "3-Phase" : "1-Phase",
    buildingFloors: numOr0("Building No. of Floors"),
    inverterFloor: numOr0("Inverter Installation Floor"),
    numInverters: numOr0("No. of Inverter"),
    panelRows: numOr0("No. of Panel Rows"),
    structLowerFt: numOr0("Structure Height Lower (FT.)"),
    structUpperFt: numOr0("Structure Height Upper (FT.)"),
    numStrings: numOr0("No. of Strings"),
    numBatteries: numOr0("No. of Batteries"),
    inverterUnitCost: num(inverter?.rate) ?? 0,
    panelType: /non-?dcr|ndcr/i.test(txt(module?.spec)) ? "NDCR" : "DCR",
    laType: "ESE",
    structureLegs: (num(basePlate?.qty) ?? 0) / 2,
    dcSpareM: spare("DC Cable Length (MTS.)"),
    acSpareM: spare("AC Cable Length (MTS.)"),
    earthSpareM: spare("Earthing Cable Length for Structure (MTS.)"),
  };
}

/** [INF] Workbook row → legacy-v1 line sr, or a "workbook-only" label. Matching is by the row's Material / Specification text. */
export function classifyLine(l: FxLine): number | string {
  const F = l.material.toLowerCase(), G = txt(l.spec).toLowerCase(), H = txt(l.make).toLowerCase();
  const by: [boolean, number | string][] = [
    [F.startsWith("solar module"), 1], [F.startsWith("solar inverter"), 2], [F.startsWith("data logger"), 3],
    [F.startsWith("battery"), 4], [F.startsWith("dc distribution"), 5], [F.startsWith("ac distribution"), 6],
    [F.startsWith("mcb at client"), 7], [F.startsWith("dc cable"), 8], [F.startsWith("mc4"), 9],
    [F.startsWith("ac cable (inverter to acdb)"), 11], [F.startsWith("ac cable (busbar"), "AC cable busbar→meter"], [F.startsWith("ac cable"), 10],
    [F.startsWith("la with"), 12],
    [F.startsWith("earthing cable") && G.includes("structure earthing"), 13], [F.startsWith("earthing cable") && G.includes("inverter earthing"), 14],
    [F.startsWith("earthing cable") && (G.includes("25 sq") || G.includes("la earthing")), 15],
    [F.startsWith("earthing pit"), 16],
    [F.startsWith("lugs") && G.includes("panel to panel"), 17], [F.startsWith("lugs") && G.includes("pin type"), 18],
    [F.startsWith("lugs") && G.includes("la earthing"), 19], [F.startsWith("lugs") && G.includes("4 sq.mm"), 20],
    [F.startsWith("glands"), 21],
    [F.startsWith("nut bolt") && G.includes("anchor"), 22], [F.startsWith("nut bolt") && G.includes("inverter earthing"), 23],
    [F.startsWith("nut bolt") && G.includes("purlin"), "M8×100 purlin bolt"],
    [F.startsWith("j-bolt"), 24], [F.startsWith("u-clamp"), 25], [F.startsWith("z-clamp"), 26],
    [F.startsWith("conduits") && G.includes("tee"), 28], [F.startsWith("conduits"), 27],
    [F.startsWith("cable tag"), 29], [F.startsWith("ferules"), 30], [/^ele[c]?trical tape/.test(F), 31], [F.startsWith("cable ties"), 32],
    [F.startsWith("structure") && (G.includes("ladder and cross") || G.trim() === "ladder"), 33],
    [F.startsWith("structure") && G.includes("walkway"), 34], [F.startsWith("structure") && G.includes("over the shed"), 35],
    [F.startsWith("structure") && (H.includes("base plate") || G.includes("base plate")), "Base plate"],
    [F.startsWith("structure") && H.includes("purlin"), "Purlin 40×40"],
    [F.startsWith("structure") && G.includes("80 microns"), "GI structure 80×40"],
    [F.startsWith("structure") && H.includes("75x75"), "Structure 75×75"],
    [F.startsWith("civil"), "Civil block"], [F.startsWith("bird"), 36], [F.startsWith("cleaning"), 38],
    [F.startsWith("dc mcb"), "DC MCB 160A"], [F.startsWith("bypass"), "Bypass switch"],
  ];
  const hit = by.find(([ok]) => ok);
  return hit ? hit[1] : `Unmapped: ${l.material}`;
}

export type DiffClass = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "A+C";
export const CLASS_LABEL: Record<DiffClass, string> = {
  A: "A formula difference", B: "B template default difference", C: "C manually entered project value",
  D: "D catalogue difference", E: "E commercial-rule difference", F: "F current calcBOQ defect", G: "G unknown",
  "A+C": "A formula difference + C manual value",
};

/** Why a known difference exists. Evidence in docs/phase5/2026-10-05-phase5-ab-evidence-report.md. */
export const REASONS: Record<number, { cls: DiffClass; why: string }> = {
  1: { cls: "G", why: "same formula ROUNDUP(B1*1000/B3); a difference would come from inputs" },
  2: { cls: "C", why: "workbook =B7 or typed per inverter row" },
  3: { cls: "B", why: "workbook typed per sheet; calcBOQ fixed 0" },
  4: { cls: "C", why: "workbook =B15 or typed" },
  5: { cls: "C", why: "workbook =B7 / =J15 / typed; calcBOQ =B7" },
  6: { cls: "A", why: "workbook =B7 / =J15 (per inverter) or typed; calcBOQ fixed 1" },
  7: { cls: "C", why: "workbook typed 1 or =J15; calcBOQ fixed 1" },
  8: { cls: "A+C", why: "spare differs (workbook C16 typed, calcBOQ +15); Aaryan sheets also drop the ×strings multiplier (D3 fixed 2026-10-05: calcBOQ now ×strings)" },
  9: { cls: "G", why: "same formula strings×4" },
  10: { cls: "C", why: "same length formula; spare differs (workbook C17 typed, calcBOQ +40)" },
  11: { cls: "A", why: "workbook =5*J15 / =10*J15 / typed; calcBOQ 5×inverters" },
  12: { cls: "C", why: "LA count typed in workbook; calcBOQ 1" },
  13: { cls: "C", why: "same length formula; spare differs (workbook C18 typed, calcBOQ +40)" },
  14: { cls: "C", why: "same length formula; spare differs (workbook C19 typed, calcBOQ +40)" },
  15: { cls: "C", why: "same length formula; spare differs (workbook C20 typed, calcBOQ +40)" },
  16: { cls: "C", why: "workbook pits typed (B21); calcBOQ earthing rule 2×inv+1, ESE +2" },
  17: { cls: "G", why: "same formula panels×2" },
  18: { cls: "G", why: "same formula inverters×2" },
  19: { cls: "C", why: "same formula pits+1; differs only through pits" },
  20: { cls: "G", why: "same formula DC cores×2 + AC cores×2 (D2 fixed 2026-10-05)" },
  21: { cls: "G", why: "both 0" },
  22: { cls: "C", why: "legs typed per project (D1 fixed 2026-10-05); differs only where the base-plate qty is not legs × 2" },
  23: { cls: "G", why: "same formula inverters×6" },
  24: { cls: "C", why: "workbook typed (Celebration =R53 legs); calcBOQ 0" },
  25: { cls: "C", why: "workbook typed; calcBOQ ceil(panels×1.5)" },
  26: { cls: "C", why: "workbook typed; calcBOQ panels×2" },
  27: { cls: "A+C", why: "different terms (workbook DC + LA wire + inverter earthing; calcBOQ DC + structure earthing + inverter earthing) and different spares" },
  28: { cls: "A+C", why: "follows conduit" },
  29: { cls: "G", why: "same formula AC cores + DC cores×2 + 2 (D2 fixed 2026-10-05)" },
  30: { cls: "G", why: "same formula = strings" },
  31: { cls: "B", why: "workbook typed 3 / 6 / 10; calcBOQ 6" },
  32: { cls: "B", why: "workbook typed 1 / 2; calcBOQ 1" },
  33: { cls: "B", why: "workbook typed; calcBOQ fixed 18" },
  34: { cls: "C", why: "workbook typed; calcBOQ fixed 5" },
  35: { cls: "A", why: "workbook typed kW (0 on raised / non-raised); calcBOQ always = capacity" },
  36: { cls: "C", why: "workbook typed; calcBOQ 0" },
  37: { cls: "G", why: "not in any workbook" },
  38: { cls: "G", why: "both 0" },
};

export type Result = "MATCH" | "DIFFERENT" | "MISSING IN calcBOQ" | "NOT IN WORKBOOK";
export interface ComparedLine {
  key: string;            // legacy sr, or the workbook-only label
  label: string;
  rows: { row: number; formula: string | null; qty: number | null }[];
  workbookQty: number | null;
  calcQty: number | null;
  diff: number | null;
  result: Result;
  cls: DiffClass | null;
  why: string;
}

const EPS = 1e-9;

/** Every workbook line and every legacy-v1 line, compared. */
export function compareFixture(fx: Fixture): { inputs: Record<string, unknown>; legacy: BOQItem[]; lines: ComparedLine[] } {
  const inputs = legacyInputsFromFixture(fx);
  const legacy = runTemplate(LEGACY_V1, inputs, DEFAULT_CATALOGUE, {}).items;
  const bySr = new Map(legacy.map((it) => [it.sr, it]));
  const groups = new Map<number | string, FxLine[]>();
  for (const l of fx.lines) {
    const k = classifyLine(l);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const out: ComparedLine[] = [];
  for (const [k, ls] of groups) {
    const rows = ls.map((l) => ({ row: l.row, formula: l.qty?.f ?? null, qty: num(l.qty) }));
    const workbookQty = rows.reduce((s, r) => s + (r.qty ?? 0), 0);
    const label = `${ls[0].material}: ${txt(ls[0].spec) || txt(ls[0].make)}`.replace(/\s+/g, " ").slice(0, 60);
    if (typeof k === "number") {
      const calcQty = bySr.get(k)?.qty ?? null;
      const diff = calcQty === null ? null : calcQty - workbookQty;
      const match = diff !== null && Math.abs(diff) < EPS;
      out.push({ key: String(k), label, rows, workbookQty, calcQty, diff, result: match ? "MATCH" : "DIFFERENT", cls: match ? null : REASONS[k].cls, why: match ? "" : REASONS[k].why });
    } else {
      out.push({ key: k, label, rows, workbookQty, calcQty: null, diff: null, result: "MISSING IN calcBOQ", cls: "A", why: "workbook-only line; legacy-v1 has no equivalent" });
    }
  }
  for (const it of legacy) {
    if (!groups.has(it.sr)) out.push({ key: String(it.sr), label: it.name, rows: [], workbookQty: null, calcQty: it.qty, diff: null, result: "NOT IN WORKBOOK", cls: null, why: "legacy-v1-only line" });
  }
  return { inputs, legacy, lines: out };
}

export interface WorkbookFinding { row: number; issue: string }

/** Internal consistency of the workbook itself (facts, no judgement of which value is right). */
export function workbookFindings(fx: Fixture): WorkbookFinding[] {
  const out: WorkbookFinding[] = [];
  for (const l of fx.lines) {
    const q = num(l.qty), r = num(l.rate), p = num(l.price);
    if (q && q > 0 && l.price === undefined) out.push({ row: l.row, issue: `qty ${q} but the Price cell is empty — the line adds nothing to Material` });
    const f = l.price?.f ?? "";
    const refs = [...f.matchAll(/\b[JL]\$?(\d+)\b/g)].map((m) => Number(m[1]));
    if (refs.length && refs.some((x) => x !== l.row)) out.push({ row: l.row, issue: `price formula ${f} references another row` });
    if (q !== null && r !== null && p !== null && Math.abs(q * r - p) > 0.01) {
      const how = l.price?.f ? `price ${l.price.f} = ${p}` : `price typed ${p} (no formula)`;
      out.push({ row: l.row, issue: `${how}; qty ${q} × rate ${r} = ${+(q * r).toFixed(2)}` });
    }
  }
  return out;
}

/** Legacy-v1 values behind the three confirmed defects, for the defect section. */
export function defectEvidence(fx: Fixture) {
  const { lines } = compareFixture(fx);
  const get = (k: string) => lines.find((l) => l.key === k);
  return {
    anchorBolts: get("22"),
    lugs4: get("20"),
    cableTags: get("29"),
    dcCable: get("8"),
    strings: pv(fx, "No. of Strings"),
    inverters: pv(fx, "No. of Inverter"),
    dcLength: fx.params["DC Cable Length (MTS.)"],
  };
}
