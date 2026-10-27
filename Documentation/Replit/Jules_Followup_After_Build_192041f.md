# Jules follow-up after build `192041f`

**Target branch:** `jules-3492949419147525921-af940c11`  
**Latest source checked:** `192041f72bb22ec3c84d319cbda2aa22ac601d4c`  
**User-tested results:** table improved, but header-to-body transition still looks wrong; scrolling may be slightly better but still jumps at some elements; general keyboard navigation did not improve.

Keep this as one focused Jules session/commit. Do not change the toolbar or the reset icon's agreed shape, 40dp size, position, or dim/active coloring.

## What is already fixed in this branch

- Reset controls now include the five export settings; their defaults and the previously missing status-bar, editor-mode, hotkey, and footnote defaults are in `getDefaultValue()`.
- The general `Tab` table-cell handler now moves a collapsed caret instead of selecting the entire target cell.
- Table cells are decorated across their full ranges, including whitespace and empty cells.
- In Pure WYSIWYG, syntax markers stay hidden as the caret moves.

Do not redo these changes. The icon behavior is finally in the agreed position and size. Keep page-navigation rows and backup/import actions excluded from reset controls.

## 1. Remove the full-height blank Markdown table separator line

The separator text (`|---|---|`) is hidden with `Decoration.replace`, but its CodeMirror line remains in the document at normal line height. The header cell already has a bottom border. Collapse the now-empty separator line to zero height so the first data row sits directly under the header.

In `web/index.html`, replace the current `.cm-table-sep-row` rule with:

```css
.cm-content .cm-line.cm-table-sep-row {
  font-size: 0 !important;
  line-height: 0 !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
}
```

Do not use `display: none`; CodeMirror still needs the line in its document/position map. In Source mode the rich-preview plugin returns `Decoration.none`, so the separator stays visible and normal there. Keep the header cell's existing bottom border; it becomes the single divider between header and body.

## 2. Stop selection changes from scrolling the document through the TOC

`EditorView.updateListener` calls `updateTocActiveSection()` for every selection change. That function calls:

```js
activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
```

This uses generic DOM scrolling on every cursor move and can scroll an ancestor other than the TOC. Update the active row as before, but only adjust the TOC's own scroll position when the TOC panel is open. Do not smooth-scroll the page/editor in response to caret movement.

At the end of `updateTocActiveSection()`, replace the current `activeRow.scrollIntoView(...)` block with:

```js
if (activeRow) {
  activeRow.classList.add('active-section');

  const panel = document.querySelector('#toc-panel');
  if (!panel?.classList.contains('open')) return;

  const containerRect = tocContent.getBoundingClientRect();
  const rowRect = activeRow.getBoundingClientRect();
  if (containerRect.height <= 0 || rowRect.height <= 0) return;

  if (rowRect.top < containerRect.top) {
    tocContent.scrollTop -= containerRect.top - rowRect.top;
  } else if (rowRect.bottom > containerRect.bottom) {
    tocContent.scrollTop += rowRect.bottom - containerRect.bottom;
  }
}
```

This keeps automatic following inside `#toc-content` and removes the smooth-scroll animation from editor navigation. The active TOC row should still update when the panel is closed; it simply must not trigger scrolling then.

## 3. Match the proven CodeMirror line-decoration approach; remove the duplicate raw-regex layout field

The reference branch `ckeditor5/Wmd-V0.2-13424438593115341489-8007187214692561893` uses CodeMirror's syntax tree and visible ranges for heading and blockquote line classes. The current Wmdx branch adds a second `persistentLayoutField` that scans raw document lines for heading/list/quote/callout prefixes and is installed on the entire document. That means Markdown-looking lines inside fenced code can receive heading/list/callout layout classes, and every initial editor state scans the whole document. The known-good branch does not have this field.

Move the structural line classes into the existing `livePreviewPlugin.buildDecorations()` tree walk, which already runs over `view.visibleRanges`, and remove `persistentLayoutField` from the extensions. Use CodeMirror syntax nodes so code-block contents do not get mistaken for Markdown headings/lists.

First, make the existing line-class helper accept multiple classes:

```js
const addLineClass = (lineFrom, ...classNames) => {
  if (!lineClasses.has(lineFrom)) lineClasses.set(lineFrom, new Set());
  for (const className of classNames) {
    lineClasses.get(lineFrom).add(className);
  }
};
```

Inside `tree.iterate({ ..., enter: (node) => { ... } })`, after `const line = ...`, add:

```js
if (node.name.startsWith('ATXHeading')) {
  const level = node.name.slice('ATXHeading'.length);
  addLineClass(line.from, 'cm-heading', `cm-heading-${level}`);
}

if (node.name === 'ListMark') {
  addLineClass(line.from, 'cm-list-item');
}

if (node.name === 'Blockquote') {
  const firstLine = view.state.doc.lineAt(node.from).number;
  const lastLine = view.state.doc.lineAt(node.to).number;
  let calloutType = '';

  for (let number = firstLine; number <= lastLine; number++) {
    const quoteLine = view.state.doc.line(number);
    const isQuote = /^ {0,3}>/.test(quoteLine.text);
    if (!isQuote) {
      calloutType = '';
      continue;
    }

    const marker = quoteLine.text.match(
      /^ {0,3}>\s*\[!([A-Za-z]+)\](?:[+-])?/
    );
    if (marker) calloutType = marker[1].toLowerCase();

    // A ViewPlugin must only emit line decorations in the current visible range.
    const isVisible = view.visibleRanges.some(
      range => quoteLine.from >= range.from && quoteLine.from <= range.to
    );
    if (!isVisible) continue;

    addLineClass(quoteLine.from, 'cm-blockquote');
    if (calloutType) {
      addLineClass(quoteLine.from, 'cm-callout', `cm-callout-${calloutType}`);
    }
    if (marker) addLineClass(quoteLine.from, 'cm-callout-title');
  }
}
```

Then:

1. Delete `isQuoteLine`, `expandQuoteRun`, `structuralRangesForLines`, `mergeLineRanges`, `changedStructuralRanges`, `buildInitialStructuralDecorations`, and `persistentLayoutField` if they have no other callers.
2. Remove `persistentLayoutField` from `EditorState.create({ extensions: [...] })`.
3. Keep the existing final loop that converts `lineClasses` entries into `Decoration.line(...)`.
4. Update tests that currently assert `structuralRangesForLines` and `changedStructuralRanges` exist. Test the rendered behavior instead: headings/lists/quotes get their classes; fenced code lines containing `# heading`, `- item`, or `> quote` do not get structural classes.

Do not add a guessed fixed “50 rendered lines” limit. I could not find a 50-line cap or `viewportMargin` setting in the latest branch source; the editor is created with `{ state, parent }` and the plugin uses CodeMirror's `visibleRanges`. If Jules changed a separate build setting, identify its exact source and verify it is actually in this commit before tuning it further.

## Regression checks

Run existing tests and add focused behavior checks for:

1. Header row sits immediately above the first body row; no blank-height separator gap. The header/body divider remains visible, including when cells are empty.
2. In Pure WYSIWYG, arrow-key/caret navigation across headings, list items, and callouts does not jump the editor or reveal raw markers.
3. Moving the caret updates the active TOC item but does not scroll the main editor or page. When the TOC panel is open, only its own content scrolls to the active item.
4. Markdown-looking lines inside fenced code do not receive heading/list/callout styles.
5. Tab and Shift+Tab still move a collapsed caret through non-separator table cells; the current reset controls remain in the right position, correct size, and bright only when active.

Build and test the APK after the single commit. Treat the scroll/navigation diagnosis as source-supported but not device-confirmed; do not claim it is fixed until the user tests it.
