# Jules patch: make Find & Replace rows truly configurable and keep the match count visible

**Base branch:** jules-3492949419147525921-af940c11
**Latest source checked:** c9cafcb418b5bf3203c82e237d60fef903cbc60a

The hidden tray is fixed. The SVG tint and SVG source chooser are also fixed. Do not change those. This patch is only for the two remaining issues: row assignment and the disappearing real-search match count.

## Root cause 1: one flat list forces exactly five buttons into row 1

Both SettingsActivity.kt and web/src/main.js currently take one global button order and split it at index 5: first five IDs go in row 1, remaining IDs in row 2. That is not a two-row layout the user can configure; it forces five buttons to stay in row 1 and makes row 2 merely the remainder. Dragging across rows cannot change that row capacity.

### Replace the single global order with two separately persisted row lists

Add two SharedPreferences strings:

- pref_findreplace_button_row1 — ordered comma-separated IDs for the first action group.
- pref_findreplace_button_row2 — ordered comma-separated IDs for the second action group.

Keep pref_findreplace_hidden_buttons as the separate hidden set. Do not limit either row to five/four items. The user must be able to move any button between rows and leave only one or two icons beside the Find field if desired.

Migration and normalization:

1. If both row keys are absent, migrate the existing pref_findreplace_button_order once: first five IDs become row1; remaining IDs become row2. This preserves the current default layout for existing users.
2. Accept only the nine known IDs. Traverse row1 then row2, discard duplicates/unknown IDs, and append any missing IDs to their original default row (prev,next,highlight,regex,close in row1; replace-one,replace-all,case,word in row2).
3. Hidden IDs remain in their row list and are not moved or deleted. Hiding/restoring must not change row membership or order.
4. Persist both normalized row keys. Keep the old flat key only as a one-time migration source; do not continue splitting it at index five.

### Settings preview: drop at the actual position and preserve row membership

In StylingFindReplaceFragment.refreshFindReplacePreview(), stop computing row1Ids/orderList.take(5) and row2Ids/orderList.drop(5). Instead, read/normalize the two row keys independently, then filter hidden IDs only within each row before rebuilding its group.

On drag/drop:

- Dragging within a row reorders within that row based on the pointer's x position relative to child midpoints.
- Dragging to the other row removes the ID from the source row list and inserts it at the dropped position in the destination row list. Do not rebalance either row or promote another button to keep a fixed count.
- Save both row keys and refresh the preview.
- Tapping + in the already-working hidden tray only removes the ID from the hidden set. It returns to the same row and slot because the row lists never lost it.

## Root cause 2: current hidden state can be defeated by CSS

In web/src/main.js, the layout helper currently assigns btn.style.display = 'none'. In web/index.html, .search-icon-btn has display:inline-flex !important. That important author rule can override a normal inline display value, leaving hidden buttons in the real bar and still consuming width.

When building the real bar, keep using the existing button nodes and move them into the two search-icon-group containers according to the two saved row lists. Set hidden state with the hidden attribute:

~~~js
if (hiddenSet.has(id)) {
  button.setAttribute('hidden', '');
} else {
  button.removeAttribute('hidden');
}
~~~

Add/retain this rule, which must be later or at least equally specific:

~~~css
#custom-search-bar .search-icon-btn[hidden] {
  display: none !important;
}
~~~

Do not clone/recreate buttons, because their action listeners are already attached. Hiding must remove their width completely. Do not change button behavior or appearance settings.

## Keep and refresh the real search match counter

The match counter is a separate #search-counter span in the first search row, before the action group. Keep that node in place; never move it into a button group or rebuild/replace the whole row when applying a layout. It must remain visible whether the user has many buttons in row 1 or only one.

Keep these CSS constraints:

~~~css
#search-counter {
  display: inline-block !important;
  flex: 0 0 auto !important;
  min-width: max-content !important;
  white-space: nowrap !important;
}
~~~

When applying a changed row/hidden layout, do not clear counterEl.textContent. If a search query is active, recalculate the n/total counter after the buttons have been moved by using the existing buildSearchQuery() and updateMatchCounterFromQuery() path. Avoid recalculating on unrelated theme updates; only do so when the saved row/hidden layout actually changed.

Add a diagnostic assertion to the existing test or debug check: after a query with multiple matches is active and buttons are moved/hidden/restored, #search-counter must still have nonempty text and a nonzero on-screen bounding rectangle. If its text is nonempty but its rectangle is clipped/offscreen, fix the flex sizing/order instead of hiding the counter.

## Required data flow

- Add row1/row2 keys to the same native-to-WebView preference payload used for the existing findreplace settings.
- In the existing JS preference application function, parse both row lists with the same known-ID normalization rules; do not recreate the old 5/4 split.
- Settings preview and actual WebView must render identical row membership and order.
- A restored button must reappear in its exact prior row/slot, with its SVG, color, size, and working action unchanged.

## Acceptance checks

1. Move three buttons from row 1 into row 2. Row 1 must show only the remaining buttons; row 2 must now be a real independently arranged row. The real Find & Replace bar must exactly match the Settings preview.
2. Move a button to a specific position in each row. It lands there—not automatically at the beginning of the row. Restart and verify both row orders persist.
3. Hide a row-1 icon and a row-2 icon, then restore them with +. Each returns to its original row and slot; no other button changes rows.
4. With a query that has multiple matches, verify n/total remains visible before and after every row move, hide, and restore. Hidden icons must actually disappear and leave their width available.
5. Confirm Find, Replace, all nine button actions, per-icon settings, SVG tint, and the fixed hidden tray still work. Run the existing Android build and JavaScript tests.

**Scope:** two-row layout persistence, real-bar hidden state, and match-counter visibility only. The holding tray, SVG tint, SVG file/paste chooser, table actions, and search logic are already working; preserve them.
