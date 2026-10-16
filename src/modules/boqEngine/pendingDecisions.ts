// src/modules/boqEngine/pendingDecisions.ts
// Which BOQ lines still run on a provisional rule, and the business decision
// that will settle it (docs/phase5/pending-business-decisions.md).
//
// The register's "pending default policy": a quantity whose rule is still an
// open decision must never look as settled as an approved one. These lines
// keep calcBOQ's current rule (nothing here changes a number); the UI marks
// them "Provisional" and says which decision they wait on, so the person
// quoting checks them against the design. pendingDecisions.test.ts ties this
// list to the register: when a decision there leaves `proposed` / `pending`,
// the test fails until this list is updated.

/** The nine open decisions, titled exactly as their headings in the register. */
export const PENDING_DECISIONS = {
  D1: "F / B / SH / Prestructure",
  D2: "U-clamps / Z-clamps",
  D3: "Walkway, ladder and cross bracing",
  D4: "Lightning arrester (LA) quantity",
  D5: "Data logger",
  D6: "Purlin",
  D7: "Structure sub-table (supports, rafters, legs, base plates, anchor bolts)",
  D8: "Over-shed aluminium structure",
  D9: "Capacity basis and template matching",
} as const;
export type DecisionId = keyof typeof PENDING_DECISIONS;

/**
 * legacy-v1 line (sr) → the decision its current rule waits on. Only lines
 * that exist and whose own quantity / lookup is the open question; D1, D6
 * and D7 have no line yet, and anchor bolts (22) follow the approved D1 fix.
 */
export const PROVISIONAL_LINES: Record<number, DecisionId> = {
  3: "D5", // Data logger: fixed 0
  6: "D9", // ACDB: selected on required kW
  12: "D4", // Lightning arrester: 1, or 0 for NA
  25: "D2", // U-clamps: ⌈panels × 1.5⌉
  26: "D2", // Z-clamps: ⌈panels × 2⌉
  33: "D3", // Ladder & cross bracing: 18 m
  34: "D3", // Walkway: 5 m
  35: "D8", // Over-shed aluminium: = capacity
};

/** The open decision behind a line, or null when its rule is settled (or it's a custom line). */
export function provisionalDecision(sr: number): { id: DecisionId; title: string } | null {
  const id = PROVISIONAL_LINES[sr];
  return id ? { id, title: PENDING_DECISIONS[id] } : null;
}
