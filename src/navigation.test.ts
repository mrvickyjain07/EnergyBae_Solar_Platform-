// src/navigation.test.ts
// Run with: npx tsx src/navigation.test.ts
import assert from "node:assert/strict";
import { NAV_SECTIONS, ROUTES, SCANNER_ROUTES, visibleSections, canAccess } from "./navigation";
import { systemRole, isPermission } from "./permissions";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const allRoutes = Object.keys(ROUTES).sort();
const navRoutes = NAV_SECTIONS.flatMap((s) => s.items);
// Standalone scanner: the sidebar is exactly SCANNER_ROUTES (the SaaS repo asserts every route instead).
check("sidebar is exactly the scanner routes, once each", [...navRoutes].sort(), [...SCANNER_ROUTES].sort());
check("Bill Analysis is in the scanner", SCANNER_ROUTES.has("bill-analysis"), true);

const as = (roleKey: string) => {
  const held = new Set(systemRole(roleKey)!.permissions);
  return (p: string) => held.has(p);
};
const routesFor = (roleKey: string) => visibleSections(as(roleKey)).flatMap((s) => s.items as string[]);

check("every route's permission is a real permission key", Object.values(ROUTES).every((r) => !r.permission || isPermission(r.permission)), true);
check("owner sees every scanner route", routesFor("owner").length, SCANNER_ROUTES.size);
check("every route still has metadata", allRoutes.length > SCANNER_ROUTES.size, true);
check("sales executive (old employee) sees no price editing, team or roles", routesFor("sales_executive").filter((r) => ["catalogue", "pricing", "team", "roles"].includes(r)), []);
check("procurement sees Catalogue and Pricing but not Team", (["catalogue", "pricing", "team"] as const).map((r) => canAccess(r, as("procurement"))), [true, true, false]);
check("a section emptied by the permission filter is dropped", visibleSections(() => false).every((s) => s.items.length > 0), true);
check("with no permissions only ungated routes remain", visibleSections(() => false).flatMap((s) => s.items).every((r) => !ROUTES[r].permission), true);

check("sales executive cannot open Team", canAccess("team", as("sales_executive")), false);
check("sales executive can open BOQ", canAccess("boq", as("sales_executive")), true);
check("Bill Analysis is live", ROUTES["bill-analysis"].status, "live");
check("BOQ is partial until capacity templates exist", ROUTES.boq.status, "partial");

console.log(`\n${passed} passed`);
