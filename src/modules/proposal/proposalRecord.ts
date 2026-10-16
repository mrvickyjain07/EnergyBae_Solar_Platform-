// src/modules/proposal/proposalRecord.ts
// Pure shaping/validation for the proposals persistence layer (proposalsApi.ts).
// Split out so it can be tested without a Supabase connection, per the
// project convention (see calculations.ts, matchWirePrice.ts).
import { sanitizePrice } from "./sanitizePrice";
import { BOQItem } from "./types";

export type ProposalStatus = "draft" | "final";

export function isProposalStatus(value: unknown): value is ProposalStatus {
  return value === "draft" || value === "final";
}

// "none" means never reviewed, or reviewed then invalidated by a later save
// (see proposalsApi.ts's POST handler resetting these columns on every save).
export type ReviewStatus = "none" | "approved" | "needs_changes";

export function isReviewDecision(value: unknown): value is Exclude<ReviewStatus, "none"> {
  return value === "approved" || value === "needs_changes";
}

export interface ProposalItemRow {
  sr: number;
  group: string;
  name: string;
  spec: string;
  make: string;
  unit: string;
  qty: number;
  unit_cost: number;
  price: number;
}

// Freezes a computed BOQ into insertable rows. Every numeric field is routed
// through sanitizePrice and price is recomputed from the sanitized qty/cost
// rather than trusted from the input — the "unit cost of -3 produces a
// negative line price" bug (see CLAUDE.md) must not be able to freeze into a
// saved quote.
export function buildProposalItemRows(boq: BOQItem[]): ProposalItemRow[] {
  return boq.map((item) => {
    const qty = sanitizePrice(item.qty);
    const unitCost = sanitizePrice(item.unitCost);
    return {
      sr: item.sr,
      group: item.group,
      name: item.name,
      spec: item.spec,
      make: item.make,
      unit: item.unit,
      qty,
      unit_cost: unitCost,
      price: sanitizePrice(qty * unitCost),
    };
  });
}
