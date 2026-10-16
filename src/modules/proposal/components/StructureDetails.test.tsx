// src/modules/proposal/components/StructureDetails.test.tsx
// Run with: npx tsx src/modules/proposal/components/StructureDetails.test.tsx
// Pending-default policy P2: the proposed F / B / SH / Prestructure formulas
// reach the page only for boq_template.update holders. Rendered to static
// markup (react-dom/server, no DOM library), so "hidden" here means "not in
// the HTML at all" — not a collapsed <details> or a CSS class.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthContext, AuthProvider } from "../../../contexts/AuthContext";
import { buildBlankProposalInputs } from "../types";
import { STRUCTURE_TYPE_DEFS } from "../structureTypes";
import StructureDetails from "./StructureDetails";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const noop = () => async () => {};
const ctx = (permissions: string[] | null) => ({
  user: permissions ? ({ permissions } as any) : null, loading: false, signedIn: !!permissions,
  loginWithGoogle: async () => {}, logout: async () => {}, switchOrganization: async () => {},
  can: (p: string) => !!permissions?.includes(p),
});
const details = (code: string) => React.createElement(StructureDetails, { inputs: { ...buildBlankProposalInputs(), structureType: code }, setNum: () => noop });
const render = (code: string, permissions: string[] | null) =>
  renderToStaticMarkup(React.createElement(AuthContext.Provider, { value: ctx(permissions) }, details(code)));
const dds = (html: string) => [...html.matchAll(/<dd[^>]*>(.*?)<\/dd>/g)].map((m) => m[1]);
// Every proposal value except bare "0", which also appears as the legs placeholder
const proposalValues = (d: (typeof STRUCTURE_TYPE_DEFS)[number]) =>
  [d.proposal.front, d.proposal.back, d.proposal.sh, d.proposal.prestructure].filter((v) => v !== "0");

for (const d of STRUCTURE_TYPE_DEFS) {
  // A. Template editor: proposed rule under the review disclosure, labelled not approved
  const editor = render(d.code, ["boq_template.update"]);
  check(`${d.code} editor: disclosure present`, editor.includes("<details") && editor.includes("Proposed rule (for engineering review)"), true);
  check(`${d.code} editor: proposed values shown`, dds(editor).slice(4), [d.proposal.front, d.proposal.back, d.proposal.sh, d.proposal.prestructure]);
  check(`${d.code} editor: labelled not approved`, editor.includes("Not approved; not used anywhere."), true);

  // B. Signed in without the permission (incl. other permissions): only "Requires engineering input"
  for (const perms of [[], ["proposal.create", "proposal.approve", "boq_template.read"]]) {
    const html = render(d.code, perms);
    const who = perms.length ? "other permissions" : "no permissions";
    check(`${d.code} ${who}: every rule reads "Requires engineering input"`, dds(html), Array(4).fill("Requires engineering input"));
    check(`${d.code} ${who}: no disclosure to expand`, [html.includes("<details"), html.includes("Proposed rule")], [false, false]);
    check(`${d.code} ${who}: no proposed value in the markup`, proposalValues(d).filter((v) => html.includes(v)), []);
  }

  // C. Signed out, and the real provider before /api/auth/me resolves (loading, no user)
  for (const [label, html] of [
    ["signed out", render(d.code, null)],
    ["auth loading", renderToStaticMarkup(React.createElement(AuthProvider, null, details(d.code)))],
  ] as const) {
    check(`${d.code} ${label}: formulas not rendered`, [html.includes("<details"), proposalValues(d).filter((v) => html.includes(v))], [false, []]);
  }
}

// The SH = F note is reviewer-only too
check("SH = F note only for editors", [render("N-E", ["boq_template.update"]), render("N-E", [])].map((h) => h.includes("written the same as Front")), [true, false]);

console.log(`\n${passed} checks passed.`);
