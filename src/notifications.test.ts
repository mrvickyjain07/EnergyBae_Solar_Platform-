// src/notifications.test.ts
// Run with: npx tsx src/notifications.test.ts
import assert from "node:assert/strict";
import { buildNotifications, FeedProposal } from "./notifications";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const p = (o: Partial<FeedProposal>): FeedProposal => ({
  proposal_no: "EB/1", customer_name: "Asha", status: "draft", updated_at: "2026-09-01T10:00:00Z",
  created_by: "u1", review_status: "none", review_note: null, reviewed_at: null, ...o,
});
const admin = { id: "admin1", canReview: true };
const emp = { id: "u1", canReview: false };

check("drafts never notify", buildNotifications([p({})], admin), []);
check("admin sees un-reviewed finals",
  buildNotifications([p({ status: "final" })], admin).map((n) => n.kind), ["awaiting_review"]);
check("employees don't see the review queue",
  buildNotifications([p({ status: "final", created_by: "someone-else" })], emp), []);
check("creator hears about approval",
  buildNotifications([p({ status: "final", review_status: "approved" })], emp).map((n) => n.kind), ["approved"]);
check("needs-changes carries the reviewer's note",
  buildNotifications([p({ status: "final", review_status: "needs_changes", review_note: "Fix panel count" })], emp)[0].body,
  "EB/1 · Fix panel count");
check("other people's reviews stay private",
  buildNotifications([p({ status: "final", review_status: "approved", created_by: "u2" })], emp), []);

// A status change must yield a different id, so it shows as unread again.
const before = buildNotifications([p({ status: "final", review_status: "needs_changes", reviewed_at: "2026-09-02T00:00:00Z" })], emp)[0].id;
const after = buildNotifications([p({ status: "final", review_status: "approved", reviewed_at: "2026-09-03T00:00:00Z" })], emp)[0].id;
check("status change → new notification id", before !== after, true);

check("newest first",
  buildNotifications([
    p({ proposal_no: "old", status: "final", updated_at: "2026-09-01T00:00:00Z" }),
    p({ proposal_no: "new", status: "final", updated_at: "2026-09-05T00:00:00Z" }),
  ], admin).map((n) => n.proposalNo),
  ["new", "old"]);

console.log(`\n${passed} checks passed.`);
