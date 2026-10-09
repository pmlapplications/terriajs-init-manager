# Sphinx configuration for the TerriaJS Init Manager documentation.
#
# Build locally with `npm run docs` (after `npm run docs:setup`);
# Read the Docs uses .readthedocs.yaml and GitLab CI uses .gitlab-ci.yml.

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

project = "TerriaJS Init Manager"
author = "Plymouth Marine Laboratory"
copyright = f"{date.today().year}, {author}"

# One version number, kept in package.json (see development/releasing.md).
release = json.loads((ROOT / "package.json").read_text())["version"]
version = ".".join(release.split(".")[:2])

extensions = ["myst_parser"]
myst_enable_extensions = ["colon_fence", "deflist"]
myst_heading_anchors = 3
source_suffix = {".md": "markdown"}

exclude_patterns = ["_build", "requirements.txt"]

html_theme = "sphinx_book_theme"
html_title = f"{project} {release}"
html_theme_options = {
    "repository_url": "https://rsg-gitlab.npm.ac.uk/pml-applications/terriajs-initialisation-manager",
    "repository_provider": "gitlab",
    "path_to_docs": "docs",
    "use_repository_button": True,
    "use_edit_page_button": True,
    "use_issues_button": True,
    "home_page_in_toc": True,
    "show_toc_level": 2,
}
html_static_path = []
