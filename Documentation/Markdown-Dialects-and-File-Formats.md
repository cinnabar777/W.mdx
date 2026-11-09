# Markdown Dialects, Settings, and File Formats

This guide explains how the editor combines Markdown dialects, which syntax
preferences control recognition and authoring, and how conversion and file
operations work. For syntax examples, see the [Wmdx Markdown Cheat Sheet](Markdown.md).
The [native syntax design](Wmdx-Syntax-Design.md) records Wmdx-specific decisions
and remaining acceptance work.

## One document, two editor surfaces

Wmdx keeps one Markdown source and parses CommonMark core syntax, selected GFM
extensions, selected Obsidian conventions, and Wmdx additions. These are syntax
families in one editor, not separate document modes.

| Editor surface | Behavior |
| --- | --- |
| Rendered Markdown editor | One shared block/layout pipeline. A syntax-exposure setting controls whether syntax stays hidden, appears around the caret, or expands to the active line/block. WYSIWYG and Live Preview are exposure presets, not separate renderers. |
| Source/Code editor | Non-Markdown text files open in Source/Code automatically; Markdown files use the selected Markdown view. The editor provides filename-based highlighting for Markdown, JavaScript/TypeScript/JSX/TSX, JSON, YAML, Python, SQL, Java, Rust, C/C++, Go, PHP, HTML/XML/SVG, and CSS. A Menu action can override the language per document; unknown extensions default to plain text. All source characters remain visible; Markdown blocks, media, and tables are not rendered as document widgets. Callout bodies are never folded. |

JSON files are not reformatted when opened. In Source/Code, **Menu → Format
JSON** validates the document before re-indenting it with two spaces. Formatting
changes whitespace only: property order, duplicate keys, and the original
spelling of scalar values are preserved. Invalid JSON is left untouched and
reports the approximate error line and column; the edit can be undone.

Source-editor appearance and token colors are separate from rendered
Document Appearance settings. In the interim, the app still exposes the
Rendered syntax exposure and Source/Code language highlighting are configured
separately; Source token colors do not change Document Appearance.

Source pipe tables stay literal and editable. A nested Source editor scrolls
the whole table as a unit, keeping columns aligned without shifting surrounding
text or widening the app's document viewport.

## What the syntax toggles do

Settings are app-wide, not stored in each document. **Markdown & Dialects**
provides a primary Wmdx, CommonMark, GFM, or Obsidian profile. The profile sets
default syntax recognition and authoring choices for supported features. A
saved feature-specific choice overrides the profile; changing the profile does
not rewrite source or replace an explicitly saved choice.

Turning a feature or spelling off does not rewrite or delete source. It only
changes recognition/rendering and authoring behavior. Import and export
conversion remain separate actions.

| Feature | Syntax families and relevant controls |
| --- | --- |
| GFM extensions | The central **GFM Extensions** switch controls parser recognition of pipe tables, task markers, double-tilde strikethrough, and bare-URL autolinks. It defaults off for CommonMark and on for Wmdx, GFM, and Obsidian profiles; it can be overridden independently. |
| Links | CommonMark inline/automatic links, Markdown reference links, Obsidian `[[wikilinks]]`, and Wmdx four-field resource links have separate flavor switches. The preferred-link setting controls what the Link action inserts. |
| Headings | CommonMark/GFM/Obsidian ATX (`#`) and Setext (`===` / `---`) headings, plus Wmdx decimal headings (`.1`–`.6`). |
| Lists | Standard Markdown lists, Wmdx bullet and ordered-marker styles, and standalone Wmdx tasks. GFM/Obsidian task-list recognition has its own switch. |
| Block quotes | Shared Markdown `>` syntax with one feature switch. |
| Callouts | Wmdx `±type`, `±type-`, `±type+`; Obsidian `> [!type]` and fold markers. GitHub alerts overlap with the Obsidian spelling for `note`, `tip`, `important`, `warning`, and `caution`; other alert-like blockquotes remain ordinary quotes on GFM import. |
| Footnotes | Markdown reference footnotes (`[^label]`), Wmdx numbered footnotes, and Obsidian inline footnotes (`^[text]`) have syntax controls. |
| Underline | **Use Wmdx syntax** recognizes Wmdx underline forms. When disabled, HTML `<u>...</u>` is the compatibility form. |
| Wmdx subscript | **Wmdx Subscript Syntax** independently controls single-tilde `~text~`. It defaults on for Wmdx and off for CommonMark, GFM, and Obsidian profiles, so single tildes stay literal in standard-only profiles. |
| Wmdx superscript | **Wmdx Superscript Syntax** controls paired-caret `^text^`. It defaults on for Wmdx and off for CommonMark, GFM, and Obsidian profiles; export converts it to semantic HTML where Markdown has no native equivalent. |
| Highlight and pen | **Wmdx Highlight and Pen Syntax** controls Wmdx color-slot highlights and pen marks. It defaults on only for Wmdx. **Obsidian Highlight Syntax** separately enables plain `==text==` highlights for Obsidian. |
| Tables and inline formatting | GFM pipe tables, task markers, double-tilde strikethrough, and bare-URL autolinks are parsed when GFM Extensions is enabled. Wmdx paired-caret `^text^` superscript is described in the cheat sheet. |

The Wmdx extensions include resource links and embeds, decimal headings,
additional list markers, native tasks, callouts, footnotes, subscript,
superscript, underline styles, highlight/pen color slots, and media/attachment
metadata. Wmdx-only syntax is controlled by its feature preferences; syntax
shared with a target profile follows that profile's behavior.
The cheat sheet gives the exact source spelling.

## Convert, paste, and export

The editor has explicit conversion actions in the toolbar's Menu group. They
operate on the currently open document or clipboard; they are not a file picker.
Each conversion previews the result and reports known losses before applying it.
The preview display is limited to the first 6,000 converted characters for
phone-sized screens; conversion, replacement, and export still use the complete
document. A browser regression test checks content beyond that preview limit.

| Action | Source and result |
| --- | --- |
| Convert from Markdown dialect | Choose CommonMark, GFM, Obsidian, or HTML for the current document; review the Wmdx preview, then explicitly replace the document. Open or paste the source into the editor first. |
| Paste from Markdown dialect | Choose CommonMark, GFM, Obsidian, or HTML for clipboard text; review the preview, then insert converted Wmdx at the current selection. |
| Regular paste | When enabled in Markdown & Dialects, safely recognized Markdown or rich HTML is converted to the primary profile. Ambiguous plain text and conversions that report losses are left unchanged. |
| Export Markdown dialect | Choose CommonMark, GFM, or Obsidian; review the converted text and warnings, then save a separate `.md` copy with Android's Save As dialog. |
| HTML / MHTML export | Existing HTML/MHTML export remains a separate action; it exports rendered content, not a Markdown dialect. |
| Open/save Markdown or MDZip | Opens and saves source or packages it with its related assets; file operations do not silently convert syntax. |

## Primary flavor and paste behavior

The Markdown & Dialects page is the centralized place to select a primary
profile and enable automatic paste conversion. Feature-specific syntax settings
remain available under Document Appearance and override profile defaults when
the user has saved a choice there. Profiles select authoring defaults as well as
which Wmdx-specific, GFM, and Obsidian spellings are recognized by the
corresponding feature controls.

Regular paste inspects plain text and, on Android, the clipboard's HTML
representation. Clearly recognized CommonMark/GFM/Obsidian content is converted
through the app's Wmdx conversion rules to the selected profile. HTML is parsed
semantically rather than rendered as active content. If conversion reports
losses, fails, or the text does not look like Markdown, regular paste keeps the
plain-text representation. The explicit **Paste from Markdown dialect** action
remains available when the user wants to choose a source format and review
warnings. HTML clipboard conversion is bounded to 200,000 characters.

Automatic conversion uses heuristic flavor detection, so it is intentionally
conservative rather than a full dialect validator. Clipboard HTML is available
only when the source app publishes that representation. The Android clipboard
path and the profile-specific paste cases are covered by browser/unit tests;
device-specific clipboard providers still need acceptance testing.

HTML conversion is semantic, not a browser snapshot. It maps supported headings,
paragraphs, lists/tasks, quotes, code, tables, links, images, audio/video,
attachments, details, and alignment where possible. Scripts and active embedded
content are omitted; multi-paragraph list items, rich table-cell inline content,
and HTML table spans are preserved where Wmdx has equivalent syntax. Inline CSS,
HTML comments, and unsupported structures produce warnings or are not retained.

## Conversion rules and known limits

Conversion is deliberately explicit and conservative:

- Parser-recognized ATX headings and simple top-level Setext headings become
  Wmdx decimal headings. Setext headings inside lists or blockquotes, and
  headings with explicit hard breaks, retain their Markdown spelling so their
  enclosing structure and line-break semantics are not changed.
- Markdown emphasis written with underscores becomes asterisk emphasis on
  import, avoiding a collision with Wmdx underscore-underlining. Underscore
  thematic breaks normalize to `---`.
- Standard-dialect single-tilde text is escaped on import so it remains literal
  rather than becoming Wmdx subscript. CommonMark double-tilde text is also
  escaped because CommonMark does not define strikethrough; GFM and Obsidian
  double-tilde strikethrough remains semantic.
- Simple Markdown links become Wmdx resource links. Link tooltip titles and
  formatted link labels stay in Markdown syntax rather than losing their detail.
- Obsidian wikilinks become Wmdx resource links, and supported image/audio/video
  or attachment embeds become Wmdx embedded resources. Note transclusions are
  retained with a warning because Wmdx does not embed another Markdown document.
- GFM alerts and Obsidian callouts become Wmdx callouts. Obsidian folding markers
  are retained in Wmdx.
- Obsidian comments are left in their original spelling and warned about because
  Wmdx has no matching native comment syntax.
- Wmdx alphabetic/Roman ordered markers export as decimal markers with a warning.
- Wmdx tasks export as GFM/Obsidian task items. CommonMark tasks require inline
  HTML checkboxes and are warned because task lists are not part of CommonMark.
- Wmdx callout type/color/fold styling falls back to a standard block quote in
  CommonMark and unsupported GFM alerts; GFM's supported alert types use alert
  syntax. The warning identifies lost styling or fold state.
- Wmdx colored underline/highlight slots lose their custom style/color when the
  target has no equivalent. Wmdx pen marks have no portable Markdown equivalent
  and are exported as plain text with a warning.
- Wmdx subscript imports from semantic HTML `<sub>` and exports to `<sub>` in
  CommonMark, GFM, and Obsidian documents.
- Wmdx audio/video embeds export as semantic HTML media elements; other embedded
  resources export as attachment links. Obsidian exports supported embeds with
  `![[...]]` where its syntax retains the resource details.
- Wmdx superscript imports from semantic HTML `<sup>` and exports to `<sup>` in
  CommonMark, GFM, and Obsidian documents.
- Wmdx strikethrough exports as CommonMark `<del>` and stays `~~text~~` in GFM
  and Obsidian.
- GFM pipe tables are preserved in CommonMark output with a warning. Pipe tables
  are not defined by CommonMark, so a strict CommonMark renderer may show the
  source as text instead of a table.
- YAML frontmatter is preserved verbatim and is not interpreted as Wmdx
  metadata; importing it warns that properties remain unparsed, and exporting
  to CommonMark/GFM warns that those formats do not standardize frontmatter.
- Obsidian heading/block transclusion, plugin syntax, math, Mermaid, semantic
  tags, and full vault resolution are not supported.

The pinned CommonMark 0.31.2 corpus contains 652 examples; parser-family checks
and import/export round-trip checks cover 575 non-HTML examples. The GFM 0.29
extension fixture checks 21 non-HTML examples through import and export. These
tests check semantic parser families, not every tree detail or rendered result.
Raw HTML cases are excluded by the no-active-HTML policy, and the Obsidian tests
are curated feature tests rather than an official versioned conformance suite.
The conversion and linter tests therefore do **not** certify complete
CommonMark, GFM, Obsidian, or HTML conformance.

The linter checks common structural errors such as unclosed code fences,
unresolved references/footnotes, malformed Wmdx resource fields, table row
widths, empty callouts, active HTML, and Obsidian transclusion. It also reports
known Wmdx-only syntax for non-Wmdx targets and GFM-only task, strike, and table
syntax for CommonMark. Code-fenced examples are excluded from syntax warnings.
A clean lint result is not proof that a document is valid in every target
renderer.
