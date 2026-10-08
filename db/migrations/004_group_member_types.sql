-- Which catalog types each group type may contain.
--
-- A plain `group` takes any item or group. A server-backed group (wms-group,
-- esri-mapServer-group, ...) takes the item types its server produces and
-- groups of its own type, so e.g. a WMS group only holds WMS layers and WMS
-- groups. The membership trigger enforces this; the app uses it to filter the
-- items offered as members.

set search_path = terria, public;

create table group_member_type (
  group_type  text not null references catalog_type (type) on update cascade on delete cascade,
  member_type text not null references catalog_type (type) on update cascade on delete cascade,
  primary key (group_type, member_type)
);

create index group_member_type_member_idx on group_member_type (member_type);

-- A plain group: every item and group type.
insert into group_member_type (group_type, member_type)
select 'group', type from catalog_type where kind in ('item', 'group');

-- Server-backed groups: the item types they create, plus themselves.
insert into group_member_type (group_type, member_type)
select g.group_type, m.member_type
from (values
  ('esri-group',               array['esri-group', 'esri-mapServer-group', 'esri-featureServer-group',
                                     'esri-mapServer', 'esri-featureServer', 'esri-imageServer']),
  ('esri-mapServer-group',     array['esri-mapServer-group', 'esri-mapServer']),
  ('esri-featureServer-group', array['esri-featureServer-group', 'esri-featureServer']),
  ('arcgis-portal-group',      array['arcgis-portal-group', 'esri-mapServer-group', 'esri-featureServer-group',
                                     'esri-mapServer', 'esri-featureServer', 'esri-imageServer']),
  ('ckan-group',               array['ckan-group', 'wms', 'wfs', 'wmts', 'esri-mapServer', 'esri-featureServer',
                                     'geojson', 'csv', 'kml', 'czml', 'shp']),
  ('csw-group',                array['csw-group', 'wms', 'esri-mapServer', 'kml', 'geojson', 'csv']),
  ('opendatasoft-group',       array['opendatasoft-group', 'opendatasoft-item']),
  ('sdmx-group',               array['sdmx-group', 'sdmx-json']),
  ('socrata-group',            array['socrata-group', 'socrata-map-item', 'csv', 'geojson']),
  ('thredds-group',            array['thredds-group', 'wms']),
  ('wfs-group',                array['wfs-group', 'wfs']),
  ('wms-group',                array['wms-group', 'wms']),
  ('wmts-group',               array['wmts-group', 'wmts']),
  ('wps-getCapabilities',      array['wps-getCapabilities'])
) as g(group_type, member_types)
cross join lateral unnest(g.member_types) as m(member_type);

-- Only groups may have children, the child's type must be allowed in the
-- parent's, and a group may not contain its ancestors.
create or replace function check_group_membership() returns trigger language plpgsql
  set search_path = terria, public as $$
declare
  parent_type text;
  parent_kind member_kind;
  child_type  text;
begin
  select m.type, t.kind into parent_type, parent_kind
  from catalog_member m join catalog_type t on t.type = m.type
  where m.id = new.parent_id;

  if parent_kind is distinct from 'group' then
    raise exception 'member % is not a group and cannot have members', new.parent_id;
  end if;

  select type into child_type from catalog_member where id = new.child_id;
  if not exists (
    select 1 from group_member_type where group_type = parent_type and member_type = child_type
  ) then
    raise exception 'a % group cannot contain a % member', parent_type, child_type;
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
