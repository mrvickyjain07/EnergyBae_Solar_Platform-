// src/modules/proposal/editHistory.test.ts
// Run with: npx tsx src/modules/proposal/editHistory.test.ts
import assert from "node:assert/strict";
import { emptyHistory, pushHistory, undoHistory, redoHistory, HISTORY_LIMIT } from "./editHistory";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

check("a fresh history has nothing to undo", emptyHistory({ a: 1 }).past.length, 0);
check("a fresh history exposes its present", emptyHistory({ a: 1 }).present, { a: 1 });

// push -> undo -> redo round trip
{
  let h = emptyHistory<Record<string, number>>({});
  h = pushHistory(h, { "1": 9 });
  h = pushHistory(h, { "1": 9, c1: 500 });
  check("present is the latest push", h.present, { "1": 9, c1: 500 });
  check("past holds both earlier states", h.past.length, 2);

  h = undoHistory(h);
  check("undo steps back one edit", h.present, { "1": 9 });
  h = undoHistory(h);
  check("undo steps back to the start", h.present, {});
  check("undo on an empty past is a no-op", undoHistory(h).present, {});

  h = redoHistory(h);
  check("redo replays the first edit", h.present, { "1": 9 });
  h = redoHistory(h);
  check("redo replays the second edit", h.present, { "1": 9, c1: 500 });
  check("redo past the end is a no-op", redoHistory(h).present, { "1": 9, c1: 500 });
}

// A new edit after undoing must discard the abandoned redo branch — otherwise
// redo would jump to a state the user already moved away from.
{
  let h = emptyHistory<Record<string, number>>({});
  h = pushHistory(h, { a: 1 });
  h = pushHistory(h, { a: 2 });
  h = undoHistory(h);
  check("future is populated after an undo", h.future.length, 1);
  h = pushHistory(h, { a: 99 });
  check("a fresh edit clears the redo branch", h.future.length, 0);
  check("a fresh edit becomes the present", h.present, { a: 99 });
}

// The stack is capped so a long editing session can't grow unbounded.
{
  let h = emptyHistory<Record<string, number>>({});
  for (let i = 0; i < HISTORY_LIMIT + 25; i++) h = pushHistory(h, { n: i });
  check("past is capped at the limit", h.past.length, HISTORY_LIMIT);
  check("the newest state survives the cap", h.present, { n: HISTORY_LIMIT + 24 });
}

console.log(`\n${passed} checks passed.`);
