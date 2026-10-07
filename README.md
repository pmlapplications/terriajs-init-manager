# Terria Layer Manager

UI for managing the catalog layers of a [TerriaJS](https://github.com/TerriaJS/terriajs) map.
React + TypeScript, built with [Vite](https://vite.dev).

Currently supports editing a single `WebMapServiceCatalogItem` (`"type": "wms"`) and
producing its init file JSON.

## Requirements

Node 20.19+ or 22.12+ (`nvm use` picks up `.nvmrc`).

## Scripts

```bash
npm install              # install dependencies
npm run dev              # start dev server at http://localhost:5173 (proxies /api)
npm run dev:api          # start the API server at http://localhost:3000 (reads .env)
npm start                # run the API server without watching
npm run build            # type-check and build to dist/
npm run preview          # serve the production build
npm run lint             # lint
npm run generate:traits  # refresh trait metadata from docs.terria.io
```

## How the WMS editor is built

| File | Role |
|---|---|
| `scripts/generate-traits.mjs` | Reads the Terria docs page for a type and writes every traits table to `src/terria/generated/<type>-traits.json`. |
| `src/terria/wms-ui.ts` | What the docs only say in prose: dropdown values, number ranges, widgets, and section grouping. Traits not placed in a section appear under "Other". |
| `src/terria/validate.ts` | Validates the whole item (types, allowed values, ranges, formats, cross-field rules). Also used on imported JSON. |
| `src/terria/capabilities.ts` | Reads WMS GetCapabilities to offer the server's layers, styles and extent. |
| `src/form/` | Generic form renderer driven by the trait metadata. |

Unset fields are left out of the JSON so Terria's defaults apply. The current draft is kept in
browser storage; **Save** writes it to the database and **Open** loads a saved config.

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

### API

`server/` is a small [Hono](https://hono.dev) server, run directly by Node's TypeScript support.
In production (`NODE_ENV=production`) it also serves `dist/`.

| Method | Path | |
|---|---|---|
| `GET` | `/api/wms` | List saved WMS configs (no item bodies). |
| `GET` | `/api/wms/:id` | Load one config; `item` is the catalog JSON without `type`. |
| `POST` | `/api/wms` | Create a config from a catalog item. |
| `PUT` | `/api/wms/:id` | Update a config. Body `{ "version", "item" }`; returns 409 if `version` is stale. |

Items are stored as `catalog_member` rows: `id`, `name`, `description` and `url` go to columns,
`shareKeys` to `catalog_member_share_key`, and every other trait to `traits`. An optional
`X-User` header is recorded in `created_by`/`updated_by`. `src/api.ts` is the frontend client.
