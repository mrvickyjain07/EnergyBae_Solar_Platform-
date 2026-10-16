// src/modules/commercial/billUnits.ts
// Load-unit normalisation for C&I bills. Indian bills print sanctioned /
// connected load in HP on many LT industrial tariffs (MSEDCL "200.00 HP"),
// and extraction used to read that number as kW — overstating it by a third.
//
// Only an explicit HP is converted (kW = HP × 0.746, the mechanical-horsepower
// definition). kW passes through. kVA is NEVER converted here: kVA → kW needs a
// power factor, and HP → kW is not that conversion — contract demand (kVA)
// stays in kVA. Anything else (no unit, an unrecognised label) yields no kW
// and a warning, so the reviewer confirms the unit instead of the code guessing.

export const HP_TO_KW = 0.746;

export type LoadUnit = "HP" | "kW" | "kVA" | "unknown";

/** Map a printed unit label ("HP", "H.P.", "Horse Power", "KW", "kva" …) to a unit; unknown when unclear. */
export function parseLoadUnit(label: string | null | undefined): LoadUnit {
  const s = String(label ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (s === "hp" || s === "horsepower") return "HP";
  if (s === "kw") return "kW";
  if (s === "kva") return "kVA";
  return "unknown";
}

export interface NormalizedLoad {
  originalValue: number | null;
  originalUnit: LoadUnit;
  /** Load in kW when it can be established; null otherwise (never a guess). */
  kw: number | null;
  method: "HP × 0.746" | "as printed (kW)" | null;
  warning: string | null;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Normalise a sanctioned or connected load. `unit` must come from the bill's
 * own label (or a user's confirmation); an unknown unit is never assumed.
 */
export function normalizeLoad(value: number | "" | null | undefined, unit: LoadUnit): NormalizedLoad {
  const v = value === "" || value === null || value === undefined ? null : Number(value);
  const base = { originalValue: v, originalUnit: unit };
  if (v === null || !Number.isFinite(v)) return { ...base, originalValue: null, kw: null, method: null, warning: v === null ? null : "Load is not a number." };
  if (v < 0) return { ...base, kw: null, method: null, warning: "Load cannot be negative — check the extracted value." };
  switch (unit) {
    case "HP":
      return { ...base, kw: round3(v * HP_TO_KW), method: "HP × 0.746", warning: null };
    case "kW":
      return { ...base, kw: v, method: "as printed (kW)", warning: null };
    case "kVA":
      return { ...base, kw: null, method: null, warning: "Load is in kVA; it is not converted to kW (that needs a power factor)." };
    default:
      return { ...base, kw: null, method: null, warning: "Load unit not stated — confirm HP, kW or kVA before it is used." };
  }
}
