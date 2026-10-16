-- supabase/migrations/0015_organizations.sql
-- Multi-tenancy: every vendor company is an organization, and every business
-- row belongs to exactly one. Chosen model (decided 2026-09-29): per-row
-- organization_id in one database, NOT schema-per-tenant or project-per-
-- tenant — one migration path, one Supabase project.
--
-- Enforcement lives in the server: it only ever uses the service_role key
-- (bypasses RLS), and every route filters by the caller's active
-- organization, resolved from organization_memberships on EVERY request
-- (src/services/authMiddleware.ts). RLS stays deny-all for anon/authenticated
-- (convention from 0011) until a client-side Supabase key exists to scope.
--
-- A user can belong to several organizations, with a role per organization —
-- so the role moves from users onto organization_memberships. users.role and
-- users.is_active are left in place (unused by the app after this migration)
-- so this is reversible; drop them in a later migration once verified.
--
-- All existing data (one company today) is moved into an "EnergyBae"
-- organization; every existing user becomes a member with their current role.
--
-- ⚠ Deploy together with the code that ships this file: the old code queries
-- catalogue_state.id / organization_settings.id and upserts on the old global
-- unique keys, all of which this migration replaces.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  role text not null default 'employee' check (role in ('admin', 'employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists organization_memberships_user_idx on organization_memberships(user_id);

-- Tenant column on every business table (nullable until backfilled below).
-- No ON DELETE CASCADE anywhere: deleting an organization that still owns
-- data must fail rather than silently erase its prices, history and quotes.
alter table catalogue_state       add column if not exists organization_id uuid references organizations(id);
alter table wire_prices           add column if not exists organization_id uuid references organizations(id);
alter table inverter_prices       add column if not exists organization_id uuid references organizations(id);
alter table price_history         add column if not exists organization_id uuid references organizations(id);
alter table proposals             add column if not exists organization_id uuid references organizations(id);
alter table organization_settings add column if not exists organization_id uuid references organizations(id);

do $$
declare
  eb uuid;
begin
  insert into organizations (name) values ('EnergyBae') returning id into eb;

  insert into organization_memberships (organization_id, user_id, role, is_active)
  select eb, u.id, u.role, u.is_active from users u;

  update catalogue_state       set organization_id = eb where organization_id is null;
  update wire_prices           set organization_id = eb where organization_id is null;
  update inverter_prices       set organization_id = eb where organization_id is null;
  update price_history         set organization_id = eb where organization_id is null;
  update proposals             set organization_id = eb where organization_id is null;
  update organization_settings set organization_id = eb where organization_id is null;
end $$;

alter table catalogue_state       alter column organization_id set not null;
alter table wire_prices           alter column organization_id set not null;
alter table inverter_prices       alter column organization_id set not null;
alter table price_history         alter column organization_id set not null;
alter table proposals             alter column organization_id set not null;
alter table organization_settings alter column organization_id set not null;

-- Natural keys become unique per organization, not globally: two vendors can
-- both stock "DC Cable 4 sqmm Cu" or number a quote EB-2026-001.
alter table wire_prices drop constraint if exists wire_prices_internal_name_key;
alter table wire_prices add constraint wire_prices_org_internal_name_key unique (organization_id, internal_name);
alter table inverter_prices drop constraint if exists inverter_prices_internal_name_key;
alter table inverter_prices add constraint inverter_prices_org_internal_name_key unique (organization_id, internal_name);
alter table proposals drop constraint if exists proposals_proposal_no_key;
alter table proposals add constraint proposals_org_proposal_no_key unique (organization_id, proposal_no);

-- The two singleton tables become one row per organization, keyed by it
-- (0014's own header anticipated exactly this).
alter table catalogue_state drop constraint if exists catalogue_state_pkey;
alter table catalogue_state drop column if exists id;
alter table catalogue_state add primary key (organization_id);

alter table organization_settings drop constraint if exists organization_settings_pkey;
alter table organization_settings drop column if exists id;
alter table organization_settings add primary key (organization_id);

create index if not exists price_history_org_created_idx on price_history(organization_id, created_at desc);
create index if not exists proposals_org_updated_idx on proposals(organization_id, updated_at desc);
-- wire_prices / inverter_prices are covered by their (organization_id, internal_name) unique indexes.

alter table organizations enable row level security;
alter table organization_memberships enable row level security;
create policy "deny_all_anon_authenticated" on organizations
  for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on organization_memberships
  for all to anon, authenticated using (false) with check (false);
