# Jules task: Fix editor keyboard navigation, scroll jumps, and blank rendering

Work on the latest W.mdx branch containing the latest tested build. Preserve the fixes the user verified: heading links inside lists work, and nested callouts fold correctly. Do not replace the editor or change table behavior, callout syntax, links, or unrelated UI. Focus only on the remaining navigation and rendering failures.

## Confirmed failures

1. **Vertical keyboard navigation skips content.** Up-arrow skips empty lines. Navigation also jumps across content in lists and callouts. The Markdown cheat sheet has additional navigation problems around its embed heading; reproduce them using the actual `Documentation/Markdown.md` fixture and identify precisely which block/row is skipped.
2. **Scroll jumps persist.** The user suspects the viewport is trying to bring the end of a logical line into view; with word wrapping, that can shift the screen. Treat this as a hypothesis and trace the actual scroll source.
3. **The editor sometimes renders blank during scrolling.** This remains intermittent; one occurrence was near the callouts section. The cause is unknown.

## Required investigation and fixes

- Trace CodeMirror vertical movement and the WYSIWYG block/decorations for paragraphs, empty paragraphs, wrapped visual rows, lists, callouts, headings, and embeds. Ensure Up/Down moves predictably through every valid caret stop without skipping intervening content. Preserve preferred horizontal position across wrapped lines and preserve blank paragraphs in the document. Do not rewrite/normalize content or change Home/End behavior as a workaround.
- Trace every scroll trigger from selection/transactions, CodeMirror scroll requests, DOM scrollIntoView, WebView, and Android focus/IME adjustments. Record bounded before/after scroll position, caret rectangle, visual-row geometry, viewport size, and trigger so the source of jumps is clear. If the issue is whole-logical-line visibility, use the actual caret/visual wrapped-row rectangle and the smallest scroll delta needed; do not pin the line end to the viewport bottom. Avoid competing scroll adjustments and preserve the viewport anchor during reflow and keyboard show/hide.
- Reproduce the blank rendering while scrolling through long content and nested callouts. Check WebView renderer loss, JavaScript/CodeMirror errors, editor-root removal or zero-height layout, decoration/widget lifecycle, and resize/reflow callbacks. Distinguish a renderer failure from a present-but-not-painted editor. Add only bounded, privacy-safe diagnostics; never log document text, filenames, or URIs. Fix the cause without discarding edits or repeatedly reloading the document. If recovery is necessary, preserve the latest document and selection.

## Regression coverage

Add tests for Up/Down across one and multiple blank paragraphs, wrapped rows, adjacent and nested list items, callout boundaries, and the Markdown cheat sheet around its embed heading. Add coverage for wrapped-line visibility near the viewport bottom and scrolling through long nested-callout content without losing the editor. Run relevant unit tests and the Android debug build; fix task-introduced failures before committing.
