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

The earlier findings below were stale: the current Source path no longer returns
early from `livePreviewPlugin`, and the old `.cm-source-list-wrapped` path is
gone. The repository now has a shared semantic block model, but the complete
whole-document renderer refactor is still unfinished:

- `getMarkdownDocumentLayout()` is mode-agnostic and produces the shared line,
  list, quote, callout, code-block, and table model. It is cached by document,
  syntax tree, and syntax settings.
- `getMarkdownRenderPlan()` now wraps that shared model with mode-specific
  decisions: Source keeps table source lines, Live Preview and WYSIWYG render
  editable tables, and only WYSIWYG replaces fenced code blocks.
- The persistent line layout, contextual renderer, table widget field, WYSIWYG
  code-block field, and Live Preview embedded/code-span fields now consume the
  same plan. Browser tests cover a single fixture across all modes, including
  local horizontal scrolling for raw Source tables.
- `semanticLayoutField` keeps that model current; `persistentLayoutField`
  applies shared line classes, source-prefix ranges, and semantic layout
  attributes in all three modes.
- `livePreviewPlugin` no longer re-emits semantic paragraph/list/heading/
  blockquote/callout/rule classes; those now come only from
  `persistentLayoutField`. The plugin retains mode-specific syntax and
  contextual inline decorations.
- `livePreviewPlugin._buildDecorationsInternal()` runs in all modes and chooses
  syntax visibility and contextual inline behavior based on the current mode.
- `livePreviewPlugin` owns semantic inline-format marks in all three modes;
  `heightMapField` remains responsible for WYSIWYG syntax hiding and special replacements.
  The plugin also owns contextual syntax and many other inline widgets.
  Rendering code is therefore still distributed across fields and plugins,
  even though their block decisions now come from the shared plan.

The shared mode-aware block plan is in place, and the current modes pass browser
geometry/regression checks. The product direction has since clarified that
Source should become a raw editor rather than another styled Markdown layout.
Do not preserve block-layout parity with Source as a goal. The remaining
unification work is to consolidate rendered-view decisions and keep Source's
language-aware token highlighting separate from document rendering. The current
repository still applies Markdown semantic line classes in Source; treat that
as implementation to simplify, not the target contract.

## Implementation and verification requirements

1. Audit every mode-specific renderer, decoration field/plugin, and CSS rule
   affecting document block layout before editing. Trace all list flavors and
   related callout/blockquote behavior; do not patch only a screenshot's list
   style. Keep Source's raw text contract distinct from rendered block styling.
2. Keep extending the shared mode-aware render plan for Live Preview and
   WYSIWYG, and reduce duplicate block-rendering decisions in the fields and
   plugin. Keep their syntax visibility and interaction behavior mode-specific,
   not block indentation, wrapping, or spacing. Keep Source layout and
   highlighting independent from rendered block geometry.
3. Add browser-level geometry checks using the same document in Live Preview
   and WYSIWYG. Compare marker, content, and wrapped-row positions for all list
   styles and nesting levels. Include syntax-visible/hidden states, cursor
   inside/outside blocks, and keyboard open/closed where supported. Separately
   assert that Source preserves exact text and uses editor wrapping without
   semantic block layout.
4. Verify paragraph, heading, quote, code-block, and table rendering alongside
   lists. For tables, assert that WYSIWYG and Live Preview contain an editable
   rendered table while Source contains editable raw Markdown table syntax.
   Verify Source token highlighting separately from rendered Document
   Appearance styling.
5. Run the full test suite and build. Do not declare completion based only on
   CSS-variable assertions. Confirm phone-sized layout and editing behavior
   with a device or browser rendering check when available. Browser checks do
   not prove Android WebView or keyboard behavior; state that limitation plainly
   until a device run is available.

The user has already supplied the expected list wrapping, view-mode distinction,
and Obsidian Live Preview table behavior. Do not ask them to repeat those
requirements or request more screenshots for the cases described here.
