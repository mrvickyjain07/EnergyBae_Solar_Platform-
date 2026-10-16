// src/modules/proposal/proposalsApi.ts
// Saved-proposal backend (see BOQ_Revised_Implementation_Plan.md D21).
// POST /api/proposals — upsert by proposal_no, freezing the BOQ + pricing
// summary computed server-side against the CURRENT catalogue, so a save
// always reflects real prices at that moment rather than whatever the
// client had cached in memory.
// GET /api/proposals/:proposalNo — full record incl. the frozen items.
// GET /api/proposals — bare list for a minimal "Open Proposal" picker; the
// full searchable list (search/duplicate/version) is D22.
import type { Express } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { calcBOQ, computePricingSummary } from "./calculations";
import { buildProposalItemRows, isProposalStatus, isReviewDecision } from "./proposalRecord";
import { BOQOverrides, Catalogue, ProposalInputs, ProposalMeta } from "./types";
import { DEFAULT_CATALOGUE } from "./defaultCatalogue";
import { boqStage, LOCKED } from "./reviewActions";
import { FinanceSettings } from "./components/FinancialAnalysis";
import { orgOf, requireMember, requirePermission, hasPermission, type AuthedRequest } from "../../services/authMiddleware";

async function loadCurrentCatalogue(org: string): Promise<Catalogue> {
  const { data } = await getSupabase().from("catalogue_state").select("data").eq("organization_id", org).maybeSingle();
  return (data?.data as Catalogue) ?? DEFAULT_CATALOGUE;
}

export function registerProposalRoutes(app: Express) {
  app.post("/api/proposals", requireMember, async (req, res) => {
    const body = req.body as {
      proposalNo?: string;
      meta?: ProposalMeta;
      inputs?: ProposalInputs;
      overrides?: BOQOverrides;
      financeSettings?: FinanceSettings;
      status?: string;
    };
    if (!body?.proposalNo || !body.inputs || !isProposalStatus(body.status)) {
      return res.status(400).json({ error: "Request body must include proposalNo, inputs, and status ('draft'|'final')." });
    }
    try {
      const org = orgOf(req);
      const catalogue = await loadCurrentCatalogue(org);
      const overrides = body.overrides ?? {};
      const boq = calcBOQ(body.inputs, catalogue, overrides);
      const summary = computePricingSummary(boq, body.inputs, catalogue);
      const items = buildProposalItemRows(boq);

      const sb = getSupabase();
      const userId = (req as AuthedRequest).user!.sub;

      // created_by must only be set on first insert, not overwritten on every
      // re-save of a draft — check whether the row already exists first, since
      // upsert() can't conditionally skip a column on conflict.
      const { data: existing } = await sb.from("proposals").select("created_by, status, review_status").eq("organization_id", org).eq("proposal_no", body.proposalNo).maybeSingle();

      // Sent-for-approval and approved quotes are locked (same rule as the UI).
      // This check is the friendly first line; the guarantee is the
      // proposals_review_lock trigger (0020), which re-checks inside the upsert
      // so a review landing between this read and the write still wins.
      const locked = LOCKED[boqStage(existing)];
      if (locked) return res.status(409).json({ error: locked });

      const needed = [existing ? "proposal.update" : "proposal.create", ...(body.status === "final" ? ["proposal.finalize"] : [])];
      if (!hasPermission(req, ...needed)) {
        return res.status(403).json({ error: "You don't have permission to do that. Ask your company admin." });
      }

      const { data: proposal, error } = await sb
        .from("proposals")
        .upsert(
          {
            organization_id: org,
            // Where this quote came from (migration 0017). Composite FKs make the
            // DB refuse another company's project, or a system from another project.
            project_id: typeof body.meta?.projectId === "string" && body.meta.projectId ? body.meta.projectId : null,
            project_system_id: typeof body.meta?.projectId === "string" && body.meta.projectId && typeof body.meta?.projectSystemId === "string" && body.meta.projectSystemId ? body.meta.projectSystemId : null,
            proposal_no: body.proposalNo,
            proposal_date: body.meta?.proposalDate ?? "",
            status: body.status,
            customer_name: body.inputs.customerName || "",
            capacity_kw: typeof body.inputs.capacity === "number" ? body.inputs.capacity : null,
            total_effective: summary.finalAfterDiscount,
            inputs: body.inputs,
            overrides,
            finance_settings: body.financeSettings ?? null,
            pricing_summary: summary,
            created_by: existing?.created_by ?? userId,
            updated_by: userId,
            updated_at: new Date().toISOString(),
            // A content change invalidates whatever review this proposal had —
            // the admin needs to look at the new version before it counts again.
            review_status: "none",
            review_note: null,
            reviewed_by: null,
            reviewed_at: null,
          },
          { onConflict: "organization_id,proposal_no" }
        )
        .select("id")
        .single();
      if (error) {
        if (error.message === "proposal_locked") return res.status(409).json({ error: LOCKED[error.details === "approved" ? "approved" : "pending"] });
        if (error.code === "23503") return res.status(400).json({ error: "The linked project or system no longer exists. Unlink it and save again." });
        throw error;
      }

      // Replace the frozen line items wholesale — simplest correct upsert for
      // a ~40-row BOQ; no per-row diffing needed.
      const { error: delErr } = await sb.from("proposal_items").delete().eq("proposal_id", proposal.id);
      if (delErr) throw delErr;
      if (items.length) {
        const { error: insErr } = await sb.from("proposal_items").insert(items.map((it) => ({ ...it, proposal_id: proposal.id })));
        if (insErr) throw insErr;
      }

      res.json({ proposalNo: body.proposalNo, status: body.status, items, pricingSummary: summary });
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/proposals failed:", err.message);
      res.status(500).json({ error: "Failed to save proposal." });
    }
  });

  app.get("/api/proposals/:proposalNo", requirePermission("proposal.view"), async (req, res) => {
    try {
      const sb = getSupabase();
      const { data: proposal, error } = await sb.from("proposals").select("*").eq("organization_id", orgOf(req)).eq("proposal_no", req.params.proposalNo).maybeSingle();
      if (error) throw error;
      if (!proposal) return res.status(404).json({ error: "Proposal not found." });
      const { data: items, error: itemsErr } = await sb.from("proposal_items").select("*").eq("proposal_id", proposal.id).order("sr");
      if (itemsErr) throw itemsErr;
      res.json({ proposal, items: items ?? [] });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/proposals/:proposalNo failed:", err.message);
      res.status(500).json({ error: "Failed to load proposal." });
    }
  });

  app.get("/api/proposals", requirePermission("proposal.view"), async (req, res) => {
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("proposals")
        .select("proposal_no, customer_name, status, capacity_kw, total_effective, updated_at, created_by, review_status, review_note, reviewed_at, project_id")
        .eq("organization_id", orgOf(req))
        .order("updated_at", { ascending: false });
      if (error) throw error;

      // Employees can read this list (it's the "Open saved proposal" picker)
      // but not /api/users (needs user.view), so the creator's name is resolved
      // here rather than left for the client to look up.
      // Only the creators of THIS company's proposals — never the whole users table.
      const creatorIds = [...new Set((data ?? []).map((p) => p.created_by).filter(Boolean))];
      const { data: users } = creatorIds.length ? await sb.from("users").select("id, name").in("id", creatorIds) : { data: [] as { id: string; name: string }[] };
      const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
      // created_by (the id) is kept alongside the resolved name so the header
      // notifications can tell "my proposal" apart reliably — names aren't unique.
      const proposals = (data ?? []).map(({ created_by, ...rest }) => ({
        ...rest,
        created_by: created_by ?? null,
        created_by_name: created_by ? nameById.get(created_by) ?? null : null,
      }));

      res.json({ proposals });
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/proposals failed:", err.message);
      res.status(500).json({ error: "Failed to list proposals." });
    }
  });

  // Needs proposal.approve — approve a finalized proposal or ask for changes.
  app.patch("/api/proposals/:proposalNo/review", requirePermission("proposal.approve"), async (req, res) => {
    const { status, note, expectedUpdatedAt } = req.body as { status?: string; note?: string; expectedUpdatedAt?: string };
    if (!isReviewDecision(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'needs_changes'." });
    }
    // The version the reviewer looked at (the list's updated_at). Without it an
    // approval could land on content saved after the reviewer opened it.
    if (typeof expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(expectedUpdatedAt))) {
      return res.status(400).json({ error: "expectedUpdatedAt (the proposal's updated_at you reviewed) is required." });
    }
    try {
      const sb = getSupabase();
      const { data: existing, error: findErr } = await sb
        .from("proposals")
        .select("status")
        .eq("organization_id", orgOf(req))
        .eq("proposal_no", req.params.proposalNo)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!existing) return res.status(404).json({ error: "Proposal not found." });
      if (existing.status !== "final") {
        return res.status(400).json({ error: "Only a finalized proposal can be reviewed." });
      }

      const userId = (req as AuthedRequest).user!.sub;
      // One conditional UPDATE = atomic: it only lands on the exact version the
      // reviewer saw, and only while the proposal is still final.
      const { data: hit, error } = await sb
        .from("proposals")
        .update({
          review_status: status,
          review_note: note?.trim() || null,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("organization_id", orgOf(req))
        .eq("proposal_no", req.params.proposalNo)
        .eq("status", "final")
        .eq("updated_at", expectedUpdatedAt)
        .select("id");
      if (error) throw error;
      if (!hit?.length) {
        return res.status(409).json({ error: "This proposal changed since you opened it. Reload and review the new version." });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[EnergyBae] PATCH /api/proposals/:proposalNo/review failed:", err.message);
      res.status(500).json({ error: "Failed to save the review." });
    }
  });

  // Needs proposal.delete. Hard delete — proposal_items cascades via its FK
  // (migration 0007). No undo: unlike price_history, proposals have no
  // audit trail, so the client confirms before calling this.
  app.delete("/api/proposals/:proposalNo", requirePermission("proposal.delete"), async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("proposals")
        .delete()
        .eq("organization_id", orgOf(req))
        .eq("proposal_no", req.params.proposalNo)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Proposal not found." });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[EnergyBae] DELETE /api/proposals/:proposalNo failed:", err.message);
      res.status(500).json({ error: "Failed to delete proposal." });
    }
  });
}
