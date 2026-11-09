# New-session handoff: unified Markdown rendering

## Goal

Use one semantic document model and shared rendered-layout pipeline for Live
Preview and WYSIWYG. Do not continue with list-only CSS or offset patches. The
current list behavior is evidence of a larger mode-architecture problem.

Source is a separate raw text/code editing surface with language-aware syntax
highlighting. Do not apply Markdown block rendering to it. Keep editing,
selection, and document content shared, while keeping source-editor appearance
settings distinct from rendered Document Appearance.

## Current agreed view contract

- **WYSIWYG:** Render Markdown structures. Tables are rendered tables with
  editable cells. Most Markdown syntax is hidden.
- **Live Preview:** Keep the same rendered structures and block styling as
  WYSIWYG. Reveal relevant syntax contextually when the user is editing or
  interacting with that syntax. Syntax exposure should be configurable from the
  caret's inline range to its line or semantic block. A table remains rendered
  and editable by default; entering it must not silently replace it with raw
  pipe syntax.
- **Source:** A raw, language-aware text editor. Show every source character,
  including table and callout syntax, with optional syntax-token highlighting.
  Do not apply Markdown block layout, rendered media/table/callout widgets,
  hidden syntax, or folding to Source. Source-editor typography, wrapping, and
  token colors are independent of Document Appearance settings.

Live Preview and WYSIWYG share semantic structure and rendered block geometry.
Source uses ordinary editor line layout. Syntax highlighting changes token
appearance only; it never removes or replaces source characters. All views edit
the same underlying document text.

## Rendered-mode simplification

The product should have two editor surfaces, not three Markdown renderers:

- **Rendered Markdown editor:** one block/layout pipeline with a configurable
  syntax-exposure policy. The old WYSIWYG choice maps to syntax hidden; the old
  Live Preview choice maps to syntax revealed around the caret. A future policy
  may reveal a whole line or semantic block without changing the renderer.
- **Source/Code editor:** literal text with language-aware token highlighting
  and independent source-editor appearance settings.

Keep the old mode preference values as compatibility aliases while migrating
existing settings. Do not remove Live Preview behavior until its per-element
differences have been represented and tested as syntax-exposure rules.

## Whole-document scope

Apply the shared model to paragraphs, headings, blockquotes, lists, code blocks,
and tables across the rendered views—not only lists.

In Live Preview and WYSIWYG, list layout must work for:

- Bullets and every bullet marker.
- Task/checklist items.
- Decimal, upper/lower alphabetic, and upper/lower Roman ordered markers.
- Nested items, wrapped items, and continuation paragraphs.

Hanging wrapping under the item text is the default in rendered views. The
optional non-hanging setting changes where wrapped rows align; it must not add a
first-line indent. Toolbar actions and shortcuts must never add first-line
paragraph indentation. Indenting a paragraph moves its source lines together,
and literal indentation must still be able to create an indented code block.
The fenced-code toolbar action remains a separate feature. Source preserves
literal source indentation and uses editor wrapping settings.

Blockquote borders and wrapped content must stay aligned in Live Preview and
WYSIWYG. Preserve existing code-block behavior. Keep tables rendered and
editable in both rendered views; Source edits the raw table syntax as text.

## Current code findings

The repository has a shared semantic document model, but rendered modes still
have separate policy branches and the full mode consolidation is unfinished:

- `getMarkdownDocumentLayout()` is mode-agnostic and produces the shared line,
  list, quote, callout, code-block, and table model. It is cached by document,
  syntax tree, and syntax settings.
- `getMarkdownRenderPlan()` now wraps that shared model with mode-specific
  decisions: Source keeps table source lines, Live Preview and WYSIWYG render
  editable tables, and only WYSIWYG replaces fenced code blocks.
- `persistentLayoutField` applies the semantic block classes to rendered modes.
  Source exits the shared decoration plugin before Markdown layout decorations
  are created; raw Markdown tables are replaced visually by one editable nested
  CodeMirror block, while the parent document text stays unchanged.
- A Source table remains literal Markdown in the document model. Its nested
  editor scrolls the whole table locally; surrounding Source text and the app's
  document viewport do not move horizontally.
- `livePreviewPlugin` owns much of the contextual syntax and inline behavior.
  It exits early for Source. WYSIWYG-only code-block replacement and
  Live-Preview-only contextual behavior are still mode branches that need to be
  translated into explicit syntax-exposure policy.
- Source has its own font, text-color, and token-color settings. Markdown uses
  the Markdown parser; Source/Code selects JavaScript/TypeScript/JSX/TSX,
  JavaScript-based JSON, HTML/XML/SVG, or CSS from the filename, and leaves
  unknown extensions as plain text. Other language packages and a per-document
  manual language override remain to be added.

The next architectural work is to map every remaining WYSIWYG/Live Preview
branch to either shared rendering behavior or a syntax-exposure policy, then
preserve the old mode settings as aliases. Keep Source separate.

## Implementation and verification requirements

1. Audit every mode-specific renderer, decoration field/plugin, and CSS rule
   affecting document block layout before editing. Trace all list flavors and
   related callout/blockquote behavior; do not patch only a screenshot's list
   style. Keep Source's raw text contract distinct from rendered block styling.
2. Consolidate WYSIWYG and Live Preview behind one rendered Markdown editor.
   Express syntax visibility as policy (hidden, caret, line, or semantic block)
   instead of a separate renderer. Verify each element's existing behavior
   before removing an old mode branch. Keep Source layout and highlighting
   independent from rendered block geometry.
3. Add browser-level geometry checks using the same document in Live Preview
   and WYSIWYG. Compare marker, content, and wrapped-row positions for all list
   styles and nesting levels. Include syntax-visible/hidden states, cursor
   inside/outside blocks, and keyboard open/closed where supported. Separately
   assert that Source preserves exact text and uses editor wrapping without
   semantic block layout.
4. Verify paragraph, heading, quote, code-block, and table rendering alongside
   lists. In Source, assert exact text fidelity, independent token styling, and
    whole-table horizontal scrolling inside a bounded table block, without
    shifting surrounding text or widening the page.
    Add device checks for extension-based language selection; add a per-document
    manual language override and tests for it.
5. Run the full test suite and build. Do not declare completion based only on
   CSS-variable assertions. Confirm phone-sized layout and editing behavior
   with a device or browser rendering check when available. Browser checks do
   not prove Android WebView or keyboard behavior; state that limitation plainly
   until a device run is available.

The user has already supplied the expected list wrapping, view-mode distinction,
and Obsidian Live Preview table behavior. Do not ask them to repeat those
requirements or request more screenshots for the cases described here.
