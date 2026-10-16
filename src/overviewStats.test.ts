// src/overviewStats.test.ts
// Run with: npx tsx src/overviewStats.test.ts
import assert from "node:assert/strict";
import { computeOverviewStats, formatINRCompact, timeAgo, OverviewProposal } from "./overviewStats";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const now = new Date("2026-09-28T12:00:00");
const p = (over: Partial<OverviewProposal>): OverviewProposal => ({
  proposal_no: "X", customer_name: "C", status: "draft", total_effective: null,
  updated_at: "2026-09-10T10:00:00", created_by_name: null, review_status: "none", ...over,
});

const s = computeOverviewStats(
  [
    p({ status: "final", total_effective: 300000 }),
    p({ status: "final", review_status: "approved", total_effective: 200000, updated_at: "2026-08-02T10:00:00" }),
    p({ status: "final", review_status: "needs_changes", total_effective: null, updated_at: "2026-04-15T10:00:00" }),
    p({ status: "draft", total_effective: 50000, updated_at: "2025-01-01T10:00:00" }), // outside the 6-month window
  ],
  now,
);

check("total", s.total, 4);
check("updated this month", s.updatedThisMonth, 1);
check("final vs draft", [s.finalCount, s.draftCount], [3, 1]);
check("null totals are skipped in pipeline", s.pipelineValue, 550000);
check("only un-reviewed finals await review", s.awaitingReview, 1);
check("review split", [s.approved, s.needsChanges], [1, 1]);
check("6 zero-filled months ending now", s.monthly.map((m) => m.label), ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
check("monthly counts; old rows fall outside the window", s.monthly.map((m) => m.count), [1, 0, 0, 0, 1, 1]);
check("window wraps the year boundary", computeOverviewStats([], new Date("2026-02-10"), 4).monthly.map((m) => m.label), ["Nov", "Dec", "Jan", "Feb"]);
check("empty list", computeOverviewStats([], now).pipelineValue, 0);

check("rupees under a lakh", formatINRCompact(85000), "₹85,000");
check("lakhs", formatINRCompact(420000), "₹4.2L");
check("whole lakhs drop .0", formatINRCompact(500000), "₹5L");
check("crores", formatINRCompact(13500000), "₹1.35Cr");

check("minutes ago", timeAgo("2026-09-28T11:45:00", now), "15m ago");
check("days ago", timeAgo("2026-09-25T12:00:00", now), "3d ago");
check("future clamps to just now", timeAgo("2026-09-28T13:00:00", now), "just now");

console.log(`\n${passed} checks passed.`);
