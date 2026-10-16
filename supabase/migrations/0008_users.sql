-- supabase/migrations/0008_users.sql
-- Auth (see BOQ_Revised_Implementation_Plan.md D24, and
-- docs/superpowers/specs — see the "Auth + Roles" plan). Login is Google
-- Sign-In only (the app already has Google OAuth machinery for Drive/Sheets
-- export, see src/services/googleAuthService.ts) — so no password_hash
-- column. This table is purely an access allowlist + role assignment: email
-- is matched against the verified Google ID token email at login
-- (src/services/googleIdentity.ts). Two roles only: admin (full access incl.
-- Price DB writes + user management) and employee (create/edit proposals,
-- no price writes).
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists users_email_idx on users(email);

alter table users enable row level security;
