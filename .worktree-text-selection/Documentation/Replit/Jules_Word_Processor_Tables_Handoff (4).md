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
3. Preserve the current tested cell highlight. One tap selects/highlights the cell; a second tap enters text editing. A long press on the selected cell opens the structural action menu. Do not put Edit Cell in that menu: ordinary tapping is the edit path. The long-press menu includes Delete Row, Delete Column, Merge with Left/Right/Up/Down neighbor when valid, and Split Cell. Put Split Cell in this menu even if a separate split icon/control also exists; dim and disable the menu action unless the selected cell is actually merged and can be split. Menu actions retain the selected cell and never switch the whole table to Markdown source. On physical keyboards, selection must not break Tab navigation.
4. The latest phone test reports the long-press menu is good. Preserve that behavior and keep it visible at table/screen edges and with the keyboard open. Render it in an overlay layer outside the table’s overflow container; position it relative to the selected cell, flip above/below as needed, and clamp it to the visible viewport including Android safe areas and the on-screen keyboard.
5. Tab commits and moves to the next visible cell; Shift-Tab commits and moves backward. Enter commits and advances to the next row; Shift-Enter inserts a line break; Escape cancels the current draft. Handle Android IME composition and the soft keyboard without losing edits or focus.
6. Save must flush an active cell draft before Android reads Markdown. A stale widget/source snapshot must never overwrite newer document text. If the source range changed while a cell draft was open, preserve the draft and report/retry rather than replacing a guessed range.
7. Preserve existing GFM behavior: header, alignment markers, optional outer pipes, empty cells, escaped pipes, inline formatting, and surrounding Markdown. Opening a table without editing it must not rewrite its source.
8. Support merged cells as a word-processor feature. The rendered model must represent rowSpan and colSpan. Provide touch-accessible Merge and Split actions for rectangular cell selections. Never discard text silently: if a merge covers non-empty cells, preserve their contents in the merged cell (with line breaks) or require an explicit confirmation before applying it.
9. Persist merges in Markdown using the Structural Tables convention only if implemented consistently: a cell containing exactly < merges into the previous cell; a cell containing exactly ^ merges into the cell above; escaped \< and \^ remain literal characters. Parse/serialize and round-trip tests are mandatory. Tell the user this is an extension to ordinary GFM Markdown; other renderers may show those markers unless they support the convention. Do not silently convert unrelated tables to another format.
10. Preserve all table appearance settings. The latest phone test reports border style and border thickness now working; border color, header background/text/weight, cell background/text, and cell padding were already working. Keep regression coverage for all of them.
11. Keep formulas, calculations, sorting, spreadsheet-style controls, and unrelated typography/toolbar changes out of this patch. The additional settings work in scope is the inactive reset-icon color, dedicated Cursor & Selection page, and table-menu colors on the table typography page.
12. Add a separate inactive reset-icon tint preference alongside the existing active reset-icon color. Keep the reset icon visible and the current working size/placement. Show the inactive tint when a preference is already at its default; show the existing active tint when Reset would change the preference. Use the same default/reset logic as the reset action itself, including custom colors, sliders, lists, and font preferences.
13. The latest phone test found the Cursor & Selection page has only three controls—cursor color, selection drag-handle color, and cursor blink—and none currently affect the editor. Wire all three to visible runtime behavior.
14. Add separate settings for selected-text highlight background color and selected-text foreground color. They must change the selection users see in CodeMirror, not just generic browser text selection.
15. Add the missing magnifier size and position controls to Cursor & Selection. Implement real Android/WebView behavior for them; do not omit the settings or ship inert controls.
16. Verify which cursor/selection visuals are controlled by CodeMirror CSS and which are controlled by Android WebView/system UI. Use CSS variables for app-owned caret/selection styling and a real Android-side integration for the magnifier if required.
17. Add table action-menu color controls to the existing table typography page, separate from table cell/header colors. Include menu background, action-item background, label/text, disabled-item, and pressed/selected-state colors. Apply them to the long-press menu only, provide working defaults/reset, and include the preferences in backup/import.

## CodeMirror implementation direction

- Current web/src/main.js already has parsePipeRow, isTableSeparatorRow, tableNavigationKeymap, navigateTableCell, and an unused GFMTableWidget class. Inspect and reuse the sound helpers, but do not activate that widget unchanged: it naively splits on |, locates ranges by lines starting with |, rewrites the whole table, and resets alignment markers.
- The current livePreviewPlugin Table branch styles each Markdown line and hides pipes. Remove/disable only that table-specific inline-decoration branch when the new widget is active, so it cannot overlap with the table replacement. Preserve all other Live Preview features.
- Add a dedicated table StateField whose value is the table block DecorationSet. Rebuild on document changes and relevant table-view effects; avoid recomputing the whole document unnecessarily. Use the block widget/replacement pattern: an anchored Decoration.widget({ widget, block: true, side: -1 }) plus a Decoration.replace({ block: true }) over the table’s exact source range. Skip child inline decorations inside the replaced table.
- The widget should build <table>, <thead>, <tbody>, <tr>, <th>, and <td> from a validated table model. Use real rowSpan and colSpan for merged cells; derive borders from table settings, not per-line pseudo-cells.
- Keep border style, border thickness, border color, header background/text/weight, cell background/text, and cell padding wired to the rendered table. The current phone build looks good; preserve this appearance while replacing the renderer.
- Put Split Cell in the long-press action menu as well as any existing split icon/control. It is enabled only when the selected cell is merged and splittable; otherwise visibly dim it and prevent activation.
- Add independent long-press menu color variables/settings on the table typography page: menu surface, action surface, label/text, disabled action, and pressed/selected action. Do not reuse cell or header colors. Verify contrast in both active and disabled states.
- Current code already sets --cursor-color, --selection-handle-color, and --cursor-blink-rate from preferences, but the CodeMirror theme hard-codes the caret to --text-color with !important. The handle/blink variables have no effective styling. Replace those hard-coded overrides with the preference variables and ensure blink-rate changes the actual CodeMirror cursor-layer animation.
- The current generic ::selection rule hard-codes blue/white, and there is no separate selected-text background/foreground preference. Add both settings and apply them to CodeMirror’s selection layer as well as any native DOM text selection path.
- The current Cursor & Selection XML has no magnifier settings. Add size/position controls and connect them to an Android/WebView magnifier implementation; confirm visually on device.
- Keep the Markdown document as the single source of truth. On cell commit, verify the expected table source/range still matches, then apply one precise transaction and restore focus/selection to the intended next cell. Preserve alignment and newline convention.
- Reuse the existing table Tab keymap for CodeMirror source navigation, and add equivalent navigation inside the active cell editor. Do not let the widget swallow Tab/Shift-Tab, IME, selection, or Android keyboard events.
- Preserve the selected-cell highlight on one tap, enter text editing on a second tap, and open structural actions only after the long-press threshold while the pointer remains down. Before activation, cancel on movement beyond touch slop, scroll, pointer cancellation, or early release; after activation, pointer release must not dismiss the menu. Long press must not interfere with normal scrolling. Dismiss the menu safely without losing the selected-cell target.
- Render the action menu in an unclipped overlay outside table overflow containers. Reposition it above/below and within viewport bounds when the selected cell is near a table or screen edge, and when the keyboard opens.
- The Structural Tables reference uses an overlay textarea for cell editing and a renderer for cell content. Adapt the useful interaction pattern, but use W.mdx’s existing safe Markdown rendering; do not insert unsanitized HTML from document text.
- Add the inactive reset tint to the Settings Theme & Custom Colors page and wire it to reset-widget binding without changing current active tint behavior.
- Add a Cursor & Selection entry to the Styling & Typography page, with a dedicated preference screen/fragment and real JS/native application paths. Add its preference keys to default/reset and settings backup/import flows.

## Scope of files

Likely touch only:

- web/src/main.js (or a small new table module imported from it): table model/widget, state decorations, cell editing, merge/split actions, safe commit and focus restoration.
- web/index.html: remove obsolete .cm-table-row/.cm-table-cell line-layout rules; add styles scoped to the new HTML table widget and active-cell overlay.
- web/test/: replace source-string-only table checks with parser/serializer and navigation tests. Add tests for merge/split and lossless round trips.
- app/src/main/res/xml/preferences_settings_theme.xml and ResetPreferences.kt: add inactive reset tint and determine default-vs-custom state consistently with reset behavior.
- app/src/main/res/xml/preferences_styling.xml, a new Cursor & Selection preference XML, and SettingsActivity.kt: add the dedicated typography subpage and route/title.
- app/src/main/res/xml/preferences_styling_cursor.xml: add selected-text colors and magnifier size/position alongside the existing three controls.
- The existing table typography preference XML/page and its preference application path: add the long-press menu color controls, defaults/reset, and backup/import wiring.
- app/src/main/java/.../MainActivity.kt and web/src/main.js: apply cursor/selection values and implement native magnifier behavior; keep platform code bounded to these controls.

Do not touch unrelated toolbar, typography, scrolling, file routing, or editor behavior.

## Required tests

Run cd web && npm test and cd web && npm run build.

Add automated tests for:

- optional outer pipes, escaped pipes, empty cells, alignment markers, uneven rows, and normal tables;
- parse → serialize → parse preserving values, alignments, and exact merge spans;
- horizontal, vertical, and rectangular merge/split; literal escaped < and ^;
- one tap selects without opening the menu; a second tap enters edit mode; only a sustained long press opens structural actions; a short tap never does;
- the menu remains fully visible for cells in the first/last rows, at either horizontal edge, and when the keyboard is visible;
- Delete Row/Column, directional Merge, and Split actions target the selected cell and preserve content/undo;
- Split Cell is present in the long-press menu, enabled for a merged cell, and dimmed/disabled for an ordinary cell; no other split control is required to open the menu.
- Tab and Shift-Tab at first/middle/last cells, skipping covered merged cells and not trapping the cursor;
- a cell draft being flushed before getMarkdown/native save, and stale source refusing to overwrite newer edits;
- opening a table without editing does not mark the document dirty or rewrite its Markdown.
- all table appearance settings, including border style and thickness, visibly work and remain intact.
- Long-press menu colors are independently configurable on the table typography page; changing them does not recolor the table cells or headers.
- reset icons use the inactive color at defaults and the active color when a reset would change a value; resetting updates the icon state immediately.
- Cursor color, selection-handle color, blink rate, selected-text background, and selected-text foreground all visibly change their named editor behavior.
- Magnifier size and position controls appear on the Cursor & Selection page and visibly affect the Android magnifier; do not count the page title or stored preferences as implementation.

## Manual Android acceptance checklist

- Open a normal table: it is visibly a table, with no pipes or separator dashes, and no missing/misaligned borders.
- Tap once to highlight a cell, tap it again to edit, and long-press it for structural actions. Test Delete Row, Delete Column, Merge in each valid direction, and Split Cell. The table remains rendered, edits save, and reopening the document preserves them.
- Confirm Split Cell appears in the long-press menu; it is bright/actionable on a merged cell and dimmed/unavailable on an unmerged cell. Confirm the menu color settings on the table typography page affect the menu without changing table styling.
- Long-press a cell near the table’s bottom edge and at the bottom of the screen; the menu must flip/reposition rather than being clipped. Repeat with the keyboard open.
- Use a hardware keyboard if available: Tab and Shift-Tab move cell-to-cell; no source mode is exposed.
- Merge and split cells by touch-accessible controls; content is preserved and the result survives save/reopen.
- Confirm border style/thickness, border color, header colors/weight, cell colors, and padding still work after the table changes.
- Check a default and modified preference: inactive/active reset-icon colors switch correctly, including after Reset.
- Test cursor color/blink, drag-handle color, selected-text background/foreground colors, magnifier size, and magnifier position on the phone; confirm each control resets to its default.
- Test escaped pipes, empty cells, long wrapping text, header alignment, and a table inside a list/blockquote if supported.

Before calling this done, report the exact files changed, automated test/build results, any unsupported Markdown constructs, and any physical-device behavior that still needs the user’s test. Do not claim Android behavior is verified from desktop tests.
