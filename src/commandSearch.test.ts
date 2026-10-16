// src/commandSearch.test.ts
// Run with: npx tsx src/commandSearch.test.ts
import assert from "node:assert/strict";
import { searchCommands, CommandItem } from "./commandSearch";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const items: CommandItem[] = [
  { id: "p1", group: "Pages", title: "Bill Analysis" },
  { id: "p2", group: "Pages", title: "Proposal Maker" },
  { id: "x1", group: "Proposals", title: "Vyankatesh Hanumante", subtitle: "EBAE/QUO/26-27/047", keywords: "final" },
  { id: "x2", group: "Proposals", title: "Anita Proposal Sharma", subtitle: "EBAE/QUO/26-27/012" },
];
const ids = (q: string) => searchCommands(items, q).map((i) => i.id);

check("empty query returns everything in order", ids(""), ["p1", "p2", "x1", "x2"]);
check("case-insensitive title match", ids("bill"), ["p1"]);
check("matches proposal number in subtitle", ids("047"), ["x1"]);
check("matches hidden keywords", ids("final"), ["x1"]);
check("every word must match", ids("vyank 012"), []);
check("words match in any order", ids("hanumante vyank"), ["x1"]);
check("title prefix outranks mid-title match", ids("proposal"), ["p2", "x2"]);
check("no match returns empty", ids("zzz"), []);

console.log(`\n${passed} checks passed.`);
