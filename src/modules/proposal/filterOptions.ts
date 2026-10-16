// src/modules/proposal/filterOptions.ts
// Type-to-narrow matching for the searchable wire picker. Every whitespace-
// separated term must appear somewhere in the option text, in any order, so
// "4 3 core" finds "…Cable 4 sqmm 3 core" out of ~180 near-identical names.
// A single substring match would force the user to type the exact phrase.

const NUMERIC = /^\d+(\.\d+)?$/;

// Conductor sizes in this catalogue run 0.5 / 4 / 40 / 400, so a plain
// substring match on "4" drags in every 40 and 400 row. Numeric terms are
// therefore matched as whole numbers; text terms stay loose so a partial word
// like "coax" still finds "Coaxial".
function matches(haystack: string, term: string): boolean {
  if (!NUMERIC.test(term)) return haystack.includes(term);
  const escaped = term.replace(".", "\\.");
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(haystack);
}

export function filterOptions<T>(options: T[], query: string, text: (option: T) => string): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return options;
  return options.filter((option) => {
    const haystack = text(option).toLowerCase();
    return terms.every((t) => matches(haystack, t));
  });
}
