# Jules follow-up: callout text color + real folding

## Base

Repository: cinnabar777/W.mdx
Branch containing the first callout implementation: 2-Jules-737999557587569881
Source commit checked: 04187eafe5b035733a30f0dd83f2a8d0d0c16d01

Use the latest tested working branch as the starting point and preserve the first-pass callout rendering. This follow-up is not a request to edit the repo outside Jules.

## What I verified

- The existing callout preferences include border thickness/style/color, background color, and padding, but no callout text color.
- The CSS rule for .cm-callout sets border, background, and padding, but no color property.
- main.js applies the existing callout variables, but no --callout-text-color variable.
- The matcher accepts an optional + or - after [!type], but those markers are only hidden in rendered mode. No body folding currently occurs.
- Documentation/Markdown.md describes + as initially expanded, - as initially collapsed, and includes nested callout examples such as > > [!todo]. The current opener matcher expects [!type] immediately after the first >, so nested callouts are not supported yet.

## Scope for this patch

Do these two related changes only:

1. Add a configurable callout text color.
2. Make the existing + / - fold markers actually expand and collapse the callout body.

Do not implement nested-callout rendering in this patch; leave that for a separate follow-up after folding is stable. Preserve nested Markdown text without modifying it. No toolbar changes, links, table work, icons, per-callout-type colors, or unrelated settings.

## A. Callout text-color setting

Use the existing callout settings category in app/src/main/res/xml/preferences_styling_blockquotes.xml.

Add a ResetColorPickerPreference:

- key: pref_callout_text_color
- title: Callout Text Color
- summary: Text color for callout titles and body
- default: default/inherit, following the existing color-picker convention used by the neighboring callout settings

Wire the key end-to-end:

1. Add reset/default handling in app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt, following the established reset behavior for the blockquote text color.
2. In web/src/main.js, apply the preference as the --callout-text-color CSS variable alongside the other callout variables.
3. In web/index.html, set color: var(--callout-text-color, inherit) on .cm-callout. The title must inherit this color unless explicitly styled otherwise.
4. Verify changing the setting updates both the callout header and body immediately, and resetting restores inherited theme text color. Do not change ordinary blockquote text color.

## B. Real + / - fold behavior

Expected Markdown behavior:

- > [!note]+ Title ... starts expanded, but can be collapsed and expanded by the user.
- > [!note]- Title ... starts collapsed, but can be expanded and collapsed by the user.
- > [!note] Title ... remains expanded and has no fold control.
- The + / - marker remains the source of the initial state. A tap changes only the current view state; it must not rewrite the Markdown. Reopening the document restores the state indicated by the source marker.

Implementation requirements:

1. Add a small, clearly tappable chevron/button in the rendered callout title only when + or - is present. Make the button accessible (button semantics and an expand/collapse label). Do not make the entire title row a toggle; users need to tap/edit the title without collapsing it.
2. Fold only the body after the opener line. Keep the title/header visible. Unfolding restores the original body in place.
3. Use CodeMirror's folding/state APIs or an equivalent editor-state mechanism. Do not hide .cm-line with CSS display:none and do not remove or rewrite source text; that can break cursor mapping, selection, keyboard navigation, and saved Markdown.
4. Derive the initial open/closed state from + / - when a document is loaded or its opener is edited. Keep manually toggled state stable across ordinary selection/viewport decoration refreshes; do not reset it on every plugin rebuild.
5. Mapping through document edits must not leave a fold attached to the wrong callout. If the opener is deleted or its fold marker is removed, clear that fold state safely.
6. In Source mode, leave Markdown fully visible and editable. In Live Preview, keep the existing rule that reveals raw callout syntax when the caret is editing the opener. The chevron must not overlap the marker replacement decoration.
7. Use the existing contiguous-quoted-body boundary for this version. No nested fold ownership or nested callout rendering in this patch.

## Tests

Extend web/test/callout.test.cjs or add a focused test file. Test actual production helpers/state logic, not copied test-only implementations.

- pref_callout_text_color exists, is forwarded/applied, and resets to inherit/default.
- Callout text-color CSS affects the header and body, while ordinary blockquote text remains controlled by its existing setting.
- No marker means expanded and no fold control.
- + means initially expanded and foldable; - means initially collapsed and foldable.
- Tapping the chevron toggles only the body; title remains visible and editable.
- Toggling does not change the document text; save/reopen derives initial state again from + / -.
- Editing/removing the opener or marker clears/recomputes fold state without orphaned hidden text.
- Selection and keyboard navigation remain valid after fold/unfold.
- Nested example text remains byte-for-byte intact; nested rendering is explicitly not part of this patch.

Run npm test, npm run build, and the Android debug build. Report the actual results. Do not claim device behavior is fixed until the APK is tested on the phone.

## Phone test

Test one expanded (+), one collapsed (-), and one non-foldable callout. Toggle each foldable one several times, edit text immediately before and after the fold, save, close, and reopen. Confirm + opens, - starts closed, no-marker has no chevron, source text is unchanged, text color applies to title and body, and resetting the color restores theme inheritance.

## Separate next task

Nested callouts are documented in Markdown.md but intentionally deferred. After this patch passes, handle nested quote depth as its own task with dedicated tests for two and three nested levels, including independently folded nested blocks.
