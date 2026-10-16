// src/permissions.test.ts
// Run with: npx tsx src/permissions.test.ts
import assert from "node:assert/strict";
import { ALL_PERMISSIONS, SYSTEM_ROLES, systemRole, resolvePermissions, canGrant, isPermission } from "./permissions";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const perms = (k: string) => new Set(systemRole(k)!.permissions);

check("permission keys are unique", new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length);
check("every system role uses only known permissions", SYSTEM_ROLES.every((r) => r.permissions.every(isPermission)), true);
check("no system role lists a permission twice", SYSTEM_ROLES.every((r) => new Set(r.permissions).size === r.permissions.length), true);
check("owner holds everything", perms("owner").size, ALL_PERMISSIONS.length);
check("admin can't change company settings", perms("admin").has("organization.update"), false);
check("admin can manage roles", perms("admin").has("role.assign"), true);

// Migration 0016 maps the old "employee" role to sales_executive: it must keep
// exactly what employees could do on the server before RBAC, and nothing admin-only.
const exec = perms("sales_executive");
for (const p of ["bill_analysis.create", "boq.create", "proposal.create", "proposal.update", "proposal.finalize", "catalogue.view", "pricing.view", "proposal.view"]) {
  check(`sales_executive keeps employee capability ${p}`, exec.has(p), true);
}
for (const p of ["catalogue.update", "pricing.update", "pricing.import", "proposal.approve", "proposal.delete", "user.view", "user.invite", "role.assign", "organization.branding.update"]) {
  check(`sales_executive lacks former admin-only ${p}`, exec.has(p), false);
}
check("only managers-and-up approve proposals", SYSTEM_ROLES.filter((r) => r.permissions.includes("proposal.approve")).map((r) => r.key), ["owner", "admin", "sales_manager", "finance"]);

check("custom role keeps only known permissions", resolvePermissions("custom", ["boq.view", "hack.everything", "boq.view"]), ["boq.view"]);
check("custom role with no permissions has none", resolvePermissions("custom", null), []);
check("unknown role key resolves to nothing (fail closed)", resolvePermissions("superuser"), []);

check("can grant a subset of own permissions", canGrant(["boq.view", "boq.create"], ["boq.view"]), true);
check("can't grant a permission you lack", canGrant(["boq.view"], ["boq.view", "role.assign"]), false);
check("admin can't grant owner (company settings)", canGrant(systemRole("admin")!.permissions, systemRole("owner")!.permissions), false);

console.log(`\n${passed} passed`);
