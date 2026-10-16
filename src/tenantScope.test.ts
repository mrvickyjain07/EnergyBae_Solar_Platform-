// src/tenantScope.test.ts
// Run with: npx tsx src/tenantScope.test.ts
// Static guard for the #1 multi-tenancy bug: a server query on a tenant-owned
// table that forgets to filter by organization. Scans every server-side .ts
// file, splits it into statements, and fails if a statement touching a tenant
// table never mentions organization_id. New route file? It's covered
// automatically. Deliberately crude (text, not AST) — a false positive is a
// prompt to look, and the fix is to add the filter, not to weaken this check.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TENANT_TABLES = ["catalogue_state", "wire_prices", "inverter_prices", "price_history", "proposals", "organization_settings", "organization_memberships", "custom_roles", "customers", "projects", "project_systems", "bill_analyses", "capacity_ranges", "boq_templates", "boq_template_versions"];
// proposal_items is reached only through a proposal id the same handler has
// already loaded with an organization filter (proposalsApi.ts).

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const files = [...walk("src"), "server.ts", ...walk("scripts")];
const violations: string[] = [];
let checked = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Statements end at ";" — good enough for supabase-js chains, which this app
  // always writes as one expression statement.
  for (const stmt of src.split(";")) {
    for (const table of TENANT_TABLES) {
      if (!stmt.includes(`.from("${table}")`)) continue;
      checked++;
      if (!stmt.includes("organization_id")) {
        violations.push(`${file}: .from("${table}") without organization_id →\n    ${stmt.trim().replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
  }
}

// Scripts that operate across organizations on purpose (platform tooling).
const ALLOWED = [/scripts[\\/]createOrganization\.ts/, /scripts[\\/]seedAdmin\.ts/];
const real = violations.filter((v) => !ALLOWED.some((re) => re.test(v)));

assert.ok(checked > 20, `expected to find the tenant queries, only saw ${checked} — did the scan break?`);
assert.deepEqual(real, [], `Unscoped tenant queries:\n${real.join("\n")}`);
console.log(`  ok — ${checked} tenant-table queries across ${files.length} files, all organization-scoped`);
console.log(`\n1 passed`);
