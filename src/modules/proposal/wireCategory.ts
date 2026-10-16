// src/modules/proposal/wireCategory.ts
// Routes an uploaded wire row to the right category by its actual core count.
// A supplier price sheet is a size x core-count matrix, so a single upload
// legitimately contains both 1-core and n-core products — stamping every row
// with the one category picked in the upload form filed "10 core ... Flexible
// Cable" under Single Core Cable.

export const SINGLE_CORE = "Single Core Cable";
export const MULTI_CORE = "Multi Core Cable";

// Only these two are decided by core count. "Aluminium Armoured Cable"
// describes construction, not core count — a 4-core armoured cable is still
// armoured — so that selection is passed through untouched.
const CORE_ROUTED = new Set<string>([SINGLE_CORE, MULTI_CORE]);

export function resolveWireType(selectedCategory: string, cores: number | null | undefined): string {
  if (!CORE_ROUTED.has(selectedCategory)) return selectedCategory;
  if (cores == null || !Number.isFinite(cores) || cores < 1) return selectedCategory;
  return cores === 1 ? SINGLE_CORE : MULTI_CORE;
}
