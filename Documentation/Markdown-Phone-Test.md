# Markdown Phone Rendering Test

Examples in this document cover the common syntax families and packaged media.
The companion [interaction checklist](Markdown-Phone-Test-Checklist.md) is
included in this MDZip package; this document stays focused on readable examples.

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

Up to three leading spaces do not create another list level:

- First
 - Second
  - Third
   - Fourth
  - Fifth
 - Sixth
- Seventh

### Block quotes

> This is a block quote.
> It contains **formatted text**.
>
> This is a second paragraph in the quote.
>
> > This is a nested quote.
>
> - A list item inside a block quote.

The quote contains a second paragraph, a nested quote, and a list. The full
indentation, wrapping, editing, and paste scenarios are in the checklist.

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

In rendered views, these should appear as clickable links without the
surrounding Markdown punctuation.

Image using a small inline SVG:

![Cyan sample image|120](data:image/svg+xml,%3Csvg%20xmlns%3D'http://www.w3.org/2000/svg'%20width%3D'120'%20height%3D'60'%3E%3Crect%20width%3D'120'%20height%3D'60'%20fill%3D'%2300bfc5'/%3E%3C/svg%3E)

Packaged PNG image resolved from the MDZ document root:

![Packaged sample image|120](Markdown-Phone-Test-Image.png)

Packaged landscape photograph at a fixed display width:

![Alpine lake at golden hour|240](media/phone-test-lake.jpg)

Packaged close-up photograph using the local Obsidian image-embed form:

![[media/phone-test-fern.png|240]]

[commonmark-spec]: https://spec.commonmark.org/0.31.2/

### Packaged audio, video, and attachments

The sample files are packaged with this document:

[Short WAV chime](audio/phone-test-chime.wav "wmdx-audio:width=80;align=center")

[Portrait MP4 sample](video/phone-test-portrait.mp4 "wmdx-video:width=85;align=center")

[PDF attachment](attachments/phone-test-attachment.pdf "wmdx-attachment")

[Text attachment](attachments/phone-test-notes.txt "wmdx-attachment:width=80;align=center")

[ZIP attachment with a CSV](attachments/phone-test-data.zip "wmdx-attachment")

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

### Strikethrough

Double tilde: ~~removed text~~.

Three tildes should stay literal: This will ~~~not~~~ strike.

### Tables

| Left aligned | Centered | Right aligned |
| :--- | :---: | ---: |
| left | center | right |
| **bold** | `code` | ordinary text |

#### Wide table for horizontal Source scrolling

| Identifier | Description | Owner | Updated | State | Notes |
| :--- | :--- | :--- | ---: | :---: | :--- |
| WMDX-001 | A deliberately long row that should remain on one source line | Editor | 2026-11-06 | Open | Keep every pipe and separator intact |

### GFM automatic links

www.commonmark.org

https://github.com/

reader@example.com

ftp://foo.bar.baz.

## Obsidian

These are supported Obsidian-style features, not a promise of full Obsidian app
or plugin compatibility.

### Wiki links

[[Markdown-Phone-Test-Embed.md|Open the packaged companion document]]

[[#Obsidian|Jump to this section]]

### Embedded document

The next card loads a small Markdown file beside this test file:

![[Markdown-Phone-Test-Embed.md|Embedded sample document]]

### Embedded image

The first image should display at its natural size; the second should display
at 32 pixels wide:

![[media/phone-test-fern.png]]

![[media/phone-test-fern.png|32]]

### Callouts

> [!info] Information
> A short callout body with **bold text** and a second sentence.

> [!warning]- Collapsed callout
> This body is revealed when the callout is expanded.

### Highlight and reference footnote

This is ==highlighted text== in a sentence.

This sentence has a reference footnote.[^phone-test]

[^phone-test]: The footnote should be displayed with its reference and this definition.

This sentence has an Obsidian inline footnote.^[This note is written at its reference.]

## W.mdx word-processing syntax

Solid _underline_, dotted _₀underline_, dashed _₁underline_, double
_₂underline_, and wavy _₃underline_.

Highlighter slots: ==highlight 1==, ==₀highlight 2==, ==₁highlight 3==, and
==₂highlight 4==.

Pen slots: =pen 1=, =₀pen 2=, =₁pen 3=, and =₂pen 4=.

Single tilde is Wmdx subscript, not GFM strikethrough: H~2~O.

### W.mdx ordered-list styles and task markers

The app supports additional ordered markers and its native task form:

A. Uppercase alphabetic item
B. Second uppercase alphabetic item

a. Lowercase alphabetic item
b. Second lowercase alphabetic item

I. Uppercase Roman item
II. Second uppercase Roman item

i. Lowercase Roman item
ii. Second lowercase Roman item

[ ] Native unchecked task
[x] Native checked task

## Reference

The examples are based on the W.mdx compatibility notes, the
[CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/),
[GitHub Flavored Markdown](https://github.github.com/gfm/), and
[Obsidian's built-in syntax documentation](https://obsidian.md/help/syntax).
The [Markdific Markdown cheat sheet](https://markdific.com/resources/markdown-cheat-sheet/)
was also used as a broad checklist; syntax outside W.mdx's supported scope is
not treated as an expected pass here.
