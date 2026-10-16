-- supabase/migrations/0020_proposal_review_lock.sql
-- Database-enforced approval lock.
--
-- POST /api/proposals already refuses (409) to save over a proposal that is
-- waiting for approval or approved (reviewActions.ts LOCKED), but it reads the
-- row and then upserts in two round trips — an approval landing in between was
-- silently overwritten (and its review cleared). This trigger runs INSIDE the
-- UPDATE, after Postgres has taken the row lock, so concurrent writers to one
-- proposal are serialised and the second is checked against the row the first
-- committed. The API check stays as the friendly first line; this is the
-- guarantee.
--
-- Locked = status 'final' and review_status 'none' (sent for approval) or
-- 'approved' — exactly boqStage() in reviewActions.ts. In a locked row only a
-- REVIEW may change it: the review columns, to 'approved' / 'needs_changes'
-- (PATCH /api/proposals/:no/review). Blocked:
--   - any other column change (content, status, links, updated_by, …);
--   - setting review_status back to 'none' on an approved row — only a save
--     does that, so this also catches a byte-identical re-save that would
--     otherwise wipe an approval.
-- updated_at is excluded from the content comparison: it is bookkeeping (set
-- by the save route; checked on 2026-10-06 that no trigger touches it on Dev
-- or prod), and excluding it keeps reviews allowed if an auto-updated_at
-- trigger is ever added.
--
-- DELETE is not affected (proposal.delete stays a separate permission).
-- Any future backfill migration that updates proposals must disable this
-- trigger around the backfill.
--
-- Requires 0010 (review columns) and 0015. Deploy with the code that maps the
-- 'proposal_locked' error to 409. Rollback: drop trigger + function.

create or replace function proposals_review_lock() returns trigger language plpgsql as $$
declare
  review_cols constant text[] := array['review_status', 'review_note', 'reviewed_by', 'reviewed_at', 'updated_at'];
begin
  if old.status = 'final' and old.review_status in ('none', 'approved') and (
       (to_jsonb(new) - review_cols) is distinct from (to_jsonb(old) - review_cols)
       or (old.review_status = 'approved' and new.review_status = 'none')
     ) then
    raise exception 'proposal_locked' using errcode = 'P0001',
      detail = case when old.review_status = 'approved' then 'approved' else 'pending' end;
  end if;
  return new;
end $$;

-- create or replace (PG14+) keeps the migration re-runnable without a destructive DROP.
create or replace trigger proposals_review_lock before update on proposals
  for each row execute function proposals_review_lock();
