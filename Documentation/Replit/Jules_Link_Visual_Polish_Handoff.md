# Jules handoff: Polish Markdown and Obsidian link appearance

## Base and guardrails

- Start from the current `main`.
- Keep this a visual/rendering pass for Markdown links and Obsidian-style wikilinks. Do not change link destinations, file resolution, document text, or navigation behavior unless an existing link action must be preserved.
- Preserve Source mode and Live Preview behavior: raw link syntax is visible in Source mode and while its source line is actively edited; rendered modes show readable link text.
- Do not modify callouts, tables, toolbars, Find & Replace, or unrelated typography.

## Current implementation to preserve

- `app/src/main/res/xml/preferences_styling_inline.xml` already has **Link Color** (`pref_link_color`) and **Link Text Decoration** (`pref_link_decoration`). Do not duplicate or remove these settings.
- `web/src/main.js` applies those preferences as `--link-color`, `--link-decoration-line`, and `--link-decoration-style`.
- `web/index.html` currently styles `.cm-content .cm-link` with those variables. Keep the existing preference values authoritative.
- The live-preview renderer currently handles parsed CommonMark `[label](URL)` links, styles the label, and hides the surrounding syntax when not actively editing that line.
- The Markdown guide documents Obsidian wikilinks (`[[File]]`, `[[#Heading]]`, `[[File#Heading]]`, and `[[target|alias]]`), but current `main.js` has no wikilink-specific renderer. Add that missing visual path without replacing the Markdown parser or changing saved content.

## Goal

Make rendered Markdown links and wikilinks look intentional and polished in dark and light themes, without turning inline prose into buttons or pills. Use one coherent visual treatment for both kinds of links by default.

## Required changes

1. Refine `.cm-content .cm-link` styling in `web/index.html` using the existing theme-aware `--link-color`; never hard-code a color that overrides the user's Link Color setting.
2. Add a subtle underline treatment with a small text underline offset, restrained thickness, and ink-aware rendering where supported. Preserve the user's selected `pref_link_decoration` style, including `none`.
3. Keep link typography aligned with surrounding text. Do not add a pill background, icon, extra padding, forced font family, or layout-changing font size/weight.
4. Render these Obsidian wikilink forms in Live Preview/WYSIWYG without changing the document text:
   - `[[Target]]` — display the readable target text.
   - `[[Target|Alias]]` — display `Alias` while retaining the full source syntax for editing/saving.
   - `[[#Heading]]` and `[[File#Heading]]` — display a readable label, removing the wiki delimiters; preserve the target and heading text exactly in source.
5. Apply the same `.cm-link` style and existing link color/decoration preferences to rendered wikilinks. Do not add duplicate settings or an internal/external color matrix in this pass.
6. Preserve the meaning of `![[...]]` embeds: do not consume or render an embed as an ordinary text link.
7. Check both dark and light themes for readable contrast. Any optional active/touch feedback must be subtle, theme-aware, and must not move text or interfere with selection.

## Scope boundary

This task adds correct visual rendering/styling of wikilink syntax. Do not invent file/heading navigation or claim that a wikilink opens its target unless the current app already has a verified action for it. Preserve any existing click behavior. Keep resolution/navigation as a separate task if it is not already implemented.

## Tests and build checks

Add or update focused tests against the production decoration/parser path. Verify:

- CommonMark links show only the label in rendered modes; source syntax is revealed while editing and remains raw in Source mode.
- `[[Target]]`, `[[#Heading]]`, `[[File#Heading]]`, and `[[Target|Alias]]` render readable labels with the same configured link style.
- `pref_link_color` and every supported `pref_link_decoration` value, including `none`, still apply/reset correctly.
- `![[...]]` embeds are unaffected and saved Markdown remains byte-for-byte unchanged by rendering.
- Dark and light theme CSS follows existing theme/link variables.

Run `npm test`, `npm run build`, and the Android debug build. Fix regressions caused by this patch only.
