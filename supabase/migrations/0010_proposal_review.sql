-- supabase/migrations/0010_proposal_review.sql
-- Admin review of finalized proposals: an employee finalizes a proposal, the
-- admin approves it or asks for changes with a note. review_status resets to
-- 'none' on every content save (POST /api/proposals in proposalsApi.ts)
-- since a changed proposal invalidates whatever review it had before.
alter table proposals add column if not exists review_status text not null default 'none' check (review_status in ('none', 'approved', 'needs_changes'));
alter table proposals add column if not exists review_note text;
alter table proposals add column if not exists reviewed_by uuid references users(id);
alter table proposals add column if not exists reviewed_at timestamptz;
