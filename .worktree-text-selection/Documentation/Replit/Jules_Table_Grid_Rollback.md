# Jules patch: remove the broken CodeMirror table grid

**Branch:** `jules-3492949419147525921-af940c11`  
**Current grid commits:** `7332c17c35605d6d7ea4ecf9b2fe4a38fecaccdf` and `33bebda5f3a9ee230eab191e0b96f29eb96964ae`  
**Restore point:** `3c76d24f97313ad5eb69d73ef4febc10c613d4e8`

## Why this rollback

The installed build shows three regressions after applying CSS Grid to CodeMirror’s individual lines:

- Large gaps between rendered table rows.
- Long cells stay wide rather than wrapping at a useful phone-sized width.
- Tab navigation no longer works.

The grid columns are also based on content width, with a maximum of `40ch`; each CodeMirror line is being used as a grid container even though it is not a real table-row element. Do not try another CSS Grid tweak on `.cm-line`.

## Exact change

Restore these three files to their exact contents at commit `3c76d24f97313ad5eb69d73ef4febc10c613d4e8`:

```text
web/src/main.js
web/index.html
web/test/table-and-widgets.test.cjs
```

From the repository root, the restore can be performed with:

```sh
git restore --source=3c76d24f97313ad5eb69d73ef4febc10c613d4e8 -- \
  web/src/main.js \
  web/index.html \
  web/test/table-and-widgets.test.cjs
```

This removes the two grid commits’ changes while preserving earlier work in the branch, including the code-block font-size setting. Do not restore the whole repository and do not change Kotlin/settings files for this rollback.

Commit the rollback on the current Jules branch; do not open a pull request.

## Verification

Run the existing web tests and build. Jules will then produce the debug APK as usual. On the phone, check:

1. Tab and Shift+Tab move between table cells again.
2. The large blank gaps between table rows are gone.
3. Long table content behaves as it did before the grid change.

This rollback is a regression recovery, **not a fix for the older missing-border issue**.

For the next table-rendering attempt, use a **single block widget for the full table range**, not CSS Grid on individual CodeMirror lines. A public CodeMirror 6 live-preview project demonstrates this pattern: when the cursor is outside a table, it replaces the table range with a block widget containing a native HTML `<table>`; when the cursor enters the table, it shows the Markdown source for editing. This is a community implementation, not Obsidian's proprietary source:

- [Table decorations and source/edit-mode switching](https://github.com/blueberrycongee/codemirror-live-markdown/blob/main/src/plugins/table.ts)
- [Native HTML table widget](https://github.com/blueberrycongee/codemirror-live-markdown/blob/main/src/widgets/tableWidget.ts)
- [Editable table widget example](https://github.com/blueberrycongee/codemirror-live-markdown/blob/main/src/widgets/tableEditorWidget.ts)

Before adopting that architecture, explicitly preserve and test: source-of-truth Markdown in CodeMirror, save/history synchronization, entering source-edit mode at the clicked cell, and Tab/Shift+Tab navigation on Android. Do not take the community widget as drop-in code; its editing and persistence behavior needs to be adapted and verified in this app.
