// src/routePermissions.test.ts
// Run with: npx tsx src/routePermissions.test.ts
// Fail-closed guard for authorization: every /api route must declare an
// access rule — requirePermission(...) or requireMember — either on the route
// itself or as a pre-registration gate for the same method+path (the pattern
// server.ts uses for Bill Analysis files that stay untouched). A new route
// with no declaration fails this test instead of shipping open to every
// signed-in user. Only the sign-in routes are public.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = new Set(["post /api/auth/google-login", "post /api/auth/logout", "get /api/auth/me", "post /api/auth/switch-organization"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const ROUTE = /app\.(get|post|put|patch|delete)\(\s*"(\/api[^"]*)"([^\n]*)/g;
const declared = new Map<string, boolean>(); // "method path" -> guarded anywhere?

for (const file of [...walk("src"), "server.ts"]) {
  for (const m of readFileSync(file, "utf8").matchAll(ROUTE)) {
    const key = `${m[1]} ${m[2]}`;
    const guarded = /requirePermission\(|requireMember\b/.test(m[3]);
    declared.set(key, (declared.get(key) ?? false) || guarded);
  }
}

const unguarded = [...declared].filter(([key, guarded]) => !guarded && !PUBLIC.has(key)).map(([key]) => key);

assert.ok(declared.size >= 35, `expected to find every route, only saw ${declared.size} — did the scan break?`);
assert.deepEqual(unguarded, [], `Routes with no access rule (add requirePermission or requireMember):\n  ${unguarded.join("\n  ")}`);
console.log(`  ok — ${declared.size} /api routes, all declare an access rule (${PUBLIC.size} public sign-in routes)`);
console.log(`\n1 passed`);
