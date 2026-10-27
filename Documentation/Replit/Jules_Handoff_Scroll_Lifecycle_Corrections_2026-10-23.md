# Jules handoff — scroll and editor-lifecycle corrections

## Scope

Correct the scrolling and editor-lifecycle work only. Do not implement heading settings, footnotes, checkbox styling, callouts, code-block preferences, reset alignment, or any toolbar changes in this handoff.

Use the current `main` tree as the source of truth. The completed scroll branch is based on an older shared point. Do not merge or copy that branch wholesale. Port only the behaviors listed below. Keep edits limited to:

- `web/src/main.js`
- `web/src/navigationCapture.js`
- `web/src/tableWidget.js`
- `web/test_sources/navigation_capture.spec.cjs`
- `web/test_sources/rendered_mode_refresh.spec.cjs`

Do not add dependencies, change Android code, edit `web/build_tests.cjs`, add test files, or add an `activeAdapter` getter or other editor internals to `window.editorBridge`. Do not replace entire files or unrelated functions. Keep the current document format, native bridge methods, trace record schema, scroll restoration, and user-driven scrolling behavior.

## 1. Keep decoration work local to the changed document area

### 1.1 WYSIWYG code-block decorations

In `wysiwygCodeBlockField.update` in `web/src/main.js`, test refresh effects **before** returning for a transaction without document changes. Use this exact order:

```js
update(current, tr) {
  const refreshHeight = tr.effects.some(effect =>
    effect.is(heightMapRefreshEffect)
  );

  if (currentEditorMode !== 'wysiwyg') return Decoration.none;
  if (refreshHeight) {
    return buildWysiwygCodeBlockDecorations(tr.state);
  }
  if (!tr.docChanged) return current;

  // Continue with the changed-range logic below.
}
```

For a document edit:

1. Find the minimum and maximum changed positions from `tr.changes.iterChanges(...)`.
2. Check whether inserted or deleted text contains a fenced-code marker (` ``` ` or `~~~`).
3. Check the syntax-tree range in both `tr.state` and `tr.startState` for `FencedCode` or `CodeBlock`.
4. If neither the markers nor either syntax tree show that the edit touched code, return `current.map(tr.changes)`.
5. Otherwise rebuild with `buildWysiwygCodeBlockDecorations(tr.state)`.

Do not use `current === Decoration.none` as an initialization or refresh signal. The state field’s `create()` builds its initial value. Keep the ordinary-edit path mapped; do not rebuild all code-block decorations for a text edit outside code.

### 1.2 Height-map decorations

Update `buildHeightMapValue(state, startLineNum = 1, endLineNum = null)` so the existing full-document behavior remains unchanged when called without a range. When a range is supplied:

- Limit each document-line loop to the supplied inclusive line range.
- Limit the syntax-tree iteration to the character range from the first requested line’s `from` through the last requested line’s `to`.
- Return sorted arrays of valid decorations for a partial range; return `Decoration.set(..., true)` for a full-document result.
- Preserve `hiddenSyntaxRanges` and all existing Markdown rendering behavior.

In `heightMapField.update`:

1. Rebuild the full value for `heightMapRefreshEffect` or `typographySettingsEffect`, including transactions with no document change.
2. Return `current` for transactions with neither a document change nor a relevant effect.
3. For a document change, compute the changed line range in the new document, expand to the complete affected syntax nodes at both change boundaries, then add one adjacent line of context on both sides.
4. If that expanded range covers the whole document, use the full builder.
5. Otherwise map the current `decorations` and `hiddenSyntaxRanges` through `tr.changes`, remove only entries in the expanded range, and add the partial builder’s results for that range. Do not discard or rebuild entries outside it.

Keep the existing syntax handling for paragraphs, list items, blockquotes/callouts, fenced code, tables, links, images, and headings. If a range-boundary edit changes the containing syntax block, the expansion must include the entire old and new block; a one-line-only replacement is not acceptable for those edits.

### 1.3 Persistent layout decorations

Make `buildPersistentLayoutDecorations(state, startLineNum = 1, endLineNum = null)` support the same full-document and partial-range return forms:

- Full document: return `Decoration.set(ranges, true)`.
- Partial range: return the sorted `ranges` array.
- Iterate only the requested lines.
- When the partial range begins within a blockquote/callout, recover the active callout stack from its actual opener before building the requested lines. Do not reset callout type/depth at the partial-range boundary.

In `persistentLayoutField.update`:

```js
const refreshLayout = tr.effects.some(effect =>
  effect.is(typographySettingsEffect) ||
  effect.is(heightMapRefreshEffect)
);
if (refreshLayout) return buildPersistentLayoutDecorations(tr.state);
if (!tr.docChanged) return current;
```

For ordinary document changes, compute and expand the changed line range as in §1.2, map the current decoration set, replace decorations only inside that range, and return the mapped set with the partial results added. Full rebuild is allowed only when the expanded range actually covers the document.

### 1.4 Table decorations

In `tableStateField.update`, preserve the source-mode behavior and the `tableHeightEstimatesChanged` full refresh. For a document edit:

- Map current decorations through `tr.changes`.
- Rebuild all table decorations only when an inserted/deleted pipe character or the old/new syntax tree shows that the edit touches a `Table`.
- Otherwise return the mapped decorations.
- Do not use `current === Decoration.none` as a sentinel.

## 2. Finish listener and callback cleanup

### 2.1 `setupNavigationDiagnostics()` in `web/src/main.js`

Keep every event listener registered by this function under a named handler so the disposer removes the exact same handler and capture setting. This applies to keydown, keyup, blur, selectionchange, pointerdown, pointermove, pointerup, pointercancel, and both scroll listeners.

Add tracked scheduling helpers inside the function:

```js
let disposed = false;
const pendingTimeouts = new Set();
const pendingFrames = new Set();

const scheduleTrackedTimeout = (callback, delay) => {
  const id = window.setTimeout(() => {
    pendingTimeouts.delete(id);
    if (!disposed) callback();
  }, delay);
  pendingTimeouts.add(id);
  return id;
};

const clearTrackedTimeout = id => {
  if (id == null) return;
  window.clearTimeout(id);
  pendingTimeouts.delete(id);
};

const scheduleTrackedFrame = callback => {
  const id = window.requestAnimationFrame(() => {
    pendingFrames.delete(id);
    if (!disposed) callback();
  });
  pendingFrames.add(id);
  return id;
};
```

Use these helpers for every asynchronous callback created by this function:

- Arrow-key animation-frame snapshot and its 50 ms follow-up.
- Selection-change debounce.
- Pointer gesture 300 ms debounce and the 50 ms pointer-up/pointer-cancel finalizers.
- Unattributed-scroll debounce.

Replace every cancellation of one of these tracked timeouts with `clearTrackedTimeout(id)`. Do not leave anonymous `setTimeout` or `requestAnimationFrame` calls in this function.

Keep and call the disposer returned by `setupFullNavigationCapture(view)`:

```js
const fullCaptureDisposer = setupFullNavigationCapture(view);
```

At the start of the returned disposer, set `disposed = true`, then cancel all pending work:

```js
for (const id of pendingTimeouts) window.clearTimeout(id);
pendingTimeouts.clear();
for (const id of pendingFrames) window.cancelAnimationFrame(id);
pendingFrames.clear();
```

Then remove every named listener using the same target, event name, and capture flag used when adding it. Call `fullCaptureDisposer()` exactly once. Keep `reportTrace` guarded so no callback can report after disposal.

### 2.2 `setupFullNavigationCapture()` in `web/src/navigationCapture.js`

Keep the trace schema and existing large-scroll/scroll-idle capture behavior. Change the page-hide registration to a named handler:

```js
const onPageHide = () => flush();
win.addEventListener('pagehide', onPageHide, { once: true });
```

Remove it in the disposer:

```js
win.removeEventListener('pagehide', onPageHide);
```

Track the mutation observer’s scheduled animation-frame or fallback timeout ID. The callback must clear its own ID and return without enqueuing if `disposed` is true. In the disposer, cancel the still-pending callback with the matching API. Also guard `enqueue` against disposal so no late callback can add a record after teardown.

Remove the ordinary-scroll snapshot request. Keep only:

```js
if (Math.abs(deltaTop || 0) >= 300) {
  requestWindowSnapshot('large-scroll-delta', true);
}
```

Keep the existing `scroll_idle` record and `requestWindowSnapshot('scroll-idle')` timer behavior. Clear that timer during disposal, as the current disposer already does.

### 2.3 Fast scrollbar and repeated mode setup

In `web/src/main.js`:

- Change the anonymous listeners in `setupFastScrollbar()` to named handlers and return/store one disposer that removes all of them and clears `hideTimer`.
- Before installing a new fast-scrollbar listener set, dispose of the previous set.
- Call the fast-scrollbar disposer from `CodeMirrorAdapter.destroy()` before destroying its view.
- Register the grouped control-bar document click listener only once across mode switches.
- Register the TOC window gesture listeners only once across mode switches. Keep the existing per-mode button/panel setup intact.

Do not change the scrollbar thresholds, drag math, touch/wheel handling, `overflowAnchor`, scroll restoration, or add scroll-correction timers.

## 3. Preserve the useful table-height cache change

In `web/src/tableWidget.js`, keep paint-only colors out of `TABLE_HEIGHT_STYLE_PROPERTIES`. The list must contain only:

```js
const TABLE_HEIGHT_STYLE_PROPERTIES = [
  '--table-cell-padding',
  '--table-border-width',
  '--table-border-style',
  '--table-header-font-weight'
];
```

Do not change table rendering or measurement behavior beyond the cache-key property list.

## 4. Tests — edit only existing registered specs

Do not change `web/build_tests.cjs`; do not add a new test file or production bridge getter. Add behavioral tests to:

- `web/test_sources/navigation_capture.spec.cjs`
- `web/test_sources/rendered_mode_refresh.spec.cjs`

Use the test file’s existing JSDOM setup and `EditorView.findFromDOM(...)` to locate the editor view. Do not access `activeAdapter` through `window.editorBridge`. If a field must be imported by a test, a named module export is permitted; do not put that field on the Android/web bridge.

Required checks:

1. **Capture teardown:** schedule a mutation batch and a key-result callback, dispose before they run, then prove no post-disposal trace is emitted. Dispatch `pagehide` after disposal and verify it does not flush a duplicate capture. Verify setup/disposal can be repeated without accumulating listeners.
2. **Diagnostics teardown:** switch repeatedly among WYSIWYG, source, and live preview; after each old view is destroyed, dispatch the relevant events and prove the old view’s diagnostic callbacks do not emit records.
3. **Incremental edits:** use a 5,440-line fixture whose `text.length` is exactly `230906`. Include headings, a fenced code block, a table, a list, and a multi-line callout at separate positions. Edit ordinary text between those blocks. Verify unrelated decorations remain mapped and retain their existing decoration specs; verify only the expanded edit area is rebuilt.
4. **Syntax boundaries:** edit a heading marker, code-fence marker, table pipe, list marker, and callout opener/continuation separately. Confirm the corresponding decorations update and unaffected distant decorations remain intact.
5. **Effect-only refresh:** dispatch `heightMapRefreshEffect` with no document change and confirm code-block decorations and persistent layout refresh. Dispatch `typographySettingsEffect` with no document change and confirm the existing typography refresh behavior remains.
6. **Scroll snapshots:** ordinary scroll events must not request `scroll-active` snapshots; large deltas and scroll-idle snapshots must still work.
7. **Fast scrollbar/setup:** after repeated mode changes, only one active scrollbar/TOC/control-bar handler set remains; after destroy, no handler or timer from that view remains.

For the 5,440-line fixture, assert both requirements explicitly:

```js
assert.equal(markdown.split('\n').length, 5440);
assert.equal(markdown.length, 230906);
```

Do not use wall-clock performance thresholds, source-code substring assertions as the sole proof, or synthetic scroll-correction timers. JSDOM cannot prove native fling/inertia or real-device visual stability; do not claim it does.

## 5. Verification and change boundary

Run the existing web test command from `web/`:

```sh
npm test
```

Report the exact result. Do not edit Android files or run unrelated migration/build steps for this web-only correction.

Before finishing, verify the changed-file list contains only the five files listed under Scope. Confirm `web/build_tests.cjs` is unchanged, `window.editorBridge` has no `activeAdapter` getter, and ordinary user-driven scrolling still uses the existing browser/WebView behavior without added correction timers.
