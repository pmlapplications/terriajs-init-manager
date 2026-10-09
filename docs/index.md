# TerriaJS Init Manager

TerriaJS Init Manager is a web app for managing the catalog of a [TerriaJS](https://github.com/TerriaJS/terriajs)
map. You use it to:

- describe catalog items (WMS layers, CSV tables, GeoJSON, 3D tiles and every other type Terria
  supports) with a form that checks each value against Terria's documented traits;
- arrange items into catalog groups;
- build complete [Terria init files](https://docs.terria.io/guide/customizing/initialization-files/)
  from those groups, with the starting map view, base maps and settings;
- publish init files at a public URL that a Terria map can load directly.

Everything is stored in PostgreSQL, so several people can work on the same catalog.

New to the app? Start with [the catalog](user-guide/catalog.md), then [init files](user-guide/init-files.md).
To run your own copy, see [Installation](deployment/installation.md).

```{toctree}
:caption: User guide
:maxdepth: 2

user-guide/catalog
user-guide/init-files
user-guide/users
```

```{toctree}
:caption: Running the app
:maxdepth: 2

deployment/installation
deployment/configuration
deployment/database
```

```{toctree}
:caption: Reference
:maxdepth: 2

reference/api
reference/architecture
```

```{toctree}
:caption: Development
:maxdepth: 2

development/setup
development/testing
development/documentation
development/releasing
changelog
```
