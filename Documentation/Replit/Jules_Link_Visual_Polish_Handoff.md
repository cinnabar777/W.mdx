# Jules handoff: Links, heading anchors, and callout insertion

## Base and guardrails

- Start from the current `main` and preserve its existing callout rendering, nesting, per-type icons/styles, header settings, and fold behavior.
- Keep Markdown source byte-for-byte unchanged except for explicit insertion/editing requested by the user.
- Do not modify tables, Find & Replace, unrelated toolbar layout, or other typography.
- Use a themed in-app dialog, not `window.prompt`, browser alerts, or an Android-native prompt that loses editor selection/focus.

## 1. Make same-document heading wikilinks work

The important syntax is `[[#BOLD|Link]]`: it targets the `BOLD` heading in the current document and displays `Link`.

- Add production-path parsing/rendering for `[[#Heading]]` and `[[#Heading|Alias]]` in Live Preview and WYSIWYG.
- Render the alias when present; otherwise render a readable heading label. Hide `[[`, the target syntax, `|`, and `]]` in rendered mode. Preserve and reveal the exact raw syntax on the active editing line and in Source mode.
- Apply the existing `.cm-link` styling and `pref_link_color` / `pref_link_decoration` settings to the visible link label.
- Activating a rendered same-document heading link must find the matching Markdown heading and scroll it into view. Match the visible heading text case-insensitively after removing the Markdown heading prefix and inline formatting syntax. If headings are duplicated, use the first matching heading in document order. If no target matches, keep the link visible and fail safely without changing the document.
- Do not implement cross-file wikilink resolution in this patch. Do not treat `![[...]]` embeds as heading links.

## 2. Replace raw link insertion with a link dialog

Currently `execCmd('link')` wraps the selection as `[selection](https://)`. Replace that behavior with one theme-aware, phone-usable dialog, invoked by both the Insert Link toolbar item and the existing `Ctrl+K` shortcut.

Dialog requirements:

- Preserve the current editor selection while the dialog is open. Prefill the display-text/alias field with selected text; if there is no selection, provide a clear empty field.
- Provide a link-kind selector for **Web URL** and **Heading in this document**.
- Web URL mode: display text plus URL; insert `[display text](URL)`.
- Heading mode: display alias plus a picker populated from headings in the current document; insert `[[#Heading|Alias]]`, or `[[#Heading]]` if the alias is empty.
- On Insert, restore editor focus and place the cursor after the inserted link. Cancel leaves the document and selection unchanged.
- Style the dialog from the app's current dark/light theme. Keep it usable with the Android keyboard and small screens.
- If invoked while editing a rendered link, prefill the dialog from that link when feasible; otherwise leave existing text untouched and insert a new link safely.

## 3. Add link underline thickness

- Add `Link Underline Thickness (px)` to the existing **Hyperlinks** section in `app/src/main/res/xml/preferences_styling_inline.xml`.
- Use the existing resettable slider convention. Use a 1–4 px range, step 1, default 1 px, and a stable key such as `pref_link_underline_thickness`.
- Wire reset/default handling in `ResetPreferences.kt`, preference forwarding in the existing native-to-web settings path, and `--link-decoration-thickness` in `web/src/main.js` / `web/index.html`.
- Apply thickness only when the underline is enabled. Preserve all existing line-style and color behavior, including decoration set to `none`.

## 4. Add Callout to the toolbar and keyboard shortcuts

- Add **Insert Callout** to the existing Insert popup group in the bottom toolbar. Reuse an existing callout type icon (prefer the existing info icon) and set a clear accessible title/tooltip. Do not add a new toolbar row or rearrange unrelated items.
- Add a customizable **Insert Callout Shortcut** in `app/src/main/res/xml/preferences_hotkeys.xml` using key `pref_hotkey_callout` and map it through the existing hotkey settings path to `customHotkeys.callout`.
- Use `Ctrl+Alt+Q` as the default shortcut; verify it does not collide with any existing default. Both toolbar and shortcut must open the same callout insertion dialog.

## 5. Reuse the insertion dialog for callouts

The callout dialog is part of this task and should reuse the same themed dialog shell as link insertion.

- Provide a callout type picker for the existing supported types: `note`, `info`, `tip`, `warning`, `important`, `danger`, `question`, `faq`, `todo`, and `example`.
- Provide an optional title and initial fold state: **Not foldable**, **Expanded (+)**, or **Collapsed (-)**.
- If text is selected, insert it as the callout body, prefixing each selected line with `> ` while preserving its text. If nothing is selected, insert the opener and a quoted blank body line, then place the caret in the body.
- Use the existing syntax and fold behavior; do not create a second callout renderer or change callout styling/settings.
- Cancel must leave the source and selection unchanged.

## Implementation locations to inspect

- `web/src/main.js` — `customHotkeys`, `execCmd('link')`, toolbar Insert popup, heading/link decorations, callout rendering and insertion.
- `web/index.html` — link decoration CSS and themed dialog styles.
- `app/src/main/res/xml/preferences_hotkeys.xml` — customizable callout shortcut.
- `app/src/main/res/xml/preferences_styling_inline.xml` — underline thickness setting.
- `app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt` and the existing native-to-web preference bridge — reset/default and value forwarding.

## Tests and build checks

Add tests against the production implementation for:

- Heading wikilinks with and without aliases resolve and scroll correctly; matching is case-insensitive, duplicate behavior is deterministic, and missing targets fail safely.
- Source mode and active-line syntax reveal preserve the exact original wikilink text; embeds remain unaffected.
- Link dialog preserves selection on cancel and inserts correct URL/heading syntax on confirm.
- Link underline thickness is resettable and affects visible underlines without overriding color/style or `none`.
- Callout is present in the toolbar and configurable shortcut; both open the same dialog.
- Callout dialog inserts selected or blank body correctly and emits the requested type/title/fold marker without changing other source.
- Existing callout, link, and editor tests continue to pass.

Run `npm test`, `npm run build`, and the Android debug build. Fix failures caused by this patch only.
