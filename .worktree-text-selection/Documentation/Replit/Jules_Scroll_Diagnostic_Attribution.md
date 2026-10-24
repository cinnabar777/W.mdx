# Jules handoff: preserve arrow traces and capture text selections

## Target

- Repository: `https://github.com/cinnabar777/W.mdx`
- Branch: `feature/callout-header-styling-17404924448172990300`
- Latest branch head inspected: `4280bd838a356e81ebe4946b2d7bca818df394e9`

Use the active branch. Do not switch branches, reset, cherry-pick, or replace newer work. If it has advanced, preserve its current state and make only this diagnostics change.

## Test facts

- The user confirms this APK test mixed several interactions: scrolling the document multiple times, single taps on Up and Down through the document, and one text-highlighting attempt.
- The attached routing-v3 report's `Navigation trace (last 24)` contains 24 records, all `kind:"scroll"`; it contains no ArrowUp or ArrowDown records. The report therefore cannot show whether the individual arrow presses moved the caret correctly or caused scroll jumps.
- Thirteen of the 24 records have `pointerType:"touch"`; the rest are `pointerType:"unknown"`. This is consistent with the confirmed document-scrolling part of the test, but the report does not reliably attribute every scroll burst to its input.
- Three scroll records show large position and content-height changes: record 2542 moves `scrollTop` by about +2,216 px while `scrollHeight` grows by about 3,356 px; record 2550 moves `scrollTop` by about -4,927 px while `scrollHeight` shrinks by about 3,119 px; record 2536 also moves about -1,133 px. These are evidence of large viewport/content-geometry changes during scrolling, not proof of their cause.
- Record 2548 changes the caret from document line 1 to line 486 during a touch event, but the logged selection is collapsed (`anchor === head`). It does not preserve evidence of a highlighted range.
- The user's earlier report that upward navigation feels worse remains a user observation, but this attached trace does not contain arrow-key events with which to verify or diagnose it.

## Verified code cause

`web/src/main.js` already records ArrowUp/ArrowDown keydown events as `kind:"arrow"` and each completed key hold as `kind:"arrow_press"`. The reason the attached report can show only scrolls is confirmed in `AppDiagnostics.recordNavigationTrace()` in `AppDiagnostics.kt`: it appends every event kind to one list and keeps only the newest 24. Twenty-four later scroll records can erase all arrow and selection records. Do not rewrite the existing arrow handler or change editor navigation.

## Implement these exact diagnostics changes

Do not rewrite the existing arrow-key listeners in `setupNavigationDiagnostics()`: they already record single taps, repeated keydowns, `keyup`, blur, and arrow-associated scroll samples. Keep their behavior unchanged. Make only the additions below.

### 1. Reserve report slots so scrolling cannot erase key events

In `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt`, replace the existing `recordNavigationTrace()` function with this implementation. It retains the latest 16 non-scroll events and latest 8 scroll events, then writes them in their original order. This keeps the report bounded at 24 while ensuring touch-scroll bursts cannot evict every arrow record.

```kotlin
@Synchronized fun recordNavigationTrace(context: Context, jsonRecord: String) {
    if (jsonRecord.isBlank() || jsonRecord.length > 8192) return
    try {
        val json = JSONObject(jsonRecord)
        val kind = json.optString("kind", "")
        if (kind != "arrow" && kind != "arrow_press" &&
            kind != "tap" && kind != "scroll" && kind != "selection") return

        val prefs = context.getSharedPreferences("diagnostic_report", Context.MODE_PRIVATE)
        val existing = (prefs.getString("nav_traces", "") ?: "")
            .lineSequence()
            .filter { it.isNotBlank() }
            .mapNotNull { line ->
                try {
                    JSONObject(line) to line
                } catch (_: Exception) {
                    null
                }
            }
            .toList()
        val entries = existing + (json to jsonRecord)

        val keep = BooleanArray(entries.size)
        var keptInput = 0
        var keptScroll = 0
        for (index in entries.indices.reversed()) {
            val isScroll = entries[index].first.optString("kind") == "scroll"
            if (isScroll && keptScroll < 8) {
                keep[index] = true
                keptScroll++
            } else if (!isScroll && keptInput < 16) {
                keep[index] = true
                keptInput++
            }
        }

        val retained = entries
            .filterIndexed { index, _ -> keep[index] }
            .joinToString("\n") { it.second }
        prefs.edit().putString("nav_traces", retained).apply()
    } catch (_: Exception) {
        // Ignore malformed trace payloads.
    }
}
```

In `AppDiagnostics.report()`, replace the current `navSection` value and report header with:

```kotlin
val navSection = if (navTraces.isNotBlank()) {
    "\n\nNavigation trace (up to 24; latest 16 non-scroll + latest 8 scroll):\n$navTraces"
} else ""

return "Wmdx Android diagnostics (routing-v4)\nAndroid SDK: ${Build.VERSION.SDK_INT}\nWebView: $webview\n" +
    "Times are milliseconds since boot. Includes selection line previews (up to 160 chars) and scroll/caret geometry. No full file content or paths recorded.\n\n" +
    events + navSection
```

and change `routing-v3` to `routing-v4` in the report header. Do not change `MainActivity.kt`; its existing JavaScript bridge already forwards the records.

### 2. Capture an actual non-collapsed highlight range

In `web/src/navigationDiagnostics.js`, change the existing kind allowlist to:

```js
const ALLOWED_KINDS = new Set(['arrow', 'arrow_press', 'tap', 'scroll', 'selection']);
```

In `setupNavigationDiagnostics(view)` in `web/src/main.js`, insert the following block immediately after `let pointerGestureTimer = null;`. It records only a non-collapsed selection, with numeric before/after snapshots; it does not record selected text.

```js
  let lastSelectionSnapshot = getSnapshot(view);
  let selectionChangeTimer = null;

  document.addEventListener('selectionchange', () => {
    if (!view.hasFocus) return;

    clearTimeout(selectionChangeTimer);
    selectionChangeTimer = setTimeout(() => {
      if (!view.hasFocus || !view.state) return;

      const after = getSnapshot(view);
      if (!after) return;
      const before = lastSelectionSnapshot;
      lastSelectionSnapshot = after;

      if (after.collapsed) return;
      if (before && before.anchor === after.anchor && before.head === after.head) return;

      const source = activePointerGesture
        ? 'pointer'
        : (activeArrowPress ? 'arrow' : 'unattributed');
      reportTrace({
        id: nextTraceId++,
        pressId: activeArrowPress
          ? activeArrowPress.pressId
          : (activePointerGesture ? activePointerGesture.id : null),
        kind: 'selection',
        source,
        direction: activeArrowPress ? activeArrowPress.direction : 'none',
        repeat: false,
        pointerType: activePointerGesture ? activePointerGesture.pointerType : 'unknown',
        duration: 0,
        selectionChanged: true,
        before,
        after
      });
    }, 80);
  });
```

Keep the current 12-sample first-plus-newest retention, 50 ms sample interval, 8,192-character record limit, and bounded line previews. Keep the existing scroll source labels (`arrow`, `pointer`, `unattributed`) and do not infer a source when there is no matching input.

### 3. Add this exact serializer regression test

Append this test to `web/test/navigation-diagnostics.test.cjs`:

```js
test('selection trace retains numeric highlight range but never selected text', () => {
  const record = {
    id: 99,
    kind: 'selection',
    source: 'pointer',
    direction: 'none',
    repeat: false,
    pointerType: 'touch',
    selectionChanged: true,
    before: { anchor: 40, head: 40, collapsed: true },
    after: { anchor: 40, head: 72, collapsed: false },
    selectedText: 'must not be serialized'
  };

  const jsonStr = serializeNavigationTraceRecord(record);
  const parsed = JSON.parse(jsonStr);
  assert.ok(jsonStr.length <= 8192);
  assert.strictEqual(parsed.kind, 'selection');
  assert.strictEqual(parsed.before.collapsed, true);
  assert.strictEqual(parsed.after.anchor, 40);
  assert.strictEqual(parsed.after.head, 72);
  assert.strictEqual(parsed.after.collapsed, false);
  assert.strictEqual(parsed.selectedText, undefined);
  assert.strictEqual(jsonStr.includes('must not be serialized'), false);
});
```

Also add one focused test for the retention policy: after appending 30 scroll records and 3 arrow records, the stored report contains all 3 arrow records and only the newest 8 scroll records, in their original order. If the Kotlin retention function cannot be unit-tested in the existing setup, do not add a new test framework; verify this exact policy by inspecting the generated APK report.

## Strict boundaries

Only these files may change:

- `web/src/main.js` (diagnostic recorder only)
- `web/src/navigationDiagnostics.js`
- `web/test/navigation-diagnostics.test.cjs`
- `app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt`

Do not change caret movement, keymaps, focus behavior, scrolling, CSS, decorations, or list/table/callout behavior. Do not edit `MainActivity.kt`, the Markdown stress-test file, `web/test_sources/rendered_navigation.spec.cjs`, `web/build_tests.cjs`, workflows, package manifests, or dependencies. Do not delete or broadly rewrite existing code.

## Verify

Run once:

```sh
node --test web/test/*.test.cjs
node web/build.cjs
```

Then run the repository's existing Android debug build workflow once. This change preserves mixed-input diagnostics; it does not fix the visible jumping. Do not claim the navigation issue is solved.
