// src/modules/boqEngine/pendingDecisions.test.ts
// Run with: npx tsx src/modules/boqEngine/pendingDecisions.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEGACY_V1 } from "./legacyV1";
import { PENDING_DECISIONS, PROVISIONAL_LINES, provisionalDecision, type DecisionId } from "./pendingDecisions";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const register = readFileSync(new URL("../../../docs/phase5/pending-business-decisions.md", import.meta.url), "utf8");
const heading = (id: string) => register.split("\n").find((l) => l.startsWith(`## ${id}. `)) ?? "";

// Every provisional line is a real legacy-v1 line
const srs = new Set(LEGACY_V1.items.map((i) => i.sr));
check("provisional lines exist in legacy-v1", Object.keys(PROVISIONAL_LINES).map(Number).filter((sr) => !srs.has(sr)), []);

// The list mirrors the register: same titles, and every decision is still open there
for (const id of Object.keys(PENDING_DECISIONS) as DecisionId[]) {
  const h = heading(id);
  check(`${id} heading title matches the register`, h.replace(`## ${id}. `, "").split(" — ")[0], PENDING_DECISIONS[id]);
  check(`${id} is still open in the register (else update PROVISIONAL_LINES)`, /`(proposed|pending)`/.test(h), true);
}

// Lookups
check("clamps wait on D2", provisionalDecision(25), { id: "D2", title: "U-clamps / Z-clamps" });
check("solar module is settled", provisionalDecision(1), null);
check("anchor bolts follow the approved D1 fix", provisionalDecision(22), null);
check("custom lines are never provisional", provisionalDecision(39), null);

console.log(`\n${passed} checks passed.`);
