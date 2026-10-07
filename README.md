# Terria Layer Manager

UI for managing the catalog layers of a [TerriaJS](https://github.com/TerriaJS/terriajs) map.
React + TypeScript, built with [Vite](https://vite.dev).

Edits any of the catalog item types listed on
[Terria's catalog items page](https://docs.terria.io/guide/connecting-to-data/catalog-items/)
(`wms`, `csv`, `geojson`, ...) and produces its init file JSON. Pick a type from **Create New**
in the top menu.

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
| `scripts/generate-traits.mjs` | Reads the Terria docs page for a type and writes every traits table to `src/terria/generated/<type>-traits.json`. `--all` does every type on the catalog items page and writes `index.json`. |
| `src/terria/catalog-ui.ts` | What the docs only say in prose: dropdown values, number ranges, widgets, and section grouping. Shared by all types; traits not placed in a section appear in a "<Type> options" section after Basics. Each type's traits are loaded on demand. |
| `src/terria/validate.ts` | Validates the whole item (types, allowed values, ranges, formats, cross-field rules). Also used on imported JSON. |
| `src/terria/capabilities.ts` | Reads WMS GetCapabilities to offer the server's layers, styles and extent (WMS only). |
| `src/form/` | Generic form renderer driven by the trait metadata. |

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

Migrations only run automatically on an empty volume. To add `003_users.sql` to an existing
database:

```bash
docker compose exec -T db psql -U terria -d terria < db/migrations/003_users.sql
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
| `GET` | `/api/items/:type` | List saved configs of a catalog item type, e.g. `/api/items/wms` (no item bodies). |
| `GET` | `/api/items/:type/:id` | Load one config; `item` is the catalog JSON without `type`. |
| `POST` | `/api/items/:type` | Create a config from a catalog item. |
| `PUT` | `/api/items/:type/:id` | Update a config. Body `{ "version", "item" }`; returns 409 if `version` is stale. |

Items are stored as `catalog_member` rows: `id`, `name`, `description` and `url` go to columns,
`shareKeys` to `catalog_member_share_key`, and every other trait to `traits`. The logged-in
user's email is recorded in `created_by`/`updated_by`. `src/api.ts` is the frontend client.
