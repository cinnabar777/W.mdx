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
  using the same semantic block model. Styling must not compete with syntax:
  callout `>` markers stay at the left edge, with no colored card or automatic
  body folding. Raw tables stay in a local horizontal scroller and do not widen
  the document.
- Showing syntax may naturally change inline flow and line breaks. Do not reserve
  space for hidden syntax markers.

“One pipeline” means shared semantic structure and layout rules for the whole
document, not merely matching a CSS variable in separate renderers. Mode-specific
syntax visibility and editing interactions are acceptable. Mode-specific block
geometry is not, except where raw syntax itself changes inline wrapping.

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

## Current code findings (audited at `4dd6b8b`)

The earlier findings below were stale: the current Source path no longer returns
early from `livePreviewPlugin`, and the old `.cm-source-list-wrapped` path is
gone. The repository now has a shared semantic block model, but the complete
whole-document renderer refactor is still unfinished:

- `getMarkdownDocumentLayout()` is mode-agnostic and produces the shared line,
  list, quote, callout, code-block, and table model. It is cached by document,
  syntax tree, and syntax settings.
- `semanticLayoutField` keeps that model current; `persistentLayoutField`
  applies shared line classes, source-prefix ranges, and semantic layout
  attributes in all three modes.
- `livePreviewPlugin._buildDecorationsInternal()` runs in all modes and chooses
  syntax visibility and contextual inline behavior based on the current mode.
- `heightMapField` still returns no decorations outside WYSIWYG and separately
  builds WYSIWYG syntax hiding, inline formatting, widgets, and block
  replacements. This duplicates rendering decisions made by
  `livePreviewPlugin`.
- `tableStateField` separately inserts editable table widgets in WYSIWYG and
  Live Preview while Source keeps table syntax. `wysiwygCodeBlockField` also
  carries a WYSIWYG-specific code-block renderer.

So the semantic block source is shared, and the three modes currently pass
browser geometry/regression checks, but rendering is still split among plugins,
state fields, and CSS. Do not describe the architecture as a completed unified
renderer until those paths consume one mode-aware render plan. The recent
callout correction is an intentional exception to matching block appearance:
Source keeps raw quote syntax instead of painting a card over it.

## Implementation and verification requirements

1. Audit every mode-specific renderer, decoration field/plugin, and CSS rule
   affecting document block layout before editing. Trace all list flavors and
   related callout/blockquote behavior; do not patch only the screenshot's list
   style.
2. Extend the existing semantic model into one mode-aware render plan and make
   all three modes consume it. Keep syntax visibility and interaction behavior
   mode-specific, not block indentation, wrapping, or spacing.
3. Add browser-level geometry checks using the same document in all three modes.
   Compare marker, content, and wrapped-row positions for all list styles and
   nesting levels. Include syntax-visible/hidden states, cursor inside/outside
   blocks, and keyboard open/closed where the test environment supports them.
4. Verify paragraph, heading, quote, code-block, and table rendering alongside
   lists. For tables, assert that WYSIWYG and Live Preview contain an editable
   rendered table while Source contains the raw Markdown table syntax.
5. Run the full test suite and build. Do not declare completion based only on
   CSS-variable assertions. Confirm phone-sized layout and editing behavior
   with a device or browser rendering check when available. Browser checks do
   not prove Android WebView or keyboard behavior; state that limitation plainly
   until a device run is available.

The user has already supplied the expected list wrapping, view-mode distinction,
and Obsidian Live Preview table behavior. Do not ask them to repeat those
requirements or request more screenshots for the cases described here.
