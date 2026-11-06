# New-session handoff: unified Markdown rendering

## Goal

Refactor the editor so the document has one semantic rendering and layout
pipeline across Source, Live Preview, and WYSIWYG. Do not continue with
list-only CSS or offset patches. The current list behavior is evidence of a
larger mode-architecture problem.

The modes may differ in syntax visibility and editing interactions; they must
not use competing block-layout calculations.

## Exact view contract

- **WYSIWYG:** Render Markdown structures. Tables are rendered tables with
  editable cells. Most Markdown syntax is hidden.
- **Live Preview:** Keep the same rendered structures and block styling as
  WYSIWYG. Reveal relevant syntax contextually when the user is editing or
  interacting with that syntax. A table remains rendered and editable; entering
  it must not expose raw pipe syntax or turn it into source text.
- **Source:** Show the complete raw Markdown, including table syntax, while
  keeping the same block styling and layout model.
- Showing syntax may naturally change inline flow and line breaks. Do not reserve
  space for hidden syntax markers.

“One pipeline” means shared semantic structure and layout rules for the whole
document, not merely matching a CSS variable in separate renderers. Mode-specific
syntax decorations are acceptable; mode-specific block geometry is not.

## Whole-document scope

Apply the shared model to paragraphs, headings, blockquotes, lists, code blocks,
and tables—not only lists.

List layout must work for:

- Bullets and every bullet marker.
- Task/checklist items.
- Decimal, upper/lower alphabetic, and upper/lower Roman ordered markers.
- Nested items, wrapped items, and continuation paragraphs.

Hanging wrapping under the item text is the default. The optional non-hanging
setting changes where wrapped rows align; it must not add a first-line indent.
Toolbar actions and shortcuts must never add first-line paragraph indentation.
Indenting a paragraph moves its source lines together, and literal indentation
must still be able to create an indented code block. The fenced-code toolbar
action remains a separate feature.

Blockquote borders and wrapped content must stay aligned in every mode. Preserve
existing code-block behavior. Keep tables rendered and editable in both
WYSIWYG and Live Preview; Source shows the raw table syntax.

## Current code findings

The current implementation is not unified:

- `livePreviewPlugin._buildDecorationsInternal()` returns early for Source and
  applies a separate `.cm-source-list-wrapped` path.
- Source list wrapping uses padding and negative `text-indent`; rendered list
  modes use marker decorations, `.cm-list-block-text`, and flex layout.
- WYSIWYG also builds list decorations in `buildHeightMapValue()` through
  `heightMapField`.
- `persistentLayoutField` still has mode-dependent list geometry.

The recent source-column offset adjustment changed some measurements but did
not unify these paths. Do not describe that adjustment as the completed
refactor.

## Implementation and verification requirements

1. Audit every mode-specific renderer, decoration field/plugin, and CSS rule
   affecting document block layout before editing. Trace all list flavors and
   related callout/blockquote behavior; do not patch only the screenshot's list
   style.
2. Define a single semantic layout source of truth and make all three modes
   consume it. Keep syntax visibility and interaction behavior mode-specific,
   not block indentation, wrapping, or spacing.
3. Add browser-level geometry checks using the same document in all three modes.
   Compare marker, content, and wrapped-row positions for all list styles and
   nesting levels. Include syntax-visible/hidden states, cursor inside/outside
   blocks, and keyboard open/closed where the test environment supports them.
4. Verify paragraph, heading, quote, code-block, and table rendering alongside
   lists. For tables, assert that WYSIWYG and Live Preview contain an editable
   rendered table while Source contains the raw Markdown table syntax.
5. Run the full test suite and build. Do not declare completion based only on
   CSS-variable assertions. Confirm phone-sized layout and editing behavior
   with a device or browser rendering check when available.

The user has already supplied the expected list wrapping, view-mode distinction,
and Obsidian Live Preview table behavior. Do not ask them to repeat those
requirements or request more screenshots for the cases described here.
