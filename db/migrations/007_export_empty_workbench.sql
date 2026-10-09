-- export_init_file() wrote "workbench": null when an init file had no
-- published workbench items, because jsonb_agg over no rows is null. Leave the
-- key out instead, as was intended.

set search_path = terria, public;

create or replace function export_init_file(p_init_file_id uuid) returns jsonb
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
         having count(*) > 0
       ), '{}'::jsonb)
  from init_file f
  where f.id = p_init_file_id
$$;
