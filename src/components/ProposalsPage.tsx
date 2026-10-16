// src/components/ProposalsPage.tsx
// Proposals index — the real saved quotes from GET /api/proposals (the same
// shared feed the header bell uses), plus the admin review queue as a tab.
// Opening a row loads it into the BOQ workspace, exactly like the header
// search does.
import React, { useMemo, useState } from "react";
import { Search, Plus, FileText, ClipboardCheck, Inbox, RefreshCw, ChevronRight } from "lucide-react";
import EmptyState from "./ui/EmptyState";
import SegmentedTabs from "./SegmentedTabs";
import ProposalReviewQueue from "../modules/proposal/ProposalReviewQueue";
import { formatINRCompact, timeAgo } from "../overviewStats";
import type { FeedProposal } from "../notifications";

type Filter = "all" | "draft" | "final" | "needs_changes";
export type ProposalsView = "list" | "reviews";

const REVIEW_BADGE: Record<FeedProposal["review_status"], { label: string; cls: string } | null> = {
  none: null,
  approved: { label: "Approved", cls: "bg-emerald-500/10 text-[var(--success-text)]" },
  needs_changes: { label: "Needs changes", cls: "bg-amber-500/10 text-amber-600" },
};

interface Props {
  proposals: FeedProposal[] | null;
  /** proposal.approve — shows the review queue tab. */
  canReview: boolean;
  view: ProposalsView;
  onViewChange: (v: ProposalsView) => void;
  onOpen: (proposalNo: string) => void;
  onNew: () => void;
  onRetry: () => void;
}

export default function ProposalsPage({ proposals, canReview, view, onViewChange, onOpen, onNew, onRetry }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const now = useMemo(() => new Date(), [proposals]);
  const awaiting = (proposals ?? []).filter((p) => p.status === "final" && p.review_status === "none").length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (proposals ?? [])
      .filter((p) =>
        filter === "all" ? true : filter === "needs_changes" ? p.review_status === "needs_changes" : p.status === filter,
      )
      .filter((p) => !q || p.customer_name?.toLowerCase().includes(q) || p.proposal_no.toLowerCase().includes(q));
  }, [proposals, filter, query]);

  const counts = useMemo(() => {
    const list = proposals ?? [];
    return {
      all: list.length,
      draft: list.filter((p) => p.status === "draft").length,
      final: list.filter((p) => p.status === "final").length,
      needs_changes: list.filter((p) => p.review_status === "needs_changes").length,
    };
  }, [proposals]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {canReview ? (
          <SegmentedTabs<ProposalsView>
            ariaLabel="Proposals view"
            value={view}
            onChange={onViewChange}
            options={[
              { value: "list", label: "All proposals", icon: FileText },
              { value: "reviews", label: awaiting ? `Review queue (${awaiting})` : "Review queue", icon: ClipboardCheck },
            ]}
          />
        ) : <div />}
        <button type="button" onClick={onNew}
          className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white shadow-sm hover:opacity-90 cursor-pointer">
          <Plus className="w-4 h-4" /> New proposal
        </button>
      </div>

      {view === "reviews" && canReview ? (
        <ProposalReviewQueue />
      ) : (
        <section className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)]">
            <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1">
              {([
                ["all", "All"],
                ["draft", "Drafts"],
                ["final", "Finalised"],
                ["needs_changes", "Needs changes"],
              ] as const).map(([id, label]) => (
                <button
                  key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                  className={`h-8 px-3 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    filter === id ? "bg-[var(--hover-bg)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label} <span className="ml-1 text-xs tabular-nums text-[var(--text-muted)]">{counts[id]}</span>
                </button>
              ))}
            </div>
            <label className="relative w-full lg:w-72">
              <span className="sr-only">Search proposals</span>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer or proposal no."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
              />
            </label>
          </div>

          {proposals === null ? (
            <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading proposals">
              {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-11 rounded-lg bg-[var(--hover-bg)] animate-pulse" />)}
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-[var(--text-muted)]">Still loading? The server may be unreachable.</p>
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-green)] cursor-pointer">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            </div>
          ) : proposals.length === 0 ? (
            <div className="p-6">
              <EmptyState icons={[FileText, Inbox, ClipboardCheck]} title="No proposals yet"
                description="Build a BOQ, then save it as a draft or finalise it — it will appear here for your whole team.">
                <button type="button" onClick={onNew}
                  className="h-9 px-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white cursor-pointer">
                  <Plus className="w-4 h-4" /> Create your first proposal
                </button>
              </EmptyState>
            </div>
          ) : rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">No proposals match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Saved proposals</caption>
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Capacity</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Value</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">Owner</th>
                    <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Updated</th>
                    <th scope="col" className="px-2 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const review = REVIEW_BADGE[p.review_status];
                    return (
                      <tr key={p.proposal_no} onClick={() => onOpen(p.proposal_no)}
                        className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--hover-bg)] cursor-pointer">
                        <td className="px-4 py-3">
                          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(p.proposal_no); }}
                            className="text-left outline-none focus-visible:underline cursor-pointer">
                            <span className="block font-medium text-[var(--text-primary)]">{p.customer_name || "Untitled customer"}</span>
                            <span className="block text-xs text-[var(--text-muted)]">{p.proposal_no}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                          {typeof p.capacity_kw === "number" ? <><span className="font-medium text-[var(--solar-text)]">{p.capacity_kw}</span> kW</> : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)] font-medium">
                          {typeof p.total_effective === "number" ? formatINRCompact(p.total_effective) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap gap-1.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === "final" ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : "bg-[var(--hover-bg)] text-[var(--text-secondary)]"}`}>
                              {p.status === "final" ? "Final" : "Draft"}
                            </span>
                            {review && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${review.cls}`}>{review.label}</span>}
                            {p.status === "final" && p.review_status === "none" && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--solar)]/12 text-[var(--solar-text)]">Awaiting review</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-[var(--text-secondary)]">{p.created_by_name || "—"}</td>
                        <td className="px-4 py-3 hidden sm:table-cell text-[var(--text-muted)] whitespace-nowrap">{timeAgo(p.updated_at, now)}</td>
                        <td className="px-2 py-3"><ChevronRight className="w-4 h-4 text-[var(--text-muted)]" aria-hidden /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
