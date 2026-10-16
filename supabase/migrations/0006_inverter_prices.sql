-- supabase/migrations/0006_inverter_prices.sql
-- Inverter price list — genuinely tabular (many SKUs by brand/system
-- type/phase/kW), unlike the Price DB catalogue (see 0001_catalogue_state.sql),
-- so this is a real table mirroring wire_prices (0002_wire_prices.sql), not a
-- jsonb blob. Replaces the old catalogue.inverters array entirely — one
-- source of truth for inverter pricing. internal_name is a computed composite
-- key (brand|systemType|phase|kw|model, lowercased) since inverters have no
-- natural single descriptive name the way wire SKUs do; it's the upsert-match
-- key for repeat uploads.
create table if not exists inverter_prices (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null unique,
  brand text not null,
  system_type text not null default 'On-Grid' check (system_type in ('On-Grid','Off-Grid','Hybrid')),
  phase integer not null check (phase in (1,3)),
  kw numeric not null,
  model text not null,
  category text,
  price numeric not null default 0,
  cost numeric,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'upload')),
  manual_override boolean not null default false,
  is_active boolean not null default true,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inverter_prices_brand_idx on inverter_prices(brand);
create index if not exists inverter_prices_system_type_idx on inverter_prices(system_type);
create index if not exists inverter_prices_phase_idx on inverter_prices(phase);
alter table inverter_prices enable row level security;

-- Extend the shared audit trail (0004_price_history.sql) to cover this table.
alter table price_history drop constraint price_history_entity_type_check;
alter table price_history add constraint price_history_entity_type_check
  check (entity_type in ('catalogue', 'wire_price', 'inverter_price'));

-- One-time carry-over from the jsonb blob so nothing existing is lost.
-- system_type defaults to 'On-Grid' -- old rows predate system-type-awareness.
-- (Verified against the live DB before this migration: catalogue_state's
-- inverters array was empty, so this is a no-op today, but stays correct if
-- that's not true when this migration runs elsewhere, e.g. a fresh branch.)
insert into inverter_prices (internal_name, brand, system_type, phase, kw, model, category, price, source)
select
  lower(trim(row->>'brand')) || '|on-grid|' || (row->>'phase') || 'p|' || (row->>'kw') || 'kw|' || lower(trim(row->>'model')),
  row->>'brand', 'On-Grid', (row->>'phase')::int, (row->>'kw')::numeric, row->>'model', row->>'category',
  coalesce((row->>'price')::numeric, 0), 'manual'
from catalogue_state, jsonb_array_elements(data->'inverters') as row
where jsonb_array_length(coalesce(data->'inverters', '[]'::jsonb)) > 0
on conflict (internal_name) do nothing;
