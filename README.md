# TerriaJS Init Manager (TIM)

A web app for managing the catalog of a [TerriaJS](https://github.com/TerriaJS/terriajs) map:
edit catalog items and groups of every Terria type, build complete
[init files](https://docs.terria.io/guide/customizing/initialization-files/) from them, and
publish those init files at a URL a Terria map can load.

**Documentation:** see [`docs/`](docs/index.md), built with Sphinx for Read the Docs. Build it
locally with `npm run docs:setup` (once) and `npm run docs`; see [Documentation](docs/development/documentation.md).

## Quick start

```bash
cp .env.example .env                               # optional; the defaults match it
docker compose up --build                          # app on http://localhost:3000
docker compose exec app node server/create-user.ts # create the first user
```

For development (Node.js 22.18+, `nvm use`):

```bash
npm install
docker compose up -d db
npm run dev:api & npm run dev                      # http://localhost:5173
npm test                                           # needs the database running
```

| | |
|---|---|
| [User guide](docs/user-guide/catalog.md) | Catalog items, groups, init files, publishing |
| [Installation](docs/deployment/installation.md) and [configuration](docs/deployment/configuration.md) | Running the app |
| [Database](docs/deployment/database.md) | Schema and migrations, and upgrading |
| [HTTP API](docs/reference/api.md) | The JSON API |
| [Development](docs/development/setup.md), [testing](docs/development/testing.md) | Working on the code |
| [Releasing](docs/development/releasing.md) | Version numbers and making a release |
| [Changelog](CHANGELOG.md) | What changed in each version |
