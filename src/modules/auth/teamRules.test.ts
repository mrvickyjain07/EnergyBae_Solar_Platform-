// src/modules/auth/teamRules.test.ts
// Run with: npx tsx src/modules/auth/teamRules.test.ts
import assert from "node:assert/strict";
import { wouldRemoveLastOwner } from "./teamRules";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

check("demoting the only owner is blocked", wouldRemoveLastOwner(["u1"], "u1", { role: "admin", is_active: true }), true);
check("deactivating the only owner is blocked", wouldRemoveLastOwner(["u1"], "u1", { role: "owner", is_active: false }), true);
check("demoting one of two owners is fine", wouldRemoveLastOwner(["u1", "u2"], "u1", { role: "admin", is_active: true }), false);
check("renaming/keeping the only owner is fine", wouldRemoveLastOwner(["u1"], "u1", { role: "owner", is_active: true }), false);
check("changing a non-owner never trips it", wouldRemoveLastOwner(["u1"], "u9", { role: "finance", is_active: false }), false);

console.log(`\n${passed} passed`);
