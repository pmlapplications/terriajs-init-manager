# HTTP API

The frontend uses a JSON API under `/api`, implemented in `server/app.ts`. `src/api.ts` is the
frontend's client for it.

## Conventions

- **Authentication.** Every `/api` route except `POST /api/auth/login` and `GET /api/health` needs
  the session cookie (`tlm_session`) that login sets. Without it, routes return `401`.
- **Request bodies** must be sent with `Content-Type: application/json`. This also means other
  sites can't post to the API from a form.
- **Errors** are returned as `{ "error": "<message>" }` with status `400` (invalid input), `401`
  (not logged in), `404` (not found) or `409` (conflict: a stale version, or a name already in
  use).
- **Versions.** Catalog members and init files have a `version` that increases on every save.
  Updates must send the version they loaded; if it has changed since, the update is refused with
  `409` rather than overwriting someone else's changes.
- **Ids** in paths are database ids (UUIDs). A catalog member's Terria `id` is `terriaId`.

## Health and authentication

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | `{ "ok": true, "version": "<app version>" }`. Public; checks the database is reachable. |
| `POST` | `/api/auth/login` | Log in with `{ "email", "password" }`. Sets the session cookie (HttpOnly, SameSite=Strict, 12 hours) and returns the user. |
| `POST` | `/api/auth/logout` | End the session. |
| `GET` | `/api/auth/me` | The logged-in user. |

## Users

| Method | Path | |
|---|---|---|
| `GET` | `/api/users` | List users, by last name. |
| `POST` | `/api/users` | Create a user: `{ "email", "firstName", "lastName", "password" }`. The password needs at least 10 characters. |
| `DELETE` | `/api/users/:id` | Delete a user and end their sessions. You can't delete yourself. |

A user is `{ id, email, firstName, lastName, createdAt }`.

## Catalog items and groups

Items and groups are sent and returned as `item`: the catalog JSON without `type` (which is in
the path) and, for groups, without `members` (sent separately as database ids).

| Method | Path | |
|---|---|---|
| `GET` | `/api/members` | One page of items and groups of every type. See [the query below](#searching-members). |
| `GET` | `/api/items/:type` | Saved items of a type, e.g. `/api/items/wms`, newest first, without their JSON. |
| `GET` | `/api/items/:type/:id` | One item: `{ id, type, terriaId, name, url, isPublished, version, updatedAt, item }`. |
| `POST` | `/api/items/:type` | Create an item. The body is the item. |
| `PUT` | `/api/items/:type/:id` | Update an item: `{ "version", "item" }`. |
| `GET` | `/api/groups/:type` | Saved groups of a type, e.g. `/api/groups/group`. |
| `GET` | `/api/groups/:type/:id` | One group, as for items plus `members`: its members in order, each `{ id, type, kind, terriaId, name }`. |
| `GET` | `/api/groups/:type/member-types` | The types a group of this type may contain. |
| `POST` | `/api/groups/:type` | Create a group: `{ "item", "members" }`, with `members` an ordered array of database ids. |
| `PUT` | `/api/groups/:type/:id` | Update a group: `{ "version", "item", "members" }`. Leave out `members` to keep the current ones. |

A request for a type of the wrong kind (for example `/api/items/group`) returns `404`.

### Searching members

`GET /api/members` returns `{ items, total, page, pageSize }`. Each item has the fields above
plus `kind`, `description`, `updatedBy` and, for groups, `memberCount`. Query parameters, all
optional:

| Parameter | |
|---|---|
| `q` | Text to find in the name, Terria id, URL or description. |
| `kind` | `item` or `group`. |
| `type` | Comma-separated types. |
| `memberOf` | A group type: only types that group may contain. |
| `within` | Comma-separated group ids: only their members, at any depth. |
| `published` | `true` or `false`. |
| `sort` | `name`, `type`, `terriaId`, `url`, `isPublished`, `version`, `updatedAt` (default) or `updatedBy`. |
| `dir` | `asc` or `desc` (default). |
| `page`, `pageSize` | Page number from 1, and page size (default 25, at most 200). |

## Init files

An init file is returned as `{ id, slug, name, description, config, catalog, workbench,
catalogCount, version, updatedAt, updatedBy, published, test }`:

- `slug` is the file name without `.json`;
- `config` holds every top-level init file key except `catalog` and `workbench`;
- `catalog` and `workbench` are member lists, as for group members;
- `published` and `test` are `{ path, version, writtenAt, writtenBy }` for the file on disk, or
  `null`.

| Method | Path | |
|---|---|---|
| `GET` | `/api/init-files` | List init files, by name, without `config`, `catalog` or `workbench`. |
| `GET` | `/api/init-files/:id` | One init file. |
| `POST` | `/api/init-files` | Create one: `{ "slug", "name", "description", "config", "catalog", "workbench" }`, with `catalog` an ordered array of group ids and `workbench` an ordered array of ids of items inside those groups. |
| `PUT` | `/api/init-files/:id` | Update one: the same body plus `version`. If test mode is on, the test file is rewritten. |
| `DELETE` | `/api/init-files/:id` | Delete one, and its published and test files. Its groups and items are kept. |
| `GET` | `/api/init-files/:id/export` | The finished init file JSON, with published members only. Add `?download` to download it as `<slug>.json`. |
| `POST` | `/api/init-files/:id/publish` | Publish: write the finished JSON to `CONFIG_DIR/<slug>.json`, replacing any earlier copy (and removing one under an old file name). `409` if another init file is published under that name. Returns the init file. |
| `DELETE` | `/api/init-files/:id/publish` | Unpublish: delete the published file. |
| `POST` | `/api/init-files/:id/test` | Turn test mode on: write `CONFIG_DIR/test/<id>.json`. |
| `DELETE` | `/api/init-files/:id/test` | Turn test mode off: delete the test file. |

Publishing doesn't change the init file's `version`.

## Published files

| Method | Path | |
|---|---|---|
| `GET` | `/config/<slug>.json` | A published init file. |
| `GET` | `/config/test/<id>.json` | An init file's test copy. |

These are public (no login), served with `Access-Control-Allow-Origin: *` and
`Cache-Control: no-cache`, so a Terria map on any site can load them and always gets the latest
copy.
