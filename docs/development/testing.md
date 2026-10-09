# Testing

The tests use [Vitest](https://vitest.dev) and are split into three projects:

| Project | Files | Runs in | |
|---|---|---|---|
| `web` | `src/**/*.test.ts(x)`, `scripts/*.test.mjs` | jsdom | Frontend modules and React components, with `fetch` replaced by a fake (`src/test/fetch.ts`). |
| `server` | `server/*.test.ts` | Node | Server code that doesn't need a database: input checks and password hashing. |
| `api` | `server/test/*.test.ts` | Node | The HTTP API, called in-process, against a real PostgreSQL database. Also the `create-user` command and the server start-up. |

```bash
npm test                   # everything (needs PostgreSQL)
npm run test:unit          # web and server only, no database needed
npm run test:api           # API tests only
npm run test:watch         # re-run tests as files change
npm run coverage           # everything, with a coverage report in coverage/
npx vitest run src/api.test.ts   # one file
```

## The test database

The API tests need PostgreSQL. Locally, `docker compose up -d db` is enough: the tests create a
`terria_test` database next to the app's own, then drop its `terria` schema and run every
migration in `db/migrations/` before each run, so each run starts from a fresh install.

Set `TEST_DATABASE_URL` to use another server. Because the tests delete all data in it, the
database name must end in `_test`; the tests refuse to run otherwise.

Published files go to a temporary folder, removed after the run.

## Writing tests

- Put frontend tests next to the file they test, as `<name>.test.ts` or `<name>.test.tsx`.
- In component tests, find elements as a user would: by role and accessible name, or by label.
  `mockFetch()` takes `"METHOD /path"` keys and returns the calls made, and `src/test/fixtures.ts`
  has sample API responses.
- `CameraMap` uses Leaflet, which needs a real layout; tests of pages that include it replace it
  with `vi.mock("./CameraMap", ...)`.
- API tests use `Client` from `server/test/helpers.ts`, which keeps the session cookie like a
  browser, and the fixture helpers there. Clear the tables a test file uses in `beforeEach`.
- Every bug fix should come with a test that fails without the fix.

## In CI

GitLab CI runs the linter, the type-check, the full test suite against a PostgreSQL service, the
production build and the docs build on every push. Test results and coverage appear in merge
requests. See `.gitlab-ci.yml`.
