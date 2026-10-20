# Jules handoff: add editor navigation diagnostics only

## Target

- Repository: `https://github.com/cinnabar777/W.mdx`
- Branch: `feature/callout-header-styling-17404924448172990300`
- Last inspected branch head: `671b359c0b2580739f01906b0c9c2f5979589e8e`

Use the active branch. Do not switch branches, cherry-pick, or reset it. If it has advanced, keep its current state and apply only this diagnostics change.

## User's latest APK observations

- Around the `ALIAS` heading in the Markdown cheat sheet, navigation sometimes jumps back to `LINKS`; the editor sometimes goes blank there.
- Up navigation is highly inconsistent around headings and block content.
- A link at the end of a paragraph can pull the caret to the beginning of the link.
- The Android report only records app/window lifecycle events. It does not record caret movement or layout geometry.
- The APK reports that it read 13,826 characters / 662 lines. The checked-in `Documentation/Markdown.md` at the inspected branch head is 13,504 characters / 636 lines. Treat these as different file snapshots. Do not rewrite or edit the stress-test Markdown file.

The current checked-in file has balanced code fences around its `ALIAS` section; there is no obvious unclosed fence there. This does not rule out an editor bug.

## Existing code locations

- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt` stores generic Android diagnostic events. Each event detail is truncated to 80 characters; the generic buffer retains 100 lines.
- `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt` exposes `AndroidNative.reportDiagnostic(event, detail)` to the WebView.
- `web/src/main.js` already has an `EditorView.updateListener` that sees selection changes. It currently sends selection state to the native bridge, but does not log arrow/tap movement or coordinates.
- `web/src/main.js` reports JavaScript errors and rejected promises, but those reports do not include editor navigation state.

## Implement exactly this diagnostics-only change

### 1. Add a testable JavaScript trace serializer

Create `web/src/navigationDiagnostics.js` with an exported `serializeNavigationTraceRecord(record)` function. It must return compact JSON containing only these fields:

- `id` — increasing numeric trace ID
- `kind` — `arrow` or `tap`
- `direction` — `up`, `down`, or `none`
- `repeat` — boolean
- `before` and `after` — each contains only numeric `anchor`, `head`, `line`, `column`, `x`, `y`, `scrollTop`, and `scrollLeft`
- `blockBefore` and `blockAfter` — one of `heading`, `list`, `callout`, `code`, `table`, `paragraph`, or `other`
- `pointerX` and `pointerY` — numeric values for tap records; omit for arrow records
- `selectionChanged` — boolean

Drop unknown fields. Never include document text, selected text, HTML, file names, paths, URIs, or arbitrary DOM class names. If a coordinate cannot be read, serialize it as `null`. Do not add a dependency.

### 2. Capture before/after movement in the existing editor

In `web/src/main.js`, install passive diagnostic listeners on the active `EditorView` only:

- On capture-phase `keydown`, handle only `ArrowUp` and `ArrowDown`. Record a pre-movement snapshot, including the selection anchor/head, document line and column, `view.coordsAtPos(head)`, and `view.scrollDOM.scrollTop/scrollLeft`.
- On editor-content `pointerdown`, record the pointer coordinates, pre-selection, and `view.posAtCoords({x, y})`.
- Record the corresponding post-movement snapshot on the next animation frame, after CodeMirror has processed the event. Correlate each before/after pair with its own increasing ID; do not use one shared pending slot that can overwrite repeated key events.
- Determine block categories using only the fixed whitelist above. If classification fails, use `other`.
- Keep these listeners observational only: never call `preventDefault`, change the selection, alter scrolling, or intercept/replace the existing keymaps.
- Skip records if there is no active editor view. Guard geometry calls that return `null` or throw.

### 3. Store and export a bounded local trace

In `MainActivity.kt`, add a WebView bridge method alongside `reportDiagnostic` to accept the serialized trace record. Validate the payload length and schema before storing it; do not persist arbitrary strings or unknown keys.

In `AppDiagnostics.kt`:

- Keep navigation records in a separate bounded local buffer so ordinary lifecycle events cannot evict them and the existing 80-character detail limit cannot truncate them.
- Retain only the latest 24 complete before/after records.
- Add a `Navigation trace (last 24)` section to the existing diagnostic report.
- Change the report version from `routing-v1` to `routing-v2`.
- Keep trace data on-device; include it in the report only when the user uses the existing Copy or Share action. Do not add network uploads.

### 4. Add one focused test

Create `web/test/navigation-diagnostics.test.cjs` using the existing `node:test` setup. Test that `serializeNavigationTraceRecord`:

- preserves valid fields and normalizes invalid coordinates to `null`;
- drops unexpected fields, including `text`, `selectedText`, `html`, `fileName`, `path`, and `uri`;
- does not emit any of those private values in the serialized result.

Do not add browser automation or modify any rendered-navigation test.

## Strict boundaries

Only these files may change:

- `web/src/main.js`
- `web/src/navigationDiagnostics.js` (new)
- `web/test/navigation-diagnostics.test.cjs` (new)
- `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`
- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt`

Do not change cursor behavior, keymaps, scrolling, CSS, decorations, list/table/callout behavior, or the Markdown stress-test file. Do not edit `web/test_sources/rendered_navigation.spec.cjs`, `web/build_tests.cjs`, workflows, package manifests, or add dependencies. Do not remove or rewrite existing code.

## Verify once

Run:

```sh
node --test web/test/*.test.cjs
node web/build.cjs
```

Then run the repository's existing Android debug build workflow once. If a check fails, report the exact failure and stop; do not expand scope or repeatedly run an unchanged failing check.

This handoff adds observability only. Do not claim it fixes navigation or make a navigation fix in the same change.
