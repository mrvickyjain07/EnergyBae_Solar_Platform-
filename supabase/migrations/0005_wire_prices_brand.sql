-- supabase/migrations/0005_wire_prices_brand.sql
-- Manufacturer/brand (e.g. "Polycab", "Havells") as a second grouping
-- dimension alongside `type` (see 0002_wire_prices.sql) — office wants to
-- browse wire prices Company -> Category -> cable, not just by category.
alter table wire_prices add column if not exists brand text;
create index if not exists wire_prices_brand_idx on wire_prices(brand);
