# Jules handoff: Callout folding, continuous nested borders, magnifier, and scroll placement

## Scope

- Apply this patch on the latest working branch that contains the functioning link behavior. Preserve that link work and all unrelated current behavior.
- Fix the four issues below in the existing CodeMirror 6 production implementation. Do not replace the editor, rewrite the callout renderer, or make unrelated styling changes.
- Preserve callout syntax, per-type appearance/settings, callout header controls, and current WYSIWYG/source-mode behavior.
- Reference screenshots: https://github.com/cinnabar777/ckeditor5/tree/fix/cm-conversion-5625725650131947556/images. Compare nested callout borders and fold indicators with the Obsidian examples supplied in the conversation.

## 1. Repair callout expand/collapse

Current behavior: the fold control is visible, but tapping expand/collapse does not reliably change the body.

- Trace the existing `CalloutTitleWidget`, callout range detection, and CodeMirror `foldEffect` / `unfoldEffect` flow in `web/src/main.js`.
- Compute each foldable callout's body range from its opener through the last line belonging to that callout. The title/opener must remain visible.
- Make each control reflect the actual `foldedRanges(view.state)` state after dispatch; do not rely only on the widget's stale `isFolded` value.
- A nested callout must fold and unfold its own body without accidentally folding/unfolding the parent or sibling. Folding an outer callout may hide all nested content; unfolding it must restore the nested callouts in their prior declared/default state.
- Preserve the `+` expanded and `-` collapsed source markers and their current initial-state meaning.
- Ensure the full callout heading remains the tap target. Prevent the tap from moving the editor selection or triggering an unrelated action.
- Handle empty callout bodies and edits that change the body range without throwing or leaving stale fold ranges.

## 2. Make nested callout vertical borders continuous

Current behavior: the vertical callout accent border is segmented, especially for nested callouts.

- Keep the existing per-type border color, width, style, and background settings.
- Track callout ancestry for every body line, not just the innermost callout. Nested body lines must retain the parent and child rail information so both vertical accents remain continuous through the nested region.
- Render continuous rails from the first through last body line of each callout. Remove only the internal vertical gaps that break the rails; preserve the existing separation between distinct callouts.
- Do not draw rails through unrelated following paragraphs or sibling callouts. Recompute the affected ranges correctly when nested quote depth increases/decreases or content is edited.
- Do not use a single border on only the opener line or a nested-callout border that replaces the parent's rail.

## 3. Fix Android magnifier jumping to the upper-left

Current behavior: in WYSIWYG, moving the text cursor over hidden Markdown syntax makes the Android keyboard magnifier jump to the top-left of the screen.

- Trace every syntax-hiding `Decoration.replace` and widget used in WYSIWYG/Live Preview, including callout markers, heading markers, links, list markers, and other inline syntax. Find which decoration breaks Android WebView's caret geometry.
- Keep the cursor and selection mapped to the original document positions while syntax is visually hidden.
- For hidden syntax that must remain addressable by the caret, use a rendering approach that retains a measurable inline text box/caret rectangle (for example, a transparent text mark) rather than removing the only DOM geometry under the touch point. Do not apply `display:none`, zero-size geometry, or move/focus the editor as a workaround.
- Keep syntax invisible in rendered WYSIWYG when the line is not actively edited; reveal the exact source syntax on the active editing line and in Source mode.
- Preserve tap-to-place-cursor, selection handles, and the existing magnifier behavior on ordinary text.
- Keep the change limited to the decoration paths needed to restore valid caret geometry.

## 4. Put navigation targets and restored reading position in view

Current behavior: links and the Table of Contents place the target at the bottom of the screen; reopening a document at its remembered position also places the text too low.

- Use one shared scroll-placement helper for same-document heading links and Table of Contents entries.
- Position the target heading in the upper-middle portion of the usable editor viewport (approximately 30% down from its top), not at the bottom edge. Account for the top search/header area, bottom toolbar, and Android safe areas.
- Use the editor's actual scroll container and current measured coordinates. Re-measure after CodeMirror/WebView layout settles; avoid default `scrollIntoView()` alignment or stale pre-layout offsets.
- Apply the same upper-middle placement when restoring a document's remembered cursor/reading position. Restore the cursor as before, but adjust the scroll so the line is comfortably visible below the top controls.
- Do not scroll when the target is already comfortably visible in the preferred region. Avoid repeated scroll corrections that cause flicker or jumps.
- Preserve existing navigation, history, and selection behavior.

## Relevant implementation areas

- `web/src/main.js`: `CalloutTitleWidget`, callout range/stack construction in `livePreviewPlugin`, fold initialization and `foldedRanges`, link/TOC navigation, and syntax-hiding decorations.
- `web/index.html`: `.cm-callout`, nested callout, and callout line CSS.
- Search the current branch for remembered cursor/scroll restoration before changing it; keep file serialization and document-open behavior untouched.

## Acceptance checks

- Add or update focused tests for fold/unfold range calculation, nested-callout ancestry/continuous rail classes, and shared anchor/restore scroll placement.
- Verify a foldable callout can be collapsed and expanded repeatedly; nested callouts remain independently usable after the parent is reopened.
- Verify long nested callouts show uninterrupted parent and child accent rails, with no rails leaking into following content.
- Verify hidden syntax retains valid caret geometry and does not cause a zero-origin magnifier/cursor rectangle in the relevant production decoration path.
- Verify heading links and TOC entries land in the upper-middle viewport, and remembered position restores there without moving an already-visible target unnecessarily.
- Run the existing web tests and production build; fix only regressions caused by this patch.
