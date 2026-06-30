// Shared slab-based MSEDCL tariff calculator.
// Used to derive an effective per-unit cost from the printed tariff table
// instead of naively dividing (Bill Amount / Units) — the bill amount also
// includes fixed charges, duty, FAC, and other line items that don't belong
// in a per-unit energy cost figure.

export interface TariffSlab {
  // Lower bound (inclusive) of the slab, in units. First slab is always 0.
  minUnits: number;
  // Upper bound (inclusive) of the slab, in units. null means "and above".
  maxUnits: number | null;
  // ₹ per unit — energy charge for consumption falling in this slab.
  energyRate: number;
  // ₹ per unit — wheeling charge for consumption falling in this slab.
  wheelingRate: number;
}

// MSEDCL LT-I Residential slabs as printed on the reference bill (MYT Order
// 217/2024 as amended by Case 75/2025). This is only a fallback used when a
// bill doesn't carry its own legible tariff table — tariff orders change
// periodically, so the extractor should always prefer slabs read off the
// uploaded bill over this default.
export const DEFAULT_MSEDCL_LT1_SLABS: TariffSlab[] = [
  { minUnits: 0, maxUnits: 100, energyRate: 3.96, wheelingRate: 0.15 },
  { minUnits: 101, maxUnits: 300, energyRate: 10.8, wheelingRate: 0.25 },
  { minUnits: 301, maxUnits: 500, energyRate: 15.03, wheelingRate: 0.35 },
  { minUnits: 501, maxUnits: 1000, energyRate: 17.53, wheelingRate: 0.4 },
  { minUnits: 1001, maxUnits: null, energyRate: 17.53, wheelingRate: 0.4 },
];

/** Total ₹ charge (energy + wheeling) for `units` consumed, applied slab-by-slab. */
export function calculateSlabCharge(units: number, slabs: TariffSlab[]): number {
  if (!units || units <= 0 || !Array.isArray(slabs) || slabs.length === 0) return 0;

  const sorted = [...slabs].sort((a, b) => a.minUnits - b.minUnits);
  let remaining = units;
  let total = 0;

  for (const slab of sorted) {
    if (remaining <= 0) break;
    const slabWidth = slab.maxUnits === null ? remaining : slab.maxUnits - slab.minUnits + 1;
    const unitsInSlab = Math.min(remaining, slabWidth);
    total += unitsInSlab * (slab.energyRate + slab.wheelingRate);
    remaining -= unitsInSlab;
  }

  return total;
}

/** Effective ₹/unit cost for `units` consumed, derived from slab-wise charges. */
export function calculateUnitCost(units: number, slabs: TariffSlab[]): number {
  if (!units || units <= 0) return 0;
  const effectiveSlabs = Array.isArray(slabs) && slabs.length > 0 ? slabs : DEFAULT_MSEDCL_LT1_SLABS;
  return Number((calculateSlabCharge(units, effectiveSlabs) / units).toFixed(3));
}
