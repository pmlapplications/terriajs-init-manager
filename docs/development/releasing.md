# Versions and releases

The app has one version number, the `version` in `package.json`. The server returns it from
`/api/health` and logs it on start-up, the app shows it in the top bar and on the login page, and
these docs show it in their title.

## Version numbers

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`. Increase:

**PATCH** (`0.1.0` → `0.1.1`)
: for bug fixes that don't change how the app is used or deployed.

**MINOR** (`0.1.1` → `0.2.0`)
: for new features, and for changes that need something done when upgrading but don't break
  anything if it is done, such as a new database migration that only adds.

**MAJOR** (`0.2.0` → `1.0.0`)
: for changes that break existing use: an API change that existing clients can't handle, a
  migration that removes or reshapes data, a changed environment variable, or init files that
  Terria would read differently.

While the version is below `1.0.0`, breaking changes may go in a MINOR release; say so clearly
in the changelog.

The version changes only when a release is made, not with every commit. Changes since the last
release are listed under **Unreleased** in `CHANGELOG.md`.

## Recording changes

Every merge request that changes behaviour adds a line to the **Unreleased** section of
`CHANGELOG.md`, under **Added**, **Changed**, **Fixed** or **Removed**. Mention new database
migrations by file name, so people upgrading know to apply them.

## Making a release

1. Make sure the default branch is green in CI.
2. Decide the new version from the **Unreleased** changes, using the rules above.
3. In `CHANGELOG.md`, rename **Unreleased** to the version and today's date, add a new empty
   **Unreleased** section above it, and update the comparison links at the bottom:

   ```markdown
   ## [Unreleased]

   ## [0.2.0] - 2026-11-03
   ```

4. Update the version in `package.json` and `package-lock.json`, without npm making its own commit
   and tag:

   ```bash
   npm version 0.2.0 --no-git-tag-version
   ```

5. Commit both files with the message `Release 0.2.0`, and merge it to the default branch.
6. Tag that commit and push the tag:

   ```bash
   git tag -a v0.2.0 -m "Release 0.2.0"
   git push origin v0.2.0
   ```

CI checks every `v*` tag: the release job fails if the tag doesn't match the version in
`package.json` or if `CHANGELOG.md` has no section for it. The tests also check that the current
version has a changelog section.

## Deploying a release

Check out the tag on the server, apply any new migrations listed in the changelog (see
[Database](../deployment/database.md#upgrading-an-existing-database)), and rebuild:

```bash
git fetch --tags && git checkout v0.2.0
docker compose up --build -d
curl -s http://localhost:3000/api/health   # {"ok":true,"version":"0.2.0"}
```
