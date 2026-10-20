# Jules follow-up: keep button rows, hidden tray, counter, and SVG chooser working

**Base branch:** jules-3492949419147525921-af940c11
**Commit checked:** 265dad8b324e651d092ab10042202e13efc50c68

The SVG tint now works: keep it unchanged. This follow-up is only for the new button arranger's phone layout and the first-dialog order for SVG entry.

## 1. Keep row membership stable when hiding/restoring icons

### Verified source cause

In StylingFindReplaceFragment.refreshFindReplacePreview(), the current code first does:

~~~kotlin
val visibleIds = orderList.filter { it !in hiddenSet }
val row1Ids = visibleIds.take(5)
val row2Ids = visibleIds.drop(5)
~~~

Filtering first promotes buttons that were in row 2 into row 1 whenever a row-1 button is hidden. Restoring a button can therefore change rows and crowd the Find field/counter. The WebView helper already splits the full order list before applying hidden state; make the Settings preview follow the same rule.

Replace with:

~~~kotlin
val row1Ids = orderList.take(5).filter { it !in hiddenSet }
val row2Ids = orderList.drop(5).filter { it !in hiddenSet }
~~~

Keep hidden IDs in the saved order. Hide them only in the row where they were assigned. Tapping + must restore a button to that exact row and slot; it must not reflow row-2 buttons into row 1.

### Drop at the actual position, not the start of a row

The current handleRowDrop ignores the pointer's horizontal location and inserts at index 0 for row 1 or index 5 for row 2. Change it to insert before the visible child whose horizontal midpoint is to the right of event.x; if none, append to that row. Translate the local slot to the full order index (row 1 starts at 0, row 2 at 5), remove the dragged ID before calculating/inserting, and keep the split at exactly five IDs/four IDs. This makes drag-to-reorder work at the spot the user drops, including moving an icon between rows.

Do not re-add a restored/dragged button to row 1 unconditionally. A drag onto row 2 must stay in row 2; tapping + restores to its saved position.

## 2. Make every hidden icon visible in the holding tray

### Verified source cause

The current hiddenChipsContainer is a horizontal LinearLayout. It lays every chip on one long line, so later hidden buttons run past the phone's right edge instead of wrapping into the taller tray.

Replace the one-line horizontal chip strip with a bounded, wrapping layout. Use Android GridLayout with three columns (no new dependency), or a vertical list if that is simpler. For GridLayout:

- Set columnCount = 3 and put each hidden button in its own cell.
- Give chips wrap-content/available cell width and enough height/padding for touch.
- Rebuild rows as hidden IDs change; every hidden ID must remain visible and reachable on a narrow phone.
- Each chip must show that button's glyph/custom SVG plus a visible +, with a short readable label/accessibility description. Do not display only the raw ID.
- The tray itself must remain full width; if its content needs a height limit, put a vertical ScrollView inside the tray, not a horizontal scroller.

Test with all nine buttons hidden. All nine + chips must be reachable; none may be clipped beyond the screen edge.

## 3. Hide live buttons despite the CSS display rule; keep the match counter visible

### Verified source cause for hidden buttons

web/index.html sets .search-icon-btn to display:inline-flex !important. In web/src/main.js the arranger currently uses btn.style.display = 'none'. A normal inline style cannot override an author CSS !important rule, so this is not a reliable way to hide a button and free its width.

Use a hidden attribute and an explicit important rule:

~~~css
#custom-search-bar .search-icon-btn[hidden] {
  display: none !important;
}
~~~

In applyFindReplaceButtonLayout(), use:

~~~js
if (hiddenSet.has(id)) {
  btn.setAttribute('hidden', '');
} else {
  btn.removeAttribute('hidden');
}
~~~

Continue moving the existing button nodes only; never replace the first search row, because it owns the match counter. Keep #search-counter as a fixed, visible item separate from the icon groups. Add/retain these constraints so it cannot shrink to zero or get covered when icons are arranged:

~~~css
#search-counter {
  display: inline-block !important;
  flex: 0 0 auto !important;
  min-width: max-content;
  white-space: nowrap;
}
~~~

Do not hide, move, or recreate #search-counter when changing order/visibility. If the row is too narrow, let the Find input take the shrink first; do not allow the counter to disappear. Keep the two explicit action groups and their row assignments. Hiding an icon must remove its width; restoring it must reclaim only its saved slot.

## 4. Make the SVG chooser the first dialog

### Verified source behavior

The current SVG preference interception uses onPreferenceTreeClick() and calls super.onPreferenceTreeClick(preference) when Paste SVG Code is chosen. That falls through to the EditTextPreference's default paste dialog. The reported order is paste editor first, then source choices after cancelling; replace this flow so the source chooser owns the click from the start.

Override PreferenceFragmentCompat.onDisplayPreferenceDialog(preference) for keys ending in _svg:

~~~kotlin
override fun onDisplayPreferenceDialog(preference: Preference) {
    val key = preference.key
    if (key != null && key.startsWith("pref_findreplace_btn_") && key.endsWith("_svg")) {
        showSvgSourceChooser(key)
        return
    }
    super.onDisplayPreferenceDialog(preference)
}
~~~

showSvgSourceChooser(key) must immediately show exactly two choices: **Choose SVG File** and **Paste SVG Code**. Cancel on this first chooser returns directly to Settings; it must not open a paste dialog afterward.

- Choose SVG File launches the existing OpenDocument picker and saves validated file contents to that same button's existing SVG preference key.
- Paste SVG Code opens a dedicated multiline editor initialized with the current SVG. Save writes to that same preference; Cancel returns to Settings.
- Do not call super.onPreferenceTreeClick(preference) or super.onDisplayPreferenceDialog(preference) for the SVG preference's Paste choice; that reopens the default dialog and reverses the flow.
- Keep the Reset control, validation, and working bitmap tint. Update the XML summary to “Choose an SVG file or paste SVG code.”

## Acceptance checks

1. Hide one row-1 button. Row-2 buttons remain in row 2. Tap +; the hidden icon returns to its original row/slot and does not push unrelated icons into row 1.
2. Drag an icon to a specific position within each row and across rows. It lands at that position, not automatically at the row's beginning. Restart the app; layout persists.
3. Hide all nine icons. The Settings tray wraps into visible rows and every + chip is reachable on a phone. Restore selected items and verify no blank spaces remain.
4. Search for text with multiple matches so the counter is visible. Reorder and hide icons. The n/total counter remains visible in the real search bar; hidden icons disappear completely and their space is freed. Find/Replace inputs and button functions still work.
5. Tap a Custom SVG Icon preference. The first dialog must offer Choose SVG File / Paste SVG Code. Cancel returns to settings. Choose Paste, cancel the editor, and confirm it returns to settings without showing another chooser. Test the file picker and paste paths both update the correct button.
6. Confirm the SVG preview/live icon tint remains correct, then run the existing Android build and JavaScript tests.

**Scope:** fix these layout and chooser regressions only. Do not alter search logic, icon artwork, button styling preferences, or the working SVG tint.
