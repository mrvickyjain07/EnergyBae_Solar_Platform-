-- supabase/migrations/0014_organization_settings.sql
-- Company branding (logo, name, contact details) shown in the app sidebar and,
-- next, on generated proposals — whose footer is currently a baked EnergyBae
-- image with EnergyBae's own phone/email/address.
--
-- Deliberately a SINGLE-ROW table (id pinned to 1): the app is single-tenant
-- today (see CLAUDE.md "Direction"). When multi-tenancy lands, this becomes
-- one row per organization — replace the `id = 1` check with an
-- organization_id FK + unique constraint; the API/UI shape doesn't change.
--
-- The logo is stored inline as a small base64 data URL (the API downscales
-- and caps it), matching the repo's existing data-URL upload pattern rather
-- than introducing Supabase Storage for one image.
create table if not exists organization_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text,
  logo_data_url text,
  phone text,
  email text,
  address text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- Same convention as 0011: RLS on with explicit deny-all for anon/authenticated.
-- The server uses the service_role key, which bypasses RLS.
alter table organization_settings enable row level security;
create policy "deny_all_anon_authenticated" on organization_settings
  for all to anon, authenticated using (false) with check (false);
