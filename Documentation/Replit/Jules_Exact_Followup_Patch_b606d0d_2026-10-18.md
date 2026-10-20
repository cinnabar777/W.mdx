# Jules — exact follow-up patch for the tested Wmdx branch

**Use this instead of the earlier general handoff.** It is written against the current branch tip `b606d0dcdcc5caad933068ace75925df9babad75`. Recheck the branch tip before applying. Do not modify `main`.

This is a code handoff only. Replit has not changed or committed app code.

## Findings in the current source

The user’s test results match specific source issues:

- `web/src/main.js`: `isNodeActive` is forced to `false` in pure WYSIWYG. List markers, quote markers, and heading markers therefore stay replaced even when the caret reaches them. This is the strongest direct explanation for keyboard navigation skipping formatted syntax.
- `buildLayoutDecorations()` walks the entire syntax tree and rebuilds all layout decorations on every document change. That is a full-document synchronous scan per edit and can make typing/scrolling worse. It is also based on `syntaxTree(state)`, which may not yet contain syntax for the whole document.
- Table cells have `border-right`, but no cell `border-bottom`, so the latest CSS can show vertical but not horizontal grid lines. Cell marks also have no shared per-column width.
- CSS variables for callouts exist, but the source never adds `cm-callout` to a line.
- `ResetPreferences.kt` still inserts the reset icon beside the title; the latest code merely made it 48dp. It does not give every control one consistent right-side slot.

## 1. Replace the active-syntax rule

In `livePreviewPlugin.buildDecorations()`, replace:

```js
const isNodeActive = !isPureWysiwyg && (cursor >= node.from && cursor <= node.to);
```

with:

```js
const isNodeActive = selection.empty
  ? selection.head >= node.from && selection.head <= node.to
  : selection.from < node.to && selection.to > node.from;
```

`currentEditorMode === 'source'` already returns `Decoration.none` above this code, so source mode remains untouched. In the two preview modes, reveal the actual Markdown token only when the caret/selection enters that token. Keep the `ListMarkerWidget`, `HeaderMark`, and `QuoteMark` replacements for inactive content.

Keep the table renderer’s existing active-row rule: show raw pipes for the row containing the caret and hide them on inactive rows in both preview modes. Do not use `isPureWysiwyg` to prevent heading/list/quote markers from becoming active.

**Do not remove selection text or replace an entire heading/list/blockquote block with a widget.** The Markdown characters must remain in the CodeMirror document and become visible/editable at the caret.

## 2. Replace the full-document layout rebuild

Do not keep `buildLayoutDecorations(state)` as a `syntaxTree(state).iterate({ from: 0, to: state.doc.length })` call from `StateField.update()`. That does work proportional to the whole file on every keystroke.

Make the persistent field cover only line-level structural classes that affect layout: headings, list-item starts, blockquotes, and callouts. Detect those from line prefixes, not from a partially parsed syntax tree. Build them once at editor creation, then map existing decorations and rebuild only changed lines plus the affected contiguous quote/callout block.

Replace the current `buildLayoutDecorations()` / `persistentLayoutField` section with this implementation. Keep paragraph, inline formatting, code-block, and table decorations in the existing view plugin unless they are separately made incremental.

```js
function isQuoteLine(text) {
  return /^ {0,3}>/.test(text);
}

function expandQuoteRun(doc, first, last) {
  let containsQuote = false;
  for (let line = first; line <= last; line++) {
    if (isQuoteLine(doc.line(line).text)) {
      containsQuote = true;
      break;
    }
  }
  if (!containsQuote) return { first, last };

  while (first > 1 && isQuoteLine(doc.line(first - 1).text)) first--;
  while (last < doc.lines && isQuoteLine(doc.line(last + 1).text)) last++;
  return { first, last };
}

function structuralRangesForLines(state, firstLine, lastLine) {
  const doc = state.doc;
  if (currentEditorMode === 'source') return [];

  // If the dirty range begins in the middle of a quote block, scan from the
  // beginning so callout state is known for every line being rebuilt.
  let scanStart = firstLine;
  while (scanStart > 1 && isQuoteLine(doc.line(scanStart - 1).text)) scanStart--;

  let activeCallout = '';
  const ranges = [];

  for (let number = scanStart; number <= lastLine; number++) {
    const line = doc.line(number);
    const text = line.text;
    const isQuote = isQuoteLine(text);
    const calloutMarker = isQuote
      ? text.match(/^ {0,3}>\s*\[!([A-Za-z]+)\](?:[+-])?/)
      : null;

    if (!isQuote) {
      activeCallout = '';
    } else if (calloutMarker) {
      activeCallout = calloutMarker[1].toLowerCase();
    }

    if (number < firstLine || number > lastLine) continue;

    const classes = [];
    const heading = text.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)/);
    if (heading) {
      classes.push('cm-heading', `cm-heading-${heading[1].length}`);
    }

    if (/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/.test(text)) {
      classes.push('cm-list-item');
    }

    if (isQuote) classes.push('cm-blockquote');
    if (activeCallout) {
      classes.push('cm-callout', `cm-callout-${activeCallout}`);
      if (calloutMarker) classes.push('cm-callout-title');
    }

    if (classes.length) {
      ranges.push(
        Decoration.line({
          attributes: { class: classes.join(' ') }
        }).range(line.from)
      );
    }
  }

  return ranges;
}

function mergeLineRanges(ranges) {
  ranges.sort((a, b) => a.first - b.first);
  const merged = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.first <= previous.last + 1) {
      previous.last = Math.max(previous.last, range.last);
    } else {
      merged.push({ first: range.first, last: range.last });
    }
  }
  return merged;
}

function changedStructuralRanges(tr) {
  const oldDoc = tr.startState.doc;
  const newDoc = tr.state.doc;
  const ranges = [];

  tr.changes.iterChangedRanges((oldFrom, oldTo, newFrom, newTo) => {
    let oldFirst = Math.max(1, oldDoc.lineAt(oldFrom).number - 1);
    let oldLast = Math.min(oldDoc.lines, oldDoc.lineAt(oldTo).number + 1);
    ({ first: oldFirst, last: oldLast } = expandQuoteRun(oldDoc, oldFirst, oldLast));

    const mappedOldFrom = tr.changes.mapPos(oldDoc.line(oldFirst).from, -1);
    const mappedOldTo = tr.changes.mapPos(oldDoc.line(oldLast).to, 1);
    let first = Math.max(
      1,
      Math.min(
        newDoc.lineAt(newFrom).number - 1,
        newDoc.lineAt(mappedOldFrom).number
      )
    );
    let last = Math.min(
      newDoc.lines,
      Math.max(
        newDoc.lineAt(newTo).number + 1,
        newDoc.lineAt(mappedOldTo).number
      )
    );
    ({ first, last } = expandQuoteRun(newDoc, first, last));
    ranges.push({ first, last });
  });

  return mergeLineRanges(ranges);
}

function buildInitialStructuralDecorations(state) {
  return Decoration.set(
    structuralRangesForLines(state, 1, state.doc.lines),
    true
  );
}

export const persistentLayoutField = StateField.define({
  create(state) {
    return buildInitialStructuralDecorations(state);
  },
  update(current, tr) {
    if (!tr.docChanged) return current;

    // Mapping keeps all untouched lines in place. Only dirty lines and any
    // affected quote/callout block are rescanned.
    let next = current.map(tr.changes);
    for (const range of changedStructuralRanges(tr)) {
      const from = tr.state.doc.line(range.first).from;
      const to = tr.state.doc.line(range.last).to;
      next = next.update({
        filterFrom: from,
        filterTo: to,
        filter: () => false,
        add: structuralRangesForLines(tr.state, range.first, range.last),
        sort: true
      });
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field)
});
```

After moving these four line classes into the persistent field, remove their duplicate `addLineClass()` calls from `livePreviewPlugin` for `ATXHeading`, `ListItem`, and `Blockquote`. Leave the inline marker replacement code there. Verify the changed-range helper with insert, delete, Enter, and Backspace at the start/end of a heading, list item, quote, and callout.

## 3. Add callout detection to the renderer

The persistent line code above recognizes Obsidian-style quote callouts such as `> [!NOTE]`. Add these styles after the existing `.cm-callout` rule in `web/index.html`:

```css
.cm-content .cm-callout {
  border-left: var(--callout-border-width, 4px)
    var(--callout-border-style, solid)
    var(--callout-border-color, #29b6f6) !important;
  background: var(--callout-bg-color, rgba(41, 182, 246, .12)) !important;
  padding-left: var(--callout-padding, 12px) !important;
}

.cm-content .cm-callout-title {
  font-weight: 700 !important;
}
```

Do not style ordinary blockquotes as callouts. The callout style applies only after a `> [!TYPE]` marker; all following contiguous `>` lines belong to that callout until a non-quote line. Use the existing callout color/spacing preferences.

## 4. Give table cells horizontal borders and aligned columns

In `web/src/main.js`, add this helper near `parseTableCells()`:

```js
function getTableColumnWidths(doc, startLine, endLine) {
  const widths = [];
  for (let number = startLine; number <= endLine; number++) {
    const line = doc.line(number);
    const parsed = parsePipeRow(line);
    if (!parsed || isTableSeparatorRow(line.text, parsed.cells)) continue;

    parsed.cells.forEach((cell, index) => {
      const text = doc.sliceString(cell.from, cell.to);
      const width = Math.max(8, Math.min(40, Array.from(text).length + 2));
      widths[index] = Math.max(widths[index] || 8, width);
    });
  }
  return widths;
}
```

In the `node.name === 'Table'` case, calculate the widths once for that table:

```js
const columnWidths = getTableColumnWidths(
  view.state.doc,
  startLine.number,
  endLine.number
);
```

Change the cell loop to include its column index and set the same width for that column in every row:

```js
for (let column = 0; column < parsed.cells.length; column++) {
  const cell = parsed.cells[column];
  const widthCh = columnWidths[column] || 8;
  if (cell.from < cell.to) {
    builder.push(Decoration.mark({
      class: isHeader
        ? 'cm-table-cell cm-table-header-cell'
        : 'cm-table-cell',
      attributes: { style: `width:${widthCh}ch;` }
    }).range(cell.from, cell.to));
  }
}
```

In `web/index.html`, update `.cm-content .cm-table-cell` to include the missing horizontal rule:

```css
.cm-content .cm-table-cell {
  display: inline-block;
  box-sizing: border-box;
  vertical-align: top;
  min-width: 8ch;
  padding: var(--table-cell-padding, 8px) !important;
  border-right: var(--table-border-width, 1px)
    var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
  border-bottom: var(--table-border-width, 1px)
    var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
  color: var(--table-cell-color, var(--text-color, #ffffff)) !important;
  background: var(--table-cell-bg, transparent) !important;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cm-content .cm-table-header-cell {
  border-top: var(--table-border-width, 1px)
    var(--table-border-style, solid)
    var(--table-border-color, #444444) !important;
  color: var(--table-header-color, var(--text-color, #ffffff)) !important;
  background: var(--table-header-bg, rgba(255, 255, 255, .12)) !important;
  font-weight: var(--table-header-font-weight, 700) !important;
}
```

The Markdown document remains pipe-delimited in CodeMirror; only decorations/style change. Verify empty cells, wrapped cells, escaped pipes, and tables wider than the phone screen. If empty cells have no visible border because the mark range is zero length, handle empty-cell display explicitly without making a second editable DOM table.

## 5. Put every reset icon in one consistent control slot

In `app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt`, replace the current `bindResetButton()` function and add the helpers below. This removes the title reparenting that puts icons in different places. Add `import android.widget.FrameLayout`; keep the existing color-tint code in `applySettingsTheme()`.

```kotlin
private const val RESET_CONTROL_ROW_TAG = "reset_control_row"

fun bindResetButton(holder: PreferenceViewHolder, preference: Preference) {
    val context = preference.context
    val key = preference.key
    val excluded = key == null ||
        key.startsWith("pref_export") ||
        key.startsWith("pref_import") ||
        key == "pref_reset_all_defaults" ||
        key.startsWith("pref_page_") ||
        key.endsWith("_page")

    var button = holder.itemView.findViewById<ImageView>(R.id.btn_reset_widget)
    if (excluded) {
        button?.visibility = View.INVISIBLE
        applySettingsTheme(holder, preference)
        return
    }

    val seekBarRow =
        holder.findViewById(androidx.preference.R.id.seekbar)?.parent as? LinearLayout
    val widgetFrame =
        holder.findViewById(android.R.id.widget_frame) as? ViewGroup
    val targetRow = seekBarRow ?: ensureHorizontalWidgetRow(context, widgetFrame)

    if (targetRow == null) {
        // Do not fall back to moving the title; leave a clear log for the
        // preference layout that failed to supply its standard widget frame.
        android.util.Log.e("PreferenceReset", "No reset slot for preference: $key")
        button?.visibility = View.INVISIBLE
        applySettingsTheme(holder, preference)
        return
    }

    if (button == null) button = createResetButton(context)
    if (button.parent !== targetRow) {
        (button.parent as? ViewGroup)?.removeView(button)
        targetRow.addView(
            button,
            LinearLayout.LayoutParams(dp(context, 40), dp(context, 40)).apply {
                gravity = Gravity.CENTER_VERTICAL
                marginStart = dp(context, 4)
            }
        )
    }

    // Keep the slot present on every setting. Disabled-at-default is visible
    // and understandable; INVISIBLE made users think settings were missing.
    button.visibility = View.VISIBLE
    val modified = isModifiedFromDefault(context, key)
    button.isEnabled = modified
    button.alpha = if (modified) 1f else 0.45f
    button.setOnClickListener {
        if (isModifiedFromDefault(context, key)) {
            resetSinglePreference(context, preference)
        }
    }

    applySettingsTheme(holder, preference)
}

private fun ensureHorizontalWidgetRow(
    context: Context,
    widgetFrame: ViewGroup?
): LinearLayout? {
    if (widgetFrame == null) return null

    val existingRow =
        widgetFrame.findViewWithTag<LinearLayout>(RESET_CONTROL_ROW_TAG)
    if (existingRow != null) return existingRow

    if (widgetFrame is LinearLayout &&
        widgetFrame.orientation == LinearLayout.HORIZONTAL
    ) {
        return widgetFrame
    }

    val oldChildren = (0 until widgetFrame.childCount)
        .map { widgetFrame.getChildAt(it) }
        .filterNot { it.id == R.id.btn_reset_widget }
    widgetFrame.removeAllViews()

    val row = LinearLayout(context).apply {
        tag = RESET_CONTROL_ROW_TAG
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }
    oldChildren.forEach { child ->
        (child.parent as? ViewGroup)?.removeView(child)
        row.addView(
            child,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
    }

    val rowParams = if (widgetFrame is FrameLayout) {
        FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.END or Gravity.CENTER_VERTICAL
        )
    } else {
        ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
    }
    widgetFrame.addView(row, rowParams)
    return row
}

private fun createResetButton(context: Context): ImageView {
    val padding = dp(context, 7)
    val typedValue = TypedValue()
    context.theme.resolveAttribute(
        android.R.attr.selectableItemBackgroundBorderless,
        typedValue,
        true
    )
    return ImageView(context).apply {
        id = R.id.btn_reset_widget
        setImageResource(R.drawable.ic_reset)
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        setPadding(padding, padding, padding, padding)
        isClickable = true
        isFocusable = true
        contentDescription = "Reset setting to default"
        setBackgroundResource(typedValue.resourceId)
    }
}

private fun dp(context: Context, value: Int): Int =
    (value * context.resources.displayMetrics.density).toInt()
```

Keep one **40dp** button on sliders, color pickers, switches, text fields, and lists. Sliders use the seekbar’s own row so reset is after the slider. Other controls use the far end of their horizontal widget row. Do not reparent the title or summary.

In `ResetColorPickerPreference.onBindViewHolder()`, put the preview swatch in the tagged row, not beside it in the outer frame:

```kotlin
val previewHost =
    widgetFrame.findViewWithTag<LinearLayout>(RESET_CONTROL_ROW_TAG)
        ?: widgetFrame as? LinearLayout
if (previewHost != null) {
    // Keep existing swatch creation/update logic, but add/find it in previewHost.
}
```

The button must be appended after the preview swatch. Check reset on slider, color, list, switch, and text preferences; confirm the slot stays fixed when switching between default and modified values.

## 6. Stop forcing scroll on ordinary selection restore

In `CodeMirrorAdapter.setSelectionState()` the current code dispatches `scrollIntoView: true` and then immediately writes `scrollTop`. Those two scroll instructions can fight. Replace that dispatch with:

```js
const hasSavedScroll =
  Number.isFinite(scrollTop) && scrollTop >= 0;

this.view.dispatch({
  selection: { anchor, head },
  scrollIntoView: !hasSavedScroll
});

if (hasSavedScroll) {
  requestAnimationFrame(() => {
    if (this.view) this.view.scrollDOM.scrollTop = scrollTop;
  });
}
```

Apply the saved scroll after the selection transaction has rendered. Do not call this method on each arrow-key movement; selection changes should only be reported to Android, not restored.

## 7. Tests required for this patch

The current table test mostly checks whether function names appear in source. Add behavior tests for:

- `isNodeActive` in WYSIWYG and live preview: marker shows when caret/selection enters it, hides outside it.
- structural field: heading/list/callout classes exist before scrolling them onscreen; typing one character does not rebuild every document line.
- changed-range field: inserting/removing `#`, list marker, `>`, or `[!NOTE]` updates the right lines and leaves neighboring blocks intact.
- table CSS contains bottom borders; column widths are shared by column; Tab/Shift+Tab selects the correct cell; empty cells remain reachable.
- reset row: all resettable control types use the same 40dp slot at the control end; modified settings reset; defaults remain visible but disabled.

Then run:

```sh
cd web
npm test
npm run build
```

Build the Android debug APK with the repo workflow. On the phone, test keyboard movement through a heading, a multi-item list, a quote/callout, and a table; scroll repeatedly across those blocks; confirm tables show both vertical and horizontal borders; and confirm reset icons occupy one consistent position.

Do not report “fixed” based only on a successful build. The user's phone test is the acceptance check for the scrolling, caret, table layout, and Android preference positioning.
