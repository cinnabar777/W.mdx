# Markdown Phone Rendering Test

Open this file in W.mdx and view it in Live/WYSIWYG mode. The examples are
intended to be checked visually on the phone. Links to `example.com` are
placeholders; they do not need to open.

The table below is a rendering check only. Table-cell cursor/editing is a known
separate issue and is not part of this test.

## CommonMark

### Heading levels

This document title is level 1. These section titles are level 2 and 3; the
following headings check levels 4 through 6.

#### Heading level 4

##### Heading level 5

###### Heading level 6

Setext level-one heading
========================

Setext level-two heading
------------------------

### Paragraphs and line breaks

This is one paragraph. A normal source newline
should continue as part of the same paragraph.

This line ends with a backslash.\
This should start on a new rendered line, but remain in the same paragraph.

This is a separate paragraph.

### Text formatting

**Bold**, *italic*, ***bold and italic***, and `inline code`.

The code span should show `**these marks literally**`, not bold text.

\*Escaped asterisks should stay visible\*.

### Lists

- First bullet
- Second bullet
  - Nested bullet
  - Another nested bullet

1. First numbered item
2. Second numbered item
   1. Nested numbered item
3. Third numbered item

### Block quotes

> This is a block quote.
> It contains **formatted text**.
>
> This is a second paragraph in the quote.
>
> > This is a nested quote.

### Code blocks

The block should be visually distinct from the surrounding text. The code and
indentation should stay intact.

```text
First line of a code block
  Indented line
Symbols stay literal: **bold** and ~~strike~~
```

This tilde-fenced block should also render as code:

~~~text
Tilde-fenced code block
~~~

### Links and images

Inline link: [CommonMark site](https://commonmark.org "Optional link title").

Reference link: read the [CommonMark specification][commonmark-spec].

Autolinks: <https://commonmark.org/> and <reader@example.com>.

Image using a small inline SVG:

![Cyan sample image|120](data:image/svg+xml,%3Csvg%20xmlns%3D'http://www.w3.org/2000/svg'%20width%3D'120'%20height%3D'60'%3E%3Crect%20width%3D'120'%20height%3D'60'%20fill%3D'%2300bfc5'/%3E%3C/svg%3E)

[commonmark-spec]: https://spec.commonmark.org/0.31.2/

### Thematic break

Text above the rule.

---

Text below the rule.

## GFM additions

These examples cover the GFM features that CommonMark does not define.

### Task lists

- [ ] Unchecked task
- [x] Checked task
- [X] Also checked
  - [ ] Nested unchecked task

Checkboxes should render and remain tappable.

### Strikethrough

Double tilde: ~~removed text~~.

Single tilde: ~also removed~.

Three tildes should stay literal: This will ~~~not~~~ strike.

### Tables

| Left aligned | Centered | Right aligned |
| :--- | :---: | ---: |
| left | center | right |
| **bold** | `code` | ordinary text |

Check the header, column alignment, cell spacing, and inline formatting. Do not
use this section to test entering or editing cells.

### GFM automatic links

www.commonmark.org

https://github.com/

reader@example.com

## Obsidian

These are supported Obsidian-style features, not a promise of full Obsidian app
or plugin compatibility.

### Wiki links

[[Markdown.md|Open the Markdown guide in this folder]]

[[#Obsidian|Jump to this section]]

### Embedded document

The next card loads a small Markdown file beside this test file:

![[Markdown-Phone-Test-Embed.md|Embedded sample document]]

### Callouts

> [!info] Information callout
> The callout title and body should appear together in a styled block.
> **Markdown formatting** should work inside the body.

> [!warning]- Collapsed callout
> This body should be hidden initially and appear when the callout is expanded.

### Highlight and reference footnote

This is ==highlighted text== in a sentence.

This sentence has a reference footnote.[^phone-test]

[^phone-test]: The footnote should be displayed with its reference and this definition.

## W.mdx word-processing syntax

These are W.mdx extensions, separate from CommonMark and GFM. Underline display
depends on the **Use Wmdx syntax** setting.

Solid _underline_, dotted _₀underline_, dashed _₁underline_, double
_₂underline_, and wavy _₃underline_.

Highlighter slots: ==highlight 1==, ==₀highlight 2==, ==₁highlight 3==, and
==₂highlight 4==.

Pen slots: =pen 1=, =₀pen 2=, =₁pen 3=, and =₂pen 4=.

## Known Obsidian gaps — not expected to pass

The following forms are listed as current limitations, not rendering tests:

- Heading or block transclusion such as `![[note.md#Heading]]`.
- Obsidian image/media embeds such as `![[image.png]]` and `![[clip.mp4]]`.
- Inline footnotes such as `^[a short note]`.
- `%% comments %%`, YAML properties/frontmatter, math, Mermaid, and plugin syntax.

## Reference

The examples are based on the W.mdx compatibility notes, the
[CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/),
[GitHub Flavored Markdown](https://github.github.com/gfm/), and
[Obsidian's built-in syntax documentation](https://obsidian.md/help/syntax).
The [Markdific Markdown cheat sheet](https://markdific.com/resources/markdown-cheat-sheet/)
was also used as a broad checklist; syntax outside W.mdx's supported scope is
not treated as an expected pass here.
