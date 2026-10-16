-- supabase/migrations/0002_wire_prices.sql
-- Wire/cable price list — genuinely tabular (many SKUs by type/size/material),
-- unlike the Price DB catalogue (see 0001_catalogue_state.sql), so this is a
-- real table, not a jsonb blob. internal_name is the office's own naming
-- (e.g. "DC Cable 4 sqmm Cu") and is the upsert-match key for repeat uploads.
create table if not exists wire_prices (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null unique,
  type text not null default 'Cable',
  size_sqmm numeric,
  cores integer,
  material text,
  price_per_m numeric not null default 0,
  gst_pct numeric,
  source text not null default 'manual' check (source in ('manual', 'upload')),
  manual_override boolean not null default false,
  is_active boolean not null default true,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wire_prices_type_idx on wire_prices(type);
create index if not exists wire_prices_material_idx on wire_prices(material);
