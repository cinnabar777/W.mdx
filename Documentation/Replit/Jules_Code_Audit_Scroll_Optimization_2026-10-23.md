# Jules handoff: fix editor lifecycle leaks and stabilize long-document scrolling

## Target and branch

- Repository: `cinnabar777/W.mdx`
- Audit base: `main` at `599e50588dd26f15a275d7fe7390a9958e6448dc`
- Start a fresh Jules working branch from the latest `main`; do not commit to or push directly to `main`.
- This Replit workspace was stale at audit time. Confirm `main` is still at the latest expected commit before editing.

## Scope

Fix proven lifecycle/performance issues in the existing CodeMirror 6 editor. Do not migrate or replace CodeMirror, change Markdown behavior, or add optional editor features.

Priorities:

1. Complete teardown and prevent duplicate global listeners across editor mode changes.
2. Reduce avoidable whole-document work on ordinary edits without changing formatting.
3. Reproduce and remove scroll jumps caused by actual layout/height updates, preserving the viewport anchor.
4. Measure long-document scrolling and initialization before and after; a successful build alone does not prove the scroll issue is fixed.

## Confirmed findings and implementation requirements

### 1. Editor and diagnostic listeners leak across mode changes

`CodeMirrorAdapter.init()` in `web/src/main.js` calls `setupGroupedControlBar()`, `setupFastScrollbar()`, `setupTocGestureAndPanel()`, and `setupNavigationDiagnostics()` on every mode initialization (around lines 3120–3125). Its destroy method invokes `navigationDiagnosticsCleanup()` (around lines 3230–3233), but that cleanup is incomplete:

- `setupNavigationDiagnostics()` adds document/window listeners for selection changes, blur, pointer input, and other events (around lines 5600–5993). Its returned function currently removes only the editor and window scroll listeners (around lines 5995–5998).
- At line 5993 it calls `setupFullNavigationCapture(view)` and discards its returned disposer. `web/src/navigationCapture.js` installs global listeners plus resize/mutation observers and has a complete disposer (around lines 549–581).
- `setupGroupedControlBar()` adds a persistent `document.click` listener every time (around line 3314).
- `setupFastScrollbar()` adds pointer handlers to the persistent thumb on every setup (around lines 4327–4366); their closures retain the old scroller.
- `setupTocGestureAndPanel()` adds persistent `window.touchstart`/`touchend` listeners every time (around lines 4449–4479).

Give each setup an explicit idempotent lifetime and cleanup handle, or install app-lifetime handlers exactly once and have them resolve the current adapter/scroller. Call per-editor cleanups from `CodeMirrorAdapter.destroy()`. Clear timers and pending animation frames owned by disposed capture handlers. A disposed view must not receive events or emit traces. Do not retain closures that reference destroyed editors.

Add a regression that switches modes repeatedly and proves listeners, observers, callbacks, and traces do not accumulate or refer to an old view.

### 2. Ordinary edits rebuild decorations for the entire document

Whole-document work occurs in:

- `buildTableBlockDecorations()` (`web/src/main.js`, around lines 1950–1981).
- `buildWysiwygCodeBlockDecorations()` (around lines 2001–2044).
- `buildHeightMapValue()` (around lines 2060–2358), which scans all lines in multiple passes and walks the syntax tree.
- `buildPersistentLayoutDecorations()` (around lines 2401–2552), which resolves syntax context for every line.
- Their state fields rebuild on document changes (`tableStateField`, `wysiwygCodeBlockField`, `heightMapField`, `persistentLayoutField`).

Keep formatting and widget behavior identical, but avoid rescanning unrelated content after a small edit. Use transaction changes/`ChangeDesc` and safely cached unaffected blocks or ranges. Invalidate enough context around multiline Markdown structures (fences, tables, lists, quotes/callouts, paragraphs). Do not replace syntax-aware handling with a broad regex pass or mis-style Markdown-looking text inside fenced code.

Add a deterministic long-document regression proving a small edit does not rebuild unrelated blocks; do not rely on flaky wall-clock thresholds.

### 3. Scroll stability needs a real reflow regression

- WYSIWYG overscan is `Math.max(1000, ceil(viewportHeight * 4))` in `web/src/viewportMargin.js`; other modes use a 1000px margin (`main.js`, around lines 3045–3059). Do not change these values by guesswork. Measure rendered line/widget counts and scroll behavior before tuning overscan.
- The scroller uses `overflow-anchor: none` in WYSIWYG and `auto` in the other modes (`main.js`, around lines 3061–3062). Keep one intentional anchoring strategy; do not add competing restorations.
- `scheduleSyntaxRefresh()` time-slices `forceParsing()` at an 8ms budget and dispatches a height-map refresh when parsing completes (`main.js`, around lines 2830–2883). WYSIWYG layout can change after opening a document; verify that redecoration and widget/table measurement do not move the user's viewport.
- `premeasureTableHeights()` measures every table. Preference updates call it (`main.js`, around lines 5153–5160); the cache key includes color and typography values (`web/src/tableWidget.js`, around lines 10–42). Avoid remeasuring every table for changes that cannot affect geometry.
- Table actions apply a deliberate two-frame scroll-anchor correction (`web/src/tableWidget.js`, around lines 247–282). Preserve it unless a reproduced case proves it conflicts with CodeMirror's scroll handling.
- Existing scroll tests mock geometry and a `scrollTop` setter that simply stores requested values (`web/test_sources/rendered_mode_refresh.spec.cjs`, around lines 57–82 and 128–164). They cannot demonstrate real browser/WebView behavior.

Test reflow both above and below the viewport, including syntax-parse completion and measured table-height changes. Assert that the same document location remains at the same screen coordinate after reflow while normal scrolling and deliberate navigation still work. Use a browser/WebView-capable test where available; retain an explicit Android long-document acceptance check if device automation is unavailable.

Do not add repeated timeout/animation-frame scroll corrections or pin the caret to a viewport edge as a workaround. Trace the transaction, widget measurement, observer, or explicit scroll command that moved the view before changing it.

### 4. Diagnostic capture can add work during ordinary scrolling

Both diagnostic systems start for each editor instance. Full capture records input, scroll, selection, resize, and DOM-mutation state; `captureNavigationState()` reads caret and rendered-row geometry (`web/src/navigationCapture.js`, around lines 90–197). Scroll events can request native screenshots through `captureDiagnosticSnapshot()` (around lines 268–279 and 359–391), invoking Android `PixelCopy`.

Android starts navigation capture automatically when the editor first becomes ready (`app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`, around line 1021). Measure the impact and keep capture bounded under the existing diagnostic policy. Do not remove diagnostic data or change its report schema. Do not request a full-window snapshot for every ordinary scroll sample; preserve the throttle and use snapshots only for the diagnostic/anomaly cases they are intended to capture.

## CodeMirror 6 inventory — report options only, do not implement

Already used: CodeMirror state/view, history/commands, Markdown/GFM parsing, syntax highlighting, search/replace, code folding, line numbers, line wrapping, custom tables, and custom navigation/selection handling.

Return a short ranked list with user impact, dependency cost, interaction risk, and Android WebView considerations. Consider:

- `bracketMatching` and `indentOnInput` from installed `@codemirror/language`.
- Fold gutter/keymap support (`foldGutter`/`foldKeymap`); `codeFolding()` is installed, while callout controls are custom.
- Standard comment commands from installed `@codemirror/commands`.
- Autocomplete (`@codemirror/autocomplete`) and lint (`@codemirror/lint`) as separate dependency/custom-provider decisions.

Do not add packages, extensions, keybindings, or UI for these candidates in this task. Present recommendations separately for the user to choose.

## CKEditor boundary

The audited runtime source and app/web build files have no CKEditor imports, package references, renderer calls, or CKEditor identifiers. Remaining matches are historical documentation/reference text. Do not delete historical audit records, Jules handoffs, or links to make a text search return zero.

## Allowed files

Limit implementation changes to:

- `web/src/main.js`
- `web/src/navigationCapture.js`
- `web/src/viewportMargin.js` only if measurements demonstrate a safe improvement
- `web/src/tableWidget.js` only for a reproduced measurement/anchor issue
- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt` only if needed to keep diagnostic capture bounded
- Focused tests under `web/test/` and `web/test_sources/`

Do not change Android UI/preferences, document formats, toolbar features, typography values, callout/table semantics, dependencies, build/workflow configuration, or unrelated documentation. Do not implement the feature candidates above.

## Verification and report

- Run the focused web tests and web build; run the Android debug build if the existing environment supports it.
- Report changed files and map each change to this brief. Explicitly list anything not implemented.
- Return the Jules branch/commit for review. Do not push or merge to `main`.
