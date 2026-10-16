// Run: npx tsx src/services/authMiddleware.guest.test.ts
// The public-scanner boundary: a request with NO session may reach only the
// scan/export allowlist, as a guest that holds scan permissions only — never
// owner/admin, never bill_analysis.import (Drive). No database is touched.
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "./authMiddleware";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
  passed++;
}

async function anonymous(path: string) {
  const req = { path, headers: {} } as unknown as Request;
  let status = 200;
  const res = { status(s: number) { status = s; return this; }, json() { return this; } } as unknown as Response;
  let nexted = false;
  await requireAuth(req, res, () => { nexted = true; });
  return { req: req as AuthedRequest, status, nexted };
}

// Paths are relative to the /api mount, exactly as Express hands them over.
const PUBLIC = ["/extract", "/enhance-bill", "/download-excel", "/commercial/extract", "/commercial/export", "/commercial/batch-export"];
const PRIVATE = [
  "/bill-analyses", "/bill-analyses/123", "/projects", "/customers", "/proposals", "/catalogue",
  "/wire-prices", "/inverter-prices", "/boq-templates", "/capacity-ranges", "/users", "/roles",
  "/organization", "/status", "/auth/switch-organization",
  // near-misses of public routes must not slip through
  "/extract/../users", "/extractx", "/commercial/extract/x", "/commercial", "/download-excel/",
];

(async () => {
  for (const p of PUBLIC) {
    const r = await anonymous(p);
    check(`public ${p} passes`, r.nexted, true);
    check(`public ${p} guest is not owner`, r.req.user?.role, "guest");
    check(`public ${p} guest perms`, r.req.user?.permissions, ["bill_analysis.create", "bill_analysis.view"]);
  }
  for (const p of PRIVATE) {
    const r = await anonymous(p);
    check(`private ${p} blocked`, [r.nexted, r.status], [false, 401]);
  }

  // The guest can run scans but holds no employee-only permission.
  const { req } = await anonymous("/extract");
  for (const [perm, allowed] of [
    ["bill_analysis.create", true], ["bill_analysis.import", false], ["bill_analysis.update", false],
    ["project.view", false], ["pricing.view", false], ["user.view", false],
  ] as const) {
    let status = 200; let nexted = false;
    const res = { status(s: number) { status = s; return this; }, json() { return this; } } as unknown as Response;
    requirePermission(perm)(req, res, () => { nexted = true; });
    check(`guest ${perm}`, nexted, allowed);
    if (!allowed) check(`guest ${perm} → 403`, status, 403);
  }

  console.log(`\n${passed} passed`);
})();
