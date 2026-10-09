# Configuration

The server is configured with environment variables. `docker compose` and `npm run dev:api` read
them from a `.env` file in the repository root; copy `.env.example` to start one.

## Server

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `postgres://terria:terria@localhost:5432/terria` | PostgreSQL connection string. The tables are in the `terria` schema. In Docker Compose it is set to the `db` container. |
| `PORT` | `3000` | Port the server listens on. |
| `NODE_ENV` | | `production` serves the built frontend from `dist/` and makes the session cookie `Secure`. |
| `CONFIG_DIR` | `config` | Folder that published and test init files are written to, served at `/config`. Relative paths are from the working directory. In Docker Compose it is the `config-data` volume at `/app/config`. |
| `DOCS_DIR` | `docs/_build/html` | The built documentation, served at `/docs/` and shown on the app's **Docs** page. The Docker image builds the docs and sets this. |
| `COOKIE_SECURE` | `true` in production | Set `false` only when serving production over plain HTTP to a host other than `localhost`. |

## Docker Compose

| Variable | Default | |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `terria` | Database name and credentials. |
| `DB_PORT` | `5432` | Host port for PostgreSQL. |
| `APP_PORT` | `3000` | Host port for the app. |
| `DB_VOLUME` | `terriajs-init-manager-db` | Volume holding the database. Change it to switch datasets. |
| `CONFIG_VOLUME` | `terriajs-init-manager-config` | Volume holding published init files. |

## Development

| Variable | Default | |
|---|---|---|
| `API_URL` | `http://localhost:3000` | Where the Vite dev server forwards `/api` and `/config`. |
| `TEST_DATABASE_URL` | `postgres://terria:terria@localhost:5432/terria_test` | Database for the API tests. Its name must end in `_test`, because the tests delete its data. See [Testing](../development/testing.md). |
