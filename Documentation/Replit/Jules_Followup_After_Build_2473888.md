# Jules follow-up after build `2473888`

**Target:** `cinnabar777/W.mdx`, branch `jules-3492949419147525921-af940c11`, latest commit `2473888`  
**Scope:** stabilize WYSIWYG selection/navigation, make editable Markdown tables render a consistent grid, and restore the missing reset controls.  
**Do not redesign:** keep the current reset glyph, its 40dp touch target, right-side placement, and its dim-default/bright-active treatment. The user says the size and placement are finally right. Do not replace or recolor the icon.

This is a follow-up to the build the user tested. Make only these focused changes. Keep the toolbar and other working features unchanged.

## 1. Stop syntax decorations from changing while navigating in Pure WYSIWYG

The current `livePreviewPlugin` calculates `isNodeActive` solely from the selection. That makes Markdown markers such as heading hashes and list/quote markers appear and disappear as the cursor/selection moves. The CodeMirror 6 reference branch `ckeditor5/Wmd-V0.2-13424438593115341489-8007187214692561893` kept markers hidden in Pure WYSIWYG; do not copy its table widget, because this branch must keep table text editable.

In `web/src/main.js`, inside `livePreviewPlugin.buildDecorations`, replace the current `isNodeActive` declaration with:

```js
const isNodeActive = !isPureWysiwyg && (
  selection.empty
    ? selection.head >= node.from && selection.head <= node.to
    : selection.from < node.to && selection.to > node.from
);
```

This preserves caret/selection reveal in Live Preview, but prevents Pure WYSIWYG decorations from changing document geometry as the user navigates. Do not remove selection reporting or change the native/web selection bridge.

### Table syntax must not switch visibility row-by-row

In the `node.name === 'Table'` block, remove `cursorLine`, `isActiveRow`, and the `!isActiveRow` condition. Replace:

```js
const hideSyntax = !isActiveRow &&
  (isPureWysiwyg || currentEditorMode === 'live_preview');
```

with:

```js
const hideSyntax =
  currentEditorMode === 'wysiwyg' ||
  currentEditorMode === 'live_preview';
```

Keep pipe delimiters and the separator row hidden in both rich modes, consistently for every table row. The Source mode already returns before these decorations are created, so it must continue to show the literal Markdown.

## 2. Keep table cell borders on the full cell range, including whitespace and empty cells

The current `trimCellRange()` removes the spaces around cell content, and `Decoration.mark()` is applied only to that trimmed text. That leaves cell padding and empty cells without a border. Preserve the full source range for drawing and separately store the trimmed range for measuring text.

Replace `trimCellRange()` with:

```js
export function trimCellRange(text, start, end, lineFrom) {
  const cellStart = start;
  const cellEnd = end;
  let contentStart = start;
  let contentEnd = end;

  while (contentStart < contentEnd && /\s/.test(text[contentStart])) {
    contentStart++;
  }
  while (contentEnd > contentStart && /\s/.test(text[contentEnd - 1])) {
    contentEnd--;
  }

  return {
    // Full cell bounds, excluding the pipe delimiters.
    start: cellStart,
    end: cellEnd,
    from: lineFrom + cellStart,
    to: lineFrom + cellEnd,
    // Trimmed text bounds, used for separator detection and width measurement.
    contentStart,
    contentEnd,
    contentFrom: lineFrom + contentStart,
    contentTo: lineFrom + contentEnd
  };
}
```

Keep empty cells in `parsePipeRow()`; do not filter them out. Update separator detection to use the trimmed content range:

```js
export function isTableSeparatorRow(text, parsedCells) {
  return parsedCells.length > 0 &&
    parsedCells.every(({ contentStart, contentEnd }) =>
      /^:?-{3,}:?$/.test(text.slice(contentStart, contentEnd).trim())
    );
}
```

Update `getTableColumnWidths()` to measure only content, while retaining the existing 8–40ch bounds:

```js
const text = doc.sliceString(cell.contentFrom, cell.contentTo);
```

When creating cell decorations, apply marks to `cell.from` through `cell.to`, not the trimmed content positions. Tag first and last cells so the outer border follows the table width:

```js
const classes = [
  'cm-table-cell',
  ...(isHeader ? ['cm-table-header-cell'] : []),
  ...(column === 0 ? ['cm-table-first-cell'] : []),
  ...(column === parsed.cells.length - 1 ? ['cm-table-last-cell'] : [])
].join(' ');

if (cell.from < cell.to) {
  builder.push(Decoration.mark({
    class: classes,
    attributes: { style: `width:${widthCh}ch;` }
  }).range(cell.from, cell.to));
} else {
  builder.push(Decoration.widget({
    widget: new EmptyTableCellWidget(widthCh, isHeader, column === 0, column === parsed.cells.length - 1),
    side: 1
  }).range(cell.from));
}
```

Add this widget near the other `WidgetType` classes in `web/src/main.js` (the file already imports `WidgetType`):

```js
class EmptyTableCellWidget extends WidgetType {
  constructor(widthCh, isHeader, isFirst, isLast) {
    super();
    this.widthCh = widthCh;
    this.isHeader = isHeader;
    this.isFirst = isFirst;
    this.isLast = isLast;
  }

  eq(other) {
    return other instanceof EmptyTableCellWidget &&
      other.widthCh === this.widthCh &&
      other.isHeader === this.isHeader &&
      other.isFirst === this.isFirst &&
      other.isLast === this.isLast;
  }

  toDOM() {
    const cell = document.createElement('span');
    cell.className = [
      'cm-table-cell',
      'cm-table-empty-cell',
      ...(this.isHeader ? ['cm-table-header-cell'] : []),
      ...(this.isFirst ? ['cm-table-first-cell'] : []),
      ...(this.isLast ? ['cm-table-last-cell'] : [])
    ].join(' ');
    cell.style.width = `${this.widthCh}ch`;
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  }

  ignoreEvent() {
    return true;
  }
}
```

Replace the current table border CSS in `web/index.html` with:

```css
.cm-content .cm-table-cell {
  display: inline-block;
  box-sizing: border-box;
  vertical-align: top;
  min-width: 8ch;
  padding: var(--table-cell-padding, 8px) !important;
  border-right: var(--table-border-width, 1px) var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
  border-bottom: var(--table-border-width, 1px) var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
  color: var(--table-cell-color, var(--text-color, #ffffff)) !important;
  background: var(--table-cell-bg, transparent) !important;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cm-content .cm-table-first-cell {
  border-left: var(--table-border-width, 1px) var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
}

.cm-content .cm-table-last-cell {
  border-right: var(--table-border-width, 1px) var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
}

.cm-content .cm-table-empty-cell {
  line-height: 1em;
  padding-top: var(--table-cell-padding, 8px) !important;
  padding-bottom: var(--table-cell-padding, 8px) !important;
}

.cm-content .cm-table-header-cell {
  border-top: var(--table-border-width, 1px) var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
  color: var(--table-header-color, var(--text-color, #ffffff)) !important;
  background: var(--table-header-bg, rgba(255, 255, 255, 0.12)) !important;
  font-weight: var(--table-header-font-weight, 700) !important;
}
```

Remove `border-left`, `border-right`, and `padding-left` from `.cm-table-row`; the cell decorations now draw the left/right edges at the actual table width. Keep `.cm-table-row` for its font and row styling.

## 3. Tab should move a caret, not select the whole next cell

The current handler selects the entire target cell with `{ anchor: targetCell.from, head: targetCell.to }`. That is not normal cell navigation and makes continued editing awkward.

Replace the target-cell dispatch with:

```js
const targetPos = direction > 0 ? targetCell.from : targetCell.to;
view.dispatch({
  selection: { anchor: targetPos, head: targetPos },
  scrollIntoView: true
});
```

Tab goes to the start of the next cell; Shift+Tab goes to the end of the previous cell. Add a regression test asserting the resulting selection is empty (anchor equals head).

## 4. Exact reset settings that are still missing or cannot activate

On this commit, `bindResetButton()` and `isModifiedFromDefault()` exclude **all** keys beginning with `pref_export`. This hides the reset icon from these five real settings:

- **Default Export Format** — `pref_export_format`
- **Include CSS Styling in Export** — `pref_export_include_css`
- **CSS Placement for HTML Export** — `pref_export_css_placement`
- **Include Table of Contents in Export** — `pref_export_include_toc`
- **Max TOC Heading Level** — `pref_export_toc_levels`

Also add default-value cases for these 12 settings. Right now `getDefaultValue()` returns `null`, so the reset icon can never become active after these settings are changed:

- **Hide Status Bar** — `pref_hide_status_bar` → `false`
- **Hide Navigation Bar** — `pref_hide_nav_bar` → `false`
- **Document Editor Mode** — `pref_editor_mode` → `"wysiwyg"` (matches its preference XML)
- **Export HTML / MHTML Shortcut** — `pref_hotkey_export` → `"ctrl+shift+e"`
- **Open with Alternate Engine Shortcut** — `pref_hotkey_open_with` → `"ctrl+shift+o"`
- **Toggle Line Numbers Shortcut** — `pref_hotkey_line_numbers` → `"ctrl+alt+l"`
- **Insert Footnote Shortcut** — `pref_hotkey_footnote` → `"ctrl+shift+f"`
- **Footnote Font Size** — `pref_footnote_font_size` → `14`
- **Footnote Text Color** — `pref_footnote_text_color` → `"default"`
- **Footnote Reference Color** — `pref_footnote_ref_color` → `"default"`
- **Footnote Back-Link Color** — `pref_footnote_link_color` → `"default"`
- **Footnote Section Background Color** — `pref_footnote_bg_color` → `"default"`

In `PreferenceResetHelper`, use one predicate in both `bindResetButton()` and `isModifiedFromDefault()`:

```kotlin
private fun shouldShowResetButton(key: String?): Boolean =
    key != null &&
        key != "pref_reset_all_defaults" &&
        key != "pref_export_backup" &&
        key != "pref_import_backup" &&
        !key.startsWith("pref_page_") &&
        !key.endsWith("_page")
```

Replace the current `pref_export*` / `pref_import*` broad exclusion checks with this predicate. Keep the icon excluded for navigation rows, the reset-all action, and backup/import actions. **Do not** exclude the five export settings listed above.

Add these cases to `getDefaultValue()`:

```kotlin
key == "pref_hide_status_bar" -> false
key == "pref_hide_nav_bar" -> false
key == "pref_editor_mode" -> "wysiwyg"
key == "pref_export_format" -> "html"
key == "pref_export_include_css" -> true
key == "pref_export_css_placement" -> "head"
key == "pref_export_include_toc" -> true
key == "pref_export_toc_levels" -> 3
key == "pref_hotkey_export" -> "ctrl+shift+e"
key == "pref_hotkey_open_with" -> "ctrl+shift+o"
key == "pref_hotkey_line_numbers" -> "ctrl+alt+l"
key == "pref_hotkey_footnote" -> "ctrl+shift+f"
key == "pref_footnote_font_size" -> 14
key == "pref_footnote_text_color" -> "default"
key == "pref_footnote_ref_color" -> "default"
key == "pref_footnote_link_color" -> "default"
key == "pref_footnote_bg_color" -> "default"
```

Check that every fallback used by the editor-mode readers agrees with the XML default `"wysiwyg"`; do not make a reset appear active just because one fallback says `"rich_text"` while the preference XML says `"wysiwyg"`.

The `pref_page_*` rows are navigation links, not settings, and should still have no reset icon. Export/import backup rows are actions, not resettable values, and should still have no reset icon.

## 5. Regression checks before building

Add or update tests so they exercise behavior, not only search the source for function names:

1. In Pure WYSIWYG, moving the caret or extending a selection across a heading/list/callout does not make Markdown markers appear/disappear.
2. In Live Preview, markers may reveal while the selection intersects them; leaving the syntax hides them again.
3. Moving between table rows does not toggle pipe visibility or change row width.
4. A table with leading/trailing spaces and an empty middle cell draws the full horizontal and vertical cell borders; column widths align across rows.
5. Tab and Shift+Tab move a collapsed caret to the next/previous cell and do not select its contents. Pipes and the separator row stay hidden in rich modes and remain visible in Source mode.
6. Every resettable preference listed above displays an icon. Changing it makes the existing icon bright/enabled; tapping it restores its listed default. Navigation and backup/action rows stay excluded.
7. Preserve existing toolbar, undo/redo, text-selection bridge, and the current reset icon's agreed appearance and placement.

Then build and test the APK. Report the exact commit and build result; do not say the phone behavior is fixed until the user tests the new build.

## Source references reviewed

- Current Wmdx commit: `2473888` — `Implement incremental CodeMirror layout field, active-syntax reveal, and table column width alignment`.
- CodeMirror reference commit the user identified: `ckeditor5/Wmd-V0.2-13424438593115341489-8007187214692561893` at `c6bb70b3c073fdfbab3035b5ed2e5b02860905c3`.
- The reference branch hides syntax markers in Pure WYSIWYG, but its table is replaced by a table widget. Port only the stable WYSIWYG marker behavior; do not replace editable table rows with a widget.
