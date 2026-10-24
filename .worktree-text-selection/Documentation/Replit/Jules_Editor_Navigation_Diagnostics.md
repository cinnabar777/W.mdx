# Jules handoff: improve caret and scroll diagnostics only

## Target

- Repository: `https://github.com/cinnabar777/W.mdx`
- Branch: `feature/callout-header-styling-17404924448172990300`
- Latest branch head verified for this handoff: `a47e5257d8514c99f9aa137aa3b75e13d82e0520`

Use the active branch. Do not switch branches, reset, cherry-pick, or replace newer work. If the branch has advanced, keep its current state and apply only this diagnostics change.

## What the latest Android report proves

The `routing-v2` report contains 24 records, IDs 1913–1936, and every one is labeled `kind:"tap"`. It contains no `kind:"arrow"` record and no scroll-event record.

The snapshots repeatedly show `anchor:13826, head:0, line:1, column:1` with `selectionChanged:false`. This is a non-collapsed selection, but the current trace does not report whether the selection is collapsed or give separate line/column and block information for both endpoints.

The current tap listener emits a tap record on `pointerdown`, before it knows whether the user is tapping or dragging to scroll. Its `x`/`y` fields describe `coordsAtPos(head)`—not the pointer. The caret Y values are far above the viewport at high scroll positions, while the report does not identify the coordinate frame or log pointer movement, pointer-up, or scroll events. The report therefore cannot distinguish a tap from a touch-scroll gesture or show whether the caret, editor layout, or scroll container jumped.

## Current code to extend

- `web/src/main.js`: `setupNavigationDiagnostics(view)` currently logs `keydown` for arrows and `pointerdown` as a tap, then takes one post-event animation-frame snapshot.
- `web/src/navigationDiagnostics.js`: `serializeNavigationTraceRecord()` currently whitelists the small arrow/tap schema.
- `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`: `reportNavigationTrace()` currently accepts strings up to 4,000 characters.
- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt`: `recordNavigationTrace()` stores 24 JSON strings and labels the report `routing-v2`.

## Implement this diagnostics-only change

### 1. Correct caret snapshots

In `web/src/main.js`, make every snapshot record the selection endpoints independently:

- `anchor`, `head`, `collapsed`
- `anchorLine`, `anchorColumn`, `headLine`, `headColumn`
- `anchorBlock`, `headBlock`, classified only as `heading`, `list`, `callout`, `code`, `table`, `paragraph`, or `other`
- `anchorLineText`, `headLineText`, each truncated to 160 characters
- `anchorClientTop`, `anchorClientBottom`, `headClientTop`, `headClientBottom`, from `view.coordsAtPos()` in viewport/client coordinates
- `viewTop`, `viewBottom`, `viewWidth`, `viewHeight`
- editor `scrollTop`, `scrollLeft`, `scrollHeight`, `clientHeight`
- `windowScrollY`, `windowInnerHeight`

For each endpoint, calculate its own line and column from that endpoint's position. Do not derive the line/category for both endpoints from `head`. Use `null` when a position has no geometry or a call throws. Keep coordinate names explicit; never reuse caret coordinates as pointer coordinates.

The short line previews are approved for this troubleshooting report. Do not include the full document, full selection, filenames, paths, URIs, or arbitrary DOM class names.

### 2. Keep arrow-key records and make each record reliable

Keep the existing capture-phase `ArrowUp`/`ArrowDown` listener and existing keymaps unchanged. For each keydown, including repeats:

- Allocate a unique increasing ID and capture the complete snapshot before CodeMirror processes the key.
- Capture the after snapshot on the next animation frame.
- Preserve direction and `event.repeat`.
- Keep each event's before/after pair in its own closure; do not reuse a single pending record.

Do not prevent default, dispatch a selection, change focus, or change scrolling.

### 3. Record touch-scroll gestures instead of calling every pointerdown a tap

Replace the current immediate `pointerdown`-as-tap logic with a passive gesture recorder:

- On `pointerdown` inside `view.dom`, start a pending gesture with a unique ID, pointer type (`touch`, `mouse`, `pen`, or `unknown`), start coordinates/time, and a before snapshot. Do not emit it as a tap yet.
- Track matching `pointermove`, `pointerup`, and `pointercancel` at `window` capture phase. Only track a pointer whose down event began inside this editor. Record the maximum pointer travel and final pointer coordinates/time.
- Listen passively for `scroll` on `view.scrollDOM`, each scrollable ancestor between the editor and the document, and the page. Label targets only as `editor`, `ancestor1`, `ancestor2`, or `page`; do not log selectors or class names.
- While a gesture is active, sample scroll and caret state no more than once every 50 ms, retaining at most 12 samples per gesture. Each sample must include elapsed milliseconds, target label, that target's scroll top/left, editor scroll height/client height, pointer coordinates, selection anchor/head/head line, caret client Y, and editor viewport top/bottom.
- Finalize on pointer-up/cancel, or after 300 ms with no pointer/scroll activity. Label it `tap` only if maximum pointer travel is at most 8 CSS pixels and no scroll target moved more than 1 CSS pixel; otherwise label it `scroll`.
- Also capture scroll activity with no active pointer (for example programmatic or native-driven scrolling). Coalesce it into one `scroll` record after 300 ms idle, with initial/final snapshots and at most 12 time-spaced samples.
- Use a `ResizeObserver` on `view.dom` and `view.scrollDOM`. If their dimensions change during an active gesture/scroll record, add the before/after dimensions to that record. Do not change dimensions or scrolling.
- On each finalized `tap`, `scroll`, or `arrow` record, send exactly one serialized record through the existing Android bridge.

All event listeners are observational and passive. Do not intercept touch, pointer, scroll, or keyboard behavior.

### 4. Update the bounded serializer and native report

Update `web/src/navigationDiagnostics.js` to whitelist the schema above, plus:

- Record-level `id`, `kind` (`arrow`, `tap`, or `scroll`), `direction`, `repeat`, `pointerType`, duration, pointer start/end coordinates, maximum travel, cancellation status, and `selectionChanged`.
- A maximum of 12 scroll samples, each restricted to the fields specified above.
- A maximum of 160 characters for each line preview.

Drop unknown fields. Enforce the caps in the serializer, not only at the call site. Keep each serialized record at or below 8,192 characters.

In `MainActivity.kt` and `AppDiagnostics.kt`:

- Raise the bridge input limit to 8,192 characters.
- Parse and validate the JSON before storing it; reject malformed JSON, unknown kinds, oversized samples/previews, and unknown fields. Store only the validated/canonical record.
- Keep the latest 24 complete records in the existing separate navigation buffer.
- Change the report version from `routing-v2` to `routing-v3`.
- Update the report note: it now contains bounded anchor/head line previews (up to 160 characters each) and scroll/caret geometry. Keep the trace local and include it only through the existing Copy/Share actions. Do not add network uploads.

### 5. Focused tests

Update `web/test/navigation-diagnostics.test.cjs` to verify:

- Arrow, tap, and scroll records preserve valid fields.
- Each endpoint's fields remain separate.
- Unknown fields—including full document text, full selection, filename, path, URI, and DOM class—are dropped.
- Line previews are capped at 160 characters and scroll samples at 12.
- Invalid coordinates normalize to `null`.
- Serialized output does not exceed 8,192 characters.

Do not add browser automation for this diagnostics-only change.

## Strict boundaries

Only these files may change:

- `web/src/main.js` (diagnostic helpers and `setupNavigationDiagnostics` only)
- `web/src/navigationDiagnostics.js`
- `web/test/navigation-diagnostics.test.cjs`
- `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`
- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt`

Do not change cursor behavior, keymaps, focus, scrolling, CSS, decorations, list/table/callout behavior, or the Markdown stress-test file. Do not edit `web/test_sources/rendered_navigation.spec.cjs`, `web/build_tests.cjs`, workflows, package manifests, or dependencies. Do not delete, replace, or broadly rewrite existing code.

## Verify

Run once:

```sh
node --test web/test/*.test.cjs
node web/build.cjs
```

Then run the repository's existing Android debug build workflow once. This handoff adds observability only; do not claim it fixes the navigation or scrolling behavior.
