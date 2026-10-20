# Jules follow-up: SVG preview + Add Row/Column in the table menu

**Base this patch on the build the user just tested:** 30f01d0942740933b51e9bb9848a05eca5d9f8ab (parent of the user's tested UI follow-up). Keep the working Find/Replace search and live preview colors intact. Scope is only the two items below.

## 1) Show a saved custom SVG in the Settings preview

### Verified cause

In app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt, StylingFindReplaceFragment.refreshFindReplacePreview() (around lines 590–623) reads button background and text color but never reads any pref_findreplace_btn_*_svg key. The preview buttons in previewButtonMap are TextViews with literal text glyphs (created around lines 692–730). A TextView cannot render the raw SVG XML, so the actual search bar changes through web/src/main.js but the native settings mockup cannot.

### Required fix

Keep the current category-selection and color-refresh behavior. Change only preview icon rendering:

1. Use one Android SVG-to-Drawable rendering path for the native preview buttons. Prefer AndroidSVG, not WebViews per icon. Add the maintained AndroidSVG Android artifact to app/build.gradle and render sanitized SVG strings to a PictureDrawable/Drawable at the preview icon's existing bounds. The preview is only 9 small icons; do not add a WebView per button.
2. In refreshFindReplacePreview(), for each (domId, btnView) in previewButtonMap:
   - compute suffix with the existing buttonPreferenceSuffix map (notably replace-one → replace_one and replace-all → replace_all);
   - read prefs.getString("pref_findreplace_btn_${suffix}_svg", "") ?: "";
   - if blank, restore that button's original default glyph and clear any compound drawable from the previous refresh;
   - if nonblank and valid, render SVG to a bounded Drawable and display it in place of the glyph;
   - if invalid or rendering throws, leave/restore the default glyph and do not crash the settings page.
3. Validate before rendering. Match the existing web/src/main.js sanitizeSvg() policy: require an <svg> root; reject script, foreignObject, inline on* handlers, javascript:, data:, embed, object, and iframe. Keep SVG rendering inert; do not load remote resources.
4. Cache each button's original glyph before the first custom icon is applied. Resetting or clearing a custom SVG must restore the original icon, not leave the old custom image or a blank button.
5. Avoid changing actual search-bar SVG handling; the actual bar already updates correctly.

### Verify on device

Paste a valid custom SVG into only the Next button setting. Before leaving Settings, its preview icon must change immediately while the other eight remain unchanged. Return to Find/Replace and confirm the actual Next icon still matches. Clear/reset Next's SVG and confirm both preview and actual button return to the original Next icon. Try malformed SVG; settings must remain usable and retain the default icon.

## 2) Add “Add Row Below” and “Add Column Right” to the long-press table-cell menu

### Verified insertion points

- web/src/tableWidget.js: showContextMenu() around lines 186–235. The existing addBtn() callback already removes the menu, executes the model action, calls renderTableCells(), and calls commitTableChange(). Add the two new menu entries here so they reuse that persistence path.
- web/src/tableModule.js: TableModel has deleteRow(r) and deleteCol(c) around lines 205–218, but no insertion methods. Add insertion methods beside them.
- web/test/table-and-widgets.test.cjs already tests TableModel parse/merge/split/serialize and checks that the long-press context menu has structural actions. Extend this test file.

### Model behavior

Add these model operations (names may follow local style, but behavior must match):

```js
insertRow(index) {
  const at = Math.max(1, Math.min(index, this.rows.length));
  this.rows.splice(at, 0, Array(this.getColCount()).fill(''));
}

insertCol(index) {
  const at = Math.max(0, Math.min(index, this.getColCount()));
  const alignment = this.alignments[Math.max(0, at - 1)] || 'left';
  for (const row of this.rows) row.splice(at, 0, '');
  this.alignments.splice(at, 0, alignment);
}
```

insertRow(r + 1) means immediately below the selected row; clamping the minimum to 1 preserves row 0 as the header. insertCol(c + 1) means immediately to the right of the selected column; copy the preceding column's alignment, or use left alignment if none exists. New cells start empty. toMarkdown() must continue to emit the GFM separator row automatically; do not put the separator into this.rows.

If insertion would cut through a merged-cell span, either insert after the full span or deliberately extend that span's < / ^ markers. Do not silently corrupt an existing merge. Add a round-trip test for an ordinary table and a merged table.

### Menu actions

In showContextMenu(), add these alongside the existing Delete Row/Delete Column actions:

```js
addBtn('Add Row Below', () => this.model.insertRow(r + 1));
addBtn('Add Column Right', () => this.model.insertCol(c + 1));
```

Always show both add actions, including for a one-row or one-column table. Keep the existing delete guards, merge/split rules, long-press behavior, menu positioning, styling, and disabled-state handling unchanged. The existing addBtn callback will re-render and commit the updated Markdown.

### Verify

- Long-press a cell: both new items appear in the existing action menu.
- Add below the header and below a body row; add right of the first and last columns.
- Confirm header remains row 0, alignment is preserved, newly added cells are blank, and the table saves/reopens correctly.
- Repeat on a merged table; no existing text or merge should be lost.
- Run node --test web/test/table-and-widgets.test.cjs, the existing web tests, and the debug build. Report build/test results separately from phone behavior.

Do not alter the working search implementation, table colors, table selection, or any unrelated settings in this patch.
