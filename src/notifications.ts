// src/notifications.ts
// Pure rules turning the GET /api/proposals list into header notifications.
// No notification table exists — these are derived from real proposal state,
// so they can never drift from it. Read/unread is per-browser (localStorage,
// see Navbar.tsx); an id encodes the status, so a status change produces a
// NEW, unread notification.

export interface FeedProposal {
  proposal_no: string;
  customer_name: string;
  status: "draft" | "final";
  updated_at: string;
  created_by: string | null;
  review_status: "none" | "approved" | "needs_changes";
  review_note: string | null;
  reviewed_at?: string | null;
  total_effective?: number | null;
  capacity_kw?: number | null;
  created_by_name?: string | null;
}

export type NotificationKind = "awaiting_review" | "approved" | "needs_changes";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: string;
  proposalNo: string;
}

export function buildNotifications(
  proposals: FeedProposal[],
  /** canReview = holds proposal.approve in the active company. */
  user: { id: string; canReview: boolean },
): AppNotification[] {
  const out: AppNotification[] = [];
  for (const p of proposals) {
    const who = p.customer_name || "Untitled customer";
    // Reviewers: finalised proposals nobody has reviewed yet.
    if (user.canReview && p.status === "final" && p.review_status === "none") {
      out.push({
        id: `${p.proposal_no}:awaiting:${p.updated_at}`,
        kind: "awaiting_review",
        title: "Proposal awaiting review",
        body: `${p.proposal_no} · ${who}`,
        at: p.updated_at,
        proposalNo: p.proposal_no,
      });
    }
    // Everyone: the outcome of a review on a proposal THEY created.
    if (p.created_by === user.id && p.review_status !== "none") {
      const at = p.reviewed_at || p.updated_at;
      out.push({
        id: `${p.proposal_no}:${p.review_status}:${at}`,
        kind: p.review_status,
        title: p.review_status === "approved" ? "Your proposal was approved" : "Your proposal needs changes",
        body: p.review_status === "needs_changes" && p.review_note ? `${p.proposal_no} · ${p.review_note}` : `${p.proposal_no} · ${who}`,
        at,
        proposalNo: p.proposal_no,
      });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
