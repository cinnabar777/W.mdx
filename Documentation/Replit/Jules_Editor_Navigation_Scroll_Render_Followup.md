# Jules task: Fix editor keyboard navigation, scroll jumps, and blank rendering

Work on the latest W.mdx branch containing the latest tested build. Preserve the fixes the user verified: heading links inside lists work, and nested callouts fold correctly. Do not replace the editor or change table behavior, callout syntax, links, or unrelated UI. Focus only on the remaining navigation and rendering failures.

## Confirmed failures

1. **Up-arrow navigation is severely inconsistent and has regressed from a previously working version.** It skips some headings but not others, some code blocks but not others, empty lines, and list content. From the end of a paragraph containing a URL/link, Up can jump to the start of the link instead of the visually adjacent row. The Markdown cheat sheet has additional navigation problems around its embed heading; reproduce them using the actual `Documentation/Markdown.md` fixture and identify precisely which block/row is skipped.
2. **Scroll jumps persist.** The user suspects the viewport is trying to bring the end of a logical line into view; with word wrapping, that can shift the screen. Treat this as a hypothesis and trace the actual scroll source.
3. **The editor sometimes renders blank during scrolling.** This remains intermittent; one occurrence was near the callouts section. The cause is unknown.

## Required investigation and fixes

- Trace CodeMirror vertical movement and the WYSIWYG block/decorations for paragraphs, empty paragraphs, wrapped visual rows, lists, callouts, headings, and embeds. Ensure Up/Down moves predictably through every valid caret stop without skipping intervening content. Preserve preferred horizontal position across wrapped lines and preserve blank paragraphs in the document. Do not rewrite/normalize content or change Home/End behavior as a workaround.
- The user verified that Up-arrow navigation worked in an earlier build. Do not ask Jules to locate that build, switch branches, or search repository history; the relevant source changes are identified below. Apply and compare these specific changes within the current Jules branch.
- The last known-good reference is commit `790d67d44a9df29c1a40b80ad7531a2305b9af44`. In its `livePreviewPlugin`, horizontal-rule syntax is not replaced while the caret is on that rule:
  ```js
  const caretIsOnRule =
    selection.empty &&
    selection.head >= node.from &&
    selection.head <= node.to;

  if (!isNodeActive && !caretIsOnRule) {
    builder.push(Decoration.replace({}).range(node.from, node.to));
  }
  ```
  A later commit, `7569940a8e00cd8277597d069fff96c0b6e78b09`, removes this guard. Restore that exact guard for the horizontal-rule case, but do not treat it as the full fix: it only explains horizontal-rule caret behavior.
- The next relevant change is commit `fbe086ebb64b66c1385b6e2e0724bb6b7e1d0034`. It adds a visible-line prepass in `livePreviewPlugin.buildDecorations()` that resolves the syntax tree at each line's first non-space character and adds `cm-paragraph`, `cm-paragraph-first`, `cm-paragraph-last`, and `cm-list-item` line classes. On the current Jules branch, isolate whether that prepass or its line classes alter visual row geometry or vertical movement. Preserve the needed typography styling; do not blindly delete the feature.
- Compare the current vertical-movement behavior to the verified-good behavior around `790d67d`, then apply the narrow fix in the current branch. Do not add another general ArrowUp override or replace CodeMirror's movement model without proving the cause.
- Trace every scroll trigger from selection/transactions, CodeMirror scroll requests, DOM scrollIntoView, WebView, and Android focus/IME adjustments. Record bounded before/after scroll position, caret rectangle, visual-row geometry, viewport size, and trigger so the source of jumps is clear. If the issue is whole-logical-line visibility, use the actual caret/visual wrapped-row rectangle and the smallest scroll delta needed; do not pin the line end to the viewport bottom. Avoid competing scroll adjustments and preserve the viewport anchor during reflow and keyboard show/hide.
- Reproduce the blank rendering while scrolling through long content and nested callouts. Check WebView renderer loss, JavaScript/CodeMirror errors, editor-root removal or zero-height layout, decoration/widget lifecycle, and resize/reflow callbacks. Distinguish a renderer failure from a present-but-not-painted editor. Add only bounded, privacy-safe diagnostics; never log document text, filenames, or URIs. Fix the cause without discarding edits or repeatedly reloading the document. If recovery is necessary, preserve the latest document and selection.

## Regression coverage

Add tests for Up/Down across one and multiple blank paragraphs; different heading levels; code blocks; adjacent and nested list items; callout boundaries; a URL/link at the end of a paragraph; and the Markdown cheat sheet around its embed heading. Verify Up moves to the visually adjacent row while retaining the expected horizontal position. Add coverage for wrapped-line visibility near the viewport bottom and scrolling through long nested-callout content without losing the editor. Run relevant unit tests and the Android debug build; fix task-introduced failures before committing.
