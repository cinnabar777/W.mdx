# Jules handoff: correlate keyboard repeats with scroll movement

## Target

- Repository: `https://github.com/cinnabar777/W.mdx`
- Branch: `feature/callout-header-styling-17404924448172990300`
- Latest branch head verified: `53b0ce2363dc427359ed8e98772b4ef4f8b77519`

Use the active branch. Do not switch branches, reset, cherry-pick, or replace newer work. If it has advanced, preserve its current state and make only this diagnostics change.

## Test facts

- The user confirms the reported interactions were keyboard navigation, including long-press repeats; they were not finger-scroll tests.
- The routing-v3 report contains 23 `ArrowUp` records and no `ArrowDown` records. In the recorded list section, each Up event moves one document line, from line 16 through line 1.
- Each arrow record says `repeat:false`, even though the user used long-press repeat.
- While moving upward, `scrollTop` decreases about 28 px per keypress while the caret remains about 5 px from the viewport top.
- One `scroll` record has `pointerType:"unknown"`, `maxTravel:0`, and a duration of 52,563 ms. It contains only the first 12 samples from about 2.5 seconds and ends at line 1, although it began at line 345. The user confirms this test activity was keyboard navigation, so do not interpret that record as a finger swipe.

## Code cause to correct

In `web/src/main.js`, `setupNavigationDiagnostics()` uses one `activeGesture` for pointer activity and all standalone scroll events. Arrow-generated scroll events can therefore create or extend a scroll record unrelated to any one arrow event. The first 12 samples are kept and later ones discarded, so a long record preserves its start but loses its end. The arrow records use `event.repeat` alone, which does not reflect the user's observed long-press repeats.

## Implement this diagnostics-only change

### 1. Group arrow keydowns into physical key presses

In `setupNavigationDiagnostics(view)`:

- Keep one unique `pressId` for each ArrowUp or ArrowDown press, starting when the first keydown arrives and ending at the matching keyup.
- For every arrow keydown, continue recording its own before/after editor snapshot and unique event ID.
- Add `pressId`, `keydownIndex`, `eventElapsedMs`, and `reportedRepeat` to each arrow record. Increment `keydownIndex` for every same-direction keydown received before keyup.
- Set the record's `repeat` to `event.repeat || keydownIndex > 1`; also retain `reportedRepeat` separately so Android/WebView behavior can be seen directly.
- Capture ArrowUp/ArrowDown `keyup` in capture phase. Emit a bounded key-press summary with `pressId`, direction, start/end elapsed milliseconds, duration, total keydown count, and whether any keydown reported `event.repeat:true`.
- If focus leaves the editor before keyup, close the press on blur and mark it `endedByBlur:true`; do not leave a press open across editor sessions.
- Use `performance.now()` consistently for elapsed times. Do not infer a repeated press from multiple key presses that each received a keyup.

### 2. Attach keyboard-driven scroll samples to the arrow press

- Arrow records already include before/after editor scroll values. Add `scrollDeltaTop` and `scrollDeltaLeft`, calculated from those snapshots.
- During an active arrow press, collect scroll samples into that `pressId` record. Also associate scroll events occurring within 150 ms after an arrow keydown with the most recent matching arrow event.
- Take a final scroll snapshot on the next animation frame and a second snapshot 50 ms later, so the trace includes delayed WebView scrolling after the key event.
- Do not create or extend an `unattributed` scroll burst while an arrow press is active or within the 150 ms association window. Never combine multiple arrow presses into one 52-second scroll record.
- Preserve pointer gestures as a separate path. A pointer gesture must start with a matching pointerdown; a scroll event alone must never be labeled as a tap or as a touch gesture.
- For scrolling outside both a pointer gesture and the arrow association window, keep a separate `unattributed` scroll trace. Bound it to at most 2 seconds per record and start a new record if scrolling continues.

### 3. Preserve both early and late samples

- Sample no more than once every 50 ms.
- Keep at most 12 samples per record: retain the first sample and the newest 11. Track `totalSampleCount` and `droppedSampleCount`.
- Each sample must include elapsed time, `pressId` or null, source (`arrow`, `pointer`, or `unattributed`), target, editor scroll top/height/client height, page `window.scrollY`, selection anchor/head/head line, caret client Y, and editor viewport top/bottom.
- For page scroll events, record `window.scrollY`; do not report the editor scroller's `scrollTop` as the page position.

### 4. Update allowlists, native validation, and tests

Update `web/src/navigationDiagnostics.js`, `MainActivity.kt`, and `AppDiagnostics.kt` to allowlist and validate the new press, timing, repeat-source, scroll-delta, and sample-count fields. Keep the existing 24-record local bound, 8,192-character per-record limit, bounded line previews, and `routing-v3` version. Do not add uploads.

Update `web/test/navigation-diagnostics.test.cjs` to verify:

- Multiple same-direction keydowns before keyup share one `pressId` and get increasing `keydownIndex`, even if each has `reportedRepeat:false`.
- Separate keydown/keyup pairs do not get inferred as repeats.
- Keyup closes the press with a finite duration; blur closure is marked.
- Arrow-driven scroll samples are attached to the matching press and are not emitted as an unrelated 52-second scroll burst.
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
