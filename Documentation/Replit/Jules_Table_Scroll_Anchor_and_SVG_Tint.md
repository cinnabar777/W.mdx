# Jules patch: SVG preview tint + keep table visible after actions

**Base branch:** jules-3492949419147525921-af940c11
**Latest source commit checked:** 36978bfe4689f288ab1cfcceae90a9f16b1fd318

Two focused fixes only. Do not redesign Find & Replace or the table menu.

## 1. Custom SVG in Settings must use the configured icon color

### Why it is currently black

In SettingsActivity.kt, refreshFindReplacePreview() calls btnView.setTextColor(...), but custom SVGs are rendered as an Android PictureDrawable. TextView text color does not tint a compound drawable, so the SVG's own black fill stays black. The live Find & Replace icon already uses the configured color; make the native Settings preview match it.

### Exact change

In refreshFindReplacePreview(prefs), compute the icon color once after reading btnColorHex:

~~~kotlin
val defaultIconColor = Color.parseColor("#AAAAAA")
val iconColor = if (btnColorHex == "default") {
    defaultIconColor
} else {
    ColorPickerDialog.parseHexColor(btnColorHex, defaultIconColor)
}
btnView.setTextColor(iconColor)
~~~

Replace the existing one-line btnView.setTextColor(...) with this resolved color. In the valid-SVG branch, immediately after creating the PictureDrawable and before setCompoundDrawables, tint it:

~~~kotlin
drawable.colorFilter = android.graphics.PorterDuffColorFilter(
    iconColor,
    android.graphics.PorterDuff.Mode.SRC_IN
)
~~~

Keep the existing validation, sizing, preference key, and error/fallback behavior. Do not tint unrelated preview fields. Empty or invalid SVG must continue to show the original built-in glyph in the configured icon color. Keep the preview refresh listener so changing the SVG or icon color updates immediately.

## 2. Table actions must not move the table out of view

### Cause in current code

In web/src/tableWidget.js, the context-menu handler mutates the model, redraws the table, then commitTableChange() replaces the Markdown range. CodeMirror rebuilds the block widget, but no code restores the table's screen position. The jump is intermittent because it depends on browser scroll anchoring and remeasurement timing.

### Add a stable identity to each rendered table

In toDOM(view), immediately after assigning container.className, add:

~~~js
container.dataset.tableFrom = String(this.from);
container.style.overflowAnchor = 'none';
~~~

Use data-table-from to identify the exact table within the current editor. Do not use document.querySelector('.cm-wp-table-container'): there may be multiple tables.

### Add one mutation wrapper

After commitTableChange is declared, add this helper inside toDOM(view):

~~~js
const runTableAction = (mutate) => {
  const scroller = view.scrollDOM;
  const scrollerRect = scroller.getBoundingClientRect();
  const originalTableTop = container.getBoundingClientRect().top - scrollerRect.top;
  const saved = {
    scrollTop: scroller.scrollTop,
    scrollLeft: scroller.scrollLeft,
    windowX: window.scrollX,
    windowY: window.scrollY
  };

  mutate();
  renderTableCells();
  commitTableChange();

  // Wait for CodeMirror to rebuild and measure the replacement block widget.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (window.scrollX !== saved.windowX || window.scrollY !== saved.windowY) {
      window.scrollTo(saved.windowX, saved.windowY);
    }

    const selector = '.cm-wp-table-container[data-table-from="' + this.from + '"]';
    const liveContainer = view.dom.querySelector(selector);
    if (!liveContainer) {
      scroller.scrollTop = saved.scrollTop;
      scroller.scrollLeft = saved.scrollLeft;
      return;
    }

    const liveScrollerRect = scroller.getBoundingClientRect();
    const liveTableTop = liveContainer.getBoundingClientRect().top - liveScrollerRect.top;
    // Correct browser/CodeMirror scroll shift so this table remains at the
    // same vertical screen position it had when the action started.
    scroller.scrollTop = Math.max(0, scroller.scrollTop + liveTableTop - originalTableTop);
    scroller.scrollLeft = saved.scrollLeft;
  }));
};
~~~

### Route every table mutation through the wrapper

Do not only fix Add Row/Add Column. Replace each user-edit renderTableCells(); commitTableChange(); pair with runTableAction(() => { ...model change... }):

- Context-menu button onclick: after menu.remove(), replace action(); renderTableCells(); commitTableChange(); with runTableAction(action).
- commitAndClose cell edit: move the model assignment and overlay cleanup inside runTableAction(() => { this.model.rows[r][c] = overlay.value; activeOverlay = null; overlay.remove(); }). Keep existing optional next-cell navigation after runTableAction returns.
- Merge and Split toolbar handlers: put mergeRect(...) or splitCell(...) inside runTableAction(() => ...).

This gives Add Row/Column, Delete, Merge, Split, and cell edits the same position-preserving behavior. Do not call renderTableCells() or commitTableChange() a second time for those actions.

## Acceptance checks

1. In Settings, use a black-fill custom SVG, change that button's icon-color setting to a bright color, and confirm the preview changes immediately and matches the live Find & Replace icon. Change it again; reset the SVG; verify the built-in glyph returns in the selected color.
2. Place a table near the top and near the bottom of the screen. Long-press a cell and use Add Row, Add Column, Delete Row/Column, Merge, and Split. Repeat each several times. The same table must remain at the same visible vertical position; it must not jump out of view. Verify with two tables in one document so the correct table is restored.
3. Confirm edits still update Markdown and undo/redo still work.
4. Run existing Android build and JavaScript tests. Avoid adding a dependency just for scroll testing. Add a regression test to existing tooling if it can exercise the scroll-restoration helper; otherwise do the acceptance checks on-device.

**Scope:** Settings SVG tint and table viewport stability only. Do not alter table layout, menu options, search behavior, or editor scroll policy globally.
