# Jules addendum: investigate WYSIWYG keyboard-navigation jumps

Investigate keyboard navigation across editor blocks and the Markdown cheat sheet. Preserve the already-working list-heading links and nested-callout folding. Do not alter unrelated UI or table behavior.

## Confirmed behavior to reproduce

- Up-arrow skips empty lines instead of placing the caret in the blank paragraph.
- Vertical keyboard navigation jumps over content in or around callouts and lists.
- The Markdown cheat sheet has multiple navigation problems around its embed heading. Inspect `Documentation/Markdown.md` and reproduce the exact behavior there; do not assume whether the heading, embed block, or surrounding structure is the cause.

## Implementation requirements

- Trace CodeMirror's vertical cursor movement and the WYSIWYG block/decorations that represent paragraphs, lists, callouts, headings, and embeds. Determine why some rendered visual rows or valid caret positions are bypassed.
- Up/Down must move through empty paragraphs and the rendered visual rows of lists, callouts, and embeds without skipping intervening content. Preserve standard preferred-horizontal-position behavior across wrapped lines.
- Keep blank paragraphs and source content intact. Do not normalize or rewrite the document to hide the problem, and do not change Home/End behavior as a workaround.
- Do not break the working nested callout folding, list-heading links, scrolling, or other confirmed editor behavior.

## Verification

Add focused tests covering one and multiple blank paragraphs, consecutive list items, list/callout boundaries, nested callouts, wrapped lines, and the Markdown cheat sheet around the embed heading. Verify the caret lands on each intervening valid row in both upward and downward navigation. Run relevant unit tests and the Android debug build before committing.
