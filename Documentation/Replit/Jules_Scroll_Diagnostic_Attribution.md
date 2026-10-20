# Jules handoff: separate keyboard and finger-scroll diagnostics

## Target

- Repository: `https://github.com/cinnabar777/W.mdx`
- Branch: `feature/callout-header-styling-17404924448172990300`
- Latest branch head verified: `53b0ce2363dc427359ed8e98772b4ef4f8b77519`

Use the active branch. Do not switch branches, reset, cherry-pick, or replace newer work. If it has advanced, preserve its current state and make only this diagnostics change.

## Findings from the routing-v3 Android report

- The 23 recorded `ArrowUp` events move the caret one document line at a time from line 16 to line 1. There are no `ArrowDown` records in this report.
- During those upward moves, `scrollTop` decreases by about 28 px per keypress while the caret stays at about 5 px from the viewport top. The report shows the viewport following the caret; it does not show skipped document lines in this segment.
- The only scroll record has `pointerType:"unknown"`, `maxTravel:0`, a duration of 52,563 ms, and only 12 samples from its first 2.5 seconds. Its `before` and `after` snapshots cover line 345 to line 1 and different scroll heights. It cannot tell whether a finger swipe or keyboard-driven scrolling caused the change.

The current implementation explains this ambiguity: `setupNavigationDiagnostics()` uses one `activeGesture` object both for pointer gestures and standalone `scroll` events. Every scroll event without an active pointer creates or updates that same object, including scroll events caused by ArrowUp/ArrowDown. `sampleThrottled()` stops storing data after the first 12 samples, and `onScroll()` listens only to the CodeMirror scroller and `window`.

## Implement exactly this diagnostics-only change

### 1. Separate pointer gestures from scroll bursts

In `web/src/main.js` within `setupNavigationDiagnostics(view)`:

- Replace the shared `activeGesture` state with separate `activePointerGesture` and `activeScrollBurst` state. Never create a pointer gesture from a scroll event.
- Keep the existing ArrowUp/ArrowDown snapshots and keymaps unchanged. Each arrow record must include monotonic `startElapsedMs` and `endElapsedMs` from `performance.now()`.
- When a scroll event occurs within 250 ms of an arrow keydown, classify its source as `keyboard` and attach the related arrow record ID. Record the per-arrow scroll before/after values already present in the arrow snapshots. Do not merge that scroll into an unattributed finger-scroll record.
- For a pointer gesture, begin only on `pointerdown` and end on its matching `pointerup` or `pointercancel`. Preserve the original `pointerType` and pointer coordinates. Classify as `tap` only when pointer travel is at most 8 CSS px and no editor/page scroll target moved more than 1 CSS px; otherwise classify it as a `scroll` with source `pointer`.
- Scroll events with neither an active pointer gesture nor a recent arrow keydown are source `unattributed`. Do not label them as touch or infer a pointer type.
- Finalize pointer and unattributed scroll records independently after their own 300 ms idle period. A new pointer gesture must not overwrite or finalize a separate pending scroll burst.
- Add `startElapsedMs` and `endElapsedMs` to each finalized interaction. Use the same `performance.now()` clock for both values. Preserve the unique interaction ID assigned at its start so records can be correlated even if they are emitted in a different order.

### 2. Keep useful samples from long scrolls

- Continue sampling no more than once every 50 ms.
- Keep at most 12 samples per record, but retain the first sample and the newest 11 samples. When older middle samples are dropped, include `totalSampleCount` and `droppedSampleCount`.
- Each scroll sample must include elapsed time, `source`, `target`, editor `scrollTop`/`scrollHeight`/`clientHeight`, page `window.scrollY`, pointer coordinates or null, selection anchor/head/head line, caret client Y, and editor viewport top/bottom.
- Listen for `scroll` on `view.scrollDOM`, each scrollable ancestor between the editor and the document, and the page. Label targets only as `editor`, `ancestor1`, `ancestor2`, or `page`; never record selectors or DOM class names.
- For `page` events, record `window.scrollY` as the page scroll position. Do not fill a page-scroll field with the CodeMirror scroller's `scrollTop`.

### 3. Update the allowlisted serializer and Android validation

Update `web/src/navigationDiagnostics.js` to allow only the new source, target, timing, and sample-count fields in addition to the current bounded navigation record fields. Enforce the 12-sample rolling cap and 8,192-character record limit in the serializer.

In `MainActivity.kt` and `AppDiagnostics.kt`, validate the new fields and allowed values before storing a record. Keep the existing 24-record local buffer and `routing-v3` report version. Do not store arbitrary fields or exceed the existing per-record size limit.

### 4. Tests

Update `web/test/navigation-diagnostics.test.cjs` to cover:

- An arrow-generated scroll is tagged `keyboard` and references its arrow ID, not a pointer gesture.
- A pointer gesture retains its pointer type and is `tap` only under both the travel and scroll thresholds.
- An unattributed scroll remains distinct from a pointer gesture.
- A record with more than 12 samples preserves the first and newest 11, and reports correct total/dropped counts.
- Start/end elapsed times use valid finite numbers and unknown fields are omitted.
- Serialized records remain at or below 8,192 characters.

## Strict boundaries

Only these files may change:

- `web/src/main.js` (diagnostic recorder only)
- `web/src/navigationDiagnostics.js`
- `web/test/navigation-diagnostics.test.cjs`
- `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`
- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt`

Do not change caret movement, keymaps, focus, scrolling, CSS, decorations, or list/table/callout behavior. Do not edit the Markdown stress-test file, `web/test_sources/rendered_navigation.spec.cjs`, `web/build_tests.cjs`, workflows, package manifests, or dependencies. Do not delete or broadly rewrite existing code.

## Verify

Run once:

```sh
node --test web/test/*.test.cjs
node web/build.cjs
```

Then run the repository's existing Android debug build workflow once. This change is only to make the next diagnostic report distinguish input sources; do not claim it fixes the visible jumping.
