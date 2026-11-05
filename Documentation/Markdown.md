# W.mdx Markdown Cheat Sheet

This guide covers standard Markdown, GitHub Flavored Markdown (GFM), and the
additional syntax W.mdx recognizes. Settings can change the appearance of
formatting, but do not change the syntax shown here. The code samples show what
to type; the examples labeled **Rendered** show the result in the editor.

## Quick reference

| Result | Example |
| --- | --- |
| Heading | `# Heading` through `###### Heading` |
| Bold | `**bold text**` |
| Italic | `*italic text*` |
| Strikethrough | `~~removed text~~` |
| Inline code | `` `code` `` |
| Link | `[label](https://example.com)` |
| Image | `![description](image.png)` |
| Quote | `> quoted text` |
| Bullet list | `- item` |
| Numbered list | `1. item` |
| Task | `- [ ] unfinished` |
| Footnote | `Text.[^1]` and `[^1]: Note text` |
| Highlight | `==text==` |
| Underline | `_text_` |
| Horizontal rule | `---` on a line by itself |

## Headings and paragraphs

Put one to six `#` characters and a space before a heading:

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

**Rendered:**

# Heading level 1
## Heading level 2
### Heading level 3
#### Heading level 4
##### Heading level 5
###### Heading level 6

The alternate Setext form supports the first two levels:

```markdown
Heading 1
=========

Heading 2
---------
```

Separate paragraphs with a blank line. A normal newline within a paragraph is
a soft break; renderers may display it as a space or as a line break. Two
trailing spaces or a backslash immediately before the newline request a hard
line break, which also matters when exporting Markdown to HTML or another
renderer. W.mdx keeps the two spaces visible in every view; it may hide the
backslash marker in visual modes.

## Text formatting

### Bold, italic, and strikethrough

```markdown
**Bold**
__Bold also works__

*Italic*
***Bold and italic***

~~Strikethrough~~
```

**Rendered:** **Bold**, *italic*, ***bold italic***, and ~~strikethrough~~.

When **Use Wmdx syntax** is enabled in Underline settings, underscores mark
underlined text instead of italic text. Use `*asterisks*` for italics in that
setting.

### Wmdx underline styles

The subscript digit selects the underline style:

| Style | Syntax |
| --- | --- |
| Solid | `_text_` |
| Dotted | `_₀text_` |
| Dashed | `_₁text_` |
| Double | `_₂text_` |
| Wavy | `_₃text_` |

The style and color are controlled by Underline settings. The digits are
subscript characters: `₀`, `₁`, `₂`, and `₃`.

**Rendered:** _Solid underline_, _₀dotted underline_, _₁dashed underline_,
_₂double underline_, and _₃wavy underline_.

### Wmdx highlighter and pen

These are Wmdx extensions, not standard Markdown. The subscript digit selects
one of four configurable color slots. Set the slot colors in **Typography →
Highlights & Pens**.

| Tool | Slot | Syntax |
| --- | --- | --- |
| Highlighter | 1 | `==text==` |
| Highlighter | 2 | `==₀text==` |
| Highlighter | 3 | `==₁text==` |
| Highlighter | 4 | `==₂text==` |
| Pen | 1 | `=text=` |
| Pen | 2 | `=₀text=` |
| Pen | 3 | `=₁text=` |
| Pen | 4 | `=₂text=` |

The slot numbers identify settings; they do not lock a slot to a particular
color. Keep the text snug against the markers: write `==text==`, not
`== text ==`.

**Rendered:** ==Highlight 1==, ==₀highlight 2==, ==₁highlight 3==,
==₂highlight 4==; =Pen 1=, =₀pen 2=, =₁pen 3=, and =₂pen 4=.

### Inline code

Use one backtick on each side. Code spans display their contents literally:

```markdown
`**this is code, not bold**`
```

If the text itself contains a backtick, use a longer backtick delimiter:

```markdown
`` Use `code` inside a code span ``
```

**Rendered:** `**this stays literal**` and `` Use `code` inside a code span ``.

## Escaping Markdown and Wmdx markers

Place a backslash before Markdown punctuation when it should appear as ordinary
text. For example:

```markdown
\*literal asterisks\*
\_literal underscores\_
\# This is not a heading
```

Escape Wmdx markers when they should not format the following text:

```markdown
\_literal underline markers\_
\==literal highlight markers\==
\=literal pen markers\=
```

You can also put syntax in inline code or a code block to show it literally.
Backslash escapes do not apply inside code.

**Rendered:** Literal markers: \*asterisks\*, \_underscores\_,
\==highlight\==, and \=pen\=.

For a literal wiki-link example such as `[[Target]]`, use code formatting.
W.mdx's wiki-link recognizer does not treat a backslash as an escape for its
opening brackets.

## Code blocks

Use three or more matching backticks or tildes on their own lines:

````markdown
```javascript
function greet(name) {
  return `Hello, ${name}`;
}
```
````

The language after the opening fence enables syntax highlighting when that
language is available. The closing fence must use the same character and at
least as many marks as the opening fence. Indented code blocks are also part of
Markdown, but fenced blocks are easier to edit and label.

**Rendered:**

```javascript
function greet(name) {
  return `Hello, ${name}`;
}
```

## Lists and tasks

### Bullet lists

Use `-`, `*`, or `+` followed by a space:

```markdown
- First item
- Second item
  - Nested item
```

Indent nested items consistently. Lists can be nested and mixed.

**Rendered:**

- First item
- Second item
  - Nested item

### Numbered lists

Use a number, a period, and a space:

```markdown
1. First item
2. Second item
   1. Nested item
```

**Rendered:**

1. First item
2. Second item
   1. Nested item

### Task lists

Task lists use GFM checkbox syntax:

```markdown
- [ ] Not finished
- [x] Finished
```

Use a space inside the brackets for an unchecked task and `x` for a checked
task.

**Rendered:**

- [ ] Not finished
- [x] Finished

## Block quotes and callouts

### Block quotes

Start each quoted line with `>`:

```markdown
> A quoted paragraph.
> It can continue on another line.
>
> A second paragraph in the quote.
```

**Rendered:**

> This is a rendered block quote.
> It can contain **formatted text**.

### W.mdx callouts

Callouts extend block quotes. Put `[!type]` after the quote marker. An optional
title follows the type:

```markdown
> [!info] Optional title
> Callout body text.
> **Markdown formatting** can be used in the body.
```

Add `-` to start collapsed or `+` to start expanded:

```markdown
> [!question]- Start collapsed
> The body is initially folded.

> [!tip]+ Start expanded
> The body is initially visible.
```

**Rendered:**

> [!info] Example callout
> This callout is displayed with the current **callout settings**.

Nested callouts use additional quote markers:

```markdown
> [!question] Outer callout
> Outer text.
> > [!info] Nested callout
> > Nested text.
```

**Rendered:**

> [!question] Outer callout
> The outer message.
> > [!info] Nested callout
> > The nested message.

The type is an identifier beginning with a letter; it may also contain digits,
underscores, or hyphens. Common labels include `note`, `info`, `tip`, `warning`,
`question`, `example`, and `todo`.

## Links and images

### Markdown links

```markdown
[W.mdx](https://example.com)
[A note in this folder](My%20Notes.md)
[A link with a title](https://example.com "Optional title")
```

For spaces in a URL or file path, use `%20`. In link text, escape a closing
bracket as `\]` when necessary.

**Rendered:** [W.mdx website](https://example.com)

### W.mdx wiki links

W.mdx recognizes these Obsidian-style link forms:

```markdown
[[Target]]
[[#Heading in this document]]
[[Target|Display text]]
```

`[[#Heading]]` links to a heading in the current document. The `|` separates
the target from its display text. Wiki links are an extension, not standard
Markdown.

**Rendered:** [[#Quick reference|Jump to the quick reference]].

`[[Target]]` is an Obsidian-style wikilink. Prefixing it with `!` embeds a
supported local document inline; see [Embedded documents](#embedded-documents).

### Images

Standard Markdown image syntax:

```markdown
![Description of the image](images/diagram.png)
```

W.mdx also accepts a pixel width after a vertical bar in the description:

```markdown
![Diagram|640](images/diagram.png)
```

The width must be a whole number from 1 to 10,000. If no width is supplied, the
image uses its natural size, subject to the editor's available width.

The **Insert image** action can use a selected image file, embed a selected file
as Base64, or insert pasted Base64 data. When entering a URL, leave both options
unchecked to keep the URL as the image source; alternatively, download the image
to the document's assets or embed it as Base64. The download and Base64 options
are mutually exclusive.

**Rendered:**

![Cyan sample image|120](data:image/svg+xml,%3Csvg%20xmlns%3D'http://www.w3.org/2000/svg'%20width%3D'120'%20height%3D'60'%3E%3Crect%20width%3D'120'%20height%3D'60'%20fill%3D'%2300bfc5'/%3E%3C/svg%3E)

## Audio and video

W.mdx recognizes links to supported audio and video files and renders them as
players. The link text is the displayed title; changing it does not rename the
file.

```markdown
[Voice memo](audio/voice-memo.m4a)
[Trip video](video/trip.mp4)
```

Supported audio file extensions are `.mp3`, `.aac`, `.m4a`, `.wav`, `.flac`,
`.opus`, `.ogg`, and `.oga`. Recognized video extensions are `.mp4`, `.m4v`,
`.webm`, `.3gp`, `.mov`, `.mkv`, `.avi`, `.mpeg`, `.mpg`, `.ogv`, and `.wmv`.
Actual playback depends on Android and the device's codec support.

The optional Markdown link title can store W.mdx display width and alignment:

```markdown
[Voice memo](audio/voice-memo.m4a "wmdx-audio:width=75;align=center")
[Trip video](video/trip.mp4 "wmdx-video:width=80;align=right")
```

The width is a whole-number percentage from 40 to 100. Alignment is `left`,
`center`, or `right`. The default full-width, left-aligned layout needs no
additional title metadata. These `wmdx-audio` and `wmdx-video` titles are W.mdx
extensions, not standard Markdown.

## Attachments

Use a Markdown link to create a downloadable/openable attachment button. The
link text is its displayed title:

```markdown
[Project files](attachments/project-files.zip "wmdx-attachment")
```

The `wmdx-attachment` link title tells W.mdx to render the link as an attachment
rather than an ordinary text link. Attachment buttons can also store width and
alignment:

```markdown
[Project files](attachments/project-files.zip "wmdx-attachment:width=75;align=center")
```

The width and alignment rules are the same as for audio and video. Tapping an
attachment opens the file with a compatible app. The inserted title is display
text; it does not rename the file.

## Embedded documents

W.mdx uses Obsidian's embed form for supported local documents:

```markdown
![[notes.md]]
![[notes.md|Project notes]]
```

The part after `|` is an optional display alias. W.mdx embeds the whole document;
Obsidian heading and block selectors are not currently supported.

The Embed action can copy the selected document into the current document's
assets or link to the original file. Choose the method in **Document Appearance
→ Embedded Content**. A copied MDZip embed is stored inside the MDZip archive;
Markdown documents use the configured Markdown asset storage. A linked embed
continues to use the original file, so it must remain available to W.mdx.

Embeds can use MDZip files and UTF-8 text-based files the renderer can display,
including Markdown, plain text, and code files. Legacy TextPack documents and
remote URLs are not supported as embedded documents.

Embedded interaction is also controlled in **Document Appearance → Embedded
Content**. **Limited interaction** allows checkboxes to be toggled without
editing the rest of the document. **Full inline editing** allows editing within
the embed. When full editing is enabled, the **Save edited to** setting chooses
whether edits go to the copy in the parent document's assets or back to the
original linked file.

## Tables

Tables use GFM pipe syntax. The separator row divides the header from the body;
colons set alignment:

```markdown
| Left | Center | Right |
| :--- | :----: | ----: |
| A    | B      | C     |
| D    | E      | F     |
```

**Rendered:**

| Left | Center | Right |
| :--- | :----: | ----: |
| **Bold** | centered | right |
| A | B | C |

The outside pipes are optional. Escape a pipe that belongs inside a cell as
`\|`. Basic inline Markdown can be used in cells; tables cannot contain
multi-paragraph cell content.

## Horizontal rules

Put at least three matching hyphens, asterisks, or underscores on a line by
themselves:

```markdown
---
***
```

The underscore form is escaped here so its three marks stay visible: \_\_\_.

**Rendered:**

Text above the rule.

---

Text below the rule.

Use a blank line before the rule. A line of hyphens directly below text creates
a level-two Setext heading instead.

## Footnotes

Add a reference in the text and a matching definition, preferably in a
footnotes section near the end of the document:

```markdown
This sentence has a footnote.[^source]

[^source]: The footnote text.
    A continuation line starts with four spaces.

Text after the footnote definitions can continue here.
```

**Rendered:**

This sentence has a rendered footnote.[^rendered]

[^rendered]: The footnote appears with the document's other footnotes.

Labels must not contain spaces or closing brackets. Matching is
case-insensitive. A reference is only treated as a footnote when a definition
with that label exists. Continuation lines need at least four leading spaces.
Inline footnotes such as `^[footnote text]` are not supported.

## HTML and other app-specific syntax

The old `md...` entries were text-expansion abbreviations, not Markdown syntax.
Any expansion depends on your keyboard or an external text expander; Wmdx does
not define those abbreviations.

Wmdx's goal is not to author or export HTML. Currently, when **Use Wmdx syntax**
is disabled, underline formatting uses the `<u>...</u>` compatibility form;
when enabled, it uses Wmdx's text-based underline markers. Treat HTML support as
an interoperability case, not a model for new Wmdx features.

When importing HTML-based Markdown, convert recognized constructs to native
Wmdx syntax where an equivalent exists. The behavior for constructs Wmdx cannot
express remains a compatibility gap to define and test; do not silently discard
them or emit HTML as a fallback.

## Markdown dialect compatibility

W.mdx is a combination rather than a strict implementation of one flavor: it
uses a CommonMark-based parser with GFM extensions, Wmdx formatting, and selected
Obsidian conventions. “Supported” below means the syntax is implemented in the
current editor; it does not claim exact compatibility with every edge case in
another renderer.

### CommonMark

**Implemented for everyday documents:** headings, paragraphs, lists, block
quotes, code spans and blocks, emphasis, links, images, escapes, hard line
breaks, thematic breaks, reference links, and autolinks.

**Still to do for full compatibility:**

- The pinned CommonMark 0.31.2 corpus now checks parser-level semantic nodes for
  all 575 non-HTML examples. This does not yet verify exact WYSIWYG rendering,
  edits, or exported Markdown.
- Define and test how imported raw HTML is converted to Wmdx-native syntax.
  Wmdx must not render arbitrary HTML or use HTML as its export fallback; warn
  rather than silently lose content that has no native equivalent.
- Keep the optional **Use Wmdx syntax** underline setting in mind: when enabled,
  `_text_` means underline rather than CommonMark italic. Use `*text*` for
  portable italics in that setting.

### GitHub Flavored Markdown

**Implemented:** pipe tables, task-list checkboxes, single- and double-tilde
strikethrough, and GFM autolinks. Tables and tasks are editable in W.mdx.

**Still to do for full compatibility:**

- The GFM 0.29 extension corpus now has parser-semantic checks for all 21
  non-HTML table, strikethrough, and autolink examples. This does not yet verify
  exact WYSIWYG rendering or full Markdown import/export round trips.
- GitHub.com alerts share the `> [!type]` callout marker with W.mdx, but exact
  alert types and rendering are not a compatibility promise.
- For GFM raw HTML, use the import-conversion policy above rather than rendering
  or exporting HTML.
- GitHub-specific issue, pull-request, commit, and `@mention` links are not
  general Markdown syntax; W.mdx does not resolve them to GitHub or send
  notifications.

### Obsidian Flavored Markdown

**Implemented:** `[[target]]` wiki links, aliases such as
`[[target|display text]]`, current-document heading links such as
`[[#Heading]]`, whole-document `![[path]]` embeds with optional aliases,
Obsidian-style callout markers, highlights, task lists, and reference
footnotes.

**Not implemented or only partially compatible:**

- Heading and block transclusion such as `![[note#Heading]]` and
  `![[note#^block]]`; W.mdx embeds the whole supported document.
- Obsidian's `![[image.png]]`, audio, video, and PDF embed forms. Use standard
  Markdown image syntax and W.mdx's Markdown media links or attachment links.
- `%% comments %%`, semantic tags (a `#tag` is plain text), YAML
  properties/frontmatter, math, Mermaid diagrams, and plugin-specific syntax.
- Inline footnotes such as `^[note]`; W.mdx supports reference footnotes, with
  four-space-indented continuation lines.
- Exact Obsidian vault resolution and app behavior. W.mdx's file access and
  linked-file behavior follow its own folder permissions and document settings.

Callouts deliberately share Obsidian's `> [!type]` form; W.mdx also supports
nested callouts and `+`/`-` initial folding markers. This is syntax overlap, not
full Obsidian callout or plugin parity.

### Other dialects outside the current scope

Pandoc Markdown and Markdown Extra are not current targets. Their syntax may be
considered for import only after the CommonMark, GFM, and Obsidian goals below
are met. If that happens, specify the individual extensions needed instead of
promising compatibility with an entire dialect.

MDX combines Markdown with JSX and JavaScript expressions; it is not a plain
Markdown dialect or a compatibility target for Wmdx documents.

**Current scope:** CommonMark, GFM, and Obsidian's built-in Markdown syntax.
Do not add another dialect target until the compatibility goal below is met.

### Specifications and references

- [CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/)
- [GitHub Flavored Markdown specification](https://github.github.com/gfm/)
- [Obsidian basic syntax](https://obsidian.md/help/syntax)
- [Obsidian advanced syntax](https://obsidian.md/help/advanced-syntax)
- [Obsidian internal links](https://obsidian.md/help/links) and
  [embeds](https://obsidian.md/help/embeds)
- [Obsidian callouts](https://obsidian.md/help/callouts) and
  [properties](https://obsidian.md/help/properties)
- [Pandoc's Markdown](https://pandoc.org/MANUAL.html#pandocs-markdown)
- [Markdown Extra](https://michelf.ca/projects/php-markdown/extra/)
- [MDX: Markdown for the component era](https://mdxjs.com/docs/what-is-mdx/)

## Compatibility goal

- **CommonMark and GFM:** provide full comparability and import/export support
  for each dialect's Markdown syntax, verified against its specification and
  representative documents. Raw HTML follows Wmdx's no-HTML boundary below.
- **Obsidian:** W.mdx is not intended to reproduce the entire Obsidian app.
  Make the documented built-in Markdown syntax and features that W.mdx supports
  work reliably and as closely to Obsidian as practical. This does not include
  third-party plugins or every Obsidian app feature.
- **Import and export:** preserve supported meaning through open, edit, save,
  export, and reopen. If a target format cannot represent a feature, convert it
  explicitly or warn the user rather than silently dropping it.

**Next step:** create a feature-by-feature acceptance matrix and regression
fixtures for all three targets. Test each applicable path through import/open,
rendering and editing, save/export, and reopen before expanding the syntax.

## Compatibility matrix

“Focused tests” below verify specific app behavior; they do not establish full
specification compatibility. The official CommonMark 0.31.2 corpus is included:
575 non-HTML cases pass a parser-semantic check, and 77 HTML-interoperability
cases are held for the no-HTML import policy. The suite does not yet verify full
WYSIWYG rendering or export, and there is no official GFM corpus or complete
cross-dialect round-trip suite.

| Target or area | Current support and focused test evidence | Remaining acceptance work |
| --- | --- | --- |
| CommonMark core | Parser-semantic checks cover all 575 non-HTML cases in the official 0.31.2 corpus, including tab-separated ATX headings and unresolved references inside emphasis. Focused WYSIWYG/Live Preview tests cover character references, escapes, hard breaks, code-span normalization, flat-list indentation, nested lists, and lists inside block quotes while preserving source spelling. | Verify exact WYSIWYG rendering and open, edit, save, export, and reopen semantics against representative cases. |
| CommonMark raw HTML | Arbitrary HTML is not rendered. `<u>...</u>` remains as a compatibility form when Wmdx underline syntax is disabled; 77 HTML-interoperability cases are held out of native parser checks. | Convert supported imported HTML to native Wmdx syntax; define and test visible handling for constructs with no equivalent. Never emit HTML as fallback. |
| GFM tables | Editable pipe tables; tests cover official table examples 198–205, cell-count normalization, escaped pipes, alignment, editing, serialized Markdown reopening, and MDZip archive open/save/reopen. | Verify direct Android Markdown file save/open and the MDZip content-provider write path. |
| GFM tasks, strikethrough, and autolinks | The GFM 0.29 fixture checks all 21 non-HTML extension examples: tables 198–205, strikethrough 491–492, and autolinks 621–631, including FTP. Main and embedded tests cover task examples 279–280; Markdown stream-codec and MDZip tests cover open/save/reopen preservation. | Verify WYSIWYG rendering and Android document-provider round trips. Raw-HTML tag filtering remains under the no-HTML policy. The separate Export action produces HTML/MHTML, not a Markdown dialect export. |
| Obsidian links and document embeds | Wiki links, aliases, current-document heading links, whole-document embeds, and nested embeds; focused coverage in `navigation_link_mapping.test.cjs` and `embedded-document.test.cjs`. | Verify resolution and round trips across Markdown and MDZip. Heading/block transclusion and Obsidian media-embed shorthand remain unsupported. |
| Obsidian callouts and footnotes | Callout and reference-footnote behavior has focused coverage in `callout.test.cjs`, `footnotes.test.cjs`, and `embedded-document.test.cjs`. | Build a documented built-in syntax fixture set and verify behavior across source, WYSIWYG, save, and reopen. Plugin and app-only behavior is out of scope. |
| Wmdx word-processing syntax | Underline, highlighting, and pen syntax are implemented; focused tests include `markdown-formatting.test.cjs` and `underline-delimiters.test.cjs`. | Keep new syntax text-based, readable, and minimally intrusive. Heading alternatives such as `.1`, `.2`, and `.3` are planned, not implemented. Replace HTML dependence for authoring as native equivalents become available. |
| Cross-dialect import/export | Markdown files can be opened and saved, but no dialect-specific export profiles or complete round-trip acceptance suite are established. | Define conversion rules for each target; preserve supported meaning through import/edit/export/reopen and warn when a target cannot represent content without loss. |

### Wmdx authoring goal

Wmdx is intended to grow from a simple, readable Markdown editor into a text-based
word processor. Use standard Markdown where it is clear and sufficient. For
features Markdown does not cover well, add Wmdx-native syntax alternatives that
are obvious to novice users, minimally intrusive, and easy to read in plain
text. Do not use HTML as the authoring or export mechanism for those features.

The heading markers `.1`, `.2`, `.3`, and similar are a planned example of this
direction; their exact syntax and behavior still need to be defined.
