# Jules task: stop editor jumping and stabilize table rendering

**Work on:** the current branch `jules-3492949419147525921-af940c11`, checked at `009c6aa10456ca106d354df7e5ab5c8e14599eaa`. Recheck the branch tip before changing files; do not switch to `main`.

**User report:** the screen flickered briefly and that stopped, but the document still jumps around while scrolling/using the editor. Plain-text documents do **not** jump; the movement is especially noticeable around headings and also happens around formatted items such as lists. The bottom toolbar toggle works now, and Undo-at-empty-history is marked fixed; do not spend this patch redoing either.

## What the current code shows

1. In `web/src/main.js`, `buildDecorations()` walks `view.visibleRanges` and creates line classes only for those ranges. The CSS for `.cm-heading-*` and `.cm-list-item` changes layout metrics such as font size, line height, and margins. When styled lines enter/leave the decorated viewport, those metrics may change measured content height and move the scroll position. This is the leading hypothesis because the user sees no jump in plain text and reports it most around headings/lists; verify it with a focused reproduction.
2. The `Table` syntax node is replaced with `GFMTableWidget`: an HTML table with `contentEditable` cells and add/remove buttons. On cell blur, `updateDoc()` replaces the Markdown table in the CodeMirror document. That document rewrite can disturb selection and scroll anchoring while editing a table.
3. The live-preview plugin rebuilds its decorations on document changes, viewport changes, and selection changes. `CheckboxWidget`, `CodeBlockHeaderWidget`, and `ImagePreviewWidget` do not implement `eq()`. CodeMirror therefore cannot reuse those widget DOM nodes across otherwise unchanged rebuilds, a plausible source of flicker/layout movement.
4. `ListMarkerWidget` and `GFMTableWidget` already implement `eq()`; preserve their behavior unless a test demonstrates a defect.

## Patch goal

Keep the document’s Markdown as the actual editable content. Render tables with line-class and inline-mark decorations rather than replacing the table with a separate content-editable HTML widget. Add reliable cell-to-cell Tab navigation using the existing table parser where possible. Stabilize other unchanged widgets so cursor and scroll updates do not needlessly replace their DOM.

### A. Replace the table widget with decorations

In `livePreviewPlugin.buildDecorations()`:

- Remove the `GFMTableWidget` replacement path for `node.name === 'Table'`; do not create a second editable table or rewrite the whole table on blur.
- Leave the source Markdown in the CodeMirror document. Add line decorations for table rows, header row, separator row, and data rows, for example:

```js
builder.push(
  Decoration.line({
    attributes: { class: 'cm-table-row cm-table-header-row' }
  }).range(line.from)
);
```

- Add narrow `Decoration.mark()` ranges for cell text/pipes only if needed to apply the existing table color, border, and padding settings. Avoid replacing the row text with widgets or changing the document just because a cell lost focus.
- Remove the table renderer’s blur-to-rewrite path and its add/remove buttons from the in-document widget. Do not remove the existing table insertion command.
- Keep all table decorations within `view.visibleRanges`, sorted with the other decorations. Do not scan or rebuild the entire document on every scroll.

### B. Prevent viewport-scoped styling from changing document geometry

- First reproduce the reported jump in a long document with headings/lists and use plain text as the passing baseline. Instrument only viewport range, scroll position, and whether line classes are added/removed; never log document text.
- Make layout-affecting styles for headings and lists stable across viewport changes. Do not solve this by rescanning/parsing the entire large document on every scroll.
- Prefer incremental, document-state-based decorations for classes that change block height, or another CodeMirror-supported approach that keeps document geometry stable. If a metric-changing style must remain viewport-scoped, change it so viewport entry/exit does not alter line/block height.
- Preserve the user’s typography settings; do not “fix” jumping by flattening heading/list font sizes, line heights, or margins.
- Add a regression check that repeatedly scrolls across heading/list boundaries and confirms the same scroll position maps to the same document location before and after viewport updates.

### C. Keep Tab navigation inside table cells

- Reuse `parseTableCells()` / `navigateTableCell()` if they match the actual parser output. If adjustment is needed, recognize unescaped `|` delimiters and skip the Markdown separator row.
- `Tab` selects/moves to the next cell; `Shift+Tab` to the previous cell. At the first/last cell, follow a clear, consistent behavior without selecting the wrong line.
- Outside a table, preserve the app’s existing Tab / Shift+Tab behavior.
- Do not dispatch a document replacement merely to move between cells.

### D. Make unchanged widgets reusable

Add `eq(other)` to each of these classes, comparing every field that affects rendered output or event behavior:

```js
// CheckboxWidget: compare checked, pos, and len.
// CodeBlockHeaderWidget: compare lang and codeText.
// ImagePreviewWidget: compare url and alt.
```

Use the same class/type check pattern already used by `ListMarkerWidget`. Include checkbox `pos` and `len`, because its click handler edits that exact Markdown range. Include code text because the Copy button must copy the current code. Do not add global forced `scrollTop` resets or call `scrollIntoView` on ordinary document/decoration updates.

## Reproduce and verify before marking fixed

1. Treat the plain-text case as the passing baseline. Start with headings/lists because those are where the user notices the jump most. Then compare checkboxes, code blocks, images, and tables. Test slow scrolling, fast flings, tapping to move the caret, and typing. Identify which formatted element first reproduces the jump before changing behavior.
2. For tables, verify the caret and selection stay in the intended cell after Tab/Shift+Tab, editing, and leaving a cell; save/reopen and confirm the Markdown content is preserved.
3. Confirm normal scrolling does not repeatedly destroy/recreate unchanged widget DOM. If jumps remain, add temporary diagnostics that record only scroll position, update type, and widget counts—not document text, filenames, or URIs—and identify the triggering update before adding a workaround.
4. Add regression tests for table cell navigation and the specific jump trigger found. Run `cd web && npm test && npm run build`, then the normal Android build. Report which phone-only checks still need the user’s test.
5. Update `Typography.md` only after the corresponding behavior is verified in the built app. The latest log still says keyboard text selection/navigation is not working; test those paths here rather than assuming the earlier branch fix carries over.

**Do not bundle unrelated settings/reset-icon or footnote work into this patch.** The log still reports those, along with link decoration and code-block label issues; record them as open rather than marking them fixed here. Do not claim all screen jumping is solved unless the phone test confirms it.
