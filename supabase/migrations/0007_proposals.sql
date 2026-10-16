-- supabase/migrations/0007_proposals.sql
-- Saved proposals (see BOQ_Revised_Implementation_Plan.md D21). Distinct from
-- the aspirational proposals/proposal_items in schema.sql — those predate
-- catalogue_state and are superseded; this is what the app actually writes.
--
-- proposal_no is the natural key (human-facing quote number, already
-- generated client-side by generateProposalNumber()) — save is an upsert by
-- proposal_no, same pattern as wire_prices' internal_name.
--
-- inputs/overrides/finance_settings are the editable state (used to restore
-- a DRAFT for further live editing). pricing_summary and proposal_items are
-- the FROZEN computed output at save time — a FINAL proposal is rendered
-- from these, never recomputed, so later catalogue price changes can't alter
-- a quote that's already gone out. See catalogueApi.ts / proposalsApi.ts.
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_no text not null unique,
  proposal_date text not null default '',
  status text not null default 'draft' check (status in ('draft', 'final')),
  customer_name text not null default '',
  capacity_kw numeric,
  total_effective numeric,
  inputs jsonb not null,
  overrides jsonb not null default '{}'::jsonb,
  finance_settings jsonb,
  pricing_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proposals_status_idx on proposals(status);
create index if not exists proposals_updated_at_idx on proposals(updated_at desc);

create table if not exists proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  sr integer not null,
  "group" text not null,
  name text not null,
  spec text not null default '',
  make text not null default '',
  unit text not null default '',
  qty numeric not null default 0,
  unit_cost numeric not null default 0,
  price numeric not null default 0
);
create index if not exists proposal_items_proposal_id_idx on proposal_items(proposal_id);

alter table proposals enable row level security;
alter table proposal_items enable row level security;
