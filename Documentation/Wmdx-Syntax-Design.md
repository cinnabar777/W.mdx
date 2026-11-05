# W.mdx Native Syntax — Design Draft

**Status:** Design draft; not all rules in this document are implemented.

This document records the agreed direction and decisions for W.mdx's native
authoring syntax. It is separate from [Markdown.md](Markdown.md), which describes
the syntax the current app supports.

## Design direction

- W.mdx syntax is the primary authoring format. It should be readable as plain
  text, concise, and suitable for a word processor. W.mdx documents should not
  require or encourage authored HTML; add readable native syntax for word-
  processor features Markdown does not cover.
- CommonMark, GitHub Flavored Markdown (GFM), and Obsidian are import/export
  targets. Their limitations do not constrain W.mdx's native syntax; conversion
  belongs in a shared pipeline with a selected source or destination format.
  HTML export is allowed; HTML is not native Wmdx authoring syntax.
- Do not introduce syntax piecemeal. Agree on a coherent grammar before
  implementing parser, renderer, toolbar, or import/export changes.
- Prefer characters users can type on a phone keyboard. The existing Unicode
  subscript selectors for typography colors and styles are an intentional
  exception: they are unobtrusive in text and are rarely typed by hand.

## Agreed native syntax

### Resource references, links, and embeds

Use one fixed-slot form for local paths and URLs:

```text
[SOURCE|TITLE|SIZE|ALIGN]
![SOURCE|TITLE|SIZE|ALIGN]
```

- Without `!`, the reference opens or follows its source. With `!`, it displays
  the source inline when that resource type has an inline viewer.
- The same form accepts local paths and URLs. The resource type determines the
  appropriate open, attachment, or inline-display behavior.
- The title is the displayed label. For images it can serve as both alt text and
  a visible caption. When the title is empty, use the source filename.
- Keep all field separators when fields are empty. Whitespace around a title is
  optional and is only for readability; `\|` represents a literal pipe inside a
  field.
- Size applies only to displayed objects, never to text links. A size can give a
  width alone or a width-and-height box. Media must preserve its proportions and
  must not be stretched.
- Alignment applies to displayed objects and standalone links. An inline link
  inherits the paragraph's alignment and cannot override it.
- Unsized objects retain their natural proportions and fit within the available
  content width.

Examples:

```text
Read [https://example.com|the guide||] in this paragraph.
[https://example.com|Visit site||->]
[attachments/archive.zip|Project archive||]
![images/sunset.png|Sunset|320x240|><]
![images/sunset.png| Sunset |320x240|><]
![images/sunset.png|Sunset|80%|><]
![https://example.com/sunset.png|Sunset|320|<>]
![notes.md|Project notes||]
```

Use bare numbers for pixels (`320`, `320x240`) and a `%` suffix for percentage
width (`80%`). The insertion dialog defaults to percentage; switching to pixels
writes the size without `%`. A percentage applies to width relative to the
available content width; height follows the media's proportions. Percentage
height is not used.

The two pixel-based `Sunset` examples are equivalent; spaces around the title
are optional. An empty title, as in `[assets/image.png||320|><]`, uses the
source filename.

### Alignment

Use the same keyboard-friendly markers in the resource `ALIGN` field and at the
start of a paragraph:

| Marker | Meaning |
| --- | --- |
| `<` | Left |
| `><` | Center |
| `->` | Right |
| `<>` | Justified |

Paragraph alignment applies to the whole paragraph. The document appearance
setting remains the default when no local alignment marker is present. A link
within a paragraph does not override that paragraph's alignment.

Examples:

```text
< Left-aligned paragraph.
>< Centered paragraph.
-> Right-aligned paragraph.
<> Justified paragraph.
```

### Headings

Use six nonprinting structural markers, replacing the current hash markers:

```text
.1 Chapter
.2 Section
.3 Subsection
.4 Level four heading
.5 Level five heading
.6 Level six heading
```

The marker indicates one of the six heading levels; it is not part of the
displayed heading text. There are exactly six structural heading levels.

### Lists

Keep the basic list structure and nesting. The unordered marker selects the
rendered bullet shape:

| Marker | Bullet shape |
| --- | --- |
| `-` | Filled circle |
| `+` | Open circle |
| `*` | Square |

Ordered lists support decimal, alphabetic, and Roman numbering, in lowercase
and uppercase forms:

```text
1. Decimal item
a. Alphabetic item
a. Next item; it follows the same alphabetic list.
A. Uppercase alphabetic item
i. Roman item
I. Uppercase Roman item
```

The marker selects the numbering style; following items auto-increment.

### Block quotes and tables

- Keep `>` for block quotes and repeat it for nested quotes.
- **Agreed:** tables are out of scope for this syntax revision; leave their
  syntax and behavior unchanged. Keep the current pipe rows and separator row,
  colon-based left/center/right alignment, optional outside pipes, `\|` for a
  literal cell pipe, and existing cell-content limits. Do not add justified
  columns or alter table editing behavior.

### Inline formatting

The native W.mdx meanings are:

| Meaning | Syntax |
| --- | --- |
| Bold | `**text**` |
| Italic | `*text*` |
| Underline | `_text_` |
| Strikethrough | `~~text~~` |
| Superscript | `^text^` |
| Subscript | `~text~` |
| Inline code | `` `code` `` |

`*` always means italic and `_` always means underline; there is no syntax-mode
toggle. Keep the existing highlighter (`==...==`) and pen (`=...=`) forms,
including their Unicode subscript color-slot selectors.

Inline formatting styles can be combined inside one another:

```text
**Bold with *italic*, ==highlight==, =pen=, and _underline_ inside**
```

For parsing, recognize `~~` before `~`; code spans remain literal, and
backslash-escaped markers remain literal. If a formatting marker has no matching
closing marker, show it and its text as ordinary text; keep the marker visible in
WYSIWYG so the user can spot the unfinished formatting. CommonMark and GFM do
not define superscript or subscript syntax; Obsidian does. Import/export adapters
must translate as appropriate.

### Footnotes and callouts

**Agreed:** keep the current footnote and callout syntax:

```text
Text with a note.[^source]

[^source]: Footnote text.

> [!info] Optional title
> Callout body.

> [!question]- Starts collapsed
> The user can expand it.

> [!tip]+ Starts expanded
> The body is initially visible.
```

Footnotes use a reference and matching definition. Callouts extend block quotes;
`+` and `-` select their initial expanded or collapsed state.

## Import, paste, and export

Provide one **Convert from** action and one **Paste from** action for each input
format:

| Input format | Document conversion | Clipboard conversion |
| --- | --- | --- |
| CommonMark | Convert from CommonMark | Paste from CommonMark |
| GFM | Convert from GFM | Paste from GFM |
| Obsidian | Convert from Obsidian | Paste from Obsidian |
| HTML | Convert from HTML | Paste from HTML |

Each action has its own toolbar action and keyboard shortcut. All use the same
conversion engine, configured for the selected source format. Shortcut keys
remain to be assigned after checking the existing keymap. Markdown export is a
separate action that selects CommonMark, GFM, or Obsidian as the destination.
Existing HTML export remains supported.

HTML input must not be retained as raw HTML in a Wmdx document. Convert
recognized elements to existing Wmdx syntax. When an HTML feature has no
suitable Wmdx equivalent, identify the feature and propose a native syntax
before implementing that conversion.

## HTML import inventory — initial proposals

The CommonMark 0.31.2 parser suite holds 77 HTML-interoperability examples out
of native Markdown parsing. These are parser conformance cases, not 77 distinct
features: they include ordinary elements, custom or malformed tags, comments,
processing instructions, and script/style blocks.

### Existing Wmdx equivalents

| HTML construct | Wmdx conversion |
| --- | --- |
| `h1`–`h6`, paragraphs, line breaks, and thematic breaks | `.1`–`.6`, normal paragraphs, the existing hard-break spelling, and the existing thematic-break syntax |
| Lists and nested lists | Existing list markers and nesting; HTML checkboxes inside list items map to task items |
| Block quotes and simple tables | Existing `>` quotes and current pipe tables; do not change table syntax or editing behavior |
| Bold, italic, underline, strike, superscript, subscript, highlight, and inline code | Existing Wmdx inline formatting markers |
| Links, images, audio, video, and supported documents | The unified resource syntax; map URL, label/alt text, size, and alignment where present |
| `text-align`, and media width/height | Paragraph or resource alignment; resource size with proportions preserved |
| `figure`/`figcaption` when its caption matches the image title | The resource title, which serves as alt text and visible caption |
| `pre`/`code` | Fenced code, preserving the code text and a recognized language |

### Gaps that need syntax or conversion decisions

These are proposals for review, not approved syntax:

| HTML feature | Candidate treatment |
| --- | --- |
| `details`/`summary` | A neutral collapsible block using the existing fold behavior, tentatively `> [!details]- Summary` followed by quoted content |
| Definition lists (`dl`/`dt`/`dd`) | `Term` followed by `: Definition`, supporting multiple term/definition pairs |
| Different image alt text and figure caption | Keep the title as both by default; add an optional `caption=...` field after `ALIGN` only when they differ |
| Responsive images (`picture`/`srcset`) | Add a recognizable `srcset=...` option after `ALIGN`, keeping `SOURCE` as the fallback |
| HTML comments | Convert to a text-only comment marker, tentatively Obsidian's `%%comment%%` form |
| Named anchors (`id`/`name`) not attached to headings | Add a small native anchor target marker; candidate `.anchor name`, with links targeting `#name` |
| Custom CSS colors and typography | Map properties with an existing Wmdx equivalent. For exact custom values, define a value-based native style form; keep the agreed Unicode subscript selectors for palette styles |
| `script` and `style` blocks | Preserve their contents as fenced code with a language label; never execute scripts or apply imported CSS |
| Tables with `rowspan`/`colspan` | No table syntax change is proposed. Decide how conversion preserves cell text while respecting the existing table limits |
| Forms, iframes, custom elements, and other active or unknown content | Convert supported media to resource syntax; do not execute active behavior. Define a per-feature conversion that preserves readable content rather than retaining raw tags |

HTML document metadata such as `<title>` and `<meta>` also needs a file-conversion
policy; it is not ordinary body text. The exact import scope and any new syntax
must be agreed before implementation.

## Decisions still to finalize

- **Parser precedence and nesting:** Nesting styles is agreed. The delimiter
  rules above are also agreed for code spans, escapes, `~` versus `~~`, and
  unmatched formatting markers. Crossing pairs and other ambiguous edge cases
  still need a shared test matrix.
- **HTML conversion coverage:** review the inventory above, decide which
  proposed gaps need native syntax, and set the conversion policy for metadata
  and unsupported or malformed input.

## Wmdx-owned implementation work

For CommonMark, GFM, Obsidian, and HTML, define how input is converted to native
Wmdx and how native constructs are exported. Preserve semantics where possible
and make unavoidable information loss explicit. Use the same conversion rules
for **Convert from** and **Paste from**; test both entry points and round trips.

