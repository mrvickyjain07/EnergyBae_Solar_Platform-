-- supabase/migrations/0009_auth_attribution.sql
-- "Who made this change" columns, added now that users (migration 0008)
-- exists. proposals.created_by/updated_by: who created a proposal and who
-- last saved it. price_history.user_id: which admin made a price change —
-- this is exactly what migration 0004's own comment flagged as deferred
-- ("no user_id column yet... add one if/when auth lands"). All nullable:
-- every row before this migration predates auth and has no user to
-- attribute to.
alter table proposals add column if not exists created_by uuid references users(id);
alter table proposals add column if not exists updated_by uuid references users(id);
alter table price_history add column if not exists user_id uuid references users(id);
