-- TerriaJS Init Manager: core schema (PostgreSQL 14+)
--
-- Every catalog entry (group, item, reference or function) is a row in
-- catalog_member. The handful of traits common to all members are columns;
-- everything type-specific lives in the `traits` JSONB, so any of Terria's
-- ~60 model types (and future ones) can be stored without schema changes.
--
-- Group contents are a separate ordered link table, so the same layer can
-- appear in several groups and several init files. export_init_file()
-- rebuilds a Terria init file JSON from these tables.

create extension if not exists pgcrypto;  -- gen_random_uuid() on PG < 13

create schema if not exists terria;
set search_path = terria, public;

-- ---------------------------------------------------------------------------
-- Member types
-- ---------------------------------------------------------------------------

create type member_kind as enum ('group', 'item', 'reference', 'function');

-- One row per Terria `type` string (e.g. 'wms', 'esri-mapServer-group').
create table catalog_type (
  type          text primary key,
  kind          member_kind not null,
  model_name    text not null,              -- e.g. WebMapServiceCatalogItem
  label         text,                       -- friendly name for the UI
  docs_url      text,
  -- Optional JSON Schema for `traits`, used by the app to build forms and
  -- validate input. Null means "accept any object".
  traits_schema jsonb,
  deprecated    boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Catalog members
-- ---------------------------------------------------------------------------

create table catalog_member (
  id           uuid primary key default gen_random_uuid(),
  -- Terria `id`. Exported as-is when set, otherwise the row uuid is used, so
  -- every exported member has a stable id for share links and the workbench.
  terria_id    text unique,
  type         text not null references catalog_type (type) on update cascade,
  name         text not null,
  description  text,
  url          text,
  -- All other traits, exactly as they would appear in the init file.
  traits       jsonb not null default '{}'::jsonb,
  -- Management fields (never exported).
  is_published boolean not null default true,
  notes        text,
  version      integer not null default 1,   -- optimistic locking
  created_at   timestamptz not null default now(),
  created_by   text,
  updated_at   timestamptz not null default now(),
  updated_by   text,

  constraint traits_is_object check (jsonb_typeof(traits) = 'object'),
  -- These keys are owned by columns / link tables; keep one source of truth.
  constraint traits_no_reserved_keys check (
    not traits ?| array['id', 'type', 'name', 'description', 'url', 'members', 'shareKeys']
  )
);

create index catalog_member_type_idx   on catalog_member (type);
create index catalog_member_name_idx   on catalog_member (lower(name));
create index catalog_member_traits_idx on catalog_member using gin (traits jsonb_path_ops);

-- Old ids a member used to have, so existing share links keep resolving.
create table catalog_member_share_key (
  share_key text primary key,
  member_id uuid not null references catalog_member (id) on delete cascade
);

create index catalog_member_share_key_member_idx on catalog_member_share_key (member_id);

-- Ordered contents of groups. A member may sit in more than one group.
create table group_membership (
  parent_id  uuid not null references catalog_member (id) on delete cascade,
  child_id   uuid not null references catalog_member (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (parent_id, child_id),
  constraint no_self_membership check (parent_id <> child_id)
);

create index group_membership_child_idx on group_membership (child_id);

-- ---------------------------------------------------------------------------
-- Init files
-- ---------------------------------------------------------------------------

create table init_file (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- file name without .json
  name        text not null,
  description text,
  -- Every top-level init file key except catalog and workbench: homeCamera,
  -- initialCamera, baseMaps, viewerMode, corsDomains, stories, showSplitter,
  -- splitPosition, previewedItemId, settings, ...
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now(),
  updated_by  text,

  constraint config_is_object check (jsonb_typeof(config) = 'object'),
  constraint config_no_managed_keys check (not config ?| array['catalog', 'workbench'])
);

-- Top-level `catalog` entries of an init file, in order.
create table init_file_catalog (
  init_file_id uuid not null references init_file (id) on delete cascade,
  member_id    uuid not null references catalog_member (id) on delete cascade,
  sort_order   integer not null default 0,
  primary key (init_file_id, member_id)
);

-- Members added to the workbench when the map loads, in order.
create table init_file_workbench (
  init_file_id uuid not null references init_file (id) on delete cascade,
  member_id    uuid not null references catalog_member (id) on delete cascade,
  sort_order   integer not null default 0,
  primary key (init_file_id, member_id)
);

-- Snapshots of generated init files, recording what was deployed and when.
create table init_file_release (
  id           bigint generated always as identity primary key,
  init_file_id uuid not null references init_file (id) on delete cascade,
  content      jsonb not null,
  released_at  timestamptz not null default now(),
  released_by  text,
  comment      text
);

create index init_file_release_file_idx on init_file_release (init_file_id, released_at desc);

-- ---------------------------------------------------------------------------
-- Audit history
-- ---------------------------------------------------------------------------

-- Full row snapshot on every change. No FK, so history outlives deletes.
create table catalog_member_revision (
  id         bigint generated always as identity primary key,
  member_id  uuid not null,
  version    integer not null,
  operation  text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  snapshot   jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by text
);

create index catalog_member_revision_member_idx on catalog_member_revision (member_id, version desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function touch_row() returns trigger language plpgsql
  set search_path = terria, public as $$
begin
  new.updated_at := now();
  if tg_table_name = 'catalog_member' then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

create trigger catalog_member_touch before update on catalog_member
  for each row execute function touch_row();
create trigger init_file_touch before update on init_file
  for each row execute function touch_row();

create function record_member_revision() returns trigger language plpgsql
  set search_path = terria, public as $$
begin
  if tg_op = 'DELETE' then
    insert into catalog_member_revision (member_id, version, operation, snapshot, changed_by)
    values (old.id, old.version, tg_op, to_jsonb(old), old.updated_by);
    return old;
  end if;
  insert into catalog_member_revision (member_id, version, operation, snapshot, changed_by)
  values (new.id, new.version, tg_op, to_jsonb(new), coalesce(new.updated_by, new.created_by));
  return new;
end $$;

create trigger catalog_member_audit after insert or update or delete on catalog_member
  for each row execute function record_member_revision();

-- Only groups may have children, and a group may not contain its ancestors.
create function check_group_membership() returns trigger language plpgsql
  set search_path = terria, public as $$
declare
  parent_kind member_kind;
begin
  select t.kind into parent_kind
  from catalog_member m join catalog_type t on t.type = m.type
  where m.id = new.parent_id;

  if parent_kind is distinct from 'group' then
    raise exception 'member % is not a group and cannot have members', new.parent_id;
  end if;

  if exists (
    with recursive descendants(id) as (
      select new.child_id
      union
      select gm.child_id from group_membership gm join descendants d on gm.parent_id = d.id
    )
    select 1 from descendants where id = new.parent_id
  ) then
    raise exception 'adding % to % would create a cycle', new.child_id, new.parent_id;
  end if;

  return new;
end $$;

create trigger group_membership_check before insert or update on group_membership
  for each row execute function check_group_membership();

-- Stop a group being retyped to a non-group while it still has children.
create function check_member_type_change() returns trigger language plpgsql
  set search_path = terria, public as $$
begin
  if new.type <> old.type
     and exists (select 1 from group_membership where parent_id = new.id)
     and (select kind from catalog_type where type = new.type) <> 'group' then
    raise exception 'member % has children; only a group type is allowed', new.id;
  end if;
  return new;
end $$;

create trigger catalog_member_type_check before update of type on catalog_member
  for each row execute function check_member_type_change();

-- ---------------------------------------------------------------------------
-- Export
-- ---------------------------------------------------------------------------

-- Terria JSON for one member and, for groups, its published descendants.
create function member_json(p_member_id uuid) returns jsonb
language plpgsql stable
  set search_path = terria, public as $$
declare
  m        catalog_member;
  result   jsonb;
  keys     jsonb;
  children jsonb;
begin
  select * into m from catalog_member where id = p_member_id;

  result := m.traits || jsonb_strip_nulls(jsonb_build_object(
    'id',          coalesce(m.terria_id, m.id::text),
    'type',        m.type,
    'name',        m.name,
    'description', m.description,
    'url',         m.url
  ));

  select jsonb_agg(share_key order by share_key) into keys
  from catalog_member_share_key where member_id = m.id;
  if keys is not null then
    result := result || jsonb_build_object('shareKeys', keys);
  end if;

  if (select kind from catalog_type where type = m.type) = 'group' then
    select jsonb_agg(member_json(gm.child_id) order by gm.sort_order, c.name) into children
    from group_membership gm join catalog_member c on c.id = gm.child_id
    where gm.parent_id = m.id and c.is_published;
    if children is not null then
      result := result || jsonb_build_object('members', children);
    end if;
  end if;

  return result;
end $$;

-- Complete init file JSON, ready to write to <slug>.json.
create function export_init_file(p_init_file_id uuid) returns jsonb
language sql stable
  set search_path = terria, public as $$
  select f.config
    || jsonb_build_object(
         'catalog', coalesce((
           select jsonb_agg(member_json(c.member_id) order by c.sort_order, m.name)
           from init_file_catalog c join catalog_member m on m.id = c.member_id
           where c.init_file_id = f.id and m.is_published
         ), '[]'::jsonb))
    || coalesce((
         select jsonb_build_object('workbench',
                  jsonb_agg(coalesce(m.terria_id, m.id::text) order by w.sort_order))
         from init_file_workbench w join catalog_member m on m.id = w.member_id
         where w.init_file_id = f.id and m.is_published
       ), '{}'::jsonb)
  from init_file f
  where f.id = p_init_file_id
$$;
