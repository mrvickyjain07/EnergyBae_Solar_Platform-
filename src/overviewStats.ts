// src/overviewStats.ts
// Pure aggregation behind the Overview dashboard (OverviewDashboard.tsx),
// split out so it can be tested without React. Input is the same list
// GET /api/proposals already returns; nothing here fetches.

export interface OverviewProposal {
  proposal_no: string;
  customer_name: string;
  status: "draft" | "final";
  total_effective: number | null;
  updated_at: string;
  created_by_name: string | null;
  review_status: "none" | "approved" | "needs_changes";
}

export interface OverviewStats {
  total: number;
  updatedThisMonth: number;
  finalCount: number;
  draftCount: number;
  pipelineValue: number;
  awaitingReview: number;
  approved: number;
  needsChanges: number;
  /** Oldest → newest, always `months` entries, zero-filled. */
  monthly: { label: string; count: number }[];
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function computeOverviewStats(proposals: OverviewProposal[], now: Date, months = 6): OverviewStats {
  const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const nowKey = monthKey(now);
  const monthly = Array.from({ length: months }, (_, i) => {
    const key = nowKey - (months - 1 - i);
    return { key, label: MONTH[((key % 12) + 12) % 12], count: 0 };
  });

  const s: OverviewStats = {
    total: proposals.length,
    updatedThisMonth: 0,
    finalCount: 0,
    draftCount: 0,
    pipelineValue: 0,
    awaitingReview: 0,
    approved: 0,
    needsChanges: 0,
    monthly: [],
  };

  for (const p of proposals) {
    const k = monthKey(new Date(p.updated_at));
    if (k === nowKey) s.updatedThisMonth++;
    const bucket = monthly.find((m) => m.key === k);
    if (bucket) bucket.count++;

    if (p.status === "final") {
      s.finalCount++;
      // Only finalised proposals wait on a review; a draft isn't submitted yet.
      if (p.review_status === "none") s.awaitingReview++;
    } else {
      s.draftCount++;
    }
    if (p.review_status === "approved") s.approved++;
    if (p.review_status === "needs_changes") s.needsChanges++;
    if (typeof p.total_effective === "number" && Number.isFinite(p.total_effective)) s.pipelineValue += p.total_effective;
  }

  s.monthly = monthly.map(({ label, count }) => ({ label, count }));
  return s;
}

/** Indian-style compact rupees: ₹85,000 · ₹4.2L · ₹1.35Cr. */
export function formatINRCompact(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, "")}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function timeAgo(iso: string, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
