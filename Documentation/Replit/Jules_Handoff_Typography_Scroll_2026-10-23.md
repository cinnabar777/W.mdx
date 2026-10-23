# Jules handoff: repair the scroll patch and implement the agreed typography behavior

## Scope confirmed with the user

Implement the items below only. Do not add application features or UI not listed here.

Include:

- Correctness and lifecycle fixes for the reviewed long-document/scroll branch.
- Heading defaults and per-level overrides, footnotes, checkbox styling, callout heading wrapping, code-block colors, and reset-icon alignment.

Exclude:

- Toolbar and bottom-control-bar styling/features (including show/hide-toggle colors). The one allowed toolbar-related change is wiring the existing `InsertFootnote` action to its specified popup; do not change toolbar layout, styling, or other actions.
- Text-selection endpoint behavior. That will be handled in a separate handoff.
- Link dialogs, horizontal divider changes, paragraph/body changes, table styling, cursor/drag settings, or any other Typography.md item not listed above.
- New CodeMirror packages or optional editor features. Report available options separately; do not implement them here.

Do not remove historical CKEditor references from documentation. The current runtime app/Web source audit found no CKEditor code to clean up.

## Reviewed branch context

- Reviewed only `jules-11272644051718230553-7da86aec`, commit `6a857f3`, against the latest fetched `main` source at `87756af`.
- Preserve the current scrolling improvement. Do not revert the incremental updates, table measurement-key reduction, or reduced diagnostic snapshots wholesale.
- The branch diff passes `git diff --check`.
- The branch’s five new `.test.cjs` checks pass, but they mostly assert source strings. The new jsdom behavior spec was not run because dependencies are not installed in this workspace.

## 1. Correct the scroll/lifecycle branch

### 1.1 Fix empty-decoration sentinels and refresh ordering

In `web/src/main.js`, an empty `DecorationSet` is a valid result, not an “uninitialized” marker. Remove every `current === Decoration.none` full-document rebuild condition from `wysiwygCodeBlockField`, `tableStateField`, and `persistentLayoutField`.

In `wysiwygCodeBlockField.update`, the refresh effect must be checked before the ordinary no-document-change return. Keep this order:

```js
const refreshHeight = tr.effects.some(effect =>
  effect.is(heightMapRefreshEffect)
);
if (refreshHeight) {
  return buildWysiwygCodeBlockDecorations(tr.state);
}
if (!tr.docChanged) return current;
```

After mapping `current`, keep the mapped set when the change does not intersect a code node or fence. Rebuild only for the explicit refresh or a relevant code/fence edit. Do not let a plain-text document with no code fences trigger a document-wide code scan on every edit.

In `tableStateField.update`, replace the empty-set sentinel with an explicit height-effect check, before the no-document-change return:

```js
const tableHeightsChanged = tr.effects.some(effect =>
  effect.is(tableHeightEstimatesChanged)
);
if (tableHeightsChanged) {
  return buildTableBlockDecorations(tr.state);
}
if (!tr.docChanged) return current;
```

Keep the existing source-mode guard and table-local invalidation logic. Ordinary edits outside tables should map the current decorations; edits affecting a table or pipe syntax may rebuild the table decorations.

In `persistentLayoutField.update`, rebuild for explicit typography or height-map refresh effects, then return unchanged state for transactions without document edits:

```js
const refresh = tr.effects.some(effect =>
  effect.is(typographySettingsEffect) ||
  effect.is(heightMapRefreshEffect)
);
if (refresh) return buildPersistentLayoutDecorations(tr.state);
if (!tr.docChanged) return current;
```

Then keep the existing changed-range expansion and mapped-decoration update. Do not use `current === Decoration.none` to trigger a full scan. `setEditorMode()` destroys and recreates the editor, so each mode’s state fields are created for that mode.

### 1.2 Finish capture cleanup

In `web/src/navigationCapture.js`, `setupFullNavigationCapture()` registers `pagehide` with `flush` but its disposer does not remove that listener. Use a stable named handler, register it once, and remove it in `dispose()`:

```js
const onPageHide = () => flush();
win.addEventListener('pagehide', onPageHide, { once: true });
```

Also track the pending MutationObserver animation-frame ID (or fallback timeout ID). Clear the ID when its callback runs, check `disposed` before enqueuing records, and cancel the pending callback in `dispose()`. Keep the disposer idempotent and preserve the diagnostic record schema.

In `setupNavigationDiagnostics()` in `web/src/main.js`, keep the branch’s cleanup handles for key, pointer, selection, scroll, and capture listeners. Track/cancel the outstanding key `requestAnimationFrame` and 50ms callbacks plus pointer-up/pointer-cancel finalization timeouts. Every delayed callback must check `disposed` before reading `view` or reporting. Clear all outstanding handles in the returned disposer.

### 1.3 Keep the performance changes; remove the two scope violations

- Keep the `tableWidget.js` removal of paint-only color values from `TABLE_HEIGHT_STYLE_PROPERTIES`; colors do not change measured height.
- Keep the `navigationCapture.js` behavior that avoids a snapshot for every ordinary scroll. Preserve large-delta and scroll-idle snapshots and the existing report schema.
- Keep the fast-scrollbar/TOC lifecycle cleanup already in the branch. Do not add toolbar features or colors.
- Remove `get activeAdapter()` from the production `window.editorBridge` object. It was added only to let a test reach the view.
- Revert only the new registration line in `web/build_tests.cjs`; the previous brief prohibited changing the test bundler. Move lifecycle coverage into the already-registered `web/test_sources/navigation_capture.spec.cjs` and decoration/refresh coverage into `web/test_sources/rendered_mode_refresh.spec.cjs`. Delete the now-unregistered `editor_lifecycle_incremental.spec.cjs`.
- In a test that needs the view, use the editor DOM and `EditorView.findFromDOM(...)`; do not expose the adapter or view through the Android/web bridge.

### 1.4 Replace weak tests with behavior checks

The current lifecycle test dispatches `blur` and `scroll` and immediately checks that no trace was reported. That does not wait for buffered callbacks and does not count listeners or observers. Replace it with a mode-switch test that:

- Counts active listeners and Resize/MutationObserver lifetimes across repeated WYSIWYG/source/live-preview switches.
- Waits for buffered callbacks to flush before asserting that disposed views produce no traces.
- Confirms the count returns to one active capture after each switch, then to zero after destroy.

The current incremental test only compares decoration counts; a full rebuild can pass that assertion. Add checks that verify unchanged decorations outside the edited range are preserved/mapped and that refresh effects update code decorations even when `tr.docChanged` is false. Include a long plain-text document with no tables or fences and ordinary edits.

Do not use wall-clock performance thresholds. Do not add repeated scroll-correction timers or change overscan/`overflow-anchor` by guesswork. Add/retain a reflow test that checks the same visible document location remains at the same screen coordinate after height changes above and below it. Preserve user-driven fling/inertia.

## 2. Headings: global defaults with six independent collapsed sections

In `app/src/main/res/xml/preferences_styling_headings.xml`, keep a Global Headings section and add six collapsed/expandable sections, H1 through H6. Each section starts collapsed and expands inline when tapped. Use the same control types and ranges as the global controls.

The current global controls are:

| Global control | Per-level key pattern |
|---|---|
| `pref_heading_scale_percent` | `pref_heading_<n>_scale_percent` |
| `pref_font_weight_heading` | `pref_heading_<n>_font_weight` |
| `pref_font_file_heading` | `pref_font_file_heading_<n>` |
| `pref_heading_align` | `pref_heading_<n>_align` |
| `pref_heading_line_height` | `pref_heading_<n>_line_height` |
| `pref_heading_letter_spacing` | `pref_heading_<n>_letter_spacing` |
| New `pref_heading_word_spacing` | `pref_heading_<n>_word_spacing` |
| `pref_heading_text_transform` | Reuse existing JS key `pref_heading_<n>_transform` |
| `pref_heading_underline_style` | `pref_heading_<n>_underline_style` |
| `pref_heading_underline_thickness` | `pref_heading_<n>_underline_thickness` |
| `pref_heading_underline_color` | `pref_heading_<n>_underline_color` |
| `pref_heading_margin_left` | `pref_heading_<n>_margin_left` |
| `pref_heading_margin_right` | `pref_heading_<n>_margin_right` |
| `pref_heading_margin_top` | `pref_heading_<n>_margin_top` |
| `pref_heading_margin_bottom` | `pref_heading_<n>_margin_bottom` |
| New global default color `pref_heading_color` | Keep existing `pref_heading_<n>_color` |

Here `<n>` is `1` through `6`. Reuse existing per-level keys for color, alignment, line height, letter spacing, transform, underline, top/bottom margin, and font weight where present. Do not create duplicate keys for those settings. For per-level scale, use the explicit percent key above and preserve compatibility with the legacy `pref_heading_<n>_scale` value if it exists.

### Inheritance and reset behavior

- An unset per-level value uses the current global value. A set H2 value affects only H2.
- The per-level reset icon clears that level’s stored override and immediately reapplies the live global value. It must not reset to a fixed factory default.
- Show the effective global value in an unset per-level control; the reset icon is inactive until an override exists.
- Per-level color unset/inherit falls back to the new global `pref_heading_color`; an explicit H1–H6 color overrides it.
- Keep H1–H6’s existing base-size hierarchy. The per-level scale overrides the global scale for that level; it does not multiply on top of the global scale.
- Add `pref_font_file_heading_1` through `pref_font_file_heading_6` to `StylingSettingsFragment`’s `fontKeys` list. In `MainActivity.kt`, load each `pref_font_file_heading_<n>_path` with `loadFontDataUri()` and add six matching optional data-URI arguments to the existing `setFontSettings()` bridge call. In `web/src/main.js`, register each font with the existing `applyFontCategory()` helper and `--heading-<n>-font-family`. An unset level font falls back to the global heading font.

In `web/src/main.js` and `web/index.html`, wire effective values to `--heading-<n>-*` variables and apply the matching CSS property to `.cm-heading-<n>`. Add `word-spacing` separately from `letter-spacing`. Add per-level left/right margins as well as the existing top/bottom overrides. Keep heading anchors, ToC behavior, and the H1–H6 base-size ratios unchanged.

For the new global word-spacing control, use a resettable text/number control labeled “Heading Word Spacing (px)” with `0px` as the no-extra-spacing default. Apply it with CSS `word-spacing`; do not change or relabel letter spacing.

## 3. Footnotes: popup authoring and real WYSIWYG rendering

The current `InsertFootnote` command inserts literal `[^1]` and `[^1]: footnote text`. Keep the existing toolbar layout unchanged, but change only this existing action to open a footnote text popup.

On Save:

1. Generate the next unused numeric ID, accounting for existing references/definitions.
2. Insert `[^n]` at the current cursor without replacing surrounding text.
3. Append `[^n]: <entered note text>` after existing footnote definitions at the end of the document, with correct blank-line separation.
4. Close the popup without changing any other document text.

Cancel must make no document change. Preserve Markdown source syntax. Render references, definitions as a footnote section at the document end, and a return/back-link in WYSIWYG using the current Lezer/Markdown stack where feasible. If a parser/plugin dependency is technically necessary, document the exact need and package before adding it; do not replace the renderer.

The existing XML already uses resettable controls for `pref_footnote_font_size`, `pref_footnote_text_color`, `pref_footnote_ref_color`, `pref_footnote_link_color`, and `pref_footnote_bg_color`. Do not add duplicate reset icons or keys. Ensure every reset icon is visible and usable; fix the existing binding if any is missing. Ensure the controls visibly style rendered note text, reference, back-link, and section background; verify each reset returns to its current default.

Test multiple references to one definition, cancel/no-change, successive unique IDs, backlinks, source syntax preservation, and reopening a saved document. Missing or duplicate definitions must be handled deterministically without breaking rendering.

## 4. Lists and checkboxes

In `app/src/main/res/xml/preferences_styling_lists.xml`, add a resettable switch under “Todo List Checkboxes”:

```xml
<com.wmdx.markdownapp.ResetSwitchPreference
    app:key="pref_list_hide_todo_bullet"
    app:title="Hide Bullet Before Checkbox"
    app:summary="Hide the extra list bullet before task checkboxes in WYSIWYG"
    android:defaultValue="false" />
```

Default remains the current appearance (bullet shown). When enabled, hide only the extra bullet for task-list items in WYSIWYG. Do not rewrite `- [ ]`/`- [x]` Markdown or change source mode.

Add a separate resettable color control `pref_todo_checkmark_color`; keep `pref_todo_checked_color` as the checked-box fill/accent. Replace the hard-coded `#111111` in `.cm-todo-checkbox:checked::after` with `var(--todo-checkmark-color, #111111)`. Default/reset must preserve the current checkmark appearance.

## 5. Callouts: always align wrapped heading text after the icon

Use the supplied Obsidian screenshot as the target. Keep the icon in its own fixed gutter. Every wrapped callout-heading line must begin at the same horizontal position as the first heading text after the icon. This is always-on; do not add a “Style as block” setting.

In `web/index.html`, retain the title container’s icon/text structure and allow the text flex item to shrink and wrap:

```css
.cm-callout-title-container {
  max-width: 100% !important;
}
.cm-callout-icon {
  flex: 0 0 auto !important;
}
.cm-callout-title-text {
  flex: 1 1 auto !important;
  min-width: 0 !important;
}
```

Keep fold controls, title text, callout body layout, and callout syntax unchanged. Add a wrapped-title regression with a title long enough to wrap; assert the continuation starts beneath the first title character, not beneath the icon or container edge.

## 6. Code-block styling

Keep existing `pref_code_block_bg_color` as the full code-block surface color. Add an independent resettable `pref_code_block_text_bg_color` and apply it only behind code text ranges; do not paint the full `.cm-codeblock-line` with this variable. The screenshot shows the text fill as a tight strip behind the code text while the separate block background fills the whole block.

In `preferences_styling_code.xml`, add resettable controls for:

- Language-label/header background (`pref_code_block_label_bg_color`).
- Copy-button background (`pref_code_block_copy_bg_color`).
- Copy-button text (`pref_code_block_copy_text_color`).
- One shared border color (`pref_code_block_border_color`) for the code-block outline, header divider, and copy-button border.

Reuse the existing language-label text key `pref_code_block_lang_label_color`. Wire the values through `ResetPreferences.kt`, `MainActivity.kt`, `applyAllPreferences()` in `web/src/main.js`, and `CodeBlockHeaderWidget`. Map the shared border value to both the existing header and copy-button border variables. Preserve the existing copy action, language text, and accessible behavior.

Test that changing the text-only fill does not change the block surface, changing the block surface does not change the text-only fill, and all three border locations use the same configured color.

## 7. Reset-icon alignment

Use the supplied settings screenshot as the target. Reset arrows on slider rows currently sit left of reset arrows on color/text rows. Align all reset arrows in the same far-right column; keep the slider’s numeric value immediately to the left of its reset arrow.

In `PreferenceResetHelper.bindResetButton()` in `ResetPreferences.kt`, do not append the reset button to the immediate parent of `R.id.seekbar`. Put the slider track/value and reset button in a shared trailing row inside `android.R.id.widget_frame`, with the slider track taking remaining width and the reset button fixed at the far right. Preserve reset semantics and do not shift the row when a reset icon is hidden.

Verify with the settings screen that slider, color-picker, and text-setting reset icons share one right edge and the slider value remains directly before the icon.

## 8. Test/API boundaries and verification

- Do not add a production `editorBridge` getter or other test-only Android/web bridge API.
- Do not modify `web/build_tests.cjs`; use its existing test registrations.
- Add tests to the existing `navigation_capture.spec.cjs` and `rendered_mode_refresh.spec.cjs` source specs, plus direct tests under `web/test/` as needed.
- Do not change dependencies, build/workflow configuration, app document formats, toolbar layout, text selection, links, dividers, paragraph/table styling, or historical audit docs.
- Run `cd web && npm test && npm run build`, and the Android debug build. Report actual results; do not claim tests passed if they were not run.
- Re-run the same 5,440-line WYSIWYG scroll scenario. Distinguish user-driven fling/inertia from unexpected scroll correction; report the observed result and do not mark Typography.md fixed without device verification.
- Return a concise changed-file list grouped by the scope above, tests/build results, and any incomplete item or blocker.

## CodeMirror 6 audit — report only

Return a short ranked list of useful features not currently wired into this editor, including user value, whether the package is already installed, and Android WebView risk. Consider `bracketMatching` and `indentOnInput` from the installed language package, folding gutter/keymap support, and autocomplete/lint (new dependency/provider decisions). Do not implement any of them in this handoff.
