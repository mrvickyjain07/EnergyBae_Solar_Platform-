// src/services/tenancy.test.ts
// Run with: npx tsx src/services/tenancy.test.ts
import assert from "node:assert/strict";
import { pickActiveOrganization, buildSessionView, MembershipRow } from "./tenancy";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const m = (over: Partial<MembershipRow>): MembershipRow => ({
  organization_id: "org-a", organization_name: "A Solar", role: "sales_executive", is_active: true, created_at: "2026-01-01T00:00:00Z", ...over,
});

const a = m({});
const b = m({ organization_id: "org-b", organization_name: "B Energy", role: "owner", created_at: "2026-03-01T00:00:00Z" });
const revoked = m({ organization_id: "org-c", organization_name: "C Power", is_active: false, created_at: "2025-01-01T00:00:00Z" });

check("preferred org wins when still an active member", pickActiveOrganization([a, b], "org-b")?.organization_id, "org-b");
check("falls back to oldest active membership", pickActiveOrganization([b, a], null)?.organization_id, "org-a");
check("revoked preferred org is never chosen", pickActiveOrganization([a, revoked], "org-c")?.organization_id, "org-a");
check("revoked membership is skipped even if oldest", pickActiveOrganization([revoked, b])?.organization_id, "org-b");
check("unknown preferred org falls back", pickActiveOrganization([a], "org-zzz")?.organization_id, "org-a");
check("no active memberships = no access", pickActiveOrganization([revoked], "org-c"), null);
check("no memberships = no access", pickActiveOrganization([]), null);

const view = buildSessionView({ id: "u1", email: "x@y.in", name: "X" }, [b, revoked, a], b);
check("user.role is the role in the ACTIVE org", view.user.role, "owner");
check("roleName is the readable name", view.user.roleName, "Owner");
check("permissions come from the ACTIVE org's role", view.user.permissions.includes("organization.update"), true);
const custom = buildSessionView({ id: "u1", email: "x@y.in", name: "X" }, [m({ role: "custom", custom_role_name: "Site Surveyor", custom_permissions: ["boq.view", "bogus.perm"] })], m({ role: "custom", custom_role_name: "Site Surveyor", custom_permissions: ["boq.view", "bogus.perm"] }));
check("custom role name is shown", custom.user.roleName, "Site Surveyor");
check("custom role permissions drop unknown keys", custom.user.permissions, ["boq.view"]);
check("active organization is reported", view.organization, { id: "org-b", name: "B Energy" });
check("switcher lists only active memberships, sorted", view.organizations.map((o) => o.id), ["org-a", "org-b"]);

console.log(`\n${passed} passed`);
