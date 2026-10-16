-- supabase/migrations/0017_customers_projects_systems.sql
-- Persistent Customers, Projects and Solar Systems.
--
--   customer        — who buys (reused across projects instead of retyped)
--   project         — one commercial opportunity for a customer
--   project_system  — one solar installation inside a project. A project has
--                     MANY systems (e.g. 50 kW factory + 20 kW warehouse),
--                     each with its own capacity, site, phase and equipment.
--
-- customer_type uses the financial engine's own values
-- (src/modules/proposal/types.ts FinanceCustomerType), so a system can
-- prefill the BOQ/proposal calculator without a mapping table.
--
-- Nothing here is hard-deleted by the app: customers and projects are
-- ARCHIVED (archived_at), so saved proposals never lose their context. A
-- system can be deleted only while no proposal references it (FK restrict).
--
-- Every table carries organization_id (tenancy, 0015). Cross-table links use
-- COMPOSITE foreign keys that include organization_id, so the database itself
-- refuses to link a project to another company's customer, or a proposal to
-- another company's project — not just the API.
--
-- Requires 0015/0016. Deploy together with the code that ships this file.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null check (length(trim(name)) > 0),
  customer_type text not null default 'INDIVIDUAL_HOUSE'
    check (customer_type in ('INDIVIDUAL_HOUSE', 'RESIDENTIAL_SOCIETY', 'COMMERCIAL', 'INDUSTRIAL')),
  contact_name text,
  phone text,
  email text,
  address text,
  gstin text,
  notes text,
  created_by uuid references users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index if not exists customers_org_name_idx on customers(organization_id, lower(name));

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  customer_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'lead' check (status in ('lead', 'active', 'won', 'lost', 'completed')),
  site_address text,
  notes text,
  created_by uuid references users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (customer_id, organization_id) references customers(id, organization_id)
);
create index if not exists projects_org_updated_idx on projects(organization_id, updated_at desc);
create index if not exists projects_customer_idx on projects(customer_id);

create table if not exists project_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  site_address text,
  capacity_kw numeric check (capacity_kw is null or capacity_kw > 0),
  system_type text not null default 'On-Grid' check (system_type in ('On-Grid', 'Off-Grid', 'Hybrid')),
  phase smallint check (phase is null or phase in (1, 3)),
  structure_type text,
  panel_brand text,
  panel_wp numeric check (panel_wp is null or panel_wp > 0),
  inverter_brand text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, project_id),
  foreign key (project_id, organization_id) references projects(id, organization_id)
);
create index if not exists project_systems_project_idx on project_systems(project_id, sort_order);

-- A saved proposal can belong to a project, and to one of its systems.
-- (Multi-system proposals are a later phase; this links the existing
-- single-system quote to where it came from.)
alter table proposals add column if not exists project_id uuid;
alter table proposals add column if not exists project_system_id uuid;
alter table proposals add constraint proposals_project_fkey
  foreign key (project_id, organization_id) references projects(id, organization_id);
alter table proposals add constraint proposals_project_system_fkey
  foreign key (project_system_id, project_id) references project_systems(id, project_id);
alter table proposals add constraint proposals_system_needs_project_check
  check (project_system_id is null or project_id is not null);
create index if not exists proposals_project_idx on proposals(project_id);

alter table customers enable row level security;
alter table projects enable row level security;
alter table project_systems enable row level security;
create policy "deny_all_anon_authenticated" on customers for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on projects for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on project_systems for all to anon, authenticated using (false) with check (false);
