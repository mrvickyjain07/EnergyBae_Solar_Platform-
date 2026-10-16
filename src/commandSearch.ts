// src/commandSearch.ts
// Pure matching/ranking behind the header's command palette
// (components/CommandPalette.tsx), split out so it's testable without React.
// Deliberately simple: every word of the query must appear somewhere in the
// item's text (any order, case-insensitive). Ranked so a prefix hit on the
// title beats a hit buried in the subtitle.

export interface CommandItem {
  id: string;
  group: "Pages" | "Sections" | "Proposals";
  title: string;
  subtitle?: string;
  /** Extra words that should match but aren't shown (e.g. proposal number). */
  keywords?: string;
}

function score(item: CommandItem, words: string[]): number {
  const title = item.title.toLowerCase();
  const hay = `${title} ${(item.subtitle ?? "").toLowerCase()} ${(item.keywords ?? "").toLowerCase()}`;
  let s = 0;
  for (const w of words) {
    if (!hay.includes(w)) return -1;
    if (title.startsWith(w)) s += 3;
    else if (title.includes(` ${w}`)) s += 2;
    else if (title.includes(w)) s += 1;
  }
  return s;
}

/** Empty query returns items unchanged (caller decides what to show). */
export function searchCommands(items: CommandItem[], query: string): CommandItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items
    .map((item, i) => ({ item, i, s: score(item, words) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}
