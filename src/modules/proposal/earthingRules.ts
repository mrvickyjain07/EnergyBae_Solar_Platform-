// src/modules/proposal/earthingRules.ts
// Central earthing-pit rule. Earthing pits are NOT a vendor-entered number:
// they follow from the inverter count and the earthing (LA) type. Lives here,
// not in a React component, because calcBOQ uses it — and calcBOQ also runs
// SERVER-side when a proposal is saved (proposalsApi.ts freezes the BOQ), so
// the server is the authority and any client-supplied pit count is ignored.
//
// Rules are data, keyed by id, so vendor/template-specific rules can be added
// later without touching calcBOQ. DEFAULT is today's business rule:
//   base = 2 × inverters + 1;  Conventional = base, ESE = base + 2, NA = base − 1

export type EarthingType = "ESE" | "Conventional" | "NA";

export interface EarthingRule {
  id: string;
  label: string;
  base: (inverters: number) => number;
  adjust: Record<EarthingType, number>;
}

export const DEFAULT_EARTHING_RULE: EarthingRule = {
  id: "default",
  label: "2 × inverters + 1, adjusted by earthing type",
  base: (inverters) => 2 * inverters + 1,
  adjust: { Conventional: 0, ESE: 2, NA: -1 },
};

/** Anything unrecognised (incl. blank on older proposals) is ESE — the
 *  original BOQ row — so a malformed or missing value can't price oddly. */
export function normalizeEarthingType(v: unknown): EarthingType {
  return v === "Conventional" || v === "NA" ? v : "ESE";
}

/**
 * Earthing pits for a project. Non-numeric, fractional or negative inverter
 * counts are coerced to a whole number ≥ 0. With no inverters entered yet the
 * result is 0 (the formula would otherwise show pits on an empty form).
 * Never negative.
 */
export function computeEarthingPits(inverters: unknown, type: unknown, rule: EarthingRule = DEFAULT_EARTHING_RULE): number {
  const n = Math.max(0, Math.trunc(Number(inverters) || 0));
  if (n === 0) return 0;
  return Math.max(0, rule.base(n) + rule.adjust[normalizeEarthingType(type)]);
}
