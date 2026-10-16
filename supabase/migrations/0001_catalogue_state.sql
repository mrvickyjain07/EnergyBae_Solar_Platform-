-- Singleton row holding the whole Price DB Catalogue object (panels, inverters,
-- batteries, ACDB/DCDB, BOS, custom BOS, overhead charges) as one jsonb blob —
-- mirrors the existing client-side Catalogue shape (src/modules/proposal/types.ts)
-- exactly, so the storage-layer swap in Task 4 needs zero reshaping.
-- Supersedes the flat `price_catalogue` table (never built out past 6 seed rows).
create table if not exists catalogue_state (
  id boolean primary key default true check (id),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
