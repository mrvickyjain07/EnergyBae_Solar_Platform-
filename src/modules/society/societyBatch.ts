// src/modules/society/societyBatch.ts
// Housing society, several bills: one bill per meter (common lights, lift,
// water pump, …). Each meter is sized on its own with the residential
// worksheet (buildWorksheetModel — avg units ÷ 106.06, panels rounded UP) and
// the society total is the SUM of the per-meter results — business decision
// 2026-10-16: each meter can carry its own net-meter, and it matches the
// worksheet's "Total solar capacity" row. Never re-derive the per-meter math
// here; read it off the worksheet model so it can't drift from Home/Society.
import { buildWorksheetModel } from "../../worksheetModel";
import type { WorksheetSlot } from "../projects/billAnalysisRules";

/** /api/extract response `data` → the worksheet slot — the same mapping App.tsx uses for a single bill. */
export function slotFromExtraction(d: any): WorksheetSlot {
  const history = Array.isArray(d?.billingHistory)
    ? d.billingHistory.map((h: any) => ({
        month: typeof h?.month === "string" ? h.month : "",
        units: typeof h?.consumption === "number" ? h.consumption : "",
        billAmount: typeof h?.amount === "number" ? h.amount : "",
        unitCost: typeof h?.unitCost === "number" ? h.unitCost : "",
      }))
    : [];
  return {
    consumerName: d?.consumerName || "",
    consumerNumber: d?.consumerNumber || "",
    fixedCharges: typeof d?.fixedCharges === "number" && d.fixedCharges > 0 ? d.fixedCharges : "",
    sanctionedLoadKw: typeof d?.sanctionedLoadKw === "number" ? d.sanctionedLoadKw : "",
    connectionType: d?.connectionType || "",
    contractDemandKva: "",
    history,
  };
}

export interface MeterSizing { avgUnits: number | null; kw: number; panels: number; capacityKw: number }

/** One meter, read off the residential worksheet model (D22 average, D23 kW, D26 panels, D25 capacity). */
export function sizeMeter(slot: WorksheetSlot, panelWp: number): MeterSizing {
  const cells = buildWorksheetModel(slot, panelWp).cells;
  const v = (ref: string) => cells.find((c) => c.ref === ref)?.value;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const avg = v("D22");
  return { avgUnits: typeof avg === "number" ? avg : null, kw: num(v("D23")), panels: num(v("D26")), capacityKw: num(v("D25")) };
}

export interface SocietyTotals { meters: number; panels: number; capacityKw: number; avgUnits: number; unsized: number }

/** Society total = sum of per-meter panels/capacity (each meter already rounded up). */
export function societyTotals(sizings: MeterSizing[], panelWp: number): SocietyTotals {
  const sized = sizings.filter((s) => s.panels > 0);
  const panels = sized.reduce((n, s) => n + s.panels, 0);
  return {
    meters: sizings.length,
    panels,
    // Recomputed from the panel count (not a float sum) so it equals panels × Wp exactly.
    capacityKw: Math.round(panels * panelWp) / 1000,
    avgUnits: Math.round(sizings.reduce((n, s) => n + (s.avgUnits ?? 0), 0) * 100) / 100,
    unsized: sizings.length - sized.length,
  };
}

/** The same meter scanned twice (two files, same consumer number) — the later one is the duplicate. */
export function duplicateConsumer(consumerNumber: string, others: string[]): boolean {
  const key = consumerNumber.replace(/\s+/g, "");
  return key !== "" && others.some((o) => o.replace(/\s+/g, "") === key);
}
