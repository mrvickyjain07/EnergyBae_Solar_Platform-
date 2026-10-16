-- supabase/migrations/0012_wire_prices_cores_numeric.sql
-- Widens wire_prices.cores from integer to numeric so a genuine "3.5 core"
-- cable (3 full conductors + a reduced-size neutral — a standard Indian power
-- cable construction, distinct from a 4-core cable) can be stored exactly
-- instead of being rounded up to 4 by extraction/upload.
alter table wire_prices alter column cores type numeric using cores::numeric;
