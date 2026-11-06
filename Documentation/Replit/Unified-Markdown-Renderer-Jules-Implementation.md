# Jules task: implement the whole-document unified Markdown layout

## Baseline and task boundary

Implement on `main-clean-textpack-wmds`, using commit
`b388166269fcc929113f121f68424274f3e2636c` as the audited baseline. Do not
replace that branch with `main` or select a different saved branch based on
its name, age, or commit count.

Read `Documentation/Replit/Unified-Markdown-Rendering-Handoff.md` first.
This task supplies the code-level implementation direction agreed after
that handoff. Implement the complete refactor, not another list-only patch.

Use the existing CodeMirror editor, Markdown source document, syntax
extensions, preferences, and editing features. Do not introduce a second
editor engine or convert the stored document to HTML.

The scope is document rendering/layout and the tests needed to verify it.
Do not change file formats, packaging, storage, unrelated UI, or settings
semantics.

## Required mode contract

- WYSIWYG renders supported Markdown structures and hides their syntax.
- Live Preview uses the same structures and block styling as WYSIWYG.
  Relevant syntax is revealed contextually during editing. Entering a table
  keeps the rendered, editable table; do not reveal the whole pipe table.
- Source displays the complete raw Markdown, including table pipes,
  indentation, fences, and syntax markers. Apply the shared semantic block
  styling wherever compatible with displaying raw source.
- Do not reserve invisible width for hidden syntax. Visible syntax can
  naturally change text flow, wrapping, and document height.
- A raw table and a rendered table are deliberately different projections.
  They must share table semantics and applicable style inputs, not identical
  cell geometry or identical total heights.

One pipeline means one semantic document model and one owner of block
layout. Different CodeMirror decoration fields are permitted where its API
requires them, but they must consume that model rather than independently
classifying blocks or calculating geometry.

## Verified baseline and failure mechanisms

The audit verified the following at the baseline:

- `npm run build` succeeds.
- `npm test` reports 543 passing tests, zero failures, and one existing TODO
  concerning raw HTML import conversion.
- GitHub's Debug APK build succeeded for the baseline commit.
- A separate mixed-document DOM check produced code-block line classes in
  WYSIWYG and Live Preview but none in Source.
- That check produced nested `.cm-list-block-text` elements in WYSIWYG but
  not in Live Preview.
- The same check produced `WordProcessorTableWidget` containers in both
  rendered modes and none in Source, as required.

These DOM checks did not establish real-browser or Android geometry.

Trace and replace these competing owners:

1. `livePreviewPlugin._buildDecorationsInternal()` in `web/src/main.js`:
   Source returns early with `.cm-source-*-wrapped` line decorations;
   rendered modes separately classify paragraphs, lists, quotes, callouts,
   headings, and code blocks.
2. `buildHeightMapValue()` / `heightMapField`: WYSIWYG independently builds
   list marker replacements, list text wrappers, headings, quote syntax,
   callout titles, and other syntax decorations.
3. `buildPersistentLayoutDecorations()` / `persistentLayoutField`: some
   shared classes already exist, but list offsets depend on
   `currentEditorMode`; code blocks and tables are skipped.
4. `buildWysiwygCodeBlockDecorations()` / `wysiwygCodeBlockField`: code block
   line classes and common indentation are rebuilt independently of Live
   Preview, and Source does not receive the corresponding block layout.
5. `web/index.html`: rendered hanging lists use flex layout while Source
   uses padding and negative `text-indent`. Source and rendered indentation
   also use different offsets and units in several places.
6. `getMarkdownSourceLineLayoutForState()` in `web/src/markdownIndent.js`:
   direct regex list recognition precedes semantic ancestor checking.
   Do not let list-looking text inside code blocks, tables, or disabled
   syntax acquire unrelated block layout.

Also trace `tableStateField`, footnotes, embedded document editors, hidden
syntax/atomic ranges, marker measurement, widget-height caches, and syntax
refresh. Do not accidentally bypass those consumers during consolidation.

## Implementation

### 1. Introduce a mode-independent semantic document model

Add a focused module, for example `web/src/markdownDocumentLayout.js`.
Expose a pure builder and a CodeMirror StateField or equivalent state-owned
cache. Keep DOM access and mode selection out of the semantic builder.

Use this interface shape as the implementation contract; add fields as
needed rather than maintaining parallel models:

```js
buildMarkdownDocumentLayout(state, syntaxSettings)
// {
//   blocks: [...],
//   lines: Map<lineFrom, LineLayout>,
//   syntaxSpans: [...],
//   tables: [...],
//   codeBlocks: [...]
// }
//
// LineLayout:
// {
//   from, to, blockId, kind,
//   paragraphFirst, paragraphLast,
//   headingLevel,
//   quoteAncestors, calloutAncestors,
//   listItemId, parentListItemId, listDepth,
//   markerRange, contentRange,
//   continuation, task,
//   sourcePrefixRanges
// }
```

The exact exported names are not important; the ownership boundary is.
Do not populate irrelevant fields with fabricated values.

Derive block ownership and nesting from the existing Lezer tree and the
existing enabled Markdown/Wmdx extensions. Supplement with the existing
Wmdx list/callout helpers where they provide semantics absent from the tree.
Centralize those supplements in this builder; do not rescan them in each
mode.

Include:

- Paragraph ranges, first/last source lines, and literal source indentation.
- ATX, setext, and enabled Wmdx heading variants.
- Nested blockquotes, lazy continuation lines, callouts, callout titles and
  bodies, and lists inside quotes/callouts.
- Bullet, decimal, alphabetic, Roman, Markdown task, and Wmdx task lists.
  Preserve ordered-marker sequencing and syntax-flavor gates.
- List continuation paragraphs and their owning items. Distinguish
  semantic nesting from optional whitespace before a top-level marker.
- Fenced and indented code blocks, fence ranges, code content, and common
  structural indentation.
- Tables and their source ranges.
- Existing horizontal rules and any other block affected by the migrated
  paths.

Retain source positions. The model must not rewrite, normalize, or
round-trip the stored Markdown just to render it.

### 2. Give block styling and layout one owner

Refactor `persistentLayoutField` into the shared layout consumer, or replace
it with one new consumer. Make it use the semantic model for every block
kind in all three modes.

Emit paragraph, heading, quote/callout, list, and code-block line classes,
block boundaries, and nesting/style inputs here only. For block widgets,
provide their semantic metadata from the same model to the field that must
own the block replacement.

Move block geometry out of `livePreviewPlugin`, `heightMapField`, and the
WYSIWYG-only code path. Remove their duplicate line classification and
block text wrapping instead of leaving it active behind the new layer.

Do not hard-code per-mode list/paragraph offsets. Remove mode checks that
change semantic block indentation, margins, or continuation layout.

Use consistent units and the existing typography preferences. Do not
translate one indentation column into an unrelated fixed pixel value in
one mode while using font-dependent widths in another.

Block styling should be selection-independent. Moving a cursor may reveal
syntax, but must not switch between competing block-layout calculations.

### 3. Separate syntax presentation from block layout

Add a small explicit presentation-policy helper for `wysiwyg`,
`live_preview`, and `source`.

The policy may decide whether a syntax span is visible, replaced with a
marker/checkbox/header widget, or hidden. It must not calculate block
indentation, block spacing, or nesting.

Use the same semantic marker/content ranges in every mode. Preserve the
existing contextual reveal behavior unless it violates the required mode
contract. Source must have no syntax-hiding replacements.

Ensure each syntax span and content wrapper has one decoration owner.
Specifically eliminate the duplicate `.cm-list-block-text` decoration from
the plugin/height-map overlap. Test mixed inline formatting as well as plain
list text, since syntax-highlight marks can split decoration DOM.

Retain the existing working inline syntax features, links, entities, hard
breaks, footnotes, media, and embedded documents. They may remain in
specialized presentation modules; do not unnecessarily rewrite them.

Update hidden-syntax and atomic-range consumers to match the actual
presentation decorations. Preserve rendered-row navigation and selection
mapping; do not retain stale ranges after a mode switch or reveal change.

### 4. Consolidate list layout and wrapping

Build one marker/content layout from the shared list-item metadata.
Do not keep Source's old hanging-indent implementation beside a new
rendered implementation.

Visible source markers, rendered marker widgets, checkbox widgets, and
contextually revealed markers must occupy the same semantic marker/content
roles. Visible whitespace and syntax may affect their intrinsic width.

Requirements:

- Hanging wrapping under item text is the default.
- The non-hanging preference changes wrapped-row alignment, not the
  first-line paragraph indent.
- Nested items and continuation paragraphs inherit their owning item's
  semantic nesting.
- Optional one-to-three spaces before a top-level Markdown list marker
  must not be mistaken for an additional list nesting level.
- Preserve `-`, `+`, `*`, both decimal delimiters, upper/lower alphabetic
  and Roman markers, and enabled task syntax behavior.
- Checkbox/bullet settings must not leave an empty reserved marker column.
- Inline emphasis, links, and other formatting must not become separate
  unintended flex columns.
- Quote/callout borders must not shift to the list item's content edge.
- Literal indentation inside code must not be styled as a nested list.

If DOM measurement is still needed for intrinsic marker width, use one
measurement path and cache policy for all projections. Keep read/write
phases separate. Remove unused marker measurement or obsolete CSS
variables when consolidation makes them unnecessary.

### 5. Consolidate code blocks and preserve table editing

Derive code-block boundaries, indentation metadata, line backgrounds,
spacing, and typography once. Apply those block styles in Source as well
as the rendered modes.

Make opening/closing fences, language headers, and hidden structural
indentation presentation decisions over the same code-block model.
Preserve literal indentation, the existing copy/header behavior, and the
separate fenced-code toolbar action.

Keep `WordProcessorTableWidget` and its working `TableModel` editing path.
Supply table ranges through the shared semantic model rather than a new
independent parse of document block ownership.

Both WYSIWYG and Live Preview must retain the rendered table throughout
selection, cell entry, typing, multiline cell editing, and navigation.
Source must retain every raw table character.

Preserve cell actions, merge/split behavior, table selection, height
measurement, scroll correction, keyboard behavior, and Markdown
serialization.

### 6. Handle refresh and editor instances correctly

Refresh the semantic model on document edits, syntax-configuration changes,
and parser progress that changes the available syntax tree.

The current syntax-refresh loop skips Source. Update that behavior so
Source's semantic block styling is also complete for long documents.
Do not force a full synchronous parse on every cursor movement.

Cache semantic work independently of selection/reveal state. Share one
model per editor state, not one global model for unrelated documents.
Preserve embedded document source context and recursion limits.

Keep mode-switch Markdown fidelity, selection, history, scroll snapshot,
dirty-state behavior, and native bridge contracts. Audit pending table
cell edits during mode transitions so destroying an editor cannot discard
uncommitted cell input.

### 7. Remove superseded code and CSS

Remove the old `.cm-source-paragraph-wrapped`,
`.cm-source-quote-wrapped`, `.cm-source-list-wrapped`, and corresponding
Source-only offset rules once the shared implementation replaces them.

Remove duplicated block-layout builders and obsolete branches. Do not
leave an old renderer registered alongside the new one.

Do not merely rename the existing competing paths or give them a common
CSS variable. The semantic builder and layout rules must actually have one
owner.

## Verification to implement and run

### Semantic and DOM regression tests

Add focused tests for the new semantic model, presentation policies, and
single ownership of layout decorations.

Use the same mixed document in all three modes. Verify paragraphs,
headings, quotes/callouts, lists, code blocks, and tables, not just lists.

Assert:

- Equivalent semantic block identities/nesting regardless of mode.
- Source retains raw source and has no hidden-syntax replacements.
- Code-block styling exists in all modes; fence/header presentation follows
  the mode policy.
- No nested duplicate list-content wrappers.
- List-looking text inside code/table content is not classified as a list.
- Syntax-flavor disabling is respected.
- Both rendered modes keep editable table widgets when the cursor enters.
- Mode switches preserve Markdown and undo/redo behavior.
- Existing indentation commands still move paragraph source lines together,
  never add first-line-only indentation, and can produce literal indented
  code blocks.
- Long-document parsing and edits near the beginning, middle, and end do not
  leave stale layout.

Update tests in `web/test/markdown-rendering-regressions.test.cjs` and any
other source-regex tests that require the old implementation. Replace those
assertions with behavior/invariant coverage; do not delete their
requirements or weaken tests merely to obtain a passing run.

### Real-browser geometry and interaction tests

Add a small real Chromium browser harness, using Playwright or an equivalent
maintained tool. Existing jsdom tests mock rectangles and cannot prove
wrapping geometry.

Load the actual built HTML/CSS/bundle and use the native bridge stubs only
where the browser lacks Android. Measure actual DOM text ranges/rectangles.
Fail on uncaught browser exceptions or reported decoration errors.

Test a phone-sized viewport and a wider viewport, with at least one
proportional font and one monospace font.

Cover:

- Every bullet marker; decimal, upper/lower alphabetic and Roman markers;
  Markdown/Wmdx tasks; nested items; continuation paragraphs; long wrapped
  items; and inline formatting inside list text.
- Hanging and non-hanging preferences.
- Syntax visible/hidden, cursor inside/outside affected constructs, and
  selection-driven reveal.
- Paragraph/heading spacing and quote/callout borders and wrapped content.
- Fenced and indented code blocks with list-looking literal content.
- Table cell entry, edit, commit, navigation, and mode switching without
  exposing the entire raw table in Live Preview.
- Viewport resizing and repeat mode switches.

Compare meaningful anchors and wrapping relationships with a small
subpixel tolerance. Account for the intrinsic width of visible syntax.
Do not demand identical total heights or line breaks across raw and
rendered projections, and do not substitute CSS-variable equality for
actual geometry.

A viewport resize is not proof of Android keyboard/IME behavior. Add
composition-event coverage where supported and report real device/keyboard
validation separately if unavailable in the execution environment.

### Build and CI coverage

Run:

```sh
cd web
npm run build
npm test
# Run the new real-browser suite using its documented package script.
cd ..
./gradlew assembleDebug testDebugUnitTest
```

Do not claim Android or browser verification if the required runtime is
unavailable; report the exact command and blocker.

The existing Debug workflow runs `node --test web/test/*.test.cjs`, not the
full bundled `npm test` command. Update the relevant existing CI workflow
steps to execute the complete suite, including the newly added browser
coverage with its required runtime installation. Do not silently leave the
new tests outside CI.

## Completion report

Provide:

- The implementation commit and branch.
- The final module/field ownership map.
- The removed competing rendering/layout paths.
- Actual build, unit-test, DOM-test, and real-browser results.
- Any unsupported runtime checks or remaining limitations, explicitly
  distinguished from verified behavior.

Do not describe a list-only adjustment, CSS-variable unification, or passing
mocked geometry tests as completion of this task.
