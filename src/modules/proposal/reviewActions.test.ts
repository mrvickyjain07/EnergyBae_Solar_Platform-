// src/modules/proposal/reviewActions.test.ts
// Run with: npx tsx src/modules/proposal/reviewActions.test.ts
import assert from "node:assert/strict";
import { boqActions, boqStage } from "./reviewActions";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const all = (_p: string) => true;
const only = (...p: string[]) => (x: string) => p.includes(x);
const on = (stage: Parameters<typeof boqActions>[0], can = all) => Object.fromEntries(Object.entries(boqActions(stage, can)).map(([k, v]) => [k, v.enabled]));

check("stage: nothing saved", boqStage(null), "unsaved");
check("stage: draft", boqStage({ status: "draft", review_status: "none" }), "draft");
check("stage: final, no review yet", boqStage({ status: "final", review_status: "none" }), "pending");
check("stage: approved", boqStage({ status: "final", review_status: "approved" }), "approved");
check("stage: needs changes", boqStage({ status: "final", review_status: "needs_changes" }), "needs_changes");

check("unsaved: everything available", on("unsaved"), { saveDraft: true, finalize: true, excel: true, proposal: true });
check("draft: everything available", on("draft"), { saveDraft: true, finalize: true, excel: true, proposal: true });
check("pending: save/finalize locked, exports open", on("pending"), { saveDraft: false, finalize: false, excel: true, proposal: true });
check("approved: save/finalize locked, exports open", on("approved"), { saveDraft: false, finalize: false, excel: true, proposal: true });
check("needs changes: can save and resubmit", on("needs_changes"), { saveDraft: true, finalize: true, excel: true, proposal: true });
check("needs changes relabels finalize", boqActions("needs_changes", all).finalize.label, "Resubmit for approval");

// Permissions mirror POST /api/proposals: create for new, update for existing, + finalize for final.
check("new BOQ needs proposal.create", on("unsaved", only("proposal.update", "proposal.finalize")).saveDraft, false);
check("saved BOQ needs proposal.update", on("draft", only("proposal.create")).saveDraft, false);
check("finalize needs proposal.finalize", on("draft", only("proposal.update")), { saveDraft: true, finalize: false, excel: false, proposal: false });
check("exports need their own permissions", on("draft", only("boq.export", "proposal.export")), { saveDraft: false, finalize: false, excel: true, proposal: true });
check("lock reason wins over permission reason", boqActions("approved", () => false).saveDraft.reason, "Approved — this BOQ is locked.");
check("permission reason explains", boqActions("draft", () => false).excel.reason, "You don't have permission to do this. Ask your company admin.");

console.log(`\n${passed} passed`);
