# Jules handoff: diagnose scroll and caret jumps from mixed-input traces

## Target

- Repository: `https://github.com/cinnabar777/W.mdx`
- Branch: `feature/callout-header-styling-17404924448172990300`
- Latest branch head verified: `53b0ce2363dc427359ed8e98772b4ef4f8b77519`

Use the active branch. Do not switch branches, reset, cherry-pick, or replace newer work. If it has advanced, preserve its current state and make only this diagnostics change.

## Test facts

- The user confirms this APK test mixed several interactions: scrolling the document multiple times, single taps on Up and Down through the document, and one text-highlighting attempt.
- The attached routing-v3 report's `Navigation trace (last 24)` contains 24 records, all `kind:"scroll"`; it contains no ArrowUp or ArrowDown records. The report therefore cannot show whether the individual arrow presses moved the caret correctly or caused scroll jumps.
- Thirteen of the 24 records have `pointerType:"touch"`; the rest are `pointerType:"unknown"`. This is consistent with the confirmed document-scrolling part of the test, but the report does not reliably attribute every scroll burst to its input.
- Three scroll records show large position and content-height changes: record 2542 moves `scrollTop` by about +2,216 px while `scrollHeight` grows by about 3,356 px; record 2550 moves `scrollTop` by about -4,927 px while `scrollHeight` shrinks by about 3,119 px; record 2536 also moves about -1,133 px. These are evidence of large viewport/content-geometry changes during scrolling, not proof of their cause.
- Record 2548 changes the caret from document line 1 to line 486 during a touch event, but the logged selection is collapsed (`anchor === head`). It does not preserve evidence of a highlighted range.
- The user's earlier report that upward navigation feels worse remains a user observation, but this attached trace does not contain arrow-key events with which to verify or diagnose it.

## Code cause to correct

In `web/src/main.js`, `setupNavigationDiagnostics()` does not provide enough input attribution for this mixed test: the latest 24-record trace contains scroll records but no arrow-key records, and scroll bursts can remain `unattributed`. It also shares an `activeGesture` between pointer and standalone scroll activity. The current sample bound can lose the end of a long burst. Do not assume that an unattributed scroll came from a key, touch, or selection; log the input event and its timing so the next APK report can distinguish them.

## Implement this diagnostics-only change

### 1. Record each input source separately

In `setupNavigationDiagnostics(view)`:

- Add a diagnostic record for every ArrowUp/ArrowDown `keydown` and matching `keyup`, with a unique event ID, direction, timestamp, `event.repeat`, and before/after selection and geometry snapshots. The test used single taps, so do not assume long-press repetition.
- Give each physical arrow-key hold a unique `pressId`; include `keydownIndex` to distinguish repeated keydowns during the same hold. Set `repeat` to `event.repeat || keydownIndex > 1`, and retain the original `event.repeat` value separately.
- Capture each arrow `keyup` in capture phase. Emit a bounded press summary with direction, start/end times, duration, keydown count, and whether any event reported `event.repeat:true`.
- If focus leaves the editor before keyup, close the press on blur and mark it `endedByBlur:true`; do not leave a press open across editor sessions.
- Record pointerdown/up/cancel separately from scroll events. A pointer gesture must start with a matching pointerdown; a scroll event alone must never be labeled as a tap or touch gesture.
- Record selection changes, including both anchor and head positions and whether the selection is collapsed. Do not log document text or paths. This lets a later report distinguish a caret tap from a text highlight without retaining selected content.
- Use `performance.now()` consistently for elapsed times.

### 2. Attribute scroll changes without mixing input sources

- Add `scrollDeltaTop` and `scrollDeltaLeft` to every arrow record, calculated from before/after snapshots.
- While an arrow press is active, associate scroll samples with its `pressId`; also associate delayed samples within 150 ms of a keydown with the most recent matching arrow event. Do not merge unrelated pointer scrolling into an arrow record.
- Take a final scroll snapshot on the next animation frame and another 50 ms later to capture delayed WebView movement after a key event or pointer interaction.
- Keep pointer-associated and unattributed scroll records separate from arrow records. For scrolling outside an active pointer gesture and the arrow association window, keep a separate `unattributed` trace. Bound each scroll burst to at most 2 seconds and start another record if scrolling continues.
- Each scroll sample must record both `scrollTop` and `scrollHeight`; this report showed large changes in both during the same bursts. Do not infer a cause from geometry alone.

### 3. Preserve both early and late samples

- Sample no more than once every 50 ms.
- Keep at most 12 samples per record: retain the first sample and newest 11. Track `totalSampleCount` and `droppedSampleCount`.
- Each sample must include elapsed time, `pressId` or null, source (`arrow`, `pointer`, or `unattributed`), target, editor `scrollTop`, `scrollHeight`, and `clientHeight`, page `window.scrollY`, selection anchor/head/head line and collapsed status, caret client Y, and editor viewport top/bottom.
- For page scroll events, record `window.scrollY`; do not report the editor scroller's `scrollTop` as the page position.

### 4. Update allowlists, native validation, and tests

Update `web/src/navigationDiagnostics.js`, `MainActivity.kt`, and `AppDiagnostics.kt` to allowlist and validate the new press, timing, repeat-source, scroll-delta, and sample-count fields. Keep the existing 24-record local bound, 8,192-character per-record limit, bounded line previews, and `routing-v3` version. Do not add uploads.

Update `web/test/navigation-diagnostics.test.cjs` to verify:

- Single-tap ArrowUp and ArrowDown presses each produce a keydown/keyup record and are not inferred as repeats.
- Multiple same-direction keydowns before keyup share one `pressId` and get increasing `keydownIndex`, even if each has `reportedRepeat:false`.
- Keyup closes the press with a finite duration; blur closure is marked.
- Arrow-driven scroll samples are attached to the matching press; touch scrolling remains a separate pointer-associated record.
- Pointer selection changes record anchor, head, and collapsed status without retaining selected document text.
- A scroll event without a matching pointer or recent arrow event remains explicitly `unattributed`.
- Large scroll-position or content-height changes are retained in the samples without being silently relabeled as key or touch activity.
- More than 12 samples retain the first and newest 11 with correct counts.
- Unknown fields are dropped and serialized output remains at or below 8,192 characters.

## Strict boundaries

Only these files may change:

- `web/src/main.js` (diagnostic recorder only)
- `web/src/navigationDiagnostics.js`
- `web/test/navigation-diagnostics.test.cjs`
- `app/src/main/java/com/wmdx/markdownapp/MainActivity.kt`
- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt`

Do not change caret movement, keymaps, focus behavior, scrolling, CSS, decorations, or list/table/callout behavior. Do not edit the Markdown stress-test file, `web/test_sources/rendered_navigation.spec.cjs`, `web/build_tests.cjs`, workflows, package manifests, or dependencies. Do not delete or broadly rewrite existing code.

## Verify

Run once:

```sh
node --test web/test/*.test.cjs
node web/build.cjs
```

Then run the repository's existing Android debug build workflow once. This change makes long-press and keyboard-driven scrolling measurable; do not claim it fixes the visible jumping.
