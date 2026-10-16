-- supabase/migrations/0018_bill_analyses.sql
-- Saved bill analyses (Phase 4: Bill → Project).
--
-- One row = one reviewed bill analysis. It is STANDALONE (project_id null —
-- a bill is often analysed before any project exists) or linked to one
-- project; it can be linked later. Project is never mandatory. `data` is the
-- worksheet snapshot exactly as the vendor left it (jsonb, because it's the
-- client's nested worksheet shape and is only ever read back whole). The
-- scalar columns beside it are derived from `data` by the SERVER at save time
-- (billAnalysisRules.ts) so project screens can list/sort without parsing
-- jsonb and without trusting client-computed numbers.
--
-- A bill feeds a project's systems by COPYING its recommendation into a new
-- or existing system (the vendor confirms), not by a foreign key — so a
-- system stays editable and deletable independently of the bill it came from.
--
-- `data` per category: Home/Society = { slot, solarPanelUsed } (the sizing
-- worksheet); commercial = { data, panelWatt, sunHours, buffer, systemCost }
-- (exactly what the C&I Excel export posts).
--
-- Composite FK (project_id, organization_id) — the database itself refuses to
-- attach a bill to another company's project (a null project_id skips the
-- check, as standalone bills should). Requires 0015–0017.

create table if not exists bill_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid,
  category text not null check (category in ('home', 'society', 'commercial')),
  consumer_name text,
  consumer_number text,
  sanctioned_load_kw numeric,
  phase smallint check (phase is null or phase in (1, 3)),
  avg_monthly_units numeric,
  recommended_kw numeric,
  source_file_name text,
  data jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references projects(id, organization_id)
);
create index if not exists bill_analyses_project_idx on bill_analyses(project_id, created_at desc);
create index if not exists bill_analyses_org_created_idx on bill_analyses(organization_id, created_at desc);

alter table bill_analyses enable row level security;
create policy "deny_all_anon_authenticated" on bill_analyses for all to anon, authenticated using (false) with check (false);
