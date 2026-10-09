# Documentation

This documentation is written in Markdown ([MyST](https://myst-parser.readthedocs.io)) in `docs/`
and built with [Sphinx](https://www.sphinx-doc.org) and the
[Sphinx Book Theme](https://sphinx-book-theme.readthedocs.io).

## Building locally

You need Python 3.11 or later.

```bash
npm run docs:setup         # once: installs Sphinx and the theme in .venv
npm run docs               # writes docs/_build/html/index.html
```

`npm run docs` always uses the Sphinx in `.venv`, not one installed elsewhere on your system,
which would lack the theme and the Markdown extension. Run `npm run docs:setup` again after
`docs/requirements.txt` changes.

`npm run docs` treats warnings, such as a broken cross-reference, as errors, as Read the Docs and
CI do.

## Where it is published

- **Read the Docs** builds the docs from `.readthedocs.yaml` when the project is connected to it.
- **GitLab CI** builds them on every push (the `docs` job) and publishes the default branch to
  GitLab Pages (the `pages` job).

The version shown in the docs comes from `package.json`.

## Writing

- Add a page by creating a `.md` file and listing it in a `toctree` in `docs/index.md`.
- Link to other pages with relative Markdown links, such as `[Database](../deployment/database.md)`.
- Keep the README short; it links here.
- Update the docs in the same change as the feature they describe.
