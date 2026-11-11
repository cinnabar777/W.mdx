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

- **Rendered Markdown editor:** One word-processing surface with the shared
  Markdown structures and block styling. A global syntax-exposure preference
  controls whether syntax stays hidden, appears around the caret, appears on the
  current line, or appears for the current semantic block. The default is hidden.
  When syntax exposure is active and the caret enters a table, expose the entire
  Markdown table in its local horizontal scroller so pipes remain aligned.
- **Source / Code editor:** A raw text editor. Show every source character,
  including table and callout syntax, with optional language-token highlighting.
  Do not apply Markdown block layout, rendered media/table/callout widgets,
  hidden syntax, or folding to Source. Source-editor typography, wrapping, and
  token colors are independent of Document Appearance settings.

These are the two user-facing editor modes. The former WYSIWYG and Live Preview
choices are compatibility aliases during migration, not separate product modes.
Both surfaces edit the same underlying document text. Syntax highlighting
changes token appearance only; it never removes or replaces source characters.

## Rendered-mode simplification

There are two user-facing editor surfaces, not three Markdown modes. The
Rendered Markdown editor uses a syntax-exposure policy; Source/Code is literal
text with language-aware token highlighting and independent appearance
settings. Android migrates saved `wysiwyg`, `live_preview`, and `rich_text`
mode values to `rendered`, preserving the former Live Preview caret behavior
when no exposure preference has been saved. The JavaScript bridge still accepts
the old values for compatibility.

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
  the Markdown parser; Source/Code detects JavaScript/TypeScript/JSX/TSX,
  HTML/XML/SVG, CSS, JSON, YAML, Python, SQL, Java, Rust, C/C++, Go, and PHP
  from the filename, and leaves unknown extensions as plain text. A
  Source/Code Language action in the toolbar menu can override the language for
  the current document; overrides are stored separately by document identity.

## Implementation status

The first user-facing consolidation is implemented on the working branch:

- Editor settings expose `rendered` and `source`; syntax exposure offers hidden,
  caret, line, and semantic-block scopes. Existing mode preferences are migrated.
- Rendered mode maps hidden syntax to the existing hidden-syntax presentation and
  the other scopes to contextual syntax, keeping the shared block model in use.
  This is a compatibility-preserving first step, not proof that every internal
  WYSIWYG/Live Preview branch has been eliminated.
- In a rendered mode with syntax exposure enabled, entering a table exposes all
  rows as raw Markdown inside one local horizontal scroller; surrounding content
  remains in the normal viewport.
- Source/Code now auto-detects a wider set of CodeMirror language parsers and
  offers a per-document language override from the toolbar menu. Existing Source
  Editor token-color settings remain independent of Document Appearance.
- Browser coverage exercises the scope policy, mode transitions, and table
  source exposure, plus independent Source/Code language overrides. Android
  compilation still requires the Android SDK locally; the branch's GitHub
  Actions build remains the authoritative Android check.

Still planned: inspect and retire remaining internal mode-only branches where
behavior is fully represented by exposure policy; validate each supported code
language against editing fixtures and refine language-specific token controls.
Import/export fidelity across CommonMark, GFM, Obsidian, and Wmdx remains a
separate compatibility workstream.

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
