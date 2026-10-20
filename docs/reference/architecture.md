# How it is built

The frontend is React and TypeScript, built with [Vite](https://vite.dev). The server is a small
[Hono](https://hono.dev) app that Node runs directly from TypeScript, with PostgreSQL for
storage.

## Frontend

The catalog editor is generated from metadata about each type's traits, so every type Terria
documents can be edited without code specific to it.

| File | Role |
|---|---|
| `scripts/generate-traits.mjs` | Reads the Terria docs page for each type and writes its traits tables to `src/terria/generated/<type>-traits.json`. `npm run generate:traits` does every type on the catalog items and catalog groups pages and writes `index.json` (items) and `groups.json` (groups). |
| `src/terria/catalog-ui.ts` | What the docs only say in prose: dropdown values, number ranges, widgets and how traits are grouped into sections. Traits not placed in a section appear after Basics, in a section named after the type (for example "WebMapService options"). Each type's traits are loaded when first needed. |
| `src/terria/validate.ts` | Checks a whole item: types, allowed values, ranges, formats and rules across traits. Also used on imported JSON. |
| `src/terria/capabilities.ts` | Reads WMS GetCapabilities to offer the server's layers, styles and extent. |
| `src/terria/type-categories.ts` | How types are grouped on the Create New page, and their icons. |
| `src/form/` | The form, driven by the trait metadata: one field per trait, chosen by its type and spec. |
| `src/App.tsx` | The item and group editor. |
| `src/drafts.ts` | Keeps each type's draft in browser storage. |
| `src/MembersPanel.tsx` | A group's member list and the search for items and groups to add. `MemberList` and `MemberSearch` are reused by the init file editor. |
| `src/InitFileEditor.tsx`, `src/init-file.ts` | The init file editor and its helpers. |
| `src/CameraMap.tsx`, `src/camera.ts` | The Leaflet map for camera views, and bounding box helpers. |
| `src/DocsPage.tsx` | Shows the documentation from `/docs/` in a frame, keeping the page being read in the address bar. |
| `src/CatalogPage.tsx`, `src/InitFilesPage.tsx`, `src/UsersPage.tsx`, `src/NewPage.tsx` | The other pages. |
| `src/BulkEditPage.tsx` | Sets the same traits on several configs of one type, reusing the editor's fields. |
| `src/routes.ts` | Hash routes shared between pages (the bulk editor's). |
| `src/dialogs.ts`, `src/DialogHost.tsx` | `confirmDialog()` and `alertDialog()`, used instead of the browser's `confirm()` and `alert()`, and the modal that shows them. |
| `src/Root.tsx` | Login gate and page routing (`#/`, `#/new`, `#/item/<type>`, `#/group/<type>`, `#/bulk/<type>/<ids>`, `#/init-files`, `#/init-files/<id>`, `#/users`, `#/docs/<page>`). |
| `src/api.ts` | Client for the HTTP API. |

## Server

| File | Role |
|---|---|
| `server/app.ts` | The routes, authentication and error handling; see [HTTP API](api.md). |
| `server/index.ts` | Starts the server on `PORT`. |
| `server/members.ts` | Catalog items and groups: splitting the editor's JSON into columns and traits, group members and the member search. |
| `server/init-files.ts` | Init files, exporting, publishing and test mode. |
| `server/users.ts`, `server/passwords.ts` | Users, sessions, and scrypt password hashing. |
| `server/create-user.ts` | The `npm run user:create` command. |
| `server/version.ts` | The app version, from `package.json`. |
| `db/migrations/` | The database schema; see [Database](../deployment/database.md). |

## Design notes

- **Unset means Terria's default.** Fields left empty are left out of the JSON rather than being
  written with an empty or default value.
- **Round trips.** Saving and loading a member gives back the same JSON, in the order the form
  shows it.
- **One source of truth for exports.** The database function `export_init_file()` builds the
  init file JSON, so downloads, the preview and published files always match.
- **Optimistic locking.** Saves send the version they loaded and are refused if it is stale, so
  two people editing the same thing can't silently overwrite each other.
- **Browser-side GetCapabilities.** Requests to WMS servers come from the user's browser, not the
  server, so the app never fetches arbitrary URLs on a user's behalf.
