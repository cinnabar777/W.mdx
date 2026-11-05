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
  belongs in format-specific adapters.
- Do not introduce syntax piecemeal. Agree on a coherent grammar before
  implementing parser, renderer, toolbar, or import/export changes.
- Prefer characters users can type on a phone keyboard. The existing Unicode
  subscript selectors for typography colors and styles are an intentional
  exception: they are unobtrusive in text and are rarely typed by hand.

## Agreed native syntax

### Resource references, links, and embeds

Use one fixed-slot form for local paths and URLs:

```text
[SOURCE| Title |SIZE|ALIGN]
![SOURCE| Title |SIZE|ALIGN]
```

- Without `!`, the reference opens or follows its source. With `!`, it displays
  the source inline when that resource type has an inline viewer.
- The same form accepts local paths and URLs. The resource type determines the
  appropriate open, attachment, or inline-display behavior.
- The title is the displayed label. For images it can serve as both alt text and
  a visible caption.
- Keep all field separators when fields are empty. Spaces belong around a
  non-empty title only; `\|` represents a literal pipe inside a field.
- Size applies only to displayed objects, never to text links. A size can give a
  width alone or a width-and-height box. Media must preserve its proportions and
  must not be stretched.
- Alignment applies to displayed objects and standalone links. An inline link
  inherits the paragraph's alignment and cannot override it.
- Unsized objects retain their natural proportions and fit within the available
  content width.

Examples:

```text
Read [https://example.com| the guide ||] in this paragraph.
[https://example.com| Visit site ||->]
[attachments/archive.zip| Project archive ||]
![images/sunset.png| Sunset |320x240|><]
![https://example.com/sunset.png| Sunset |320|<>]
![notes.md| Project notes ||]
```

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
- **Agreed:** justified table columns are not needed.
- **Recommendation:** retain the current pipe-table grid and its left, center,
  and right column alignment syntax because it is compact and already works.

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

For parsing, recognize `~~` before `~`; code spans remain literal, and
backslash-escaped markers remain literal. CommonMark and GFM do not define
superscript or subscript syntax; Obsidian does. Import/export adapters must
translate as appropriate.

### Footnotes and callouts

The current forms are recommended to remain:

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

## Decisions still to finalize

- **Resource size units:** Width and height behavior is agreed, but the unit
  should be explicitly stated in the syntax. Existing image sizing is
  pixel-based; existing audio/video layout uses percentages.
- **Resource title fallback:** The title field's empty-value fallback should be
  written down before implementation.
- **Import/export behavior:** Define how each native construct maps to
  CommonMark, GFM, and Obsidian, and how unsupported or lossy conversions are
  reported.
- **Parser precedence and nesting:** The delimiter rules above are agreed for
  code spans, escapes, and `~` versus `~~`. Nesting and ambiguous edge cases
  still need a shared test matrix.
- **Table notation:** Keeping the pipe grid and current left/center/right
  alignment syntax is recommended, but the user has not explicitly confirmed
  retaining that exact notation.
- **Footnotes and callouts:** Keeping their current syntax is recommended, but
  remains a recommendation until explicitly confirmed.

