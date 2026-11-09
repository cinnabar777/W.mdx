# Markdown Phone Test Checklist

This is the interaction checklist for the reader-facing
[Markdown-Phone-Test.md](Markdown-Phone-Test.md) fixture, which is also available
as an MDZip package with real media and attachment assets.

## View-mode contract

- Switch among Source, Live Preview, and WYSIWYG at the same cursor position.
- Confirm switching modes never changes the Markdown source.
- Source shows original syntax. Live Preview renders supported structures and
  reveals context-sensitive syntax while editing. WYSIWYG hides supported
  syntax.
- Confirm headings, paragraphs, quotes, lists, callouts, code, and tables keep
  their semantic block positions when changing modes.

## Lists and indentation

- Test root and nested bullet, task, decimal, alphabetic, and Roman lists with
  long wrapped text in all three modes.
- Test the optional leading spaces before a marker, list continuations, and a
  paragraph adjacent to a list. A list item's wrapped rows must remain aligned
  with that item's content, not the parent block or document margin.
- Place the caret inside ordinary and formatted text in several list items.
  Move it between items, then close and reopen the keyboard. Verify the list
  block margin and nesting do not jump. Revealing a different-length source
  marker may naturally change line wrapping; each resulting wrap must still
  follow the selected hanging/non-hanging rule.
- Test both values of **Non-hanging List Wrapping**. Hanging mode aligns wrapped
  rows beneath item text; non-hanging mode aligns them to the item block.
- Increase/decrease nesting with the toolbar and Tab/Shift-Tab. The item,
  continuation, child, and numbering must move together.
- Press Return to create the next item. Confirm its marker, depth, and wrapping
  remain stable.

## Quotes and paragraphs

- Verify nested quote markers remain at the left edge in Source and nested
  quotes render farther inward. The outer quote border should remain continuous
  through its paragraphs, nested quote, and quoted list.
- Use Block Quote and Outdent on a paragraph and on a multiline selection.
- Use Indent and Outdent on a wrapped paragraph and a quote. Every wrapped row
  should move with the paragraph. Repeat with one- and two-space indent steps.
- Paste a multiline nested list at the blank quoted line before its `>` marker.
  Repeat with long-press Paste, Ctrl+V, and the keyboard clipboard; every pasted
  line should remain quoted with its nesting intact.
- Test an indented code block at document start. Clear Formatting should remove
  structural indentation without deleting code text. Backspace at the visual
  start should remove one literal space. Fenced-code behavior must be unchanged.

## Tables

- Live Preview and WYSIWYG show editable tables; Source shows raw Markdown.
- In Source, a wide table scrolls as one local block; every row moves together,
  surrounding text stays put, and the app's document viewport does not widen.
- In rendered views, enter a cell and verify the caret and keyboard enter that
  cell without moving to the line after the table or revealing raw table source.
- Edit a cell, move to another cell, return, and confirm the first edit remains.
  Check the floating toolbar and table actions do not overlap.
- Save and reopen the MDZ to verify cell edits persist.

## Syntax, links, and media

- Test CommonMark inline/reference links and autolinks, GFM automatic links,
  Obsidian wiki links, and Wmdx resource links. Rendered links should be
  clickable; Source should retain their exact syntax.
- Verify the packaged wiki link opens the companion document.
- Check task boxes in rendered views. The Markdown task-list setting should
  control GFM/Obsidian `- [ ]` forms; Wmdx standalone tasks should use the Wmdx
  list setting.
- Test callout title and body as one styled block, inline formatting in the
  body, collapsed/expanded state, and nested callouts. In Source, keep each `>`
  marker at the raw line edge. Do not render a colored callout card under its
  literal markers; collapsed bodies remain visible in Source.
- Check all Wmdx underline styles, four highlight slots, and four pen slots.
  Confirm Setext headings are not mistaken for highlight syntax.
- Confirm the local image, embedded image, WAV, MP4, PDF, text, and ZIP examples
  load from the MDZ without network access. Play and pause audio/video. Verify
  attachment actions and the configured width/alignment metadata.
- Source should display raw links and media metadata; it should not substitute a
  rendered widget for the original syntax.
- Confirm Source keeps the authored Wmdx alphabetic/Roman list markers instead
  of auto-numbered display labels, and does not prepend a language/copy widget
  to a code fence. Semantic styling may remain, but visible characters must stay
  in order; a wide table may use a nested raw-text editor only if every Markdown
  marker remains visible and the table scrolls as one aligned block.

## Feature-toggle checks

- Toggle each feature off and on. Disabled syntax should remain literal source;
  changing a preference must not rewrite or delete document text.
- Where a feature offers **Preferred … Syntax**, verify toolbar/shortcut
  insertion follows that preference while other enabled spellings remain
  recognizable.
- Test the Markdown, GFM-task, Obsidian, and Wmdx list/callout/link/footnote
  options independently. There is no single whole-document dialect switch.

## Known compatibility gaps

These are limitations, not expected passes:

- Obsidian heading/block transclusion such as `![[note.md#Heading]]`.
- Obsidian audio, video, or PDF embeds such as `![[clip.mp4]]`.
- Obsidian comments, YAML properties/frontmatter, math, Mermaid, and plugin
  syntax.
- CommonMark has no native task-list or pipe-table syntax. Export warns for
  task checkboxes and preserves pipe-table source with a warning.
- Wmdx alphabetic/Roman lists export as decimal markers; Wmdx callout styling,
  color slots, and pen marks may lose presentation when exported to other
  dialects. Review conversion warnings before saving.
- The linter performs limited structural checks; it is not a complete
  specification validator for any dialect.
