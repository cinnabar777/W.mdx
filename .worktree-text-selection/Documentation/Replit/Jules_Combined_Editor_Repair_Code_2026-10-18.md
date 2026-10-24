# Jules: combined CodeMirror editor repair

**Purpose:** Apply this as one combined repair pass on the current Jules working branch. Keep the fixes in separate logical commits within that session so a regression can be backed out without losing the other work.

**Starting point checked:** `jules-3492949419147525921-af940c11` at `e542a3ccb4d7e1c9db3d615a10e7083dbc315a8d`. Recheck the branch tip first; do not change `main`.

**Important:** Replit has not modified the app code or pushed a commit. This is implementation guidance for Jules to apply. Keep the working toolbar toggle and empty-history Undo behavior.

## 1. Restore usable tables without bringing back the old cursor trap

### What is broken in the current build

The current `Table` branch in `web/src/main.js` only adds row classes. It leaves the pipe-delimited Markdown visible and does not render individual cells. The old `GFMTableWidget` class is still in the file, but the table path no longer uses it. The current tests only check that widget `eq()` and table-navigation code exist; they do not test rendered tables.

### Required behavior

- Keep Markdown as the one source of truth in CodeMirror. No second `contentEditable` table, no full-table rewrite on blur.
- Render each table row and cell using CodeMirror line/mark decorations. Apply row classes for header/data/separator styling and a mark for each cell.
- Hide pipe characters and the separator syntax in WYSIWYG when the caret is outside the active table row. Reveal the raw syntax for the active row so it remains easy to edit. Do not change the document when hiding/showing syntax.
- Preserve click-to-place-caret, text selection, typing, copy/paste, save/reopen, and horizontal scrolling.
- Keep existing `Tab`/`Shift+Tab` navigation, but make it work for optional leading/trailing pipes and escaped pipes. Skip the separator row. Outside a table, let the normal Tab behavior run.

### Add robust pipe-row parsing

Replace the current `parseTableCells()` pipe scan with a helper that handles escaped pipes and optional outer pipes. Keep offsets in document coordinates:

```js
function isEscapedPipe(text, index) {
  if (text[index] !== '|') return false;
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function parsePipeRow(line) {
  const text = line.text;
  const pipeOffsets = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && !isEscapedPipe(text, i)) pipeOffsets.push(i);
  }
  if (pipeOffsets.length === 0) return null;

  const hasLeadingPipe = /^\s*\|/.test(text);
  const hasTrailingPipe = /\|\s*$/.test(text);
  const firstCellStart = hasLeadingPipe ? pipeOffsets[0] + 1 : 0;
  const lastCellEnd = hasTrailingPipe
    ? pipeOffsets[pipeOffsets.length - 1]
    : text.length;

  const internalPipes = pipeOffsets.filter((offset, i) =>
    !(hasLeadingPipe && i === 0) &&
    !(hasTrailingPipe && i === pipeOffsets.length - 1)
  );

  const cells = [];
  let cellStart = firstCellStart;
  for (const pipe of internalPipes) {
    cells.push(trimCellRange(text, cellStart, pipe, line.from));
    cellStart = pipe + 1;
  }
  if (lastCellEnd >= cellStart) {
    cells.push(trimCellRange(text, cellStart, lastCellEnd, line.from));
  }

  return {
    pipes: pipeOffsets.map(offset => line.from + offset),
    cells: cells.filter(cell => cell.from <= cell.to)
  };
}

function trimCellRange(text, start, end, lineFrom) {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end, from: lineFrom + start, to: lineFrom + end };
}

```

When using `isTableSeparatorRow`, use the local `start`/`end` fields returned by `trimCellRange`, not the global document offsets:

```js
function isTableSeparatorRow(text, parsedCells) {
  return parsedCells.length > 0 &&
    parsedCells.every(({ start, end }) =>
      /^:?-{3,}:?$/.test(text.slice(start, end).trim())
    );
}
```

Add tests for:

- `| a | b |`, `a | b`, and `| a | b`
- `a \\| b` (escaped pipe inside a cell)
- left/center/right separator markers such as `:---`, `:---:`, `---:`
- empty cells and whitespace around cell text

### Apply cell and row decorations

In the `node.name === 'Table'` case:

1. Walk that table’s lines, classify header/data/separator rows, and call the row-class helper.
2. For non-separator cells, add a `Decoration.mark({ class: 'cm-table-cell' })` over each parsed cell range. Add `cm-table-header-cell` to header cells.
3. Hide each pipe with `Decoration.replace({}).range(pipePos, pipePos + 1)` only when the row is not active. Hide the separator row’s Markdown syntax without deleting it from the document.
4. Keep all ranges sorted and non-overlapping. Table marks must never consume text ranges containing another cell’s pipe.

Example CSS starter for the inline cell marks:

```css
.cm-content .cm-table-cell {
  display: inline-block;
  box-sizing: border-box;
  vertical-align: top;
  padding: var(--table-cell-padding, 8px);
  border-right: var(--table-border-width, 1px)
    var(--table-border-style, solid)
    var(--table-border-color, #444);
  color: var(--table-cell-color, var(--text-color, #fff));
  background: var(--table-cell-bg, transparent);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cm-content .cm-table-header-cell {
  color: var(--table-header-color, var(--text-color, #fff));
  background: var(--table-header-bg, rgba(255, 255, 255, .12));
  font-weight: var(--table-header-font-weight, 700);
}
```

This is only a starting style: ensure column widths line up across rows. Calculate widths within the current table block and apply the same width per column; do not rescan the entire document on every scroll. If cell widths cannot be made to align while preserving CodeMirror caret/selection behavior, do not call the table renderer complete—use a CodeMirror-managed table widget that maps clicks back to document offsets, not a separate editable HTML table.

### Fix cell navigation

Refactor `parseTableCells()` to consume the same `parsePipeRow()` result used for rendering. `navigateTableCell()` must:

- Move to the next/previous real cell and select its text.
- Not navigate when the caret is outside a table.
- Not choose a nearest cell when parsing failed; return `false` so normal Tab behavior can run.
- Keep the caret in the right document position when the active row reveals syntax.
- Avoid extra `scrollIntoView` except when the chosen next/previous cell is actually outside the viewport.

## 2. Fix heading/list scroll jumps and related cursor movement

### Current evidence

`livePreviewPlugin.update()` rebuilds decorations on `viewportChanged`, `selectionSet`, and `docChanged`. `buildDecorations()` walks `view.visibleRanges`, then adds heading and list line classes there. Those classes activate CSS that changes font size, line height, margins, and indentation. The user reports no jump in plain text, but frequent jumps around headings and lists.

### Required implementation

- Reproduce first with a long plain-text document (passing baseline), then with headings and lists.
- Make layout-affecting heading/list decoration stable when lines enter or leave the viewport. Do not “fix” this by removing the user’s sizes, margins, font settings, or line-height settings.
- Do not parse the entire document on every scroll or every keystroke. Use a CodeMirror `StateField`/mapped decoration set or another incremental approach: classify changed blocks after document edits, map unaffected decorations through the transaction, and keep paint-only viewport decorations separate.
- Do not set `scrollTop` repeatedly or force `scrollIntoView` during ordinary render/selection updates.
- Add a debug-only measurement that logs scroll position, viewport range, and layout-decoration counts only. Never log document text, filenames, or URIs.

Suggested shape (the helper must be implemented incrementally; do not paste a full-document rebuild into every transaction):

```js
const structuralLayoutField = StateField.define({
  create(state) {
    return buildInitialLayoutDecorations(state);
  },
  update(current, tr) {
    if (!tr.docChanged) return current.map(tr.changes);
    return updateChangedLayoutRanges(current, tr);
  },
  provide: field => EditorView.decorations.from(field)
});
```

`buildInitialLayoutDecorations` and `updateChangedLayoutRanges` must preserve heading/list metrics outside the viewport without making large-document editing slower. The regression test should repeatedly cross heading/list boundaries and verify that the same document position does not jump as viewport decorations update.

### Preserve text selection and keyboard navigation

Test and repair in the same pass because the failures use the same decorations and document offsets:

- Tap and drag-select across heading text, links, list markers, checkboxes, table cells, and code blocks.
- Arrow-key through the same elements without skipping over or trapping at hidden Markdown syntax.
- Verify the selection anchor/head stays mapped after revealing syntax in the active element.
- Keep `setSelectionState()` from scrolling unexpectedly when the selection is already visible; only scroll when needed.

## 3. Keep widget DOM stable

The latest commit already added `eq()` to `CheckboxWidget`, `CodeBlockHeaderWidget`, and `ImagePreviewWidget`. Keep those checks and the `ListMarkerWidget` check. Do not remove or weaken them while changing table rendering.

## 4. Prevent paragraph typography from leaking into lists

The user reports that paragraph font, letter spacing, and top margin still affect list items. `Paragraph` decorations can coexist on list lines, so explicitly exclude list lines from paragraph-only rules and provide list-specific fallback values:

```css
.cm-content .cm-paragraph:not(.cm-list-item) {
  font-size: var(--body-font-size, 16px) !important;
  font-family: var(--body-font-family, inherit) !important;
  text-align: var(--paragraph-align, left) !important;
  letter-spacing: var(--paragraph-letter-spacing, 0px) !important;
  line-height: var(--paragraph-line-height, 1.6) !important;
}

.cm-content .cm-paragraph-first:not(.cm-list-item) {
  text-indent: var(--paragraph-indent, 0px) !important;
  margin-top: var(--paragraph-margin-top, 0px) !important;
}

.cm-content .cm-paragraph-last:not(.cm-list-item) {
  margin-bottom: var(--paragraph-margin-bottom, 8px) !important;
}

.cm-content .cm-list-item {
  font-size: var(--list-font-size, 16px) !important;
  font-family: var(--list-font-family, inherit) !important;
  letter-spacing: var(--list-letter-spacing, normal) !important;
  text-indent: 0 !important;
  margin-top: 0 !important;
  margin-left: var(--list-left-indent, 24px) !important;
  margin-bottom: var(--list-item-spacing, 4px) !important;
  line-height: var(--list-line-height, 1.5) !important;
}
```

Check the actual CodeMirror line DOM/classes before using `:not(.cm-list-item)`; if the two classes are placed on separate nested elements, add a reliable list-paragraph class in the decoration builder and target that. Verify paragraph-only size, letter spacing, and margins change paragraphs but not lists.

## 5. Make reset icons consistent in the same settings pass

Current `ResetPreferences.kt` inserts reset icons in different parents; normal controls use 32dp while sliders use 48dp. This causes inconsistent size/placement and some reset buttons are difficult to align.

- Use one fixed reset slot at the far right of every resettable preference row, including slider and color preferences. Reserve the slot when the reset icon is `INVISIBLE`, so the row never shifts.
- Draw one consistent medium-size reset glyph in every slot; keep a comfortable Android touch target.
- Remove the special “insert beside title” and “change to 48dp only for slider” branches. Do not let the reset view overlap title or summary.
- Keep the color swatch visible in its own control slot and keep reset at the far right.
- Rebind recycled preference rows correctly; reset should only be visible/clickable when the stored setting differs from its default.
- Test reset on a slider, color picker, list, switch, and text preference. Confirm tapping reset restores the exact default and does not open the preference itself accidentally.

## 6. Other open items to keep visible

The latest user test log still reports these. Fix what is a small, well-bounded extension of the current patch; do not claim unfinished items are fixed:

- Link underline/decoration preference does not work in the app test; verify the actual setting changes and link styles in WYSIWYG.
- WYSIWYG link insertion needs a URL-entry popup because the Markdown URL syntax is hidden.
- Code-block language/copy label appears only when the caret is inside the block; label/copy background, text, and border color preferences are still not working; a code-block text background color is requested.
- Footnote styling/settings do not work and footnote settings lack reset buttons. This likely requires actual footnote parsing/rendering, not just CSS.
- Callouts are not functional yet.
- Divider width needs centering or an offset.
- Checkbox unchecked background, hiding the bullet before a checkbox / proper `[ ]` display, checkmark color, and list continuation indentation remain open.

Footnotes and callouts may need a distinct parser/plugin feature; do not add fake CSS-only settings and mark them done.

## 7. Required verification before the next phone build

- `cd web && npm test && npm run build`
- Build the Android APK using the normal GitHub Actions workflow.
- The web tests must exercise behavior rather than only assert that function/class names exist. At minimum: table row/cell parse cases; cell navigation; active-row syntax reveal; stable selection; heading/list viewport crossing.
- On the phone: confirm tables visibly render and remain editable/selectable; save/reopen a table; scroll across headings/lists; test keyboard movement and selection; change/reset a slider and a color setting.
- Keep the latest known-good Jules branch checkpoint. If one area fails, revert only that area rather than losing the whole batch.
- Update `Typography.md` only after behavior is verified in the built app.

