# Markdown Dialects, Settings, and File Formats

This guide explains how the editor combines Markdown dialects, which syntax
preferences control recognition and authoring, and how conversion and file
operations work. For syntax examples, see the [Wmdx Markdown Cheat Sheet](Markdown.md).
The [native syntax design](Wmdx-Syntax-Design.md) records Wmdx-specific decisions
and remaining acceptance work.

## One document, three editor views

Wmdx keeps one Markdown source and parses CommonMark core syntax, selected GFM
extensions, selected Obsidian conventions, and Wmdx additions. These are syntax
families in one editor, not separate document modes.

| View | Behavior |
| --- | --- |
| Source | Shows raw Markdown and syntax, including table pipes. Shared block geometry stays stable, but styling must not compete with syntax: callout `>` markers remain at the left edge, with no colored card or automatic body folding. Generated widgets must not replace, prepend, or overlap source characters. |
| Live Preview | Keeps rendered structures and reveals relevant syntax while editing; tables remain rendered and editable. |
| WYSIWYG | Shows rendered structures with most syntax hidden; interactive features such as task checkboxes remain available. |

Visible syntax can naturally change inline width and line wrapping. It should
not switch the document to a competing block-layout algorithm. Hidden syntax
does not reserve placeholder width.

## What the syntax toggles do

Settings are app-wide, not stored in each document. Wmdx does **not** have one
master “CommonMark,” “GFM,” or “Obsidian” switch. Instead, the settings for each
feature turn that feature on or off, select recognized dialect spellings, and
where offered choose what the toolbar and shortcut author.

Turning a feature or spelling off does not rewrite or delete source. It only
changes recognition/rendering and authoring behavior. Import and export
conversion are separate actions and do not depend on which spelling is selected
for authoring.

| Feature | Syntax families and relevant controls |
| --- | --- |
| Links | CommonMark inline/automatic links, Markdown reference links, Obsidian `[[wikilinks]]`, and Wmdx four-field resource links have separate flavor switches. The preferred-link setting controls what the Link action inserts. |
| Headings | CommonMark/GFM/Obsidian ATX (`#`) and Setext (`===` / `---`) headings, plus Wmdx decimal headings (`.1`–`.6`). |
| Lists | Standard Markdown lists, Wmdx bullet and ordered-marker styles, and standalone Wmdx tasks. GFM/Obsidian task-list recognition has its own switch. |
| Block quotes | Shared Markdown `>` syntax with one feature switch. |
| Callouts | Wmdx `±type`, `±type-`, `±type+`; Obsidian `> [!type]` and fold markers. GitHub alerts overlap with the Obsidian spelling for `note`, `tip`, `important`, `warning`, and `caution`; other alert-like blockquotes remain ordinary quotes on GFM import. |
| Footnotes | Markdown reference footnotes (`[^label]`), Wmdx numbered footnotes, and Obsidian inline footnotes (`^[text]`) have syntax controls. |
| Underline | **Use Wmdx syntax** recognizes Wmdx underline forms. When disabled, HTML `<u>...</u>` is the compatibility form. |
| Tables and inline formatting | GFM pipe tables, task lists, double-tilde strikethrough, and autolinks are parser extensions. Wmdx single-tilde `~text~` is subscript, and paired-caret `^text^` is superscript. Feature settings are separate rather than one global GFM profile. |

The Wmdx extensions include resource links and embeds, decimal headings,
additional list markers, native tasks, callouts, footnotes, subscript,
superscript, underline styles, highlight/pen color slots, and media/attachment
metadata. Script formatting is recognized without a separate dialect toggle.
The cheat sheet gives the exact source spelling.

## Convert, paste, and export

The editor has explicit conversion actions in the toolbar's Menu group. They
operate on the currently open document or clipboard; they are not a file picker.
Each conversion previews the result and reports known losses before applying it.

| Action | Source and result |
| --- | --- |
| Convert from Markdown dialect | Choose CommonMark, GFM, Obsidian, or HTML for the current document; review the Wmdx preview, then explicitly replace the document. Open or paste the source into the editor first. |
| Paste from Markdown dialect | Choose CommonMark, GFM, Obsidian, or HTML for clipboard text; review the preview, then insert converted Wmdx at the current selection. |
| Export Markdown dialect | Choose CommonMark, GFM, or Obsidian; review the converted text and warnings, then save a separate `.md` copy with Android's Save As dialog. |
| HTML / MHTML export | Existing HTML/MHTML export remains a separate action; it exports rendered content, not a Markdown dialect. |
| Open/save Markdown or MDZip | Opens and saves source or packages it with its related assets; file operations do not silently convert syntax. |

HTML conversion is semantic, not a browser snapshot. It maps supported headings,
paragraphs, lists/tasks, quotes, code, tables, links, images, audio/video,
attachments, details, and alignment where possible. Scripts and active embedded
content are omitted; inline CSS, merged table cells, HTML comments, and
unsupported structures produce warnings or are not retained.

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
- Wmdx superscript imports from semantic HTML `<sup>` and exports to `<sup>` in
  CommonMark, GFM, and Obsidian documents.
- Wmdx strikethrough exports as CommonMark `<del>` and stays `~~text~~` in GFM
  and Obsidian.
- GFM pipe tables are preserved in CommonMark output with a warning. Pipe tables
  are not defined by CommonMark, so a strict CommonMark renderer may show the
  source as text instead of a table.
- Obsidian heading/block transclusion, plugin syntax, YAML properties, math,
  Mermaid, semantic tags, and full vault resolution are not supported.

The pinned CommonMark 0.31.2 corpus contains 652 examples; parser-family checks
and import/export round-trip checks cover 575 non-HTML examples. The GFM 0.29
extension fixture checks 21 non-HTML examples through import and export. These
tests check semantic parser families, not every tree detail or rendered result.
Raw HTML cases are excluded by the no-active-HTML policy, and the Obsidian tests
are curated feature tests rather than an official versioned conformance suite.
The conversion and linter tests therefore do **not** certify complete
CommonMark, GFM, Obsidian, or HTML conformance.

The linter is a small structural checker for common errors such as unclosed
code fences, unresolved references/footnotes, malformed Wmdx resource fields,
table row widths, empty callouts, active HTML, and Obsidian transclusion. A
clean lint result is not proof that a document is valid in every target
renderer.
