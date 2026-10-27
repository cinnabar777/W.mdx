# Jules handoff — exact, limited code changes

## Apply only this handoff

Make the scoped edits below. Do not replace whole files or whole functions. Keep unrelated code unchanged. If a named function or code block does not match, stop and report the mismatch instead of adapting the task or changing adjacent features.

Do not change toolbar layout or other toolbar actions. The only toolbar action in scope is the existing `InsertFootnote` command. Do not add dependencies, change the document format, or expose editor internals through the Android/web bridge.

## 1. Keep the scroll improvements; fix the remaining invalidation and lifecycle defects

### 1.1 Decoration state fields in `web/src/main.js`

`Decoration.none` is a valid empty result. It is not an initialization flag. The editor state fields build their initial decorations in `create()`, so remove only the `current === Decoration.none` full-document rebuild branches.

In `wysiwygCodeBlockField.update`, use this order:

```js
const refreshHeight = tr.effects.some(effect =>
  effect.is(heightMapRefreshEffect)
);
if (refreshHeight) {
  return buildWysiwygCodeBlockDecorations(tr.state);
}
if (!tr.docChanged) return current;
```

After this block, retain the existing changed-range/code-fence test and mapped-decoration behavior. Ordinary edits outside code blocks must not rebuild all code-block decorations.

In `tableStateField.update`, replace the `current === Decoration.none` check with:

```js
const tableHeightsChanged = tr.effects.some(effect =>
  effect.is(tableHeightEstimatesChanged)
);
if (tableHeightsChanged) {
  return buildTableBlockDecorations(tr.state);
}
if (!tr.docChanged) return current;
```

Keep the source-mode guard and the existing pipe/table-local invalidation. Do not make ordinary edits outside tables rebuild all tables.

In `persistentLayoutField.update`, replace its sentinel check with:

```js
const refreshLayout = tr.effects.some(effect =>
  effect.is(typographySettingsEffect) ||
  effect.is(heightMapRefreshEffect)
);
if (refreshLayout) {
  return buildPersistentLayoutDecorations(tr.state);
}
if (!tr.docChanged) return current;
```

Keep the existing changed-range expansion, `current.map(tr.changes)`, and partial decoration replacement. Do not widen an ordinary edit to the entire document unless the expanded changed range actually covers the entire document.

### 1.2 Cancel all navigation-capture work on disposal

In `web/src/navigationCapture.js`, keep the current diagnostic record schema and add a stable page-hide handler:

```js
const onPageHide = () => flush();
win.addEventListener('pagehide', onPageHide, { once: true });
```

In the returned disposer, add:

```js
win.removeEventListener('pagehide', onPageHide);
```

For the MutationObserver batch, keep the pending animation-frame or fallback-timeout ID. Set the ID to `null` inside the callback; before `enqueue(...)`, return if `disposed`. In the disposer, cancel the still-pending callback with the matching API (`cancelAnimationFrame` for an animation frame, `clearTimeout` for the fallback). Do not enqueue a mutation batch after disposal.

In `setupNavigationDiagnostics()` in `web/src/main.js`, the existing named listeners and `fullCaptureDisposer` are correct; preserve them. Add tracked pending-frame and pending-timeout sets for the callbacks created inside this function:

```js
const pendingTimeouts = new Set();
const pendingFrames = new Set();

const scheduleTrackedTimeout = (callback, delay) => {
  const id = window.setTimeout(() => {
    pendingTimeouts.delete(id);
    if (!disposed) callback();
  }, delay);
  pendingTimeouts.add(id);
  return id;
};

const scheduleTrackedFrame = (callback) => {
  const id = window.requestAnimationFrame(() => {
    pendingFrames.delete(id);
    if (!disposed) callback();
  });
  pendingFrames.add(id);
  return id;
};
```

Use these wrappers for the Arrow-key animation frame and its 50 ms follow-up, selection-change debounce, pointer-gesture debounce/finalization, and unattributed-scroll debounce. Replace their matching `clearTimeout(...)` calls with a helper that clears the timer and removes its ID from `pendingTimeouts`.

Before removing listeners in the returned disposer, cancel every remaining ID:

```js
for (const id of pendingTimeouts) window.clearTimeout(id);
pendingTimeouts.clear();
for (const id of pendingFrames) window.cancelAnimationFrame(id);
pendingFrames.clear();
```

Keep `disposed = true` before cancellation. Keep the existing call to `fullCaptureDisposer()`.

### 1.3 Keep these branch changes; remove only the test-only production exposure

- Keep the table-height cache key free of paint-only colors in `web/src/tableWidget.js`.
- Keep the rule that ordinary scrolling does not request a window snapshot; retain large-scroll-delta and scroll-idle snapshots.
- Keep the existing fast-scrollbar and TOC cleanup.
- Remove `get activeAdapter() { return activeAdapter; }` from the production `window.editorBridge` object in `web/src/main.js`.
- Remove only the lifecycle-spec registration added to `web/build_tests.cjs`; do not add a new test-bundler entry. Delete the unregistered `web/test_sources/editor_lifecycle_incremental.spec.cjs`.
- Put the lifecycle assertions in the already-registered `web/test_sources/navigation_capture.spec.cjs`; put decoration refresh/incremental assertions in `web/test_sources/rendered_mode_refresh.spec.cjs`.
- Tests that need the editor view must locate it with `EditorView.findFromDOM(...)`. Do not add a production bridge getter for tests.

Add behavior checks, not only source-string checks:

1. Repeatedly switch WYSIWYG/source/live-preview and verify one active listener/capture set remains; after destruction, no listener or queued callback from the disposed view emits a trace.
2. Edit ordinary text in a long document and verify decorations outside the expanded edit range remain mapped.
3. Dispatch `heightMapRefreshEffect` without a document edit and verify code-block decorations refresh.
4. Verify table/heading edits still refresh the appropriate local decorations.
5. Do not use wall-clock performance thresholds or add scroll-correction timers.

## 2. Heading settings and scale inheritance

### 2.1 Settings UI and exact preference keys

In `app/src/main/res/xml/preferences_styling_headings.xml`:

- Keep the existing Global Headings controls.
- Add a global resettable color control with key `pref_heading_color`, default `"default"`.
- Add a global resettable edit-text control `pref_heading_word_spacing`, default `"0px"`. Its label must say **Word Spacing**, not letter/text spacing.
- Replace the flat “Heading Colors 1–6” group with six initially collapsed H1–H6 sections. Tapping the H1–H6 header must show/hide only that level’s controls inline.

Use these exact per-level keys. `<n>` is `1` through `6`:

| Global control | H<n> override key |
|---|---|
| `pref_heading_scale_percent` | `pref_heading_<n>_scale_percent` |
| `pref_font_weight_heading` | `pref_heading_<n>_font_weight` |
| `pref_font_file_heading` | `pref_font_file_heading_<n>` |
| `pref_heading_align` | `pref_heading_<n>_align` |
| `pref_heading_line_height` | `pref_heading_<n>_line_height` |
| `pref_heading_letter_spacing` | `pref_heading_<n>_letter_spacing` |
| `pref_heading_word_spacing` | `pref_heading_<n>_word_spacing` |
| `pref_heading_text_transform` | `pref_heading_<n>_transform` |
| `pref_heading_underline_style` | `pref_heading_<n>_underline_style` |
| `pref_heading_underline_thickness` | `pref_heading_<n>_underline_thickness` |
| `pref_heading_underline_color` | `pref_heading_<n>_underline_color` |
| `pref_heading_margin_left` | `pref_heading_<n>_margin_left` |
| `pref_heading_margin_right` | `pref_heading_<n>_margin_right` |
| `pref_heading_margin_top` | `pref_heading_<n>_margin_top` |
| `pref_heading_margin_bottom` | `pref_heading_<n>_margin_bottom` |
| `pref_heading_color` | Keep existing `pref_heading_<n>_color` |

For every row, copy the existing global preference element’s preference class, range, entries, default, and summary behavior; change only its key and H<n>-specific title. Do not create a different control type or range. Keep existing per-level color keys; do not add duplicate color keys. Move each existing color control into its matching H<n> section.

Implement tap-to-expand with a clickable `Preference` header and a following `PreferenceCategory` whose children are hidden initially. In `StylingSettingsFragment.onCreatePreferences`, after `setPreferencesFromResource(...)`, bind each pair with this logic:

```kotlin
for (level in 1..6) {
    val header: Preference? = findPreference("pref_heading_${level}_toggle")
    val section: androidx.preference.PreferenceCategory? =
        findPreference("pref_heading_${level}_settings")
    if (header == null || section == null) {
        error("Missing H$level heading accordion preferences")
    }
    section.isVisible = false
    header.setOnPreferenceClickListener {
        section.isVisible = !section.isVisible
        header.summary = if (section.isVisible) {
            "Tap to collapse H$level settings"
        } else {
            "Tap to expand H$level settings"
        }
        true
    }
}
```

Use keys `pref_heading_<n>_toggle` and `pref_heading_<n>_settings` on the corresponding XML header/category. The section starts collapsed every time settings opens.

### 2.2 Apply overrides; reset means inherit the live global value

In `web/src/main.js`, keep the H1–H6 base ratios unchanged. Read `pref_heading_<n>_scale_percent` first; if absent, preserve compatibility with the existing legacy `pref_heading_<n>_scale` and `pref_heading_<n>_font_size` keys.

For every per-level setting, set the CSS variable to the explicit override when present; otherwise remove/leave it unset so CSS inherits the current global value. In particular, a reset must remove the stored override key and clear that level’s CSS variable. Do not store the factory default back into the override key.

The scale override **replaces**, not multiplies, the global scale. Change each H1–H6 `font-size` rule in `web/index.html` to this form, retaining its existing base ratio (`1.8`, `1.5`, `1.3`, `1.1`, `1.0`, `0.9`):

```css
/* H1 example; repeat for H2–H6 with that level's existing base ratio */
font-size: calc(
  var(--body-font-size, 16px) *
  1.8 *
  var(--heading-1-scale, var(--heading-scale, 1))
) !important;
```

When an H1 scale is set, only `--heading-1-scale` applies. When cleared, CSS falls back to `--heading-scale`.

For color, map the global preference to `--heading-color`; map a set per-level preference to `--heading-<n>-color`. Change the color fallback in each H<n> selector to:

```css
color: var(--heading-1-color, var(--heading-color, inherit)) !important;
```

Wire `word-spacing` separately from `letter-spacing`: set `--heading-word-spacing` and `--heading-<n>-word-spacing`, then apply `word-spacing: var(--heading-<n>-word-spacing, var(--heading-word-spacing, 0px))` to each H<n>. Add per-level left/right margin variables and CSS fallbacks in the same way. Do not alter heading anchors, ToC behavior, or the base-size ratios.

In `SettingsActivity.kt`, add `pref_font_file_heading_1` through `pref_font_file_heading_6` to the existing `fontKeys` list. In `MainActivity.kt`, load each matching `_path` through the existing `loadFontDataUri()` and pass the six optional values through the existing `setFontSettings()` bridge call. In `web/src/main.js`, register each optional font through the existing `applyFontCategory()` helper and set `--heading-<n>-font-family`; an unset per-level font uses the global heading font.

In `ResetPreferences.kt`, treat a stored per-level override as modified even if it equals the XML default. Resetting one of the listed H<n> override keys must remove that key and re-apply preferences; it must not write a factory default back. A reset on H2 must not alter H1 or global preferences.

## 3. Existing footnote action: popup and placement

Change only the existing `InsertFootnote` action in `web/src/main.js`; do not change toolbar layout or other actions. Replace the fixed `[^1]` insertion with a modal using the existing `#editor-modal-overlay` and `#editor-modal-dialog`.

Use a textarea and Save/Cancel controls. Put the entered text into the textarea’s `.value`; do not interpolate user input into `innerHTML`.

Use this insertion algorithm after Save:

```js
function nextFootnoteId(markdown) {
  const used = new Set(
    Array.from(markdown.matchAll(/\[\^(\d+)\]/g), match => Number(match[1]))
  );
  let id = 1;
  while (used.has(id)) id++;
  return id;
}

function footnoteAppendPrefix(markdown) {
  if (!markdown) return '';
  if (markdown.endsWith('\n\n')) return '';
  if (markdown.endsWith('\n')) return '\n';
  return '\n\n';
}
```

At Save, append a single definition `[^n]: <text>` after existing definitions at document end. If the note textarea contains line breaks, indent continuation lines by two spaces. Insert the reference at the cursor without replacing the selection or surrounding text. If the cursor is at document end, combine the marker and appended definition into one insertion; otherwise dispatch the two insertions in one transaction:

```js
const marker = `[^${id}]`;
const definition = `[^${id}]: ${note.replace(/\r?\n/g, '\n  ')}`;
const textWithReference =
  markdown.slice(0, cursor) + marker + markdown.slice(cursor);
const prefixSource = cursor === markdown.length ? textWithReference : markdown;
const append = footnoteAppendPrefix(prefixSource) + definition;
const changes = cursor === markdown.length
  ? { from: cursor, insert: marker + append }
  : [
      { from: cursor, insert: marker },
      { from: markdown.length, insert: append }
    ];
```

Set the post-transaction selection immediately after the inserted marker. Cancel closes the modal and dispatches no transaction.

Render defined references in WYSIWYG as numbered superscript links; render definitions as one footnote section at document end, with a back-link to each reference. Keep the original Markdown text unchanged in storage/source mode. Reuse the existing footnote preference keys and CSS variables; do not add duplicate reset controls. Do not add a separate full-document rendering pass on every ordinary keystroke.

Add tests for cancel/no change, successive unique IDs, multiple references, multiline text, cursor at document end, source preservation, reopened documents, and backlinks.

## 4. Checkbox controls

In `app/src/main/res/xml/preferences_styling_lists.xml`, inside the existing `Todo List Checkboxes` category, add:

```xml
<com.wmdx.markdownapp.ResetSwitchPreference
    app:key="pref_list_hide_todo_bullet"
    app:title="Hide Bullet Before Checkbox"
    app:summary="Hide the extra bullet before task checkboxes in WYSIWYG"
    android:defaultValue="false" />

<com.wmdx.markdownapp.ResetColorPickerPreference
    app:key="pref_todo_checkmark_color"
    app:title="Checkbox Checkmark Color"
    app:summary="Color of the checkmark inside checked todo boxes"
    app:defaultValue="#111111" />
```

Keep the default appearance: the extra bullet remains visible and the checkmark remains `#111111`. Keep `pref_todo_checked_color` as the checked-box fill/accent.

In `web/src/main.js`, add class `cm-todo-list-line` to the line decoration for each task-list item in both the live-preview and WYSIWYG decoration builders. In `applyAllPreferences()`, toggle a class on the editor DOM only when the preference is true and `currentEditorMode === 'wysiwyg'`. In `web/index.html`, use:

```css
.cm-hide-todo-bullet .cm-todo-list-line .cm-list-bullet {
  display: none !important;
}

.cm-todo-checkbox:checked::after {
  color: var(--todo-checkmark-color, #111111);
}
```

Do not change the Markdown marker or hide bullets in source/live-preview modes.

## 5. Callout title wrapping

Keep the icon and title as separate existing DOM elements. In `web/index.html`, use:

```css
.cm-callout-title-container {
  display: flex;
  align-items: flex-start;
  max-width: 100%;
  gap: 6px;
}

.cm-callout-icon {
  flex: 0 0 auto;
}

.cm-callout-title-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}
```

Do not add a setting for this. Add a test with a long callout title and verify wrapped lines start beneath the first title character after the icon.

## 6. Code-block colors

Keep `pref_code_block_bg_color` as the full block surface. In `preferences_styling_code.xml`, add resettable color controls using these exact keys:

- `pref_code_block_text_bg_color` — tight background behind code text only.
- `pref_code_block_label_bg_color` — language/header background.
- `pref_code_block_copy_bg_color` — copy-button background.
- `pref_code_block_copy_text_color` — copy-button text.
- `pref_code_block_border_color` — the single shared border color.

Keep `pref_code_block_lang_label_color` for language text. Wire the five new keys through `ResetPreferences.kt`, the existing preference bridge in `MainActivity.kt`, and `applyAllPreferences()` in `web/src/main.js`.

Use this XML element shape for every new color preference; use the listed exact key and matching title:

```xml
<com.wmdx.markdownapp.ResetColorPickerPreference
    app:key="pref_code_block_text_bg_color"
    app:title="Code Text Background Color"
    app:summary="Background behind code text only"
    app:defaultValue="default" />
```

Repeat it for the other four keys, with titles “Language Label Background Color”, “Copy Button Background Color”, “Copy Button Text Color”, and “Code Block Border Color”. Keep all five defaults at `"default"`.

Use these existing widget CSS-variable names:

```js
setCssVar('--code-block-label-bg', prefs.pref_code_block_label_bg_color);
setCssVar('--code-copy-bg', prefs.pref_code_block_copy_bg_color);
setCssVar('--code-copy-color', prefs.pref_code_block_copy_text_color);
setCssVar('--code-block-label-border', prefs.pref_code_block_border_color);
setCssVar('--code-copy-border', prefs.pref_code_block_border_color);
setCssVar('--code-block-text-bg-color', prefs.pref_code_block_text_bg_color);
```

Use the shared border value on the block outline too. Add this mark for each fenced-code line in the existing WYSIWYG code-block decoration builder, using that line’s document range:

```js
const lineText = state.doc.sliceString(lineFrom, lineTo);
const trailingWhitespace = lineText.match(/\s*$/)?.[0].length ?? 0;
const textEnd = lineTo - trailingWhitespace;
if (textEnd > lineFrom) {
  builder.push(
    Decoration.mark({ class: 'cm-codeblock-text-bg' }).range(lineFrom, textEnd)
  );
}
```

Use the code-block line’s exact `lineFrom`/`lineTo` values already in that builder. Do not include trailing whitespace and do not apply the text-background variable to `.cm-codeblock-line`.

```css
.cm-codeblock-text-bg {
  background: var(--code-block-text-bg-color, transparent);
}

.cm-content .cm-codeblock-line {
  border-left: 1px solid var(--code-block-border-color, transparent);
  border-right: 1px solid var(--code-block-border-color, transparent);
}

.cm-content .cm-codeblock-first {
  border-top: 1px solid var(--code-block-border-color, transparent);
}

.cm-content .cm-codeblock-last {
  border-bottom: 1px solid var(--code-block-border-color, transparent);
}
```

Set `--code-block-border-color` from `pref_code_block_border_color`. Keep `pref_code_block_bg_color` mapped only to the full block background. Do not change the copy operation, language detection, or widget markup.

## 7. Reset-button alignment

In `PreferenceResetHelper.bindResetButton()` in `ResetPreferences.kt`, remove the special case that chooses the immediate parent of `R.id.seekbar` as the reset-button row. Put the seekbar row and reset button in the same horizontal row inside `android.R.id.widget_frame`.

The seekbar row must use width `0` and weight `1`; append the reset button after it at fixed `40dp`. The outer row must fill the widget frame and align to its end. Keep the seekbar’s numeric value inside its existing row, immediately before the reset button. Keep an invisible reset button’s layout slot so the row does not shift when reset is disabled.

Use the existing `ensureHorizontalWidgetRow(...)`; move the existing seekbar row into it if necessary rather than recreating the seekbar or value view.

## 8. Required verification

- Add behavior coverage only to the existing registered source specs: `web/test_sources/navigation_capture.spec.cjs` and `web/test_sources/rendered_mode_refresh.spec.cjs`.
- Do not edit `web/build_tests.cjs`, except to remove the extra registration described in §1.3.
- Run the existing web tests/build and Android debug build; report exact commands and results.
- Include a long-document regression with 5,440 lines / 230,906 characters. Verify that ordinary text edits do not rebuild unrelated decorations, height changes above the viewport do not cause an unexplained visible-location jump, and user-driven fling/inertia is unchanged.
- Do not add wall-clock thresholds, scroll-correction timers, new dependencies, or unrelated file changes.
