# Jules task: Fix link insertion and editor position mapping

Use the current Jules branch. This task replaces the earlier generic history-search instruction. Do not ask Jules to find a branch or reconstruct an old session. The user’s latest phone test shows that link handling is the primary problem, with cursor movement and tap-position jumps also broken.

## Preserve verified behavior

- Heading links inside lists work.
- Nested callouts fold correctly.
- Horizontal-rule rendering is visible as intended. Keep these working behaviors. The horizontal-rule special case only reveals the rule; it is not a general keyboard-navigation fix.
- Preserve current table rendering and callout appearance.

## Priority 1: Link insertion must retain the intended selection and table location

Confirmed reproduction: select a word inside a table cell and invoke link insertion. The selection disappears, and the link is inserted at the end of the table, breaking the table.

Fix the link insertion flow so it snapshots the editor selection before focus leaves the editor for a toolbar action or dialog, retains/maps that selection while the dialog is open, and inserts the link around the selected word at its original document position. When selection is empty, insert at the saved caret position. For a table selection, validate that the mapped range remains in the original cell and insert there; never fall back to appending text after the table. Cancel must make no document change. Cover URLs, heading links, and ordinary links in the Markdown cheat sheet’s embed section, which contains many links.

## Priority 2: Repair vertical caret movement and tap placement

Both Up and Down are skipping content inconsistently: some headings, code blocks, blank lines, list items, callout lines, and bold-only lines are skipped while others are not. Up from a paragraph ending in a URL can jump to the start of the link. Tapping at a location in the document sometimes causes a large jump. The Markdown cheat sheet around its embed heading is the stress fixture; reproduce on the actual `Documentation/Markdown.md` content and identify the exact positions that fail.

Trace how source positions map to visible caret positions across markdown syntax decorations, link marks/widgets, headings, lists, callouts, code blocks, wrapped lines, and table cells. Ensure Up/Down moves through the visually adjacent valid caret row while preserving horizontal position, including empty paragraphs and bold-only lines. Ensure a tap places the caret at the tapped visual location and does not restore a stale selection or scroll position. Do not use the horizontal-rule-only keymap as a general fix, add broad ArrowUp/ArrowDown overrides, or change Home/End as a workaround.

## Previously reported blank rendering

A document previously went blank during scrolling, once near callouts. Verify whether it still reproduces while testing the cases above. If so, diagnose it independently (renderer loss, JS/editor error, editor root/layout disappearing, or decoration/widget failure) and preserve unsaved content. Keep any diagnostics bounded and privacy-safe; never log document text, filenames, or URIs.

## Required automated coverage

Add tests for: link insertion on selected text in a table cell; insertion at a caret inside a cell; cancellation; links in ordinary paragraphs and the embed section; Up/Down through blank lines, headings, code blocks, list items, callouts, bold-only lines, and a paragraph ending in a link; and tap placement around wrapped lines. Include the Markdown cheat sheet as a regression fixture. Run relevant unit tests and the Android debug build, fixing failures introduced by this task before committing.
