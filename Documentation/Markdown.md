# W.mdx Markdown Cheat Sheet

This guide covers standard Markdown, GitHub Flavored Markdown (GFM), and the
additional syntax W.mdx recognizes. Settings can change the appearance of
formatting, but do not change the syntax shown here.

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

The alternate Setext form supports the first two levels:

```markdown
Heading 1
=========

Heading 2
---------
```

Separate paragraphs with a blank line. A normal newline within a paragraph
usually renders as a space. For a line break without a new paragraph, end the
line with two spaces or use the HTML line-break tag, `<br>`, if the target renderer supports it.

## Text formatting

### Bold, italic, and strikethrough

```markdown
**Bold**
__Bold also works__

*Italic*
***Bold and italic***

~~Strikethrough~~
```

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

### Inline code

Use one backtick on each side. Code spans display their contents literally:

```markdown
`**this is code, not bold**`
```

If the text itself contains a backtick, use a longer backtick delimiter:

```markdown
`` Use `code` inside a code span ``
```

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

## Lists and tasks

### Bullet lists

Use `-`, `*`, or `+` followed by a space:

```markdown
- First item
- Second item
  - Nested item
```

Indent nested items consistently. Lists can be nested and mixed.

### Numbered lists

Use a number, a period, and a space:

```markdown
1. First item
2. Second item
   1. Nested item
```

### Task lists

Task lists use GFM checkbox syntax:

```markdown
- [ ] Not finished
- [x] Finished
```

Use a space inside the brackets for an unchecked task and `x` for a checked
task.

## Block quotes and callouts

### Block quotes

Start each quoted line with `>`:

```markdown
> A quoted paragraph.
> It can continue on another line.
>
> A second paragraph in the quote.
```

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

Nested callouts use additional quote markers:

```markdown
> [!question] Outer callout
> Outer text.
> > [!info] Nested callout
> > Nested text.
```

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

`![[Target]]` is Obsidian's embed syntax; W.mdx does not currently render it as
an embedded file. Use a Markdown image for images instead.

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

## Tables

Tables use GFM pipe syntax. The separator row divides the header from the body;
colons set alignment:

```markdown
| Left | Center | Right |
| :--- | :----: | ----: |
| A    | B      | C     |
| D    | E      | F     |
```

The outside pipes are optional. Escape a pipe that belongs inside a cell as
`\|`. Basic inline Markdown can be used in cells; tables cannot contain
multi-paragraph cell content.

## Horizontal rules

Put at least three matching hyphens, asterisks, or underscores on a line by
themselves:

```markdown
---
***
___
```

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

Labels must not contain spaces or closing brackets. Matching is
case-insensitive. A reference is only treated as a footnote when a definition
with that label exists. Continuation lines need at least four leading spaces.
Inline footnotes such as `^[footnote text]` are not supported.

## HTML and other app-specific syntax

The old `md...` entries were text-expansion abbreviations, not Markdown syntax.
Any expansion depends on your keyboard or an external text expander; Wmdx does
not define those abbreviations.

HTML is not Markdown. Some renderers accept inline HTML such as
`<u>underlined text</u>`, `<span style="color: red;">colored text</span>`,
`<sub>2</sub>`, and
`<sup>2</sup>`, but its appearance and support depend on the renderer. For
consistent formatting in W.mdx, use the Wmdx underline, highlighter, and pen
syntax above.

The following are Obsidian or plugin features, not standard Markdown syntax:

- `%% comments %%`
- `![[file]]` embeds
- Obsidian queries such as fenced `query` blocks
- Template variables such as `{{title}}`
- Obsidian tags and YAML properties

W.mdx does not interpret these as Obsidian features. A `#tag` in ordinary text
is just text here; a `#` followed by a space at the start of a line begins a
Markdown heading.
