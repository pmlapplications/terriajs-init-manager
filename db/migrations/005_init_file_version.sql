-- Optimistic locking for init files, as catalog_member already has: every
-- update bumps `version`, and the API only writes when the client sends the
-- version it loaded.

set search_path = terria, public;

alter table init_file add column version integer not null default 1;

create or replace function touch_row() returns trigger language plpgsql
  set search_path = terria, public as $$
begin
  new.updated_at := now();
  if tg_table_name in ('catalog_member', 'init_file') then
    new.version := old.version + 1;
  end if;
  return new;
end $$;
