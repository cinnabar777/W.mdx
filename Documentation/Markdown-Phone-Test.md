# Markdown Phone Rendering Test

This is a visual smoke test, not a complete CommonMark, GFM, or Obsidian
compatibility suite. It samples common cases for a quick phone check; the
specification corpora and import/export round trips are tested separately.

Open this file in W.mdx and check it in Live Preview and WYSIWYG. In rendered
views, inline and reference-link source syntax should be hidden, including while
the link is active. The reference definition should also be hidden. Autolink
angle brackets should not appear. Nested quotes should indent farther than their
parent, and the outer quote border should continue through both paragraphs and
the nested quote. The list with up to three leading spaces before its markers
should stay flat, the nested list should stay nested, and the quoted list should
stay inside its quote. Tap inline, reference, angle, and automatic links to
confirm they open the browser or email app. Tap the wiki link to confirm it
opens the sibling Markdown guide. Source view should continue to show the
original Markdown syntax.

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

Items indented by up to three spaces before their markers should stay at one
list level:

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

The nested quote should be visibly indented farther than the first quote, with
an inset border while the outer border remains continuous.
CommonMark and Obsidian quote markers stay at the left edge: nested source uses
`> >`. To create one in the editor, place the cursor in a quote or select quoted
lines and use the Block Quote toolbar action; it adds another quote level.
Outdent removes one level. Ordinary
indentation is separate from quote nesting: any wrapped text in an indented
paragraph or quote should remain aligned with the indented block.

For the wrapping check, place the cursor in the following quote and use Indent.
At a collapsed cursor, the action should indent the whole paragraph, not just
the current source line. In Live Preview and WYSIWYG, leading indentation
spaces should stay hidden even when the cursor is on the line. Source view keeps
the spaces visible, but the first row and every wrapped row must begin at the
same content position. On an ordinary paragraph, set Indent Step to one space
and verify each action moves every wrapped row with the paragraph. Then choose
two spaces and verify one action moves it by two spaces. With either choice,
enough indentation may create a CommonMark indented code block; this is separate
from the fenced-code toolbar action. In Live Preview and WYSIWYG, the four
structural spaces that create an indented code block must not appear as a
first-line text indent. Any shared leading code indentation must shift the whole
rendered block, including wrapped rows; relative indentation between code lines
must remain. The quote border must stay at the same left position:

> This indented quote is deliberately long enough to wrap on a phone screen.
> Its next source line should remain aligned with the indented quote block.

For ordinary lists, leave Block List Layout off. Check a root item and nested
items that wrap across multiple visual lines. At every depth, each item's
wrapped lines must align under that item's text—not under its marker, the
parent's text, or the left margin. Place the cursor in a nested item with a
continuation line and a child item. Increase and decrease indent with both the
toolbar and Tab/Shift-Tab. The item, continuation, and child must move together,
and numbering must remain correct. Ordinary hanging indentation must work
regardless of Block List Layout; enabling that separate option must not turn
the item into a first-line-only indent.

When a paragraph follows a list, delete the blank separator at the start of the
paragraph. Markdown treats the following text as part of the list item; its
wrapped lines must align under the item text in Source, Live Preview, and
WYSIWYG. Press Return to create the next item and verify its marker and wrapping
stay stable without a visible layout jump.

#### Pasting multiline content into a quote

Start with this quote and place the cursor at the start of the blank quote
line, before its `>` marker:

```md
> Paste here
>
```

Paste these lines:

```md
- First
  - Second
    - Third
```

The source should keep every pasted line inside the quote:

```md
> Paste here
> - First
>   - Second
>     - Third
```

Repeat the paste with the long-press Paste action, Ctrl+V, and the keyboard
clipboard. Each path should produce the same quoted source.

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

Check the header, column alignment, cell spacing, and inline formatting. In Live
Preview and WYSIWYG, tap a cell and verify the caret and keyboard enter that
cell without relying on a synthesized click; they must not move to the line
after the table. Edit a cell, tap another cell, then return to confirm the first
edit was saved. Long-press an unedited cell and confirm both the floating
toolbar and table action menu remain available without overlapping. Save and
reopen the document to confirm the edit persists.

### GFM automatic links

www.commonmark.org

https://github.com/

reader@example.com

ftp://foo.bar.baz.

Each automatic link should be styled and open its browser or email app when
tapped. For the FTP example, verify the trailing period is not part of the link;
`foo.bar.baz` is a specification placeholder, not a live server.

## Obsidian

These are supported Obsidian-style features, not a promise of full Obsidian app
or plugin compatibility.

### Wiki links

[[Markdown.md|Open the Markdown guide in this folder]]

[[#Obsidian|Jump to this section]]

### Embedded document

The next card loads a small Markdown file beside this test file:

![[Markdown-Phone-Test-Embed.md|Embedded sample document]]

### Embedded image

The first image should display at its natural size; the second should display
at 32 pixels wide:

![[Markdown-Phone-Test-Image.png]]

![[Markdown-Phone-Test-Image.png|32]]

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

This sentence has an Obsidian inline footnote.^[This note is written at its reference.]

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
- Obsidian audio, video, and PDF embeds such as `![[clip.mp4]]`.
- `%% comments %%`, YAML properties/frontmatter, math, Mermaid, and plugin syntax.

## Reference

The examples are based on the W.mdx compatibility notes, the
[CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/),
[GitHub Flavored Markdown](https://github.github.com/gfm/), and
[Obsidian's built-in syntax documentation](https://obsidian.md/help/syntax).
The [Markdific Markdown cheat sheet](https://markdific.com/resources/markdown-cheat-sheet/)
was also used as a broad checklist; syntax outside W.mdx's supported scope is
not treated as an expected pass here.
