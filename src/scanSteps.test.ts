// src/scanSteps.test.ts
// Run with: npx tsx src/scanSteps.test.ts
import assert from "node:assert/strict";
import { stepStates, ScanStep } from "./scanSteps";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const steps: ScanStep[] = [
  { label: "a", start: 0 },
  { label: "b", start: 15 },
  { label: "c", start: 40 },
  { label: "d", start: 65 },
];

check("start: first active, rest pending", stepStates(steps, 5), ["active", "pending", "pending", "pending"]);
check("boundary hands over to the next step", stepStates(steps, 15), ["done", "active", "pending", "pending"]);
check("mid-way", stepStates(steps, 50), ["done", "done", "active", "pending"]);
// The regression: simulated progress parks at 90 while the server works —
// the last step must still be in progress, not "Completed".
check("parked at 90: last step still active", stepStates(steps, 90), ["done", "done", "done", "active"]);
check("only 100 completes the last step", stepStates(steps, 100), ["done", "done", "done", "done"]);

console.log(`\n${passed} checks passed.`);
