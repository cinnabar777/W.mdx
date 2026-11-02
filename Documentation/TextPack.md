# TextPack support

`.textpack` is the compressed ZIP form of TextBundle. W.mdx uses the
[TextBundle v2 specification](https://textbundle.org/spec).

## Package structure

A package contains `info.json`, a `text.*` document, and an optional `assets/`
directory. Version 2 allows the document extension to vary, for example
`text.md` or `text.markdown`. Markdown image references use package-relative
paths prefixed with `assets/`, such as `![](assets/cover.png)`.

Archive paths are meaningful. Keep nested asset paths intact when opening and
saving; do not flatten them to basenames. New images should retain their source
filename when available, adding a collision suffix only when needed.

## W.mdx behavior

- New packages use `text.md`, `info.json`, and an `assets/` directory.
- Existing packages retain the selected `text.*` entry name when saved.
- When several root `text.*` entries exist, a unique non-blank entry is
  selected. If multiple entries contain text, opening fails clearly rather
  than silently choosing the wrong document.
- TextPack images resolve from the active package workspace while editing.
- Saving a package writes only the selected root `text.*` document, avoiding
  stale duplicate entry points.

The official TextBundle example archive is kept as a regression fixture in the
Android unit tests.
