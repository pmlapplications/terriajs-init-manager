# Installation

The app is a Node.js server that serves the web frontend and its API, and stores everything in
PostgreSQL. The simplest way to run it is with Docker Compose.

## With Docker Compose

Requirements: Docker with the Compose plugin.

```bash
cp .env.example .env              # optional; the defaults match it
docker compose up --build         # app on http://localhost:3000, PostgreSQL on port 5432
```

This starts two containers:

- `db`: PostgreSQL 17. The schema in `db/migrations/` is created automatically the first time,
  when the data volume is empty.
- `app`: the frontend and API on port 3000 (`APP_PORT`).

Data is kept in two named volumes: the database (`DB_VOLUME`, default `terria-layer-manager-db`)
and published init files (`CONFIG_VOLUME`, default `terria-layer-manager-config`). They survive
`docker compose down` and rebuilds; `docker compose down -v` deletes them.

You can keep separate datasets, for example for testing, by changing the database volume name:

```bash
DB_VOLUME=tlm-db-scratch docker compose up -d db   # use or create another dataset
```

### Create the first user

Every page needs a login, so create the first user from the command line. That user can then add
others in the app.

```bash
docker compose exec app node server/create-user.ts
```

You are asked for an email, first and last name, and a password (at least 10 characters, typed
twice and not shown).

## Without Docker

Requirements:

- Node.js 22.18 or later, which runs the TypeScript server directly (`.nvmrc` gives the version;
  run `nvm use`);
- PostgreSQL 14 or later.

```bash
npm ci                     # install dependencies
npm run build              # build the frontend into dist/
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
NODE_ENV=production DATABASE_URL=postgres://... npm start
npm run user:create        # create the first user (reads .env)
```

With `NODE_ENV=production` the server also serves the built frontend from `dist/`. See
[Configuration](configuration.md) for the environment variables.

## Behind a reverse proxy

The app serves everything (the frontend, `/api` and `/config`) from one port, so a reverse proxy
only needs to forward all paths to it. Serve it over HTTPS: the session cookie is marked `Secure`
in production. If you must serve production over plain HTTP to a host other than `localhost`, set
`COOKIE_SECURE=false`.

Published init files are under `/config/`. They are public and are served with
`Access-Control-Allow-Origin: *` so that Terria maps on other sites can load them.

## Upgrading

1. Read the [changelog](../changelog.md) for the versions between yours and the new one.
2. Apply any new database migrations; see [Database](database.md#upgrading-an-existing-database).
3. Rebuild and restart: `docker compose up --build -d`.
