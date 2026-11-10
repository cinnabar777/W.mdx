# W.mdx Markdown Cheat Sheet

This guide covers standard Markdown, GitHub Flavored Markdown (GFM), and the additional syntax W.mdx recognizes. Settings can change the appearance of formatting, but do not change the syntax shown here. The code samples show what to type; the examples labeled **Rendered** show the result in the editor.

For the agreed W.mdx-native syntax and its current implementation status, see [W.mdx Native Syntax — Design Draft](Wmdx-Syntax-Design.md). For how CommonMark, GFM, Obsidian, and Wmdx settings interact with file opening, saving, and export, see [Markdown Dialects, Settings, and File Formats](Markdown-Dialects-and-File-Formats.md).

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

Separate paragraphs with a blank line. A normal newline within a paragraph is a soft break; W.mdx renders it as a space in Live Preview and WYSIWYG while Source preserves the literal newline. Two trailing spaces or a backslash immediately before the newline request a hard line break, which also matters when exporting Markdown to HTML or another renderer. W.mdx keeps the two spaces visible in every view; it may hide the backslash marker in visual modes.

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

When **Use Wmdx syntax** is enabled in Underline settings, underscores mark underlined text instead of italic text. Use `*asterisks*` for italics in that setting.

### Wmdx subscript

Wrap text in single tildes to display subscript, as in `H~2~O`. This is a Wmdx extension, not GFM strikethrough; GFM strikethrough uses double tildes, `~~text~~`. CommonMark, GFM, and Obsidian exports represent subscript with `<sub>text</sub>`.

### Wmdx superscript

Wrap text in paired carets to display superscript, as in `x^2^`. This is a Wmdx extension; CommonMark, GFM, and Obsidian exports represent it with `<sup>text</sup>`.

### Wmdx underline styles

The subscript digit selects the underline style:

| Style | Syntax |
| --- | --- |
| Solid | `_text_` |
| Dotted | `_₀text_` |
| Dashed | `_₁text_` |
| Double | `_₂text_` |
| Wavy | `_₃text_` |

The style and color are controlled by Underline settings. The digits are subscript characters: `₀`, `₁`, `₂`, and `₃`.

**Rendered:** _Solid underline_, _₀dotted underline_, _₁dashed underline_, _₂double underline_, and _₃wavy underline_.

### Wmdx highlighter and pen

These are Wmdx extensions, not standard Markdown. The subscript digit selects one of four configurable color slots. Set the slot colors in **Typography → Highlights & Pens**.

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

The slot numbers identify settings; they do not lock a slot to a particular color. Keep the text snug against the markers: write `==text==`, not `== text ==`.

**Rendered:** ==Highlight 1==, ==₀highlight 2==, ==₁highlight 3==, ==₂highlight 4==; =Pen 1=, =₀pen 2=, =₁pen 3=, and =₂pen 4=.

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

Place a backslash before Markdown punctuation when it should appear as ordinary text. For example:

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

You can also put syntax in inline code or a code block to show it literally. Backslash escapes do not apply inside code.

**Rendered:** Literal markers: \*asterisks\*, \_underscores\_, \==highlight\==, and \=pen\=.

For a literal wiki-link example such as `[[Target]]`, use code formatting. W.mdx's wiki-link recognizer does not treat a backslash as an escape for its opening brackets.

## Code blocks

Use three or more matching backticks or tildes on their own lines:

````markdown
```javascript
function greet(name) {
  return `Hello, ${name}`;
}
```
````

The language after the opening fence enables syntax highlighting when that language is available. The closing fence must use the same character and at least as many marks as the opening fence. Indented code blocks are also part of Markdown, but fenced blocks are easier to edit and label.

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

Use a space inside the brackets for an unchecked task and `x` for a checked task.

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

Callouts extend block quotes. Put `[!type]` after the quote marker. An optional title follows the type:

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

The type is an identifier beginning with a letter; it may also contain digits, underscores, or hyphens. Common labels include `note`, `info`, `tip`, `warning`, `question`, `example`, and `todo`.

## Links and images

### Markdown links

```markdown
[W.mdx](https://example.com)
[A note in this folder](My%20Notes.md)
[A link with a title](https://example.com "Optional title")
```

For spaces in a URL or file path, use `%20`. In link text, escape a closing bracket as `\]` when necessary.

**Rendered:** [W.mdx website](https://example.com)

### W.mdx wiki links

W.mdx recognizes these Obsidian-style link forms:

```markdown
[[Target]]
[[#Heading in this document]]
[[Target|Display text]]
```

`[[#Heading]]` links to a heading in the current document. The `|` separates the target from its display text. Wiki links are an extension, not standard Markdown.

**Rendered:** [[#Quick reference|Jump to the quick reference]].

`[[Target]]` is an Obsidian-style wikilink. Prefixing it with `!` embeds a supported local document inline; see [Embedded documents](#embedded-documents).

### Images

Standard Markdown image syntax:

```markdown
![Description of the image](images/diagram.png)
```

W.mdx also accepts a pixel width after a vertical bar in the description:

```markdown
![Diagram|640](images/diagram.png)
```

The width must be a whole number from 1 to 10,000. If no width is supplied, the image uses its natural size, subject to the editor's available width.

The **Insert image** action can use a selected image file, embed a selected file as Base64, or insert pasted Base64 data. When entering a URL, leave both options unchecked to keep the URL as the image source; alternatively, download the image to the document's assets or embed it as Base64. The download and Base64 options are mutually exclusive.

**Rendered:**

![Cyan sample image|120](data:image/svg+xml,%3Csvg%20xmlns%3D'http://www.w3.org/2000/svg'%20width%3D'120'%20height%3D'60'%3E%3Crect%20width%3D'120'%20height%3D'60'%20fill%3D'%2300bfc5'/%3E%3C/svg%3E)

## Audio and video

W.mdx recognizes links to supported audio and video files and renders them as players. The link text is the displayed title; changing it does not rename the file.

```markdown
[Voice memo](audio/voice-memo.m4a)
[Trip video](video/trip.mp4)
```

Supported audio file extensions are `.mp3`, `.aac`, `.m4a`, `.wav`, `.flac`, `.opus`, `.ogg`, and `.oga`. Recognized video extensions are `.mp4`, `.m4v`, `.webm`, `.3gp`, `.mov`, `.mkv`, `.avi`, `.mpeg`, `.mpg`, `.ogv`, and `.wmv`. Actual playback depends on Android and the device's codec support.

The optional Markdown link title can store W.mdx display width and alignment:

```markdown
[Voice memo](audio/voice-memo.m4a "wmdx-audio:width=75;align=center")
[Trip video](video/trip.mp4 "wmdx-video:width=80;align=right")
```

The width is a whole-number percentage from 40 to 100. Alignment is `left`, `center`, or `right`. The default full-width, left-aligned layout needs no additional title metadata. These `wmdx-audio` and `wmdx-video` titles are W.mdx extensions, not standard Markdown.

## Attachments

Use a Markdown link to create a downloadable/openable attachment button. The link text is its displayed title:

```markdown
[Project files](attachments/project-files.zip "wmdx-attachment")
```

The `wmdx-attachment` link title tells W.mdx to render the link as an attachment rather than an ordinary text link. Attachment buttons can also store width and alignment:

```markdown
[Project files](attachments/project-files.zip "wmdx-attachment:width=75;align=center")
```

The width and alignment rules are the same as for audio and video. Tapping an attachment opens the file with a compatible app. The inserted title is display text; it does not rename the file.

## Embedded documents

W.mdx uses Obsidian's embed form for supported local documents:

```markdown
![[notes.md]]
![[notes.md|Project notes]]
```

The part after `|` is an optional display alias. W.mdx embeds the whole document; Obsidian heading and block selectors are not currently supported.

The Embed action can copy the selected document into the current document's assets or link to the original file. Choose the method in **Document Appearance → Embedded Content**. A copied MDZip embed is stored inside the MDZip archive; Markdown documents use the configured Markdown asset storage. A linked embed continues to use the original file, so it must remain available to W.mdx.

Embeds can use MDZip files and UTF-8 text-based files the renderer can display, including Markdown, plain text, and code files. Legacy TextPack documents and remote URLs are not supported as embedded documents.

Embedded interaction is also controlled in **Document Appearance → Embedded Content**. **Limited interaction** allows checkboxes to be toggled without editing the rest of the document. **Full inline editing** allows editing within the embed. When full editing is enabled, the **Save edited to** setting chooses whether edits go to the copy in the parent document's assets or back to the original linked file.

## Tables

Tables use GFM pipe syntax. The separator row divides the header from the body; colons set alignment:

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

The outside pipes are optional. Escape a pipe that belongs inside a cell as `\|`. Basic inline Markdown can be used in cells; tables cannot contain multi-paragraph cell content.

## Horizontal rules

Put at least three matching hyphens, asterisks, or underscores on a line by themselves:

```markdown
---
***
```

The underscore form is escaped here so its three marks stay visible: \_\_\_.

**Rendered:**

Text above the rule.

---

Text below the rule.

Use a blank line before the rule. A line of hyphens directly below text creates a level-two Setext heading instead.

## Footnotes

Add a reference in the text and a matching definition, preferably in a footnotes section near the end of the document:

```markdown
This sentence has a footnote.[^source]

[^source]: The footnote text.
    A continuation line starts with four spaces.

Text after the footnote definitions can continue here.
```

**Rendered:**

This sentence has a rendered footnote.[^rendered]

[^rendered]: The footnote appears with the document's other footnotes.

Labels must not contain spaces or closing brackets. Matching is case-insensitive. A reference is only treated as a footnote when a definition with that label exists. Continuation lines need at least four leading spaces. Obsidian also supports inline footnotes such as `^[footnote text]`. Wmdx can recognize and render that syntax when the Obsidian inline footnote flavor is enabled; it is not part of GFM or CommonMark.

## HTML and other app-specific syntax

The old `md...` entries were text-expansion abbreviations, not Markdown syntax. Any expansion depends on your keyboard or an external text expander; Wmdx does not define those abbreviations.

Wmdx does not use HTML as its native authoring syntax. The editor can export HTML/MHTML and convert HTML or MHTML input into a new Markdown document. Import maps supported semantic blocks, lists, links, images, media, attachments, and tables; scripts and active embedded content are omitted, and known losses are shown as warnings. Export renders the complete Markdown source into semantic HTML rather than copying the editor DOM, then sanitizes active content. Local assets and MHTML archive behavior still require device acceptance. See [Markdown Dialects, Settings, and File Formats](Markdown-Dialects-and-File-Formats.md) and the [compatibility matrix](Markdown-Compatibility-Matrix.md).

When **Use Wmdx syntax** is disabled, underline formatting uses the `<u>...</u>` compatibility form; when enabled, it uses Wmdx's text-based underline markers.

## Markdown dialect compatibility

W.mdx is a combination rather than a strict implementation of one flavor: it uses a CommonMark-based parser with GFM extensions, Wmdx formatting, and selected Obsidian conventions. “Supported” below means the syntax is implemented in the current editor; it does not claim exact compatibility with every edge case in another renderer.

### CommonMark

**Implemented for everyday documents:** headings, paragraphs, lists, block quotes, code spans and blocks, emphasis, links, images, escapes, hard line breaks, thematic breaks, reference links, and autolinks.

**Remaining compatibility work:**

- The pinned CommonMark 0.31.2 corpus compares rendered semantics after import/export for all 575 non-HTML examples using the official reference renderer. This verifies conversion output, not every in-editor interaction or Android file-provider behavior.
- The explicit HTML-to-Wmdx conversion action now maps common semantic content. It still needs broad HTML-interoperability coverage and Android file-provider verification; unsupported styles and structures are reported as warnings.
- Keep the optional **Use Wmdx syntax** underline setting in mind: when enabled, `_text_` means underline rather than CommonMark italic. Use `*text*` for portable italics in that setting.

### GitHub Flavored Markdown

**Implemented:** pipe tables, task-list checkboxes, double-tilde strikethrough, and GFM autolinks. Single tilde is reserved for Wmdx subscript. Tables and tasks are editable in W.mdx.

**Remaining compatibility work:**

- All 21 non-HTML examples from the GFM 0.29 table, strikethrough, and autolink extensions are compared against upstream expected HTML semantics in WYSIWYG, and each fixture verifies that source remains unchanged. This does not cover full GFM core behavior or certify import/export compatibility.
- GitHub.com alerts share the `> [!type]` callout marker with W.mdx, but exact alert types and rendering are not a compatibility promise.
- Inline raw HTML emphasis, strike, sub/superscript, mark, code, and underline tags render in Live/WYSIWYG and remain literal in Source. Raw HTML links, images, breaks, CSS-specific styling, and block HTML are still not browser-equivalent; explicit HTML conversion handles a larger semantic subset and warns about retained content.
- GitHub-specific issue, pull-request, commit, and `@mention` links are not general Markdown syntax; W.mdx does not resolve them to GitHub or send notifications.

### Obsidian Flavored Markdown

**Implemented:** `[[target]]` wiki links, aliases such as `[[target|display text]]`, current-document heading links such as `[[#Heading]]`, whole-document `![[path]]` embeds with optional aliases, and local image/audio/video/PDF and supported attachment embeds such as `![[image.png]]` or `![[clip.mp4]]` (including pixel-size modifiers where applicable). Obsidian-style callout markers, highlights, task lists, and reference footnotes are also supported.

**Not implemented or only partially compatible:**

- Heading and block transclusion such as `![[note#Heading]]` and `![[note#^block]]`; W.mdx embeds the whole supported document.
- Exact vault resolution and application-specific embed behavior. Local audio/video/PDF embeds map to Wmdx media or attachment resources and export back to Obsidian embed syntax when their metadata is representable; external vault resolution still depends on the receiving app.
- `%% comments %%`, semantic tags (a `#tag` is plain text), YAML properties/frontmatter, math, Mermaid diagrams, and plugin-specific syntax.
- Exact Obsidian vault resolution and app behavior. W.mdx's file access and linked-file behavior follow its own folder permissions and document settings.

Callouts deliberately share Obsidian's `> [!type]` form; W.mdx also supports nested callouts and `+`/`-` initial folding markers. This is syntax overlap, not full Obsidian callout or plugin parity.

### Other dialects outside the current scope

Pandoc Markdown and Markdown Extra are not current targets. Consider them only after the CommonMark, GFM, and Obsidian acceptance work is complete. Specify individual extensions rather than promising compatibility with an entire dialect.

MDX combines Markdown with JSX and JavaScript expressions; it is not a plain Markdown dialect or a compatibility target for Wmdx documents.

**Current scope:** CommonMark, GFM, and Obsidian's built-in Markdown syntax. Do not add another dialect target until the current feature matrix and round-trip/device acceptance work is complete.

### Specifications and references

- [CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/)
- [GitHub Flavored Markdown specification](https://github.github.com/gfm/)
- [Obsidian basic syntax](https://obsidian.md/help/syntax)
- [Obsidian advanced syntax](https://obsidian.md/help/advanced-syntax)
- [Obsidian internal links](https://obsidian.md/help/links) and [embeds](https://obsidian.md/help/embeds)
- [Obsidian callouts](https://obsidian.md/help/callouts) and [properties](https://obsidian.md/help/properties)
- [Pandoc's Markdown](https://pandoc.org/MANUAL.html#pandocs-markdown)
- [Markdown Extra](https://michelf.ca/projects/php-markdown/extra/)
- [MDX: Markdown for the component era](https://mdxjs.com/docs/what-is-mdx/)

## Compatibility and verification status

Focused tests verify named Wmdx behaviors; they do not establish full specification compatibility or identical rendering in another application. The official CommonMark 0.31.2 corpus has 575 non-HTML cases checked for import/export rendered semantics against the reference renderer. The remaining 77 HTML-interoperability cases are excluded from that comparison and are not certification of HTML conversion. The 21 GFM extension examples have WYSIWYG comparisons against upstream expected HTML; seven curated Obsidian fixtures check wikilinks, heading links, highlights, image embeds, callouts, tasks, and footnotes. The project does not claim complete GFM or Obsidian conformance.

| Area | Implemented behavior and tests | Known remaining work |
| --- | --- | --- |
| CommonMark core | Import/export rendered-semantic comparisons cover all 575 non-HTML examples against the pinned reference renderer. Focused editor tests cover character references, escapes, hard breaks, code spans, nested lists, and lists in quotes while preserving source. | In-editor interactions and Android file-provider behavior still need acceptance testing; raw-HTML cases are excluded. |
| GFM extensions | Pipe tables, tasks, strikethrough, and autolinks are recognized; all 21 non-HTML GFM 0.29 extension examples compare WYSIWYG semantics with upstream expected HTML. | GitHub-specific mentions/issue references and full GFM interoperability are not promised. |
| Obsidian conventions | Wiki links/aliases, heading links, image/audio/video/PDF embeds, highlights, callouts, tasks, and footnotes have focused conversion fixtures; a round-trip test covers callout type/fold state, wikilink identity, highlight, and footnote content through HTML. | Heading/block transclusion, plugin syntax, YAML properties, and full vault behavior are outside scope. |
| Wmdx syntax | Decimal headings, alphabetic/Roman list markers, native tasks, resource links, media/attachment metadata, callouts, numbered footnotes, underline styles, highlight slots, and pen slots are implemented. | App/device acceptance remains necessary; export can lose style or dialect-specific semantics and reports known losses. |
| Import and paste | Menu actions preview conversion from CommonMark, GFM, Obsidian, or HTML into Wmdx. Paste uses the same conversion engine. | Complex HTML styling, HTML comments, merged table cells, and unsupported dialect features may be omitted with warnings. |
| Markdown export | Menu action exports CommonMark, GFM, or Obsidian and saves a separate Markdown file. Headings, links, supported callouts/tasks, and Wmdx formatting have explicit mappings. | CommonMark tables are preserved as pipe-table source with a warning; Wmdx ordered styles become decimal; color and pen semantics may be lost. Test all target renderers and round trips. |
| HTML/MHTML | Semantic HTML export covers supported rendered structures; HTML/MHTML import converts the HTML part and related MHTML resources to Markdown. | Verify local asset access, separate stylesheet providers, and WebView MHTML creation/reopen on Android devices. |
| Linter | The in-app linter provides structural diagnostics for unclosed fences, missing references/footnotes, malformed Wmdx resources, table row width, empty callouts, active HTML, and unsupported Obsidian transclusion. | It does not beautify or normalize Markdown style. Evaluate a conservative, check-only profile based on the user-referenced [Obsidian Linter](https://github.com/platers/obsidian-linter) for documentation and test-fixture consistency. Keep style checks separate from CommonMark/GFM/Obsidian conformance and semantic round-trip tests; do not auto-wrap source or alter soft-break semantics. |

### Wmdx authoring goal

Wmdx is a readable, text-based word processor. It uses standard Markdown where that syntax is clear and sufficient, and adds native syntax for word-processing features that Markdown does not express well. Import/export may use portable HTML fallbacks for specific semantics, but the editor's authoring syntax should remain readable in plain text and avoid silently discarding information.
