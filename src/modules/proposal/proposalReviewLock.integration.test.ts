// src/modules/proposal/proposalReviewLock.integration.test.ts
// Run with: npx tsx src/modules/proposal/proposalReviewLock.integration.test.ts
//
// The approval lock end to end, against the real route handlers and the
// EnergyBae DEV database (.env.local) with migration 0020 applied:
//   - the proposals_review_lock trigger, hit DIRECTLY with the service role
//     (no API in front), so the database itself is what's being tested;
//   - the exact interleaving the trigger exists for: the API's lock check
//     passes, an approval commits, then the save's upsert runs;
//   - the review route's optimistic check (expectedUpdatedAt);
//   - 50 rounds of a real save racing a real approval: exactly one wins, and
//     an approval is never left on content the reviewer didn't see.
// Only the session is stubbed (the user/org/permissions requireAuth resolves).
//
// Refuses to run against any database but Dev. Works in its own throwaway
// organization and cleans up by the exact ids it created — never by a filter.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import dotenv from "dotenv";
import express from "express";
import { getSupabase } from "../../services/supabaseClient";
import type { RequestUser } from "../../services/authMiddleware";
import { ALL_PERMISSIONS } from "../../permissions";
import { registerProposalRoutes } from "./proposalsApi";
import { buildBlankProposalInputs } from "./types";
import { LOCKED } from "./reviewActions";

dotenv.config({ path: ".env.local" });
const DEV_PROJECT = "pafvngnhupxjegbvflcx";
if (!process.env.SUPABASE_URL?.includes(DEV_PROJECT)) {
  console.error(`Refusing to run: SUPABASE_URL is not the EnergyBae Dev project (${DEV_PROJECT}).`);
  process.exit(1);
}

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const sb = getSupabase();
const ROUNDS = 50;
const inputs = (customerName: string) => ({ ...buildBlankProposalInputs(), customerName, capacity: 3, panelWp: 600, phase: "1-Phase" as const, numInverters: 1, panelRows: 1, numStrings: 1 });
const created = { org: null as string | null };

async function main() {
  const { data: member } = await sb.from("organization_memberships").select("user_id").limit(1).single();
  const userId = member!.user_id as string;
  const { data: orgRow, error: orgErr } = await sb.from("organizations").insert({ name: "ZZ-IT Review Lock" }).select("id").single();
  if (orgErr) throw orgErr;
  const org = (created.org = orgRow.id as string);

  const as: RequestUser = { sub: userId, email: "it@test", name: "IT", org, role: "owner", permissions: [...ALL_PERMISSIONS] };
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use((req, _res, next) => { (req as any).user = as; next(); });
  registerProposalRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
  };
  const save = (no: string, name: string, status: "draft" | "final" = "final") => call("POST", "/api/proposals", { proposalNo: no, inputs: inputs(name), status });
  const review = (no: string, status: "approved" | "needs_changes", expectedUpdatedAt: string) =>
    call("PATCH", `/api/proposals/${encodeURIComponent(no)}/review`, { status, note: "it", expectedUpdatedAt });
  const row = async (no: string) => {
    const { data, error } = await sb.from("proposals").select("id, status, review_status, updated_at, customer_name, inputs").eq("organization_id", org).eq("proposal_no", no).single();
    if (error) throw error;
    return data;
  };
  // The raw content write the save route performs, without its API check in front.
  const rawContentUpdate = (no: string, name: string) =>
    sb.from("proposals").update({ customer_name: name, updated_at: new Date().toISOString() }).eq("organization_id", org).eq("proposal_no", no).select("id");
  const rawReviewUpdate = (no: string, status: string) =>
    sb.from("proposals").update({ review_status: status, review_note: "raw", reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("organization_id", org).eq("proposal_no", no).select("id");

  try {
    // ── 1. draft stays editable ─────────────────────────────────────────
    check("draft saves", (await save("IT-1", "Draft A", "draft")).status, 200);
    check("draft content editable at DB level", (await rawContentUpdate("IT-1", "Draft B")).error, null);

    // ── 2. pending (final, review none) is locked in the database ───────
    check("finalize", (await save("IT-1", "Final A")).status, 200);
    let r = await row("IT-1");
    check("finalized = pending", [r.status, r.review_status], ["final", "none"]);
    const pendingEdit = await rawContentUpdate("IT-1", "Sneaky");
    check("pending: DB refuses a content update", [pendingEdit.error?.message, pendingEdit.error?.details], ["proposal_locked", "pending"]);
    check("pending: API refuses a re-save (409)", [(await save("IT-1", "Sneaky")).status], [409]);
    check("pending: content unchanged", (await row("IT-1")).customer_name, "Final A");

    // ── 3. a review is allowed on a locked row ──────────────────────────
    const preReview = await row("IT-1");
    check("pending → approved via the review route", (await review("IT-1", "approved", preReview.updated_at)).status, 200);
    r = await row("IT-1");
    check("approved, updated_at untouched by the review", [r.review_status, r.updated_at], ["approved", preReview.updated_at]);

    // ── 4. approved is locked: raw update, raw upsert, byte-identical re-save ─
    const approvedEdit = await rawContentUpdate("IT-1", "Sneaky");
    check("approved: DB refuses a content update", [approvedEdit.error?.message, approvedEdit.error?.details], ["proposal_locked", "approved"]);
    const upsert = await sb.from("proposals").upsert({ organization_id: org, proposal_no: "IT-1", proposal_date: "", status: "final", customer_name: "Final A", inputs: r.inputs, review_status: "none", review_note: null, reviewed_by: null, reviewed_at: null }, { onConflict: "organization_id,proposal_no" }).select("id");
    check("approved: DB refuses the save route's upsert (identical content, review reset)", upsert.error?.message, "proposal_locked");
    const resetOnly = await rawReviewUpdate("IT-1", "none");
    check("approved: DB refuses clearing the approval", resetOnly.error?.message, "proposal_locked");
    const r4 = await save("IT-1", "Sneaky");
    check("approved: API refuses a re-save with the approved message", [r4.status, r4.json.error], [409, LOCKED.approved]);
    check("approved: still approved, content unchanged", [(await row("IT-1")).review_status, (await row("IT-1")).customer_name], ["approved", "Final A"]);

    // ── 5. reviewer can send it back; then it is editable again ─────────
    r = await row("IT-1");
    check("approved → needs_changes allowed", (await review("IT-1", "needs_changes", r.updated_at)).status, 200);
    check("needs_changes: content editable", (await save("IT-1", "Final B")).status, 200);
    r = await row("IT-1");
    check("re-save resets the review (pending again)", [r.review_status, r.customer_name], ["none", "Final B"]);

    // ── 6. stale approval is refused ────────────────────────────────────
    const stale = await review("IT-1", "approved", "2000-01-01T00:00:00.000Z");
    check("approval of an older version → 409", stale.status, 409);
    check("missing expectedUpdatedAt → 400", (await call("PATCH", "/api/proposals/IT-1/review", { status: "approved" })).status, 400);
    check("stale approval left it pending", (await row("IT-1")).review_status, "none");

    // ── 7. the interleaving the trigger exists for ──────────────────────
    // needs_changes → the save route's API check would PASS → an approval
    // commits → the save's write must still be refused, by the database.
    check("send back for changes", (await review("IT-1", "needs_changes", (await row("IT-1")).updated_at)).status, 200);
    const seenBySave = await row("IT-1"); // what the save route's check reads
    check("API check would pass (needs_changes)", seenBySave.review_status, "needs_changes");
    check("approval commits in between", (await review("IT-1", "approved", seenBySave.updated_at)).status, 200);
    const late = await rawContentUpdate("IT-1", "Late save");
    check("late save write refused by the DB", late.error?.message, "proposal_locked");
    check("approval survives", [(await row("IT-1")).review_status, (await row("IT-1")).customer_name], ["approved", "Final B"]);

    // ── 8. 50 rounds: real save vs real approval, fired together ────────
    let saveWins = 0, approveWins = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const no = `IT-RACE-${i}`;
      await save(no, `v0-${i}`);
      const pending = await row(no);
      await review(no, "needs_changes", pending.updated_at); // editable AND approvable
      const before = await row(no);
      const [s, a] = await Promise.all([save(no, `v1-${i}`), review(no, "approved", before.updated_at)]);
      const after = await row(no);
      const statuses = [s.status, a.status].sort().join(",");
      assert.equal(statuses, "200,409", `round ${i}: exactly one must win, got save ${s.status} / approve ${a.status}`);
      if (a.status === 200) {
        approveWins++;
        assert.deepEqual([after.review_status, after.customer_name, after.updated_at], ["approved", `v0-${i}`, before.updated_at], `round ${i}: approval must hold the content it reviewed`);
      } else {
        saveWins++;
        assert.deepEqual([after.review_status, after.customer_name], ["none", `v1-${i}`], `round ${i}: winning save must leave it pending, never approved`);
      }
    }
    check(`${ROUNDS} save-vs-approve rounds: one winner each, no approval on unseen content`, saveWins + approveWins, ROUNDS);
    console.log(`     (save won ${saveWins}, approval won ${approveWins})`);
  } finally {
    server.close();
    // Exact org only: its proposals (items cascade), then the org itself.
    if (created.org) {
      await sb.from("proposals").delete().eq("organization_id", created.org);
      await sb.from("organizations").delete().eq("id", created.org);
    }
  }
  console.log(`\n${passed} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
