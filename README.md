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
npm run dev              # start dev server at http://localhost:5173
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
browser storage until a backend exists.

Loading GetCapabilities runs in the browser, so the WMS server must allow cross-origin (CORS)
requests.

## Database

`db/migrations/` holds the PostgreSQL schema for storing catalog members and init files.
