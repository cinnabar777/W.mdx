# Jules handoff: Callout header styling controls

## Base and guardrails

- Start from the current `main`, which contains the merged and phone-tested callout implementation.
- Preserve existing callout parsing/rendering, nested callouts, type icons/default palettes, `+` / `-` folding, heading-wide fold interaction, and removal of the redundant ellipsis.
- Do not change Markdown syntax or rewrite document text. Do not modify toolbar, tables, links, Find & Replace, or unrelated typography/settings.
- Keep the existing Callouts Settings controls working: outer border thickness/style/color, callout background, callout body text color, and inside padding.

## Goal

Add usable, clearly grouped controls for styling callout headers. Use one shared set for all headers plus a compact per-type selector for a small number of header-only overrides. The current type-specific default palette and icons must remain the default appearance until a user changes a setting.

## 1. Shared header controls

Add these to the existing **Callouts Settings** category in `app/src/main/res/xml/preferences_styling_blockquotes.xml`; do not create an unrelated settings page:

- Header background color.
- Header title text color.
- Header title text size (px or the app's established text-size unit).
- Header font family, reusing the app's existing font choices and providing a default/inherit option.
- Header font weight.
- Header padding/spacing.
- Header accent color and thickness. This styles the header only; it must not replace or silently change the existing outer callout border settings.

Keep body styling separate: the existing Callout Text Color continues to control callout body text. New header title color controls titles only. Header background/padding must not unintentionally restyle the body.

## 2. Per-type header overrides

Add a compact type selector for `info`, `faq`, `question`, `todo`, and `example`. Keep `faq` and `question` as separate choices even though they may share a default palette.

For the selected type, allow overrides only for:

- Header background color.
- Header title text color.
- Header accent color.
- Built-in icon choice, using the icons already implemented in the callout renderer.

Each override must have an explicit reset/inherit option. Do not duplicate font, size, weight, padding, or thickness controls for every type. Do not add pasted or uploaded SVG icons in this task. Unknown callout types must keep the existing generic fallback.

## 3. Defaults and precedence

- With all new settings at default/inherit, the current appearance must remain unchanged, including distinct type palettes/icons.
- A shared header setting applies to every type that has no override for that property.
- A type-specific override applies only to that type and takes precedence over the shared setting for that property.
- Resetting a type override restores inheritance; resetting a shared setting restores the existing per-type default rather than flattening all callouts to one style.
- Preserve the existing global callout border/background/body-text/padding behavior. Keep header CSS variables distinct from body/global callout variables so one setting cannot accidentally overwrite another.

## 4. Live settings preview and immediate application

- Add a compact preview to the existing Callouts Settings page with a type selector or samples for the five supported labels.
- The preview must use the same preference values and CSS-variable/rendering path as the real editor; do not create a visually separate mock that can drift from the app.
- Changes must update the preview and an open document immediately, without closing the document or rebuilding the editor.
- Persist each preference through the existing settings mechanism and support reset-to-default for every new setting.

## 5. Implementation locations

Inspect and update the existing end-to-end preference path. Likely files include:

- `app/src/main/res/xml/preferences_styling_blockquotes.xml` — controls in the existing Callouts Settings category.
- `app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt` — reset/default handling.
- `web/src/main.js` — preference-to-CSS-variable updates and callout type/override mapping.
- `web/index.html` — header-only CSS variables and styling, kept separate from callout body styles.
- Existing settings bridge/preview code, if the current preference changes need to be forwarded or refreshed there.

Use stable preference keys with a consistent `pref_callout_header_...` naming pattern for shared controls and `pref_callout_type_<type>_...` for overrides. Follow the project's existing color-picker, slider, font-choice, reset, and settings-preview patterns. Sanitize/allowlist type and icon values; never interpolate arbitrary preference text into HTML or CSS selectors.

## 6. Tests and build checks

Add or update tests against the production preference-to-style path. Cover:

- Default/inherit preserves the current per-type colors and icons.
- Shared header settings apply across types; a type override affects only its selected type.
- Resetting a type override restores the shared/default value; resetting a shared value restores type defaults.
- Header settings do not change body text/background or the existing outer border controls.
- The settings preview and editor use the same resolved styles; a setting update refreshes them without an editor rebuild.
- Existing callout rendering, nesting, fold behavior, and saved Markdown remain unchanged.

Run `npm test`, `npm run build`, and the Android debug build. Fix failures caused by this change; do not broaden the patch into unrelated repairs.
