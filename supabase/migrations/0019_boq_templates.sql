-- supabase/migrations/0019_boq_templates.sql
-- Phase 5C: capacity ranges → BOQ templates → immutable template versions.
--
--   capacity_ranges        per company, data-driven. A range holds SYSTEM
--                          (required) capacities in (min_kw, max_kw];
--                          max_kw null = open-ended. Never actual DC kWp.
--   boq_templates          a blueprint inside a range, with optional variant
--                          keys (system / structure / panel type) and at most
--                          one default per range.
--   boq_template_versions  the versioned definition document (jsonb; shape in
--                          src/modules/boqTemplates/templateRules.ts). A draft
--                          is editable; PUBLISHED IS IMMUTABLE — enforced here
--                          by trigger, not only by the API — so a BOQ generated
--                          later can always point at the exact rules it used.
--
-- Additive only: no existing table changes; the live calculator (calcBOQ) and
-- proposals are untouched and do not read these tables.
--
-- Every company gets its OWN editable copy of the seed (seed_boq_templates):
-- five default ranges, each with a "Standard (current calculator)" template
-- whose v1 references the built-in legacy-v1 engine (= calcBOQ). Company A's
-- edits can never reach company B: every table is organization-scoped with
-- composite (id, organization_id) foreign keys.
--
-- Requires 0015 (organizations). Dev only until the user approves a deploy.

create table if not exists capacity_ranges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  label text not null check (length(trim(label)) > 0),
  min_kw numeric not null check (min_kw >= 0),
  max_kw numeric check (max_kw is null or max_kw > min_kw),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  -- deferred so a whole-set replace can swap labels between rows
  constraint capacity_ranges_org_label_key unique (organization_id, label) deferrable initially deferred
);
create index if not exists capacity_ranges_org_idx on capacity_ranges(organization_id, sort_order);

create table if not exists boq_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  capacity_range_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  system_type text check (system_type is null or system_type in ('On-Grid', 'Off-Grid', 'Hybrid')),
  structure_type text,
  panel_type text check (panel_type is null or panel_type in ('DCR', 'NDCR')),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (capacity_range_id, organization_id) references capacity_ranges(id, organization_id)
);
create index if not exists boq_templates_org_range_idx on boq_templates(organization_id, capacity_range_id);
create unique index if not exists boq_templates_one_default_per_range on boq_templates(capacity_range_id) where is_default and archived_at is null;

create table if not exists boq_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  template_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  definition jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references users(id),
  unique (template_id, version),
  check ((status = 'draft' and published_at is null) or (status = 'published' and published_at is not null)),
  foreign key (template_id, organization_id) references boq_templates(id, organization_id)
);
create index if not exists boq_template_versions_template_idx on boq_template_versions(template_id, version desc);
create unique index if not exists boq_template_versions_one_draft on boq_template_versions(template_id) where status = 'draft';

-- Published versions can never change or disappear; a draft may change but
-- never move to another template / company / version number.
create or replace function boq_template_versions_guard() returns trigger language plpgsql as $$
begin
  -- Only purge_boq_templates() (whole-company removal) may delete published rows.
  if tg_op = 'DELETE' and current_setting('energybae.purge_boq_templates', true) = 'on' then return old; end if;
  if old.status = 'published' then
    raise exception 'Published template versions are immutable (template %, version %)', old.template_id, old.version
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.template_id <> old.template_id or new.organization_id <> old.organization_id or new.version <> old.version) then
    raise exception 'A template version cannot be moved' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
-- create or replace (PG14+) keeps the migration re-runnable without a destructive DROP.
create or replace trigger boq_template_versions_guard before update or delete on boq_template_versions
  for each row execute function boq_template_versions_guard();

-- Replace a company's whole range set atomically (rows with an id are updated,
-- rows without are inserted, missing rows are deleted — a range still used by
-- a template fails the FK and rolls the whole call back). The API validates
-- the set first (templateRules.validateRanges); this function trusts nothing
-- about ownership: ids from another company are refused.
create or replace function replace_capacity_ranges(p_org uuid, p_ranges jsonb) returns setof capacity_ranges
language plpgsql as $$
declare
  wanted int;
begin
  select count(*) into wanted from jsonb_array_elements(p_ranges) r where r ? 'id';
  if wanted > 0 and (select count(*) from capacity_ranges c join jsonb_array_elements(p_ranges) r on r ? 'id' and c.id = (r->>'id')::uuid where c.organization_id = p_org) <> wanted then
    raise exception 'Unknown capacity range' using errcode = 'P0002';
  end if;
  delete from capacity_ranges c
    where c.organization_id = p_org
      and not exists (select 1 from jsonb_array_elements(p_ranges) r where r ? 'id' and (r->>'id')::uuid = c.id);
  update capacity_ranges c
    set label = r->>'label', min_kw = (r->>'min_kw')::numeric, max_kw = (r->>'max_kw')::numeric,
        sort_order = (r->>'sort_order')::int, updated_at = now()
    from jsonb_array_elements(p_ranges) r
    where r ? 'id' and c.id = (r->>'id')::uuid and c.organization_id = p_org;
  insert into capacity_ranges (organization_id, label, min_kw, max_kw, sort_order)
    select p_org, r->>'label', (r->>'min_kw')::numeric, (r->>'max_kw')::numeric, (r->>'sort_order')::int
    from jsonb_array_elements(p_ranges) r where not (r ? 'id');
  return query select * from capacity_ranges where organization_id = p_org order by sort_order;
end $$;

-- Seeds one company (no-op if it already has ranges). The document mirrors
-- LEGACY_SEED_DOCUMENT in templateRules.ts — keep the two identical
-- (boqTemplates.integration.test.ts compares them).
create or replace function seed_boq_templates(p_org uuid) returns void
language plpgsql as $$
declare
  r record;
  rid uuid;
  tid uuid;
  doc constant jsonb := '{
    "schema": 1,
    "engine": {"kind": "builtin", "id": "legacy-v1"},
    "defaults": {
      "cable": {"dcSpareM": 15, "acSpareM": 40, "earthStructureSpareM": 40, "earthInverterSpareM": 40, "laSpareM": 40, "acInverterToAcdbPerInverterM": 5},
      "structure": {"uClamps": null, "zClamps": null, "walkwayM": 5, "ladderBracingM": 18, "laQty": 1, "purlinExtraM": null,
                    "supportLengthM": null, "rafterLengthM": null, "frontLegHeightFt": null, "backLegHeightFt": null, "rafterCount": null, "legCount": null},
      "earthing": {"type": "ESE"},
      "acdb": {"rule": "one_per_system"}
    },
    "commercial": {
      "installationPerKw": null, "liaisoningPerKw": null, "transportPct": null, "profitPct": null, "gstPct": null,
      "insurance": {"coverMultiplier": 1.2, "factorA": 3, "factorB": 5, "fixedAmount": 0},
      "quoteAdjustmentPerW": 2,
      "quoteSequence": "legacy-v1"
    },
    "notes": ""
  }'::jsonb;
begin
  -- Serialise seeding per company so two first requests can't both seed.
  perform pg_advisory_xact_lock(hashtext('seed_boq_templates:' || p_org::text));
  if exists (select 1 from capacity_ranges where organization_id = p_org) then return; end if;
  for r in select * from (values
      ('1–6 kW', 0::numeric, 6::numeric, 1),
      ('7–20 kW', 6::numeric, 20::numeric, 2),
      ('21–50 kW', 20::numeric, 50::numeric, 3),
      ('51–100 kW', 50::numeric, 100::numeric, 4),
      ('100+ kW', 100::numeric, null::numeric, 5)
    ) v(label, min_kw, max_kw, sort_order)
  loop
    insert into capacity_ranges (organization_id, label, min_kw, max_kw, sort_order)
      values (p_org, r.label, r.min_kw, r.max_kw, r.sort_order) returning id into rid;
    insert into boq_templates (organization_id, capacity_range_id, name, is_default)
      values (p_org, rid, 'Standard (current calculator)', true) returning id into tid;
    insert into boq_template_versions (organization_id, template_id, version, status, definition, published_at)
      values (p_org, tid, 1, 'published', doc, now());
  end loop;
end $$;

-- Removes ALL of one company's ranges/templates/versions (company offboarding,
-- test clean-up). The only path that may delete published versions; the flag
-- is transaction-local, so it cannot leak into other requests.
create or replace function purge_boq_templates(p_org uuid) returns void
language plpgsql as $$
begin
  perform set_config('energybae.purge_boq_templates', 'on', true);
  delete from boq_template_versions where organization_id = p_org;
  delete from boq_templates where organization_id = p_org;
  delete from capacity_ranges where organization_id = p_org;
  perform set_config('energybae.purge_boq_templates', 'off', true);
end $$;

-- Server-only (service role); never callable by browser roles.
revoke execute on function replace_capacity_ranges(uuid, jsonb) from public, anon, authenticated;
revoke execute on function seed_boq_templates(uuid) from public, anon, authenticated;
revoke execute on function purge_boq_templates(uuid) from public, anon, authenticated;

alter table capacity_ranges enable row level security;
alter table boq_templates enable row level security;
alter table boq_template_versions enable row level security;
create policy "deny_all_anon_authenticated" on capacity_ranges for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on boq_templates for all to anon, authenticated using (false) with check (false);
create policy "deny_all_anon_authenticated" on boq_template_versions for all to anon, authenticated using (false) with check (false);

-- Seed every existing company.
select seed_boq_templates(id) from organizations;
