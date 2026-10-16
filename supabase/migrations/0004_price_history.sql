-- supabase/migrations/0004_price_history.sql
-- Audit trail for every price change across the catalogue (see
-- 0001_catalogue_state.sql) and wire_prices (see 0002_wire_prices.sql).
-- entity_key identifies what changed: "panels.<id>.pricePerWp",
-- "bos.dcCable", "charges.installation" for the catalogue; the wire's
-- internal_name for wire_prices. No user_id column yet — there's no auth
-- system in this app to attribute changes to (add one if/when auth lands).
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('catalogue', 'wire_price')),
  entity_key text not null,
  old_value numeric,
  new_value numeric not null,
  source text not null default 'manual' check (source in ('manual', 'upload')),
  created_at timestamptz not null default now()
);
create index if not exists price_history_entity_idx on price_history(entity_type, entity_key);
create index if not exists price_history_created_at_idx on price_history(created_at desc);

alter table price_history enable row level security;
