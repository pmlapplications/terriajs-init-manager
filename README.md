# Terria Layer Manager

UI for managing the catalog layers of a [TerriaJS](https://github.com/TerriaJS/terriajs) map.
React + TypeScript, built with [Vite](https://vite.dev).

Edits any of the catalog item types listed on
[Terria's catalog items page](https://docs.terria.io/guide/connecting-to-data/catalog-items/)
(`wms`, `csv`, `geojson`, ...) and produces its init file JSON. **Create New** in the top bar opens
a page of every type, grouped by kind of data (imagery, vector, tables, 3D, ...) with an icon each;
pick one to start a new item. The categories and icons are set in `src/terria/type-categories.ts`.

It also edits the [catalog groups](https://docs.terria.io/guide/connecting-to-data/catalog-groups/)
(`group`, `wms-group`, ...), listed under **Groups** in **Create New**. Every group has a
**Members** section where you search the saved items and groups and pick which to include, in
order. The search only offers types the group may contain: a plain `group` takes any item or
group, while e.g. a `wms-group` takes `wms` items and other `wms-group`s. The rules are the
`group_member_type` table (`db/migrations/004_group_member_types.sql`).

The landing page (**Catalog items**) lists every saved item and group in a paged table. Search
matches name, Terria id, URL and description; filter by kind, type or published state, and click a
column header to sort by it. Click a name to open it in the editor.

**Init files** builds complete [Terria init files](https://docs.terria.io/guide/customizing/initialization-files/).
The catalog is picked from saved groups (in order; each brings its members), and the workbench from
items inside those groups. The home and initial cameras are set by panning a Leaflet map and
clicking **Use map view** (a `{ west, south, east, north }` box), or given as JSON for
position/direction/up, `positionHeading` or `lookAt` views; the initial camera can also focus on the
workbench items. Viewer mode, splitter, base maps, settings, CORS domains and the previewed item
have fields; stories and any other top-level keys are edited as JSON. **Download JSON** gives the
finished `<file name>.json` with published groups and items only. The map uses OpenStreetMap tiles.

Each init file is **Published** or **Not published**. Publishing writes the last saved version to
`CONFIG_DIR/<file name>.json` (default `./config`; a Docker volume in the compose stack), which is
public at `/config/<file name>.json` with CORS allowed, so a Terria map can load it directly.
Unpublishing deletes the file. The published file is a snapshot: after saving, the editor shows it
as out of date until you **Update** it. Publishing after a rename moves the file to the new name.
**Test mode** writes a separate copy to `/config/test/<init file id>.json` that is rewritten on
every save, for trying changes before publishing. Deleting an init file removes both files.
Which files are on disk is recorded in `init_file_output`.

## Requirements

Node 20.19+ or 22.12+ (`nvm use` picks up `.nvmrc`).

## Scripts

```bash
npm install              # install dependencies
npm run dev              # start dev server at http://localhost:5173 (proxies /api)
npm run dev:api          # start the API server at http://localhost:3000 (reads .env)
npm start                # run the API server without watching
npm run user:create      # create a user from the command line (reads .env)
npm run build            # type-check and build to dist/
npm run preview          # serve the production build
npm run lint             # lint
npm run generate:traits  # refresh trait metadata for every item type from docs.terria.io
```

## How the editor is built

| File | Role |
|---|---|
| `scripts/generate-traits.mjs` | Reads the Terria docs page for a type and writes every traits table to `src/terria/generated/<type>-traits.json`. `--all` does every type on the catalog items and catalog groups pages and writes `index.json` (items) and `groups.json` (groups). |
| `src/terria/catalog-ui.ts` | What the docs only say in prose: dropdown values, number ranges, widgets, and section grouping. Shared by all types; traits not placed in a section appear in a "<Type> options" section after Basics. Each type's traits are loaded on demand. |
| `src/terria/validate.ts` | Validates the whole item (types, allowed values, ranges, formats, cross-field rules). Also used on imported JSON. |
| `src/terria/capabilities.ts` | Reads WMS GetCapabilities to offer the server's layers, styles and extent (WMS only). |
| `src/form/` | Generic form renderer driven by the trait metadata. |
| `src/MembersPanel.tsx` | A group's member list and the search for items and groups to add (`MemberList` and `MemberSearch` are reused by the init file editor). |
| `src/InitFileEditor.tsx`, `src/CameraMap.tsx` | The init file editor and its Leaflet map for camera views. |

Unset fields are left out of the JSON so Terria's defaults apply. Each type's current draft is
kept in browser storage; **Save** writes it to the database and **Open** loads a saved config.

Loading GetCapabilities runs in the browser, so the WMS server must allow cross-origin (CORS)
requests.

## Database

`db/migrations/` holds the PostgreSQL schema for storing catalog members and init files.

### Running with Docker

```bash
cp .env.example .env              # optional; defaults match it
docker compose up --build         # app + API on http://localhost:3000, Postgres on :5432
```

For frontend development, run only the database and use the dev servers:

```bash
docker compose up -d db
npm run dev:api & npm run dev
```

The migrations run automatically when the database volume is empty. The volume is named by
`DB_VOLUME` (default `terria-layer-manager-db`), so you can keep separate test datasets:

```bash
DB_VOLUME=tlm-db-scratch docker compose up -d db   # use or create another dataset
docker compose down -v                             # delete the current dataset to start fresh
```

### Users and login

Every page and every API route except login and `/api/health` needs a logged-in user. Users have
an email, first and last name and password; any logged-in user can add or delete users on the
**Users** page (but not delete themselves). Passwords are hashed with scrypt, and sessions last
12 hours in an HttpOnly cookie.

Create the first user from the command line:

```bash
npm run user:create                                   # against DATABASE_URL
docker compose exec app node server/create-user.ts    # inside the Docker stack
```

Migrations only run automatically on an empty volume. To add a newer one (e.g. `003_users.sql`,
`004_group_member_types.sql`, `005_init_file_version.sql`, `006_init_file_output.sql`) to an existing database:

```bash
docker compose exec -T db psql -U terria -d terria < db/migrations/003_users.sql
docker compose exec -T db psql -U terria -d terria < db/migrations/004_group_member_types.sql
docker compose exec -T db psql -U terria -d terria < db/migrations/005_init_file_version.sql
docker compose exec -T db psql -U terria -d terria < db/migrations/006_init_file_output.sql
```

### API

`server/` is a small [Hono](https://hono.dev) server, run directly by Node's TypeScript support.
In production (`NODE_ENV=production`) it also serves `dist/`.w

| Method | Path | |
|---|---|---|
| `POST` | `/api/auth/login` | Log in with `{ "email", "password" }`; sets the session cookie. |
| `POST` | `/api/auth/logout` | End the session. |
| `GET` | `/api/auth/me` | The logged-in user. |
| `GET` | `/api/users` | List users. |
| `POST` | `/api/users` | Create a user: `{ "email", "firstName", "lastName", "password" }`. |
| `DELETE` | `/api/users/:id` | Delete a user and end their sessions. |
| `GET` | `/api/members` | One page of items and groups of every type: `{ items, total, page, pageSize }`. Query `q` (search), `kind` (`item`/`group`), `type` (comma-separated), `memberOf` (a group type: only types it may contain), `within` (comma-separated group ids: only their members, at any depth), `published` (`true`/`false`), `sort` (`name`, `type`, `terriaId`, `url`, `isPublished`, `version`, `updatedAt`, `updatedBy`), `dir` (`asc`/`desc`), `page`, `pageSize` (max 200). |
| `GET` | `/api/items/:type` | List saved configs of a catalog item type, e.g. `/api/items/wms` (no item bodies). |
| `GET` | `/api/items/:type/:id` | Load one config; `item` is the catalog JSON without `type`. |
| `POST` | `/api/items/:type` | Create a config from a catalog item. |
| `PUT` | `/api/items/:type/:id` | Update a config. Body `{ "version", "item" }`; returns 409 if `version` is stale. |
| `GET` | `/api/groups/:type` | List saved configs of a catalog group type, e.g. `/api/groups/group`. |
| `GET` | `/api/groups/:type/:id` | Load one group; `item` is the group JSON without `type` or `members`, and `members` lists its members in order. |
| `GET` | `/api/groups/:type/member-types` | The types a group of this type may contain. |
| `POST` | `/api/groups/:type` | Create a group. Body `{ "item", "members" }`, where `members` is an ordered array of catalog member ids. |
| `PUT` | `/api/groups/:type/:id` | Update a group. Body `{ "version", "item", "members" }`; leave out `members` to keep the current ones. |
| `GET` | `/api/init-files` | List init files. |
| `GET` | `/api/init-files/:id` | Load one: `{ slug, name, description, config, catalog, workbench, version, ... }`, with `catalog` and `workbench` as member lists. |
| `POST` | `/api/init-files` | Create one. Body `{ "slug", "name", "description", "config", "catalog", "workbench" }`: `config` holds every top-level key except `catalog` and `workbench`, which are ordered arrays of group ids and of ids of items inside those groups. |
| `PUT` | `/api/init-files/:id` | Update one. The same body plus `version`; returns 409 if it is stale. |
| `DELETE` | `/api/init-files/:id` | Delete one (its groups and items are kept). |
| `GET` | `/api/init-files/:id/export` | The finished init file JSON from `export_init_file()`, published members only. Add `?download` to save it as `<slug>.json`. |
| `POST` | `/api/init-files/:id/publish` | Publish: write the finished JSON to `CONFIG_DIR/<slug>.json`. Returns the init file, whose `published` is `{ path, version, writtenAt, writtenBy }` (null when not published). 409 if another init file is published under that name. |
| `DELETE` | `/api/init-files/:id/publish` | Unpublish: delete the file. |
| `POST` | `/api/init-files/:id/test` | Turn test mode on: write `CONFIG_DIR/test/<id>.json`, rewritten on every save. Shown as `test`. |
| `DELETE` | `/api/init-files/:id/test` | Turn test mode off: delete the test file. |
| `GET` | `/config/<slug>.json`, `/config/test/<id>.json` | Files written above. Public (no login) and served with `Access-Control-Allow-Origin: *`. |

Items are stored as `catalog_member` rows: `id`, `name`, `description` and `url` go to columns,
`shareKeys` to `catalog_member_share_key`, and every other trait to `traits`. Groups are stored the
same way; their members are rows in `group_membership` (with `sort_order`), which rejects a member
whose type `group_member_type` doesn't allow and a group that would end up inside itself. `member_json()` exports a group with its published members inlined. The logged-in
user's email is recorded in `created_by`/`updated_by`. `src/api.ts` is the frontend client.
