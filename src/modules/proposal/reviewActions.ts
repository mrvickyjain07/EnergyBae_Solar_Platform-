// src/modules/proposal/reviewActions.ts
// Which Review & Export actions are available, and why not. Pure, so the
// rules live in ONE place: every button on the page (Option A, Option B and
// the shared status bar) renders from the same ActionState, never its own logic.
//
// Inputs are only what already exists: the saved proposal's status /
// review_status (proposalsApi.ts) and the caller's permissions (can()). The
// permissions mirror POST /api/proposals: create vs update, plus
// proposal.finalize for status "final".
//
// The same LOCKED stages are enforced server-side in POST /api/proposals.

export type BoqStage = "unsaved" | "draft" | "pending" | "needs_changes" | "approved";
export type ActionKey = "saveDraft" | "finalize" | "excel" | "proposal";
export interface ActionState { label: string; enabled: boolean; reason: string | null }

export function boqStage(saved: { status: string; review_status: string } | null | undefined): BoqStage {
  if (!saved) return "unsaved";
  if (saved.status !== "final") return "draft";
  if (saved.review_status === "approved") return "approved";
  if (saved.review_status === "needs_changes") return "needs_changes";
  return "pending";
}

export const LOCKED: Partial<Record<BoqStage, string>> = {
  pending: "Sent for approval — wait for the review before changing it.",
  approved: "Approved — this BOQ is locked.",
};

export function boqActions(stage: BoqStage, can: (permission: string) => boolean): Record<ActionKey, ActionState> {
  const write = stage === "unsaved" ? "proposal.create" : "proposal.update";
  const state = (label: string, perms: string[], lock: boolean): ActionState => {
    const missing = perms.some((p) => !can(p));
    const reason = lock && LOCKED[stage] ? LOCKED[stage]! : missing ? "You don't have permission to do this. Ask your company admin." : null;
    return { label, enabled: reason === null, reason };
  };
  return {
    saveDraft: state(stage === "unsaved" ? "Save as draft" : "Save changes as draft", [write], true),
    finalize: state(stage === "needs_changes" ? "Resubmit for approval" : "Finalize & send for approval", [write, "proposal.finalize"], true),
    excel: state("Download BOQ (Excel)", ["boq.export"], false),
    proposal: state("Edit Proposal", ["proposal.export"], false),
  };
}

export const STAGE_TEXT: Record<BoqStage, string> = {
  unsaved: "Not saved in the app yet.",
  draft: "Saved as a draft — reopen and edit it any time.",
  pending: "Finalized — waiting for admin approval.",
  needs_changes: "Admin asked for changes — edit, then resubmit.",
  approved: "Finalized and approved.",
};
