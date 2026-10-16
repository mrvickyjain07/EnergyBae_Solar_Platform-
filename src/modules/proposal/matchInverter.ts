// src/modules/proposal/matchInverter.ts
// Pure inverter-selection engine for the BOQ's Auto mode (see ProposalForm.tsx).
// Mirrors matchWirePrice.ts's shape: no I/O, matched against a candidate list
// the caller already has in memory (fetched once from GET /api/inverter-prices,
// see inverterPricesApi.ts / supabase/migrations/0006_inverter_prices.sql).
// Unlike wire matching (which only ever steps a conductor size UP or refuses),
// an inverter that's too small for the required capacity isn't unsafe to
// combine — so undersized candidates fall back to a multi-unit suggestion
// instead of a flat no-match.
import { SystemType } from "./types";

export type InverterMatchType = "EXACT" | "NEXT_ABOVE" | "MULTIPLE" | "NO_MATCH";

export interface InverterCandidate {
  id: string;
  brand: string;
  systemType: SystemType;
  phase: 1 | 3;
  kw: number;
  model: string;
  price: number;
  isActive: boolean;
}

export interface InverterMatchOpts {
  systemType: SystemType;
  phase: 1 | 3;
  requiredCapacity: number;
  brand?: string;
}

export interface InverterMatch {
  candidate: InverterCandidate | null;
  quantity: number;
  matchType: InverterMatchType;
  reason: string;
}

export function findBestInverter(candidates: InverterCandidate[], opts: InverterMatchOpts): InverterMatch {
  const pool = candidates.filter(
    (c) =>
      c.isActive &&
      c.systemType === opts.systemType &&
      c.phase === opts.phase &&
      (!opts.brand || c.brand.toLowerCase() === opts.brand.toLowerCase())
  );

  if (pool.length === 0) {
    return {
      candidate: null,
      quantity: 0,
      matchType: "NO_MATCH",
      reason: `No ${opts.systemType} ${opts.phase}-Phase inverter${opts.brand ? ` from ${opts.brand}` : ""} found.`,
    };
  }

  const exact = pool.find((c) => Math.abs(c.kw - opts.requiredCapacity) < 0.01);
  if (exact) {
    return { candidate: exact, quantity: 1, matchType: "EXACT", reason: `Exact ${exact.kw} kW match.` };
  }

  const above = pool.filter((c) => c.kw > opts.requiredCapacity).sort((a, b) => a.kw - b.kw)[0];
  if (above) {
    return { candidate: above, quantity: 1, matchType: "NEXT_ABOVE", reason: `Next size up: ${above.kw} kW (required ${opts.requiredCapacity} kW).` };
  }

  const largest = [...pool].sort((a, b) => b.kw - a.kw)[0];
  const quantity = Math.ceil(opts.requiredCapacity / largest.kw);
  return {
    candidate: largest,
    quantity,
    matchType: "MULTIPLE",
    reason: `No single inverter covers ${opts.requiredCapacity} kW — ${quantity} × ${largest.kw} kW suggested.`,
  };
}
