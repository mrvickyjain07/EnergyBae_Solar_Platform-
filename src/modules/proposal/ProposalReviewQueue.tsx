// src/modules/proposal/ProposalReviewQueue.tsx
// Admin-only: every finalized proposal in one place — who submitted it, and
// an approve / needs-changes + note action. Server-side enforcement is the
// requireAdmin-gated PATCH /api/proposals/:proposalNo/review (see server.ts);
// this screen is only reachable in the UI when App.tsx renders it for an
// admin, same pattern as UserManagement.tsx.
import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, Eye, Trash2 } from "lucide-react";
import { listProposalsAsync, loadProposalAsync, loadCatalogueAsync, reviewProposalAsync, deleteProposalAsync, saveStandaloneEditorHandoff, ProposalListEntry, SavedProposal } from "./storage";
import { fmtINR } from "./calculations";
import { groupBOQ } from "./boqGrouping";
import { ProposalItemRow } from "./proposalRecord";
import { BOQItem, Catalogue, PricingSummary } from "./types";
import { DEFAULT_CATALOGUE } from "./defaultCatalogue";
import { buildProposalData } from "./buildProposalData";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  none: { label: "Pending review", className: "bg-[var(--hover-bg)] text-[var(--text-secondary)]" },
  approved: { label: "Approved", className: "bg-[var(--accent-green)]/15 text-[var(--accent-green)]" },
  needs_changes: { label: "Needs changes", className: "bg-amber-500/15 text-amber-500" },
};

interface ProposalDetail {
  proposal: SavedProposal;
  items: ProposalItemRow[];
}

function toBOQItems(items: ProposalItemRow[]): BOQItem[] {
  return items.map((i) => ({ ...i, unitCost: i.unit_cost }));
}

// Read-only rendering of the FROZEN BOQ exactly as it was saved — no editing,
// no live recompute against the current catalogue (that's the whole point of
// a frozen final proposal, see CLAUDE.md's "Proposal freeze" section).
function FrozenBOQTable({ items }: { items: ProposalItemRow[] }) {
  const groups = groupBOQ(toBOQItems(items));
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-xs text-[var(--text-muted)] bg-[var(--bg-surface)]">
            <th className="text-left px-3 py-2">Item</th>
            <th className="text-left px-3 py-2">Spec / Make</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Unit Cost</th>
            <th className="text-right px-3 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <React.Fragment key={g.group}>
              <tr className="bg-[var(--bg-surface)]/60">
                <td colSpan={5} className="px-3 py-1.5 font-medium text-[var(--text-secondary)] text-xs">
                  {g.group} · {fmtINR(g.subtotal)}
                </td>
              </tr>
              {g.items.map((item) => (
                <tr key={item.sr} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="px-3 py-1.5 text-[var(--text-primary)]">{item.name}</td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">{[item.make, item.spec].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-1.5 text-right text-[var(--text-secondary)] font-mono">{item.qty || "—"} {item.unit}</td>
                  <td className="px-3 py-1.5 text-right text-[var(--text-secondary)] font-mono">{item.unitCost ? fmtINR(item.unitCost) : "—"}</td>
                  <td className="px-3 py-1.5 text-right text-[var(--text-primary)] font-mono">{item.price ? fmtINR(item.price) : "—"}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProposalReviewQueue() {
  const [proposals, setProposals] = useState<ProposalListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ProposalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Loaded once and reused for every "View Proposal" — buildProposalData only
  // reads catalogue.charges.gst as a display fallback, not per-proposal state.
  const [catalogue, setCatalogue] = useState<Catalogue>(DEFAULT_CATALOGUE);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const all = await listProposalsAsync();
      setProposals(all.filter((p) => p.status === "final"));
    } catch {
      setError("Failed to load proposals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadCatalogueAsync().then(setCatalogue).catch(() => {});
  }, []);

  const openReview = (p: ProposalListEntry) => {
    setOpenRow(p.proposal_no);
    setNote(p.review_note || "");
    setError(null);
    setDetail(null);
    setDetailLoading(true);
    loadProposalAsync(p.proposal_no)
      .then(setDetail)
      .catch(() => setError("Failed to load the proposal's BOQ."))
      .finally(() => setDetailLoading(false));
  };

  // Same handoff the employee's own "Edit Proposal" button uses (ProposalMaker.tsx's
  // handleOpenStandaloneEditor) — seed the localStorage key proposal-editor.html
  // reads on load, then open it in a new tab. Built from the FROZEN inputs/items/
  // summary since this page has no live form state of its own.
  const viewProposal = (d: ProposalDetail) => {
    if (!d.proposal.pricing_summary) {
      setError("This proposal has no pricing summary saved — can't open the document.");
      return;
    }
    const data = buildProposalData(
      d.proposal.inputs,
      catalogue,
      toBOQItems(d.items),
      d.proposal.pricing_summary as PricingSummary,
      { proposalNo: d.proposal.proposal_no, proposalDate: d.proposal.proposal_date },
      null
    );
    saveStandaloneEditorHandoff(data);
    window.open(`${window.location.origin}/proposal-editor.html?preview=1`, "_blank", "noopener");
  };

  const deleteProposal = async (p: ProposalListEntry) => {
    if (!window.confirm(`Delete proposal ${p.proposal_no} (${p.customer_name || "Unnamed"})? This can't be undone.`)) return;
    setDeleting(p.proposal_no);
    setError(null);
    try {
      await deleteProposalAsync(p.proposal_no);
      if (openRow === p.proposal_no) setOpenRow(null);
      await load();
    } catch {
      setError("Failed to delete the proposal.");
    } finally {
      setDeleting(null);
    }
  };

  const submitReview = async (p: ProposalListEntry, status: "approved" | "needs_changes") => {
    setSubmitting(true);
    setError(null);
    try {
      await reviewProposalAsync(p.proposal_no, status, note, p.updated_at);
      setOpenRow(null);
      await load();
    } catch (e) {
      // e.g. "This proposal changed since you opened it…" — reload so the reviewer sees the new version.
      setError(e instanceof Error ? e.message : "Failed to save the review.");
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <h2 className="text-xs font-medium font-display text-[var(--text-primary)]">Proposal Reviews</h2>

      {error && <div className="p-3 bg-red-950/25 border border-red-900/40 rounded-xl text-xs text-red-300 font-mono">{error}</div>}

      <div className="glass-panel rounded-2xl overflow-hidden bg-[var(--bg-card)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
              <th className="text-left px-4 py-2.5">Proposal</th>
              <th className="text-left px-4 py-2.5">Customer</th>
              <th className="text-left px-4 py-2.5">Submitted by</th>
              <th className="text-left px-4 py-2.5">Amount</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--text-muted)]">Loading…</td>
              </tr>
            ) : proposals.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--text-muted)]">No finalized proposals yet.</td>
              </tr>
            ) : (
              proposals.map((p) => {
                const badge = STATUS_BADGE[p.review_status];
                const isOpen = openRow === p.proposal_no;
                return (
                  <React.Fragment key={p.proposal_no}>
                    <tr className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-[var(--text-primary)]">{p.proposal_no}</td>
                      <td className="px-4 py-2.5 text-[var(--text-primary)]">{p.customer_name || "Unnamed"}</td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.created_by_name || "Unknown"}</td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)] font-mono">{p.total_effective != null ? fmtINR(p.total_effective) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => (isOpen ? setOpenRow(null) : openReview(p))}
                            className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer text-xs font-semibold"
                          >
                            {isOpen ? "Close" : "View & Review"}
                          </button>
                          <button
                            type="button"
                            title="Delete this proposal"
                            disabled={deleting === p.proposal_no}
                            onClick={() => deleteProposal(p)}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-950/25 cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-[var(--border-subtle)] last:border-0 bg-[var(--bg-surface)]/40">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="space-y-3">
                            {detailLoading ? (
                              <div className="text-[var(--text-muted)] text-xs py-2">Loading proposal…</div>
                            ) : detail ? (
                              <div className="space-y-2.5">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                                  <div>
                                    <div className="text-[var(--text-muted)] text-xs">Customer</div>
                                    <div className="font-semibold text-[var(--text-primary)]">{detail.proposal.inputs.customerName || "—"}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)] text-xs">Capacity</div>
                                    <div className="font-semibold text-[var(--text-primary)]">{detail.proposal.inputs.capacity || "—"} kW · {detail.proposal.inputs.phase || "—"}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)] text-xs">Proposal date</div>
                                    <div className="font-semibold text-[var(--text-primary)]">{detail.proposal.proposal_date || "—"}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-muted)] text-xs">Total payable</div>
                                    <div className="font-semibold text-[var(--accent-green)]">
                                      {(() => {
                                        const s = detail.proposal.pricing_summary as PricingSummary | null;
                                        if (!s) return "—";
                                        return fmtINR(s.discountAmt > 0 ? s.finalAfterDiscount : s.effective);
                                      })()}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    disabled={!detail.proposal.pricing_summary}
                                    onClick={() => viewProposal(detail)}
                                    title={detail.proposal.pricing_summary ? undefined : "This proposal has no pricing summary saved."}
                                    className="px-3 py-1.5 rounded-lg bg-[var(--accent-solid)] text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> View Proposal
                                  </button>
                                </div>
                                <FrozenBOQTable items={detail.items} />
                              </div>
                            ) : (
                              <div className="text-red-300 text-xs py-2">Couldn't load this proposal's BOQ.</div>
                            )}
                            <textarea
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Note for the employee (optional for approve, recommended for needs-changes)…"
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => submitReview(p, "approved")}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => submitReview(p, "needs_changes")}
                                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" /> Needs changes
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] font-mono flex items-center gap-1.5">
        <Clock className="w-3 h-3" /> Re-saving a finalized proposal clears its review — the employee's next edit needs a fresh look.
      </p>
    </div>
  );
}
