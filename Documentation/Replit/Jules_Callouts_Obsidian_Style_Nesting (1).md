# Jules patch: callout styling, nesting, and folding

## Base

Repository: cinnabar777/W.mdx
Branch: 2-Jules-737999557587569881
Latest source checked: 85503eb30d1dec47a032e08e01fc18be6dd518fc

Use the newest tested working commit in this branch as the base. The user has confirmed callout folding and callout text color work. Preserve both; this is an enhancement pass, not a rewrite.

## Current gaps confirmed in source

- Callouts currently use one common style; the type is parsed for the title, but no type-specific styling/icon is applied.
- The current parser expects one leading quote marker before [!type]. It does not recognize nested openers such as > > [!todo].
- The built-in CodeMirror fold placeholder still has its default chip styling. The custom callout chevron is a separate control.
- Documentation/Markdown.md includes info, faq, question, todo, example, foldable callouts, and nested callouts.

## Scope

1. Hide Markdown quote markers in the rendered callout view, including nested levels.
2. Add distinct default colors and icons for the callout types documented in Markdown.md.
3. Add usable header styling controls without multiplying every setting by the number of callout types.
4. Support nested callout rendering and independent folding.
5. Remove the redundant folded-content ellipsis; the full heading is the fold control.

Do not modify the toolbar, links, tables, Find & Replace, or saved Markdown syntax. Do not remove or rename the existing callout settings.

## A. Hide quote markers in rendered callouts

- In WYSIWYG, no leading > markers should be visible on callout header or body lines, including nested > > and > > > levels.
- In Live Preview, reveal the original quote markers only on the line where the caret/selection is actively editing Markdown, consistent with existing syntax-reveal behavior.
- In Source mode, show all Markdown syntax exactly as written.
- Hiding is visual decoration only. Do not delete, normalize, or rewrite markers in the document.
- Preserve normal blockquotes and current blockquote preferences.

## B. Per-type default styling and icons

Use a centralized safe map keyed by normalized callout type. Never put untrusted type text into raw HTML or an unsanitized CSS selector. Use data-callout-type and data-callout-depth attributes or an allowlisted class map.

At minimum, implement the documented types with a visually distinct accent/background and small inline icon:

- info: blue information style
- faq and question: warm orange/amber question style
- todo: blue/cyan check style
- example: purple example/list style

Unknown types must fall back to the existing generic callout appearance without breaking layout. Keep the user's existing global Callout Text Color, Border Thickness/Style/Color, Background Color, and Padding settings working. Do not remove or silently change what those existing settings control.

Icons are decorative and must not replace or alter the title text. Use inline SVG with currentColor or CSS-masked icons; make them aria-hidden. Do not add external icon dependencies.

## C. Callout header styling settings

Add these controls to the existing Callout settings page. Do not put them under an unrelated settings category and do not replace the working settings page.

### Shared header controls

Provide one shared set of controls for all callout headers:

- Header background color.
- Header title text color.
- Header title text size.
- Header font family, using the app's existing font choices; include a default/inherit choice.
- Header font weight.
- Header padding/spacing.
- Header accent/border color and thickness, reusing existing border-style choices where practical.

These controls affect the header only. They must not change callout body text, body background, or the existing global callout settings. Keep the existing Callout Text Color setting responsible for body text.

### Per-type overrides

Add a compact type selector for the documented callout labels: `info`, `faq`, `question`, `todo`, and `example`. Keep `faq` and `question` as distinct selectable labels even if they share the same initial palette.

- Each type inherits the shared header controls by default.
- Allow a type-specific override only for header background color, title text color, accent/border color, and built-in icon choice.
- Each override needs an explicit “Use shared/default” reset so users can undo it.
- Do not repeat font, size, weight, padding, or border thickness controls for every type.
- Unknown callout types use the generic fallback and shared header controls.
- Do not add pasted or uploaded custom SVG icons in this pass.

### Preview and application

- Include a small live preview on the Callout settings page, with a selector or samples for the documented types.
- Changing a shared value updates every type that inherits it; changing a type override updates only that type. The preview must use the same CSS variables/render path as the real editor, not a separate mock-only style.
- Changing a setting must update the preview and the open editor without requiring the user to close/reopen the document or rebuild the editor.
- Persist values through the existing preference mechanism and restore defaults correctly.
- Clearly label header settings separately from body/global callout settings.

## D. Nested callouts and folding

Recognize quote depth and callout header after that depth, for example:

~~~md
> [!question]+ Can callouts be nested?
> Outer text.
> > [!todo]- Yes, they can.
> > Child text.
> > > [!example] Multiple levels
> > > Nested text.
~~~

Requirements:

- Support at least three nested levels.
- Each nested callout gets its own type style, title, and fold button.
- The child block is visually inside the parent, with readable indentation and separate background/accent styling; do not simply paint every line as one flat outer callout.
- Folding a child hides only its body. Folding a parent hides all of its descendants. Expanding the parent restores any child fold state that was already active.
- Preserve existing semantics: + starts expanded and foldable; - starts collapsed and foldable; no marker means expanded and not foldable.
- Make the entire rendered callout heading row the fold toggle target; do not require a small chevron hit area. Keep the visible chevron as an affordance and provide an accessible expanded/collapsed label on the heading control. In Live Preview, when the opener is in active source-editing state, preserve the ability to edit its Markdown instead of toggling unexpectedly; in WYSIWYG, tapping anywhere in the rendered heading toggles folding.
- Use CodeMirror fold/state APIs, not CSS display:none on editor lines. Do not alter the source text when toggling or rendering.
- When a nested line is edited, reveal its own Markdown markers without causing the parent or sibling callout markers to flash or become visible.

## E. Remove the redundant folded-content ellipsis

CodeMirror's fold placeholder is currently visible at the end of collapsed content. With the full rendered callout heading acting as the fold toggle, this extra ellipsis is unnecessary. Hide only the CodeMirror callout fold placeholder (the .cm-foldPlaceholder inside the callout heading/fold range) in rendered callouts. Keep the heading's chevron and accessible expand/collapse state. Do not add an ellipsis color preference, and do not hide fold placeholders globally or affect code folding/other editor widgets.

## Implementation notes

- The current implementation in web/src/main.js scans quoted lines in livePreviewPlugin.buildDecorations(), and the title/fold button is CalloutTitleWidget. Extend these paths rather than adding a second editor or competing plugin.
- Parse quote depth first, then detect [!type] after the depth prefix. Track each callout's parent, opener, and body range; the current flat inCallout boolean is insufficient for nesting.
- Keep decorations non-overlapping with QuoteMark replacements and fold placeholders. Use syntax-tree context to exclude fenced/indented code and tables.
- Add styles in web/index.html and reuse the existing callout CSS variables/settings. Add default palette variables for the five documented labels, shared header variables, and type-specific override variables.
- Keep header and body CSS variables separate. Apply defaults, shared header preferences, and per-type overrides through one documented precedence path; do not let a header setting accidentally overwrite body styling.
- Wire the settings-page preview and the editor to the same preference values and CSS variable application code.
- Preserve content byte-for-byte across render, fold/unfold, save, and reopen.

## Tests and verification

Add/update actual production-path tests in web/test/callout.test.cjs:

- Every documented type maps to the correct default palette and icon; unknown type uses generic fallback.
- Shared header settings affect all documented types; per-type color/icon overrides affect only the selected type; reset restores inheritance.
- Header settings never change body text or body styling. Existing global callout preferences retain their current behavior.
- The settings preview matches the live editor and updates immediately after changing a setting.
- No > marker is visible in WYSIWYG, including two- and three-level nested examples; Source mode is unchanged; active Live Preview line reveals only its own source markers.
- Nested callouts render at depths 1, 2, and 3; parent and child title/body styles stay distinct.
- Tapping anywhere on a rendered callout heading toggles its fold; child fold/unfold is independent; parent folding hides all descendants and restores a previously folded child state.
- +, -, and no-marker initial behavior remains correct.
- No redundant ellipsis appears for folded callout content; the full heading still expands/collapses it. Non-callout fold placeholders/widgets are unchanged.
- Render/fold/unfold/edit/save/reopen never changes the Markdown text except for explicit user edits.

Run npm test, npm run build, and the Android debug build. Report real results and stop for phone testing; do not claim device behavior is verified by unit tests.

## Phone test

Use the nested examples in Documentation/Markdown.md. Verify the shared header controls and per-type overrides in Settings and in an open document; body styling stays independent; the outer question callout, nested todo, and third-level example have distinct styles/icons; no > appears in rendered view; tapping anywhere on a rendered heading folds/unfolds; parent/child folds behave independently; + and - initial states remain correct; no extra ellipsis appears; saving/reopening preserves the exact source.
