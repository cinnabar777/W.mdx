# Jules task: first-pass Obsidian-style callout rendering

## Starting point

Use the newest working W.mdx branch/session base. The latest source I checked is branch jules-3492949419147525921-af940c11 at commit c447d5e (Find & Replace row/counter fix). Keep that work intact; do not revert to CKEditor code or an older editor branch.

## Goal

Render Markdown callouts as styled blocks in the existing CodeMirror 6 editor, without changing the saved Markdown. Treat this as a focused visual-rendering task before toolbar work.

## Verified existing implementation

- web/src/main.js has livePreviewPlugin (ViewPlugin) which builds line decorations over view.visibleRanges; use this existing path.
- The plugin already handles blockquote QuoteMark decorations and avoids applying regular paragraph styling inside code blocks/tables.
- web/index.html already defines .cm-callout and .cm-callout-title CSS classes using the callout CSS variables.
- app/src/main/res/xml/preferences_styling_blockquotes.xml already contains callout border thickness/style/color, background color, and padding preferences. main.js already applies these variables.
- I found no callout syntax detection/assignment of cm-callout or cm-callout-title in the current editor code. Implement that missing connection. Do not add a duplicate settings page or new callout settings.

## Scope and syntax

Support the Obsidian-style opener:

~~~md
> [!note]
> Callout body.

> [!warning] Custom title
> Warning body.
~~~

- Recognize [!type] case-insensitively for any simple type slug such as note, tip, warning, important, danger, or future types. Use the same existing callout style for all types; do not add type-specific colors/icons in this pass.
- Optional + or - immediately after ] is accepted as syntax, but do not implement collapse/fold behavior. Hide that marker in rendered mode along with [!type].
- If there is no custom title after the marker, show a readable title derived from the type (e.g. note becomes Note). If there is a custom title, show the supplied title instead.
- A callout starts only when a blockquote line contains the marker. Apply cm-callout to the opener and the contiguous following quoted lines belonging to that blockquote. Apply cm-callout-title to the opener line only. Stop at the first non-quoted line; never style the next ordinary paragraph as part of the callout.
- Ordinary blockquotes with no [!type] remain ordinary blockquotes and must not receive the callout class.

## Implementation requirements

1. Add callout recognition inside livePreviewPlugin.buildDecorations() using the existing visible-range / line-class approach (Decoration.line). Do not add a second editor, replace the Markdown parser, or introduce a second competing ViewPlugin.
2. Use the syntax tree/context to avoid matching text inside fenced/indented code blocks or table widgets. A literal > [!note] inside a code block or table must stay code/table content, not become a callout.
3. Add the existing cm-blockquote line class to ordinary quoted lines if needed for the existing blockquote styles to apply; retain current blockquote preferences and behavior. A callout line can have both the ordinary quote class and cm-callout.
4. In rendered/WYSIWYG mode, hide the [!type] plus optional + / - marker and show the readable/default or custom title. Use a small, text-only inline WidgetType or equivalent existing decoration technique; do not change the document text. Avoid overlapping a replacement decoration with the existing QuoteMark replacement.
5. In Live Preview, when the caret/selection is on the callout marker, reveal the original editable Markdown marker, matching the editor’s existing syntax-reveal behavior. In Source mode, leave the entire source untouched; livePreviewPlugin already returns no decorations there.
6. Keep all existing callout CSS variables and settings keys; no settings migration, toolbar icon, fold menu, or unrelated typography changes.
7. Preserve save/reopen fidelity: rendering must never rewrite the document text or alter its line breaks.

## Suggested parsing shape

Use a narrow header matcher on the quote content, not on arbitrary document text. Conceptually:

~~~js
/^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?(?:[ \t]+(.*))?\s*$/i
~~~

The capture groups are type, optional fold marker, and optional custom title. Adapt it to the exact source line representation in the current editor. When rendering the title, use the custom title when nonempty; otherwise capitalize the type. Do not interpolate the type into raw HTML or construct an unsanitized CSS class from it.

## Tests and verification

Add tests in the existing web/test Node test setup (script: npm test). Test the actual parser/helper used by the editor, not a separate duplicate implementation:

- [!note], [!TIP], [!warning]+, [!danger]- are recognized.
- A custom title is retained; a missing custom title displays the capitalized type.
- A normal > quoted text line stays a normal blockquote.
- A callout styles its contiguous quoted body lines but stops before the next unquoted paragraph.
- Literal callout syntax inside fenced code is not rendered as a callout.
- Source mode remains raw; editing the marker in Live Preview reveals it and moving the caret away restores the rendered title.
- Rendering and toggling editor modes leave the underlying Markdown byte-for-byte unchanged.

Run npm test, npm run build, and the Android debug build. Report any skipped check explicitly; do not claim the phone behavior is verified by web tests.

## Manual phone test for me

Use one document containing a normal blockquote, Note, Tip, Warning with a custom title, a callout with multiple quoted body lines, and a fenced code example containing > [!note]. Verify the callout settings change the rendered border/background/padding, normal quotes stay normal, the code example stays code, caret entry shows editable syntax, and Save → close/reopen preserves the original Markdown.

## Do not include

No toolbar changes, links, tables, custom callout color settings, icons, folding/collapsing, nested callout features, or unrelated fixes. Make this one callout-rendering change, run checks, and stop for phone testing.
