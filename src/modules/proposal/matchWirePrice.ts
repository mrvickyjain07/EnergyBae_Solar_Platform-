// src/modules/proposal/matchWirePrice.ts
// Picks the wire_prices row that satisfies a BOQ cable spec, so the cable
// line items can take their rate from the uploaded supplier price list
// instead of sitting at ₹0.
//
// Safety rule baked in: a conductor is never substituted with a SMALLER one.
// Under-sizing a cable under-rates the circuit, so when the exact size isn't
// stocked we step UP to the next available size and otherwise return null —
// better an unpriced line the office notices than a quietly under-spec'd one.

export interface WireCandidate {
  internal_name: string;
  size_sqmm: number | null;
  cores: number | null;
  material: string | null;
  price_per_m: number;
}

export interface WireSpec {
  size: number;
  cores: number;
  /** null = unknown/any; a stated material must match exactly */
  material: string | null;
}

// Reads the cable geometry out of a BOQ row's spec text, which calcBOQ()
// builds in a consistent "<n>C×<size>sq.mm" shape — e.g.
//   "2C×4 sq.mm XLPO EN50618 FRLS"          -> 2 core, 4 sqmm
//   "1.1kV Al.XLPE 4C×4sq.mm FRLS Armoured" -> 4 core, 4 sqmm, Al
//   "Cu FRLS 1C×25sq.mm IS694"              -> 1 core, 25 sqmm, Cu
// Returns null for any row that isn't a cable, so callers can skip it.
export function parseCableSpec(specText: string): WireSpec | null {
  // Cores can be fractional — "3.5C" is a real cable construction (3 full
  // conductors + reduced neutral), not a typo for 3 or 4.
  const m = /([\d.]+)\s*C\s*[×xX*]\s*([\d.]+)/.exec(specText || "");
  if (!m) return null;
  const cores = parseFloat(m[1]);
  const size = parseFloat(m[2]);
  if (!Number.isFinite(cores) || !Number.isFinite(size)) return null;
  // "Al.XLPE" / "Al " means aluminium; "Cu" copper. Anything else is unknown
  // and left null so the match falls back to size + cores.
  const material = /\bAl\b|Al\./i.test(specText) ? "Al" : /\bCu\b/i.test(specText) ? "Cu" : null;
  return { size, cores, material };
}

// "Unknown material" reaches us in several disguises: a real null, an empty
// cell, or — from earlier extraction runs — the literal string "null" written
// into the column. None of them name an actual material, so all must read as
// unknown; treating "null" as a material rejected 177 of 181 real rows.
const UNKNOWN_MATERIAL = new Set(["", "null", "none", "na", "n/a", "-", "—"]);
function normalizeMaterial(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  return UNKNOWN_MATERIAL.has(s) ? null : s;
}

/** Same rule applied at write time (wirePriceExtraction.ts) so the literal
 *  string "null" never reaches the database in the first place. Preserves the
 *  original casing — "Cu"/"Al" — for anything that IS a material. */
export function normalizeMaterialText(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return UNKNOWN_MATERIAL.has(s.toLowerCase()) ? null : s;
}

export function matchWirePrice(candidates: WireCandidate[], spec: WireSpec): WireCandidate | null {
  const wanted = normalizeMaterial(spec.material);
  const viable = candidates.filter((c) => {
    if (c.size_sqmm == null || !Number.isFinite(c.size_sqmm)) return false;
    // Core count is a hard constraint — a 3-core cable cannot stand in for a
    // 1-core run.
    if (c.cores !== spec.cores) return false;
    // An UNKNOWN material on the catalogue side is not a mismatch: supplier
    // rate matrices routinely omit it (177 of 181 rows in the Polycab sheet).
    // Only an explicitly different material disqualifies a candidate.
    const have = normalizeMaterial(c.material);
    if (wanted && have && have !== wanted) return false;
    // Never undersize.
    return (c.size_sqmm as number) >= spec.size;
  });
  if (viable.length === 0) return null;

  // Closest size at or above the requirement; a stated matching material
  // outranks an unstated one; cheapest breaks any remaining tie.
  return viable.sort((a, b) => {
    const da = (a.size_sqmm as number) - spec.size;
    const db = (b.size_sqmm as number) - spec.size;
    if (da !== db) return da - db;
    const ma = wanted && normalizeMaterial(a.material) === wanted ? 0 : 1;
    const mb = wanted && normalizeMaterial(b.material) === wanted ? 0 : 1;
    if (ma !== mb) return ma - mb;
    return a.price_per_m - b.price_per_m;
  })[0];
}
