// src/modules/proposal/sanitizePrice.ts
// Single source of truth for "is this a legal price/qty number" — used by both
// PriceDatabase.tsx (client) and the /api/catalogue route (server) so the
// AC-Cable-at-"-1" / Adani-at-"80000/Wp" class of bug can't recur through some
// other input we forgot to guard individually.
export function sanitizePrice(raw: unknown, opts?: { min?: number; max?: number }): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Infinity;
  return Math.min(Math.max(n, min), max);
}
