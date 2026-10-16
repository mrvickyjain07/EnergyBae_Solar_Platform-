// src/modules/proposal/structureTypes.ts
// The five structure types, and what each one asks for in Structure Details.
//
// Single source of truth for the proposal form, project systems, BOQ template
// variants and every place a structure type is displayed. The STORED value is
// the short code (S-F, S-T, N-E, E, GM — the codes the product spec §6 and
// docs/phase5/pending-business-decisions.md already use), not the label: the
// pre-2026-10-12 options stored labels ("Flush Mount (Default)", "Single Tilt",
// "Elevated"), and storing codes keeps an old "Elevated" distinguishable from
// the new Elevated instead of silently mapping it. Old values are never
// rewritten; they display as themselves.
//
// Symbols (confirmed 2026-10-12): F = Front, B = Back, SH = Shed Height.
// Their formulas are NOT confirmed. The height deductions, SH and Prestructure
// below are the business PROPOSAL
// (decision D1, status "proposed"). They are display text on purpose — no
// number here can reach a quote. calcBOQ ignores structure type for every
// quantity and price (structureTypes.test.ts proves it); activating a rule
// means a new template engine version after approval, not editing this file.

export type StructureCode = "S-F" | "S-T" | "N-E" | "E" | "GM";

/** Structure-detail inputs a type can ask for (fields of ProposalInputs). */
export type StructureField = "structLowerFt" | "structUpperFt" | "structureLegs";

export interface StructureTypeDef {
  code: StructureCode;
  label: string;
  description: string;
  /** Manual inputs shown for this type. Structure Legs is always shown: it drives anchor bolts (approved D1 rule). */
  fields: StructureField[];
  /** Business proposal for decision D1 — NOT approved, not used by any calculation. */
  proposal: { front: string; back: string; sh: string; prestructure: string; structureTable: boolean };
  /** Register decisions whose rules this type's structure quantities wait on. */
  pending: string[];
}

/** A dash in the proposal: no rule was given. It does not mean the dimension doesn't exist (shed structures have legs). */
export const NO_RULE = "— (no rule given)";

const HEIGHTS: StructureField[] = ["structLowerFt", "structUpperFt", "structureLegs"];
const LEGS_ONLY: StructureField[] = ["structureLegs"];

export const STRUCTURE_TYPE_DEFS: StructureTypeDef[] = [
  {
    code: "S-F", label: "Shed Flush", description: "Flush on a shed roof", fields: LEGS_ONLY,
    proposal: { front: "0", back: "0", sh: NO_RULE, prestructure: "1.5 / Wp", structureTable: false },
    pending: ["D1", "D7", "D8"],
  },
  {
    code: "S-T", label: "Shed Tilted", description: "Tilted frame on a shed roof", fields: LEGS_ONLY,
    proposal: { front: "0", back: "0", sh: NO_RULE, prestructure: "4.5 / Wp", structureTable: false },
    pending: ["D1", "D7", "D8"],
  },
  {
    code: "N-E", label: "Non-Elevated", description: "Low structure on an RCC roof", fields: HEIGHTS,
    proposal: { front: "F − 4", back: "B − 6", sh: "F − 4", prestructure: "Not specified", structureTable: true },
    pending: ["D1", "D6", "D7"],
  },
  {
    code: "E", label: "Elevated", description: "Raised structure above the roof", fields: HEIGHTS,
    proposal: { front: "F − 6", back: "B − 8", sh: "F − 6", prestructure: "Not specified", structureTable: true },
    pending: ["D1", "D6", "D7"],
  },
  {
    code: "GM", label: "Ground Mounted", description: "Structure on the ground", fields: HEIGHTS,
    proposal: { front: "F − 2", back: "B − 4", sh: "F − 2", prestructure: "6 (unit not stated)", structureTable: false },
    pending: ["D1", "D7"],
  },
];

export const STRUCTURE_CODES = STRUCTURE_TYPE_DEFS.map((d) => d.code);
export const structureDef = (v: string | null | undefined) => STRUCTURE_TYPE_DEFS.find((d) => d.code === v) ?? null;

/** Display text: label for a code, the stored text itself for an older value, "" for none. */
export const structureTypeLabel = (v: string | null | undefined) => structureDef(v)?.label ?? (v || "");

/** Stored value that predates the five types (shown as-is, never auto-mapped). */
export const isLegacyStructure = (v: string | null | undefined) => !!v && !structureDef(v);

/** <select> options: the five types, plus the current value if it is an older one so it stays visible. */
export function structureOptions(current?: string | null): { value: string; label: string }[] {
  const opts = STRUCTURE_TYPE_DEFS.map((d) => ({ value: d.code, label: d.label }));
  return isLegacyStructure(current) ? [...opts, { value: current!, label: `${current} (earlier option)` }] : opts;
}

/** Structure-detail fields to show. No type yet, or an older value: everything, as before. */
export const structureFields = (v: string | null | undefined): StructureField[] => structureDef(v)?.fields ?? HEIGHTS;

/**
 * Switch structure type. Clears structure inputs the new type doesn't use, so a
 * height typed for an Elevated system can't follow it to a shed (the proposal
 * document prints the upper height as the installation type). Never clears
 * Structure Legs, which drive anchor bolts for every type.
 */
export function applyStructureType<T extends Partial<Record<StructureField, number | "">> & { structureType: string }>(inputs: T, code: StructureCode): T {
  const keep = new Set(structureFields(code));
  const next = { ...inputs, structureType: code };
  for (const f of HEIGHTS) if (!keep.has(f) && f in next) (next as any)[f] = "";
  return next;
}
