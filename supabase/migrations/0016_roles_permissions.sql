-- supabase/migrations/0016_roles_permissions.sql
-- Permission-based access control. Permissions are the security primitive
-- (keys like 'proposal.approve', defined in src/permissions.ts); a role is a
-- named bundle of them.
--
-- Built-in roles (owner, admin, sales_manager, sales_executive, engineering,
-- procurement, finance) are defined in CODE, not rows — identical for every
-- company, versioned and tested with the app. Only companies' own custom
-- roles are stored, here, as a name + text[] of permission keys (validated by
-- the API against the code catalogue; unknown keys are ignored at check time).
--
-- organization_memberships.role now holds a built-in key or 'custom' (+
-- custom_role_id). Existing memberships keep their exact access:
--   admin    -> owner            (full control, as before)
--   employee -> sales_executive  (defined to equal the old employee rights)
--
-- Requires 0015. Deploy together with the code that ships this file.

create table if not exists custom_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null check (length(trim(name)) > 0),
  description text,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists custom_roles_org_name_key on custom_roles(organization_id, lower(name));

-- Composite FK: a membership can only point at a custom role of ITS OWN
-- organization — enforced by the database, not just the API.
alter table custom_roles add constraint custom_roles_id_org_key unique (id, organization_id);
alter table organization_memberships add column if not exists custom_role_id uuid;
alter table organization_memberships add constraint organization_memberships_custom_role_fkey
  foreign key (custom_role_id, organization_id) references custom_roles(id, organization_id);

alter table organization_memberships drop constraint if exists organization_memberships_role_check;
update organization_memberships set role = 'owner' where role = 'admin';
update organization_memberships set role = 'sales_executive' where role = 'employee';
alter table organization_memberships alter column role set default 'sales_executive';
alter table organization_memberships add constraint organization_memberships_role_check
  check (role in ('owner', 'admin', 'sales_manager', 'sales_executive', 'engineering', 'procurement', 'finance', 'custom'));
-- A custom role id exactly when role = 'custom'.
alter table organization_memberships add constraint organization_memberships_custom_role_check
  check ((role = 'custom') = (custom_role_id is not null));

alter table custom_roles enable row level security;
create policy "deny_all_anon_authenticated" on custom_roles
  for all to anon, authenticated using (false) with check (false);
