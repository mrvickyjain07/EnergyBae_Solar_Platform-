// src/modules/society/googleAccessGate.test.tsx
// Run with: npx tsx src/modules/society/googleAccessGate.test.tsx
// Public scanner: Google Drive folder import was removed (2026-10-16) — the
// housing-society and C&I several-bills screens must never render it, for
// any role, while local multi-file upload stays. Static markup, so "hidden" = not in the HTML at all.
// (The server side of this boundary is authMiddleware.guest.test.ts.)
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthContext } from "../../contexts/AuthContext";
import { resolvePermissions } from "../../permissions";

// The C&I module imports its colocated .css (Vite handles it in the app);
// Node can't, so stub stylesheets as empty modules — built-in hook, no deps.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    return nextLoad(url, context);
  },
});
// Harmless in-memory sessionStorage in case anything still reads it.
const mem = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
const { default: SocietyBatchAnalysis } = await import("./SocietyBatchAnalysis");
const { default: CommercialBatchAnalysis } = await import("../commercial/CommercialBatchAnalysis");

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const ctx = (permissions: string[], signedIn: boolean) => ({
  user: { permissions } as any, loading: false, signedIn,
  loginWithGoogle: async () => {}, logout: async () => {}, switchOrganization: async () => {},
  can: (p: string) => permissions.includes(p),
});
const render = (el: React.ReactElement, permissions: string[], signedIn: boolean) =>
  renderToStaticMarkup(React.createElement(AuthContext.Provider, { value: ctx(permissions, signedIn) }, el));

const society = React.createElement(SocietyBatchAnalysis, { presetProjectId: null, onSaved: () => {}, onOpenProject: () => {} });
const commercial = React.createElement(CommercialBatchAnalysis, {});
const hasDrive = (html: string) => /Google Drive folder/.test(html);

const GUEST = ["bill_analysis.create", "bill_analysis.view"];
const cases: [string, string[], boolean, boolean][] = [
  ["anonymous guest", GUEST, false, false],
  ["engineering (no import permission)", resolvePermissions("engineering"), true, false],
  ["procurement (no import permission)", resolvePermissions("procurement"), true, false],
  ["sales executive", resolvePermissions("sales_executive"), true, false],
  ["admin", resolvePermissions("admin"), true, false],
];

for (const [who, perms, signedIn, expected] of cases) {
  check(`society Drive card — ${who}`, hasDrive(render(society, perms, signedIn)), expected);
  check(`C&I Drive card — ${who}`, hasDrive(render(commercial, perms, signedIn)), expected);
}

// Local multi-file upload stays available to everyone, including the public.
check("guest keeps local multi-file upload (society)", /Upload several bills|Click to upload/.test(render(society, GUEST, false)), true);
check("guest keeps local multi-file upload (C&I)", /Upload several bills|Click to upload/.test(render(commercial, GUEST, false)), true);
// Advertised limit matches src/uploadLimits.ts, not the old 50 MB.
check("upload limit shown is 3 MB", /up to 3 MB/.test(render(society, GUEST, false)), true);
check("no 50 MB claim", /50 MB/.test(render(commercial, GUEST, false)), false);
// Guest never sees society "Save bills" (needs an account + project access).
check("guest has no import permission", GUEST.includes("bill_analysis.import"), false);

console.log(`\n${passed} passed`);
