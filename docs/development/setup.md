# Development setup

Requirements: Node.js 22.18 or later (`nvm use` picks up `.nvmrc`) and Docker, for PostgreSQL.

```bash
npm install
cp .env.example .env       # optional; the defaults match it
docker compose up -d db    # PostgreSQL only
npm run dev:api            # API server on http://localhost:3000, restarts on changes
npm run dev                # frontend on http://localhost:5173, forwarding /api and /config
npm run user:create        # create a user to log in with
```

Open <http://localhost:5173>. The Vite dev server reloads the frontend as you edit; the API server
restarts when a server file changes.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Frontend dev server on port 5173. |
| `npm run dev:api` | API server on port 3000, reading `.env`, restarting on changes. |
| `npm start` | API server without watching. |
| `npm run user:create` | Create a user from the command line. |
| `npm run build` | Type-check everything and build the frontend into `dist/`. |
| `npm run preview` | Serve the built frontend. |
| `npm run lint` | Lint with [oxlint](https://oxc.rs/docs/guide/usage/linter). |
| `npm test` | Run every test; see [Testing](testing.md). |
| `npm run docs:setup`, `npm run docs` | Install the docs tools (once), then build this documentation; see [Documentation](documentation.md). |
| `npm run generate:traits` | Refresh the trait metadata for every type from docs.terria.io. |

## Refreshing trait metadata

When Terria adds types or traits, run `npm run generate:traits`. It rewrites the files in
`src/terria/generated/` from the Terria documentation and reports any type it couldn't read.
Review the diff, add any widgets or ranges the new traits need in `src/terria/catalog-ui.ts`, and
add new types to `db/migrations/` (in a new migration) and to `src/terria/type-categories.ts`.
The tests check that every generated type builds a working editor.

## Changing the database

Never edit a migration that has been released: existing databases won't see the change. Add a
new numbered file to `db/migrations/` instead, list it in the [database docs](../deployment/database.md),
and mention it in the changelog so that people upgrading know to apply it. The API tests run
every migration on a fresh database, so they check the new one too.
