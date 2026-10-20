# Jules handoff: Word-processor tables for W.mdx

## Target

- Repository: https://github.com/cinnabar777/W.mdx
- Branch: jules-3492949419147525921-af940c11
- Continue from the latest Jules branch/build the user tested. The earlier table-grid rollback was commit 289be61f941f955f5557b216ff5cb0617a0f33b7; do not reset later working changes to that commit.
- This is a Jules patch request. Do not edit this repository from Replit and do not create a PR.

## Goal

Replace the fragile line-by-line Markdown table styling with a touch-friendly, word-processor-style table editor. The table stays rendered as a real HTML table while the user reads and edits it. Markdown remains the saved document format behind the table. Do not reveal pipe-table source just because the user taps or enters a cell.

Use the interaction model of Obsidian Structural Tables as a reference, not as a drop-in dependency. It is MIT licensed, but its editor files depend heavily on Obsidian APIs. Do not import the Obsidian plugin wholesale or add its structural-table features that are not listed below.

## Required behavior

1. Render a semantic HTML table with consistent borders, aligned columns, natural text wrapping, and horizontal scrolling only when genuinely needed. Do not use CSS Grid to fake table rows from CodeMirror lines.
2. Replace the complete Markdown table range with a block widget using state-level CodeMirror decorations. Keep table parsing/model/serialization separate from the DOM widget.
3. Preserve the current tested interaction: one touch tap selects/highlights a cell without entering edit mode. A long press on the selected cell opens a contextual action menu; a second tap or explicit Edit Cell action can enter cell editing. Do not switch the whole table to Markdown source. On physical keyboards, selection must not break Tab navigation.
4. Tab commits and moves to the next visible cell; Shift-Tab commits and moves backward. Enter commits and advances to the next row; Shift-Enter inserts a line break; Escape cancels the current draft. Handle Android IME composition and the soft keyboard without losing edits or focus.
5. Save must flush an active cell draft before Android reads Markdown. A stale widget/source snapshot must never overwrite newer document text. If the source range changed while a cell draft was open, preserve the draft and report/retry rather than replacing a guessed range.
6. Preserve existing GFM behavior: header, alignment markers, optional outer pipes, empty cells, escaped pipes, inline formatting, and surrounding Markdown. Opening a table without editing it must not rewrite its source.
7. Support merged cells as a word-processor feature. The rendered model must represent rowSpan and colSpan. Provide touch-accessible Merge and Split actions for rectangular cell selections. Never discard text silently: if a merge covers non-empty cells, preserve their contents in the merged cell (with line breaks) or require an explicit confirmation before applying it.
8. Persist merges in Markdown using the Structural Tables convention only if implemented consistently: a cell containing exactly < merges into the previous cell; a cell containing exactly ^ merges into the cell above; escaped \< and \^ remain literal characters. Parse/serialize and round-trip tests are mandatory. Tell the user this is an extension to ordinary GFM Markdown; other renderers may show those markers unless they support the convention. Do not silently convert unrelated tables to another format.
9. Fix the two table appearance settings still reported broken: border style and border thickness. Border color, header background/text/weight, cell background/text, and cell padding are reported working; preserve those.
10. Keep formulas, calculations, sorting, spreadsheet-style controls, and unrelated typography/toolbar changes out of this patch.

## CodeMirror implementation direction

- Current web/src/main.js already has parsePipeRow, isTableSeparatorRow, tableNavigationKeymap, navigateTableCell, and an unused GFMTableWidget class. Inspect and reuse the sound helpers, but do not activate that widget unchanged: it naively splits on |, locates ranges by lines starting with |, rewrites the whole table, and resets alignment markers.
- The current livePreviewPlugin Table branch styles each Markdown line and hides pipes. Remove/disable only that table-specific inline-decoration branch when the new widget is active, so it cannot overlap with the table replacement. Preserve all other Live Preview features.
- Add a dedicated table StateField whose value is the table block DecorationSet. Rebuild on document changes and relevant table-view effects; avoid recomputing the whole document unnecessarily. Use the block widget/replacement pattern: an anchored Decoration.widget({ widget, block: true, side: -1 }) plus a Decoration.replace({ block: true }) over the table’s exact source range. Skip child inline decorations inside the replaced table.
- The widget should build <table>, <thead>, <tbody>, <tr>, <th>, and <td> from a validated table model. Use real rowSpan and colSpan for merged cells; derive borders from table settings, not per-line pseudo-cells.
- Wire border style and thickness settings to the actual table cell border CSS. Verify the controls change visible table borders at runtime; preserve the already-working border color and other table appearance settings.
- Keep the Markdown document as the single source of truth. On cell commit, verify the expected table source/range still matches, then apply one precise transaction and restore focus/selection to the intended next cell. Preserve alignment and newline convention.
- Reuse the existing table Tab keymap for CodeMirror source navigation, and add equivalent navigation inside the active cell editor. Do not let the widget swallow Tab/Shift-Tab, IME, selection, or Android keyboard events.
- Preserve the selected-cell highlight on a single tap. Add a touch-duration-aware long-press handler on the selected cell for the context menu; cancel it on movement, scroll, pointer cancellation, or release. Do not let long-press prevent scrolling or accidentally enter edit mode.
- The Structural Tables reference uses an overlay textarea for cell editing and a renderer for cell content. Adapt the useful interaction pattern, but use W.mdx’s existing safe Markdown rendering; do not insert unsanitized HTML from document text.

## Scope of files

Likely touch only:

- web/src/main.js (or a small new table module imported from it): table model/widget, state decorations, cell editing, merge/split actions, safe commit and focus restoration.
- web/index.html: remove obsolete .cm-table-row/.cm-table-cell line-layout rules; add styles scoped to the new HTML table widget and active-cell overlay.
- web/test/: replace source-string-only table checks with parser/serializer and navigation tests. Add tests for merge/split and lossless round trips.

Do not touch unrelated toolbar, typography, scrolling, file routing, or editor behavior.

## Required tests

Run cd web && npm test and cd web && npm run build.

Add automated tests for:

- optional outer pipes, escaped pipes, empty cells, alignment markers, uneven rows, and normal tables;
- parse → serialize → parse preserving values, alignments, and exact merge spans;
- horizontal, vertical, and rectangular merge/split; literal escaped < and ^;
- one tap selects without editing; long press opens actions; movement/scroll cancels long press;
- Tab and Shift-Tab at first/middle/last cells, skipping covered merged cells and not trapping the cursor;
- a cell draft being flushed before getMarkdown/native save, and stale source refusing to overwrite newer edits;
- opening a table without editing does not mark the document dirty or rewrite its Markdown.
- border style and thickness settings visibly update the rendered borders; existing working appearance settings remain intact.

## Manual Android acceptance checklist

- Open a normal table: it is visibly a table, with no pipes or separator dashes, and no missing/misaligned borders.
- Tap once to highlight a cell; long-press it to open actions; use the separate edit action to edit with the Android keyboard. The table remains rendered, the edit saves, and reopening the document preserves it.
- Use a hardware keyboard if available: Tab and Shift-Tab move cell-to-cell; no source mode is exposed.
- Merge and split cells by touch-accessible controls; content is preserved and the result survives save/reopen.
- Verify border style and thickness settings now work; confirm the already-working border color, header colors/weight, cell colors, and padding still work.
- Test escaped pipes, empty cells, long wrapping text, header alignment, and a table inside a list/blockquote if supported.

Before calling this done, report the exact files changed, automated test/build results, any unsupported Markdown constructs, and any physical-device behavior that still needs the user’s test. Do not claim Android behavior is verified from desktop tests.
