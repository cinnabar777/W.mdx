# Jules patch instructions — restore the 42ae Find bar, keep it reopenable, and make its preview live

**User-confirmed reference:** commit 42ae1070536c549b6c110132d8f4735127dc1e5f is the last build where Find highlights worked. Target the later broken implementation at 3ee1daae9a45f42681cc921dabc1f395c26126af. Make only the changes below; do not rewrite Find/Replace or the preference screen.

## A. Search: restore the working CodeMirror-panel wiring without closing/detaching it

In web/src/main.js, CodeMirrorAdapter's extension list at approximately line 1175 is currently plain [1msearch(),[0m. Replace it with the exact working configuration from 42ae:

```js
search({
  createPanel: () => {
    const container = document.querySelector('#custom-search-bar');
    return {
      dom: container,
      top: true
    };
  }
}),
```

Then replace the current toggleFindAndReplaceBar() with this version. The key difference from 42ae is intentional: when hiding the bar, do **not** call closeSearchPanel(). CodeMirror removes the custom panel DOM on close, which is the reopen failure. Keep the panel mounted and only hide the bar with its existing .hidden class.

```js
function toggleFindAndReplaceBar(forceState) {
  const bar = document.getElementById('custom-search-bar');
  if (!bar) return;

  const show = forceState ?? bar.classList.contains('hidden');
  bar.classList.toggle('hidden', !show);

  const view = activeAdapter?.view;
  if (!view) return;

  if (show) {
    openSearchPanel(view);
    requestAnimationFrame(() => {
      const input = bar.querySelector('#search-input');
      input?.focus();
      input?.select();
      commitSearchQuery();
    });
  } else {
    // Intentionally do not call closeSearchPanel(view): that detaches
    // the custom #custom-search-bar element from CodeMirror's panel host.
    view.focus();
  }
}
```

The imports for search, setSearchQuery, openSearchPanel, findNext, findPrevious, replaceNext, and replaceAll already exist. Remove the closeSearchPanel import if it becomes unused. Do not change buildSearchQuery(), commitSearchQuery(), or the regex/history logic in this patch: those functions are identical between 42ae and 3ee.

**Required regression check:** enter a repeated literal query. Confirm actual visible .cm-searchMatch DOM marks appear, not just a “1/N” counter. Confirm the selected hit has .cm-searchMatch-selected. Close with the X, reopen from the toolbar, and search again. Repeat after opening a different document. If marks are absent, inspect the active adapter's view and computed CSS before changing query logic; the counter is calculated independently and does not prove rendering.

## B. Preview: apply real SharedPreferences values to the existing preview views

File: app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt.

The current preview views are created in StylingFindReplaceFragment.setupInteractivePreview() around lines 568–705. They are hard-coded TextViews (literal colors, 28px buttons, 32px rows, generic text glyphs). Existing button-to-category mapping at lines 687–697 is already correctly separate; keep it. The missing part is applying each key's stored value to its corresponding preview view.

1. Add one extension hook to BaseSettingsFragment so the specialized fragment receives preference changes without replacing the common reset/background handling:

```kotlin
protected open fun onSettingPreferenceChanged(
    sharedPreferences: SharedPreferences,
    key: String
) = Unit
```

Call it at the end of BaseSettingsFragment.onSharedPreferenceChanged(), after existing reset and settings-background handling:

```kotlin
if (sharedPreferences != null && key != null) {
    onSettingPreferenceChanged(sharedPreferences, key)
}
```

2. In StylingFindReplaceFragment, keep references to the preview card, Find and Replace fields, counter, and each button in a map keyed by DOM/button id: prev, next, highlight, regex, close, replace-one, replace-all, case, word. Also keep each existing field-to-category and button-to-category click mapping.

3. Add `refreshFindReplacePreview(prefs: SharedPreferences)`. Call it immediately after setupInteractivePreview() in onViewCreated(), and from the hook when `key.startsWith("pref_findreplace_")`. This function must read the same preference keys used by the live editor and update the relevant preview element immediately. It must also be safe to call with `key` for any Find/Replace preference; simplest correct implementation is to reapply all Find/Replace preview styles on each such change.

4. Use this exact preference suffix map; do not construct preference keys directly from hyphenated DOM ids:

```kotlin
private val buttonPreferenceSuffix = mapOf(
    "prev" to "prev",
    "next" to "next",
    "highlight" to "highlight",
    "regex" to "regex",
    "close" to "close",
    "replace-one" to "replace_one",
    "replace-all" to "replace_all",
    "case" to "case",
    "word" to "word"
)
```

5. Apply at minimum these real values to the corresponding views:
   - panel background/bottom border: pref_findreplace_panel_bg, pref_findreplace_panel_border;
   - Find and Replace field background, text, placeholder, border, focus border, and font size: use the separate pref_findreplace_field_find_* and pref_findreplace_field_replace_* keys;
   - counter text color: pref_findreplace_counter_color;
   - button normal background/icon color, active background/icon color where that button has active state, pressed background, width, and custom SVG: pref_findreplace_btn_<suffix>_{bg,color,active_bg,active_color,pressed_bg,width,svg}.
   - shared field height: pref_findreplace_field_height for both rows and their aligned buttons. Do not add the removed panel-min-height or button-height settings.

Use ColorPickerDialog.parseHexColor(value, fallback) for colors; when the stored value is "default", use the same fallback values as the CSS in web/index.html. For width/height, update the preview view's LayoutParams in dp using the current display density. Do not change another button when one key changes. If custom SVG is set, render the sanitized SVG in the preview (the existing preview TextView glyph cannot display SVG); preserve the original icon when the value is empty or invalid.

6. In the override, reapply the preview and then call the base hook if needed:

```kotlin
override fun onSettingPreferenceChanged(
    sharedPreferences: SharedPreferences,
    key: String
) {
    if (key.startsWith("pref_findreplace_")) {
        refreshFindReplacePreview(sharedPreferences)
    }
}
```

**Preview verification:** change only Next's background to a distinct color; confirm only the Next preview button changes immediately. Confirm only Next changes in the actual bar after returning to the editor. Repeat for Regex (including active state), and reopen the settings page to confirm saved values remain visible. Tap each preview item and verify its category title is unique (the XML already defines separate categories and keys).

## Scope guard

Do not edit search query/counter/regex behavior except for the panel extension and safe show/hide lifecycle above. Do not touch typography, tables, toolbar, or unrelated settings. Run the existing JS tests/build. Report source/build checks separately from phone verification; do not claim phone behavior until tested.
