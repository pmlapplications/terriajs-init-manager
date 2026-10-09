# Database

The data lives in PostgreSQL, in the `terria` schema. `db/migrations/` holds the schema as
numbered SQL files, applied in order.

## Upgrading an existing database

Docker Compose only runs the migrations when the database volume is empty. When a release adds
migrations, apply the new ones to an existing database yourself, in order. The
[changelog](../changelog.md) lists the migrations each release adds.

```bash
docker compose exec -T db psql -U terria -d terria < db/migrations/006_init_file_output.sql
docker compose exec -T db psql -U terria -d terria < db/migrations/007_export_empty_workbench.sql
```

Without Docker, run each file with `psql "$DATABASE_URL" -f db/migrations/<file>.sql`.

| Migration | Adds |
|---|---|
| `001_initial_schema.sql` | Catalog types, members, groups, init files, revision history and the export functions. |
| `002_seed_catalog_types.sql` | Every Terria catalog type. |
| `003_users.sql` | Users and login sessions. |
| `004_group_member_types.sql` | Which types each group type may contain. |
| `005_init_file_version.sql` | Version numbers on init files, so stale saves are refused. |
| `006_init_file_output.sql` | Records of published and test init files on disk. |
| `007_export_empty_workbench.sql` | Fixes exported init files containing `"workbench": null`. |

## How things are stored

Catalog items and groups
: Rows in `catalog_member`, typed by `catalog_type`. The traits common to every type (`id`, as
  `terria_id`, `name`, `description` and `url`) are columns; `shareKeys` are rows in
  `catalog_member_share_key`; every other trait is in the `traits` JSONB column, exactly as it
  appears in the init file. `is_published` controls whether a member is exported.

Group members
: Rows in `group_membership`, ordered by `sort_order`. A trigger rejects a member whose type
  `group_member_type` doesn't allow for the group's type, and a group that would end up inside
  itself.

Init files
: Rows in `init_file`, with every top-level key except `catalog` and `workbench` in `config`. The
  catalog groups are in `init_file_catalog` and the workbench items in `init_file_workbench`, both
  ordered.

Published and test files
: `init_file_output` has a row for each file written to `CONFIG_DIR`, with the version written.

Exports
: `member_json(id)` builds a member's Terria JSON with its published members inlined, and
  `export_init_file(id)` builds a whole init file. These are what the app downloads and publishes.

History
: `catalog_member_revision` keeps a snapshot of every insert, update and delete of a catalog
  member. Every update of a member or init file increments its `version`, and the app only saves
  when the client sends the version it loaded.

Who made each change is recorded by email in `created_by` and `updated_by`.
