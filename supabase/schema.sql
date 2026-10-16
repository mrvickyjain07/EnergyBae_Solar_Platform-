-- EnergyBae Solar Platform — Week 2 schema.
-- Paste into the Supabase SQL Editor and run once.
-- No RLS policies: only the server (secret key, full access) ever touches
-- these tables directly — add RLS if/when client-side Supabase access is needed.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'sales' check (role in ('admin', 'operations', 'sales')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  action text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_user_id_idx on activity_logs(user_id);

create table if not exists price_catalogue (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  unit_price numeric not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references users(id),
  customer_name text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'rejected')),
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proposals_created_by_idx on proposals(created_by);
create index if not exists proposals_status_idx on proposals(status);

create table if not exists proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists proposal_versions_proposal_id_idx on proposal_versions(proposal_id);

-- Seed: overhead charge constants from src/modules/proposal/defaultCatalogue.ts.
-- Panels/inverters/batteries/BOS ship empty by design (real vendor data only,
-- entered via the Price Database UI) — nothing to seed there.
insert into price_catalogue (category, item_name, unit_price) values
  ('overhead', 'installation', 5500),
  ('overhead', 'transport', 3),
  ('overhead', 'liaisoning', 3500),
  ('overhead', 'profit', 15),
  ('overhead', 'gst', 8.9),
  ('overhead', 'subsidy', 78000);
