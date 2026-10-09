-- Copies of init files written to the server's config folder (CONFIG_DIR),
-- which is public at /config:
--
--   published  CONFIG_DIR/<slug>.json, the file maps load
--   test       CONFIG_DIR/test/<init file id>.json, for trying changes out
--
-- A row means the file is on disk. It is a separate table so publishing
-- doesn't bump init_file.version and conflict with an open editor.

set search_path = terria, public;

create table init_file_output (
  init_file_id uuid not null references init_file (id) on delete cascade,
  target       text not null check (target in ('published', 'test')),
  -- Path under CONFIG_DIR, kept so the file can be removed after a rename.
  file_path    text not null,
  -- init_file.version that was written.
  version      integer not null,
  written_at   timestamptz not null default now(),
  written_by   text,
  primary key (init_file_id, target),
  unique (file_path)
);
