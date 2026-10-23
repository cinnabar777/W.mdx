# Jules handoff: finish typography backlog and stabilize the editor scroll patch

## Branch and baseline

- Continue from `jules-11272644051718230553-7da86aec`, currently based on `main` commit `599e505` and containing the scroll/lifecycle work at `6a857f3`.
- Preserve that branch as the checkpoint. Do not reset to `main`, replace the editor, push to `main`, or merge.
- The latest phone capture is a 5,440-line / 230,906-character document opened in WYSIWYG. The user reports scrolling may feel better. Preserve the improvement; do not roll back the scroll patch wholesale.
- Root `Typography.md` is the user's current checklist. Treat items marked “fixed” there as protected behavior. Do not update the checklist until the user has verified the corresponding behavior in a phone build.

## Workstreams and commit boundaries

Make one focused Jules pass, with separate logical commits so each workstream can be reverted independently:

1. Correct the existing scroll/performance branch defects and add meaningful regressions.
2. Complete the open typography/rendering items listed below.
3. Finish the bounded settings/layout items below.

If a feature cannot be completed safely in this pass, leave its current behavior intact and report the blocker and exact missing work. Do not claim it is fixed because a preference or CSS selector exists.

## 1. Correct the scroll/performance branch without losing the improvement

### Fix the decoration sentinel performance regression

In `web/src/main.js`, `tableStateField` and `wysiwygCodeBlockField` use `current === Decoration.none` as if an empty decoration set meant “not initialized.” Their builders return `Decoration.set(builder, true)`; when a document has no tables or code blocks, the result is empty. Ordinary edits to those documents can therefore trigger a full-document scan on every keystroke.

- Do not use an empty `DecorationSet` as an initialization marker. StateField `create()` already initializes the field.
- Map an empty set through ordinary changes just like any other set.
- Rebuild only for a relevant structural change, an explicit refresh effect, or a confirmed edit to the corresponding table/code block.
- Add a deterministic regression using a long plain-text document with no tables or fences. Assert that an ordinary edit does not call the full-document table/code-block builders. Keep separate regressions for edits that add, remove, or change a table/fence.

### Restore code-block refresh behavior

In `wysiwygCodeBlockField.update()`, the early `if (!tr.docChanged) return current` now precedes the `heightMapRefreshEffect` check. The earlier implementation rebuilt on `heightMapRefreshEffect`, which is dispatched when deferred syntax parsing finishes without a document edit.

- Return `current` only when there is neither a document change nor a relevant refresh effect.
- Rebuild the affected code-block decorations when the parse/height refresh effect arrives, even if `tr.docChanged` is false.
- Add a regression that dispatches the refresh effect without a document edit and verifies code-block decorations reflect the completed syntax tree.

### Finish lifecycle cleanup

- Keep the new explicit disposers for `setupNavigationDiagnostics()` and the fast scrollbar.
- In `web/src/navigationCapture.js`, the disposer must also remove the `pagehide` listener registered for `flush`.
- Track or guard pending animation-frame and timeout callbacks so disposed captures cannot inspect a destroyed view or enqueue more records.
- Keep cleanup idempotent. Do not remove diagnostic reporting or change its schema.
- Add a behavioral mode-switch regression that verifies listener/observer counts return to one active capture and that events from destroyed views do not produce traces. Do not use an immediate assertion that runs before buffered batches flush.

### Scroll/reflow acceptance

The new long-document capture did not show the prior run's 1,700px scroll-position reversal, which is encouraging. It did show content height growing from about 219,752px to 242,538px, with 129 adjacent scroll samples changing by at least 100px (largest increase 1,139px). Most recorded top deltas followed the scroll direction, so do not assume every height change is a user-visible jump.

- Use the 5,440-line document or an equivalent long fixture. Exercise WYSIWYG scrolling through headings, lists, callouts, code blocks, tables, and footnotes.
- Add a real browser/WebView-capable reflow test where available. Record the same visible document location and its screen coordinate before and after height changes above and below it.
- Distinguish user-driven fling/inertia from an unrequested scroll correction. Do not “fix” normal scroll deltas, remove typography, shrink the existing overscan by guesswork, or add repeated timeout/animation-frame scroll corrections.
- Preserve the existing `overflow-anchor` strategy and table-action anchor handling unless a reproduced case shows which one is wrong.
- The first capture's large jump coincided with DOM mutations and resize notifications; the second had no similarly large collapse/reversal. Re-run the same long-document scenario after changes and report what the new trace demonstrates. Do not present screenshots alone as proof of smooth scrolling.
- The trace still contains `scroll-idle` and large-delta screenshot requests. Keep capture bounded and do not restore per-scroll-sample snapshots.

## 2. Typography.md: finish open rendering and typography behavior

Inspect existing preference keys and CSS/JS bridges first. Reuse existing settings; do not add duplicate keys or replace the rendering architecture.

### Headings

- Preserve global heading settings as the defaults.
- Allow H1 through H6 to override the existing heading style controls independently. An unset per-level value inherits the global value; setting H2 must not change H1 or H3.
- Apply and test color, font/weight, scale/size, alignment, and margins for each level where those controls already exist. Keep heading navigation/anchors and current heading layout stable while scrolling.

### Body and code blocks

- Body font size must not resize code blocks. Keep code at its separate intended size (14 CSS px unless the existing preference specifies another default); body-size changes must leave it unchanged.
- Add the requested code-block body background setting using the existing preference/bridge patterns.
- In WYSIWYG, keep the language/copy header visible whenever the code block is rendered; it must not appear only after placing the caret inside the block.
- Wire the existing/needed header settings for label background/text, copy control background/text, and border. Reuse existing color preferences where available and retain the current copy action and accessible labels.

### Links and footnotes

- Make the existing link-decoration/underline preference visibly change WYSIWYG links and reset back to its default.
- Provide a URL-entry/edit dialog for inserting or editing a link in WYSIWYG, where Markdown URL syntax is hidden. Preserve the selected text, document contents, and caret/selection on cancel, submit, and reopen; do not rewrite unrelated Markdown.
- Footnote references, definitions, section, and backlinks must be real rendered behavior—not CSS-only styling on syntax that is not parsed/rendered. Wire the requested note font size/text color, reference color, backlink color, and footnote-section background settings, with working reset controls.
- Prefer a focused extension using the current Markdown/Lezer stack. Do not add a parser dependency or replace the Markdown renderer without documenting the technical need and the exact package change in the Jules report.
- Add tests for multiple references to one definition, missing/duplicate definitions, backlinks, editing/revealing source syntax, and save/reopen.

### Lists and checkboxes

- Fix continuation/wrapped lines so the start of every continuation line aligns under the list text after the marker, not under or flush against the marker. Do not insert spaces or otherwise rewrite Markdown to fake indentation.
- Add the requested unchecked checkbox background and checked mark color controls.
- If adding the option to hide the extra list bullet before a task checkbox, make it a WYSIWYG presentation setting only. The Markdown `[ ]`/`[x]` source and normal source mode must remain unchanged.
- Preserve the currently working list bullets, selection, and keyboard navigation. Verify nested ordered/unordered lists and long wrapped items.

### Callout insertion, divider, and controls

- Callout rendering/folding already exists in the current code. First verify whether a callout toolbar command and configurable shortcut are already present. If either is missing, add only the missing insertion command/shortcut; do not rewrite callout syntax, nesting, styling, or folding.
- Center the horizontal divider within the editor content when its width is constrained. Preserve the current width control; do not use a viewport-dependent magic offset.
- Add the missing toolbar-toggle color controls. Reuse `pref_toolbar_toggle_bg_color` if it is still the correct setting, and add only the missing complementary color/state key(s).
- Reset controls already work generally; fix the remaining slider-row alignment without changing reset semantics or shifting rows when the reset icon is invisible. Reuse `pref_settings_reset_inactive_icon_color`; do not create a duplicate preference.

### Cursor and drag indicator additions

- Add the requested cursor color, blink-rate, and drag-balloon color settings using current settings conventions.
- Defaults must preserve the current appearance. Clamp blink timing to a usable nonzero range and ensure settings do not change text-selection behavior or accessibility.

## 3. Protect behavior already marked fixed

Do not regress or reopen these Typography.md items:

- Paragraph font, letter spacing, and top margin.
- Table border style/thickness/color, header/cell colors and weight, and cell padding.
- Bottom control bar behavior except the missing toggle color settings.
- Text selection, editor navigation, existing list bullet styling, and general reset behavior.

Do not implement optional CodeMirror features (autocomplete, lint, extra keymaps/gutters) in this pass. Do not remove historical CKEditor references from documentation.

## Test/API/scope constraints

- Remove the test-only `window.editorBridge.activeAdapter` getter added in the previous branch. Do not expose internal adapters or editor views as a production bridge API. Use the existing editor DOM/test harness to observe behavior.
- Do not modify `web/build_tests.cjs`. Put new source-level tests into already-registered test specs; add direct behavioral tests under `web/test/`.
- Keep implementation changes limited to:
  - `web/src/main.js`, `web/src/navigationCapture.js`, `web/src/tableWidget.js`, and `web/index.html`
  - focused existing/new tests under `web/test/` and `web/test_sources/` (without changing the test bundler)
  - existing Android preference/bridge files needed for the listed settings, including relevant `preferences_styling_*.xml`, hotkey preference XML if a callout shortcut is missing, `MainActivity.kt`, and `ResetPreferences.kt`
  - `Typography.md` only after phone verification of the corresponding items
- No unrelated Android UI, toolbar features, document formats, table behavior, build/workflow files, dependencies, or broad refactors.

## Verification and Jules report

- Run `cd web && npm test && npm run build`.
- Run the Android debug build if available.
- On a phone, verify the Typography.md items that are changed and repeat the 5,440-line WYSIWYG scroll test. Record the exact app build/source commit used.
- Update only verified statuses in `Typography.md`; leave anything not phone-tested open.
- Return the branch/commit and list changed files grouped by workstream. Report test/build results, phone results, any added preference keys/dependencies, and each item not completed. Do not push or merge to `main`.
