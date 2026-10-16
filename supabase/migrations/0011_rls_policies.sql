-- supabase/migrations/0011_rls_policies.sql
-- Closes the RLS gap flagged by the security audit: catalogue_state and
-- wire_prices had RLS OFF entirely (fully open to anon/authenticated if that
-- key is ever wired into client code, per .env.example's own stated intent
-- for the publishable key), while price_history/inverter_prices/proposals/
-- proposal_items/users had RLS ON with zero policies — already default-deny
-- for every role but service_role, but implicit, easy to misread as an
-- oversight rather than intentional.
--
-- The server only ever talks to Supabase with SUPABASE_SECRET_KEY
-- (src/services/supabaseClient.ts), which is the service_role and always
-- bypasses RLS regardless of policies — so none of this changes how the app
-- itself behaves today. It only matters the day someone wires the anon/
-- publishable key into client code, at which point every table here should
-- already be locked down rather than open until someone remembers to write
-- policies. If/when that day comes, replace the relevant deny-all policy
-- below with real scoped read/write rules — don't just drop it.

alter table catalogue_state enable row level security;
alter table wire_prices enable row level security;

create policy "deny_all_anon_authenticated" on catalogue_state
  for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on wire_prices
  for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on price_history
  for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on inverter_prices
  for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on proposals
  for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on proposal_items
  for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on users
  for all to anon, authenticated using (false) with check (false);
