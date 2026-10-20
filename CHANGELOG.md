# Changelog

All notable changes to TerriaJS Init Manager. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See
[Releasing](docs/development/releasing.md) for when and how to bump the version.

## [Unreleased]

### Added

- Delete items and groups from the catalog table, unless an init file uses them. Deleting a
  group keeps its members.
- Select rows in the catalog table, or every row on the page, and delete them together.
- Edit several items or groups of one type at once: **Edit selected** sets the traits you fill in
  on all of them, showing each one's current values on request. Traits that must be unique are
  left out.
- An **Orphaned only** filter in the catalog table, for items and groups in no group and no init
  file.
- A **Docs** menu item that shows this documentation inside the app, served by the server at
  `/docs/`. The Docker image now builds the documentation (new `DOCS_DIR` setting).
- Released under the MIT License (see `LICENSE`).
- A GitHub Actions workflow matching the GitLab CI pipeline: lint, tests, build, docs, GitHub
  Pages and release tag checks.

### Changed

- Published init files can no longer be deleted; unpublish them first.

## [0.1.0] - 2026-10-09

First versioned release.

### Added

- Editor for every Terria catalog item and group type, driven by trait metadata generated from
  docs.terria.io, with validation and WMS GetCapabilities lookups.
- Catalog items and groups stored in PostgreSQL, with ordered group members, per-group-type
  member rules, optimistic locking and revision history.
- Catalog table with search, filters, sorting and paging; duplicate an item from the table.
- Init file editor: catalog groups, workbench items, cameras set from a map, base maps, settings
  and other top-level keys, with JSON export and download.
- Publish and unpublish init files to `/config/<file name>.json`, and a test mode that keeps
  `/config/test/<init file id>.json` up to date on every save.
- Users and login sessions; `npm run user:create` for the first user.
- Version number shown in the app and returned by `/api/health`.
- Documentation (Sphinx, Read the Docs), a test suite (Vitest) and GitLab CI.

### Fixed

- Exported init files no longer contain `"workbench": null` when no workbench items are
  published (migration `007_export_empty_workbench.sql`).

[Unreleased]: https://github.com/pmlapplications/terriajs-initialisation-manager/-/compare/v0.1.0...main
[0.1.0]: https://github.com/pmlapplications/terriajs-initialisation-manager/-/tags/v0.1.0
