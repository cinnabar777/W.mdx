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

### Editor syntax preferences (planned)

- Syntax choices are app-wide per feature, not saved per document. Users who
  settle on a convention should not have to choose it again for every file.
- Each feature can be enabled or disabled. When enabled, its settings can
  independently turn recognition/rendering on or off for each supported flavor.
- If multiple flavors are enabled, the editor may render all of them, but exactly
  one enabled flavor is the preferred authoring syntax used by the toolbar and
  shortcuts. If only one flavor is enabled, it is preferred automatically.
- Keep one toolbar key and shortcut path per feature, not a duplicate set for
  every flavor. They insert the preferred syntax; enabled alternatives are
  recognized and rendered without adding more toolbar keys.
- These preferences affect normal editing only. CommonMark, GFM, Obsidian, and
  HTML import/export conversion remains available regardless of the selected
  authoring syntax.
- Disabling a feature or flavor makes its source syntax literal in the editor;
  it does not convert or rewrite existing documents.

### Link syntax settings and insertion (implemented)

- Links have one app-wide enable switch and separate recognition switches for
  CommonMark/GFM inline links and automatic URLs, reference links, Obsidian
  internal links, and Wmdx resource links. All are enabled by default to keep
  existing documents rendering as before. GFM `@` mention links are not
  included.
- The preferred link authoring syntax is app-wide: Wmdx, CommonMark, or
  Obsidian. External links use Wmdx resource syntax when Wmdx is preferred;
  otherwise they use the standard Markdown inline form. Internal links use
  Wmdx resource syntax, Obsidian wikilinks, or Markdown relative/anchor links
  according to the preference and enabled flavors.
- Reference links remain a distinct insertion choice and use Markdown's
  `[label][id]` form. Insertion reuses a definition for the same destination
  when possible; otherwise it creates a unique definition at the end of the
  document.
- Reference links are mainly useful when the same destination is used several
  times: each in-text link points to one shared destination definition. For a
  one-off link, the inline form is shorter and simpler.
- One **Links** toolbar action opens a dialog for External, Internal, or
  Reference links. Choices unavailable under the current flavor settings are
  disabled. One configurable keyboard shortcut opens the same dialog; its
  default is blank.
- The dialog accepts a URL, local file path, or `#Heading` target. It can also
  choose a heading from the current document. Wmdx standalone alignment is
  offered only when Wmdx is the selected authoring syntax.
- Turning off a flavor prevents its visual link rendering without rewriting
  the source. Import/export conversion remains separate from these authoring
  preferences.
- Obsidian links keep Obsidian's target-first order, `[[TARGET|ALIAS]]`.
  CommonMark internal links use `[ALIAS](#heading)` or a relative file path.

### Heading syntax settings (implemented)

- Heading recognition has one app-wide enable switch, separate switches for
  Wmdx, hash/ATX, and Setext syntax, and one preferred authoring syntax.
- Wmdx headings use `.1` through `.6`. Hash/ATX headings use `#` through
  `######` and are shared by CommonMark, GFM, and Obsidian. Setext headings use
  `===` for level 1 and `---` for level 2; Setext cannot represent levels 3–6.
- All three forms are enabled by default, with Wmdx as the default authoring
  syntax. The heading toolbar and shortcuts insert the preferred enabled form.
  Selecting Setext disables heading levels 3–6 in the heading menu and
  shortcuts. Auto Heading follows the selected authoring syntax.
- Disabled heading flavors remain visible as literal source. These preferences
  do not affect CommonMark, GFM, Obsidian, or HTML import/export conversion.

### Callout syntax settings (implemented)

- Callouts have one app-wide enable switch, separate Wmdx and Obsidian flavor
  switches, and a preferred authoring syntax.
- Both flavors are enabled by default, with Wmdx as the default authoring
  syntax. If only one flavor remains enabled, it becomes the authoring syntax.
- Wmdx callouts use `±type`, `±type-`, and `±type+` with automatically indented
  bodies. Obsidian callouts use `> [!type]` with quoted body lines; this also
  recognizes the overlapping GFM alert syntax. Ordinary blockquotes are not
  treated as callouts.
- Return on a blank nested callout line steps out one level at a time.
  Trailing Wmdx whitespace-only lines after populated callouts do not render as
  empty body blocks; Obsidian quote markers are reduced on the blank line being
  exited.
- Disabling callouts stops rendering both callout flavors; ordinary blockquotes
  remain available. These preferences do not change import/export conversion.

## Agreed native syntax

### Resource references, links, and embeds

Use one fixed-slot form for local paths and URLs:

```text
[SOURCE|TITLE|SIZE|ALIGN]
![SOURCE|TITLE|SIZE|ALIGN]
```

- Without `!`, the reference opens or follows its source. With `!`, it displays
  the source inline when that resource type has an inline viewer.
- This is intentionally a structured form: resource references may need to
  carry source, title, size, and alignment together.
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
[example.com|Visit site||>]
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

Use keyboard-friendly markers in the resource `ALIGN` field:

| Marker | Meaning |
| --- | --- |
| `<` | Left |
| `><` | Center |
| `>` | Right |
| `<>` | Justified |

Resource alignment markers are inside the bracketed syntax, so `>` is
unambiguous there. Paragraph alignment applies to the whole paragraph. Its
right-alignment marker remains `->` because a bare `>` at the start of a line
could be mistaken for a block quote. The document appearance setting remains
the default when no local alignment marker is present. A link within a
paragraph does not override that paragraph's alignment.

Examples:

```text
< Left-aligned paragraph.
>< Centered paragraph.
-> Right-aligned paragraph.
<> Justified paragraph.
```

For external web links, a bare domain such as `example.com` is valid source
text. W.mdx adds `https://` when opening a bare domain because a browser treats
it as a relative path otherwise. Explicit schemes such as `https://`, `ftp://`,
and `mailto:` are kept as entered.

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
b. Next alphabetic item
A. Uppercase alphabetic item
i. Roman item
ii. Next lowercase Roman item
I. Uppercase Roman item
II. Next uppercase Roman item
```

The marker selects the numbering style. Source markers explicitly advance for
each item, so alphabetic and Roman lists remain clear in Source view as well as
WYSIWYG. The ordered-list toolbar writes a sequence when applied to multiple
selected lines, and Return inserts the next marker (`A.` → `B.`, `I.` → `II.`).
Existing repeated style markers such as `A.` followed by `A.` remain recognized
and auto-number in WYSIWYG. Applying the matching toolbar action to those lines
rewrites them as an explicit sequence.

Each indentation depth has its own numbering sequence. A nested list starts
again at its first marker (`I.` / `A.` / `1.`), and the parent sequence resumes
after the nested block. Indenting or outdenting a Wmdx ordered list updates its
source markers to match. Return continues a non-empty item; Return on an empty
nested item removes that marker and steps out one indentation level, while an
empty top-level item exits the list.

Task items begin directly with `[ ]` for unchecked or `[x]` for checked; do not
put a leading `-` before the checkbox. The checkbox marker is itself the task
marker, and indentation represents nesting. Add dialect-specific list markers
when exporting formats that require them.

```text
[ ] Unfinished task
[x] Finished task
  [ ] Nested task
```

The Lists typography settings control whether lists are rendered, which
Markdown and Wmdx list flavors are recognized, and which flavor the existing
toolbar actions and shortcuts insert. If only one flavor is enabled, it is
selected for authoring automatically. Markdown task lists can be enabled
separately from other Markdown lists. The default unordered marker and Wmdx
ordered-list style are configurable; Markdown authoring keeps decimal ordered
markers. Defaults enable both flavors and task-list syntax, author Wmdx,
use `-` for bullets, and use decimal numbering.

### Block quotes and tables

- Keep `>` for block quotes and repeat it for nested quotes.
- **Agreed:** tables are out of scope for this syntax revision; leave their
  syntax and behavior unchanged. Keep the current pipe rows and separator row,
  colon-based left/center/right alignment, optional outside pipes, `\|` for a
  literal cell pipe, and existing cell-content limits. Merged cells use `<` in
  horizontally covered cells and `^` in vertically covered cells. Do not add
  justified columns or alter table editing behavior.

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

Properly nested formatting is valid. A crossed pair closes in a different
order than it opened, for example `*italic _underlined* later_`. Its intended
formatting is ambiguous. **Agreed direction:** do not rewrite the source; show
the conflicting markers literally in visual editing rather than guessing at
the intended formatting.

`==` selects a background highlight color; `=` selects a text/pen color. Add a
toolbar action for custom colors, with the hex value after the opening marker
and `:` separating the value from the text:

```text
==FF0000:Important text here==
=FF0000:Important text here=
```

Accept standard 3-, 4-, 6-, and 8-digit CSS hex values, without a leading `#`.
The hex is stored as ordinary characters. Subscript appearance in Source view
is an optional styling setting, not part of the syntax. Keep the existing
Unicode subscript palette selectors unchanged.

Inline formatting styles can be combined inside one another:

```text
**Bold with *italic*, ==highlight==, =pen=, and _underline_ inside**
```

For parsing, recognize double markers before their single-marker forms,
comments before italic syntax, and color markers before their shorter form.
Code spans and backslash-escaped markers remain literal. If a formatting marker
has no matching closing marker, show it and its text as ordinary text; keep the
marker visible in WYSIWYG so the user can spot the unfinished formatting.
CommonMark, GFM, and Obsidian do not define native Markdown syntax for
superscript or subscript; use HTML `<sup>` and `<sub>` when converting them.

### Inline formatting parser test matrix

| Case | Source | Expected behavior |
| --- | --- | --- |
| Bold and italic precedence | `**bold**; *italic*` | Parse bold and italic as distinct styles |
| Proper nesting | `**bold *italic* _underline_**` | Apply all three styles; hide valid delimiters in visual views |
| Nested highlight | `==highlight *italic*==` | Apply highlight to the span and italic to its nested text |
| Custom pen color | `=FF0000:pen _underline_=` | Apply pen color and nested underline |
| Strikethrough and subscript | `~~strike~~; ~sub~` | Parse double tilde as strikethrough and single tilde as subscript |
| Escaped marker | `\*literal\*` | Show literal asterisks without italic formatting |
| Code span | `` `*italic* _underline_ ~sub~` `` | Keep every inner marker literal |
| Comment precedence | `/* comment with * and _ markers */` | Hide the comment in visual views; do not parse its inner markers as formatting |
| Unmatched marker | `*unfinished` or `unfinished*` | Keep the text and unmatched marker literal and visible; do not leak styling |
| Crossed pairs | `*italic _underlined* later_` | Keep the crossing span literal and visible; never auto-correct the source |

### Inline formatting import/export rules

| Wmdx style | CommonMark/GFM | Obsidian |
| --- | --- | --- |
| Bold and italic | Use native `**bold**` and `*italic*`. | Same. |
| Underline | Use HTML `<u>`; Markdown `_text_` means italic, not underline. Import `_text_` as Wmdx italic. | Same. |
| Strikethrough | GFM uses `~~text~~`; CommonMark uses HTML `<del>`. | Use `~~text~~`. |
| Superscript/subscript | Use HTML `<sup>` and `<sub>`. | Use HTML `<sup>` and `<sub>`. |
| Plain highlight `==text==` | Use HTML `<mark>`. | Use native `==text==`. |
| Colored highlight and pen text | Use HTML with color styles where the renderer preserves them; report color loss if it strips them. | Same. Do not map arbitrary Wmdx hex colors to Obsidian's theme-dependent emoji highlight colors. |
| Inline comments `/* ... */` | Convert to HTML comments `<!-- ... -->`. | Convert to `%% ... %%`. |

On HTML import, convert semantic tags such as `<u>`, `<del>`, `<sup>`,
`<sub>`, and `<mark>` to Wmdx formatting. Do not import CSS styles or inline
`style` attributes; if those contain the only color information, report that
color was not preserved. These mappings follow [CommonMark raw HTML](https://spec.commonmark.org/0.31.2/#raw-html),
[GFM strikethrough](https://github.github.com/gfm/#strikethrough-extension-)
and [raw HTML](https://github.github.com/gfm/#raw-html), and Obsidian's
[basic formatting syntax](https://help.obsidian.md/Editing+and+formatting/Basic+formatting+syntax).

### Footnotes and callouts

Footnotes are automatically numbered. Use a single trailing `^` to create a
reference to the next new footnote. Use `^N` to reference an existing footnote
number `N` again; this links to that definition and does not create a new note
or advance the automatic number. Definition lines begin with `^ ` and pair in
order with newly created footnotes. Continuation lines in a multiline
definition begin with two spaces. Render references and definitions with their
generated number in the footnotes section. Paired `^text^` remains superscript
syntax, and `\^` represents a literal caret.
When numbered Markdown footnotes are imported alongside native footnotes, keep
their numbers and continue native definitions after the existing numeric
labels.

In editable views, keep a native footnote marker visible while the cursor is in
it. This lets the user type a reuse number after `^`; format the reference after
the cursor leaves it.

```text
This sentence creates footnote 1.^
This refers to footnote 1 again.^1
This creates the next footnote.^

^ First footnote text.
^ Second footnote text.
```

A `^N` reference must resolve to an existing footnote; it is not a way to
create a manually numbered note.

The `[^label]` reference and `[^label]:` definition form is shared by GFM and
Obsidian. It is available as one optional Markdown-reference flavor, not as
separate GFM and Obsidian settings. CommonMark has no native footnote syntax.
Obsidian also supports the self-contained inline form `^[note text]`; Wmdx
recognizes it as a separate optional flavor and renders the note in the
document's footnotes section.

Footnote syntax settings include an overall enable switch, independent Wmdx,
Markdown-reference, and Obsidian-inline flavor switches, and one preferred
authoring syntax for the toolbar and shortcut. The default authoring syntax is
Wmdx. Disabling a flavor affects editor recognition and rendering, not
import/export conversion. When Wmdx and inline notes are mixed, automatic
numbers follow reference order unless a generated number is explicitly reused;
an explicit reuse keeps its existing number.

| Footnote case | Source | Rule |
| --- | --- | --- |
| New note | `Sentence.^` and a matching `^ note text` definition | Assign the next number and create one definition |
| Reuse | `Sentence.^2` | Link to the existing footnote 2; do not create a definition |
| Obsidian inline note | `Sentence ^[note text]` | Create an automatically numbered note and display it in the footnotes section |
| Superscript | `^2^` | Treat as paired superscript, not a footnote reference |
| Literal caret | `\^` | Show a literal caret |
| Table merge marker | `^` in a table cell | Keep the existing vertical-merge meaning |

Preserve callout and expandable-dropdown functionality. Use these native
callout markers:

| Form | Meaning |
| --- | --- |
| `±type` | Non-collapsible callout |
| `±type-` | Collapsible callout, initially closed |
| `±type+` | Collapsible callout, initially open |

An optional title follows the type and state marker after one space, for
example `±warning Safety note`, `±warning- Safety note`, or
`±warning+ Safety note`.

Each automatic footnote number refers to its matching definition; `^N` reuses
an existing numbered footnote. Nested callouts reuse the same `±type` marker at
a deeper indentation level. Ordinary blockquotes keep
`>` and repeated `>` markers for nested quoted lines. Callout body lines do not
each need a `>` prefix; reserve `>` for quoted content inside a callout.

The body scope is agreed: indent the callout content using the same convention
as lists; the editor adds continuation indentation automatically. Blank lines
separate paragraphs, and dedenting ends the callout. A nested callout marker
appears at the parent body's indentation, with its body automatically indented
one further level:

```text
±warning-
  First paragraph.

  Second paragraph.

  ±note
    Nested paragraph.

  Back in the outer callout.

Normal paragraph outside.
```

The dropdown is a callout type with its own styling, not a separate block
system. It requires a state suffix: `±dropdown-` starts closed and
`±dropdown+` starts open. Both use the same body indentation and paragraph
rules as other callouts. Obsidian's `> [!type]` remains an import format, not
the Wmdx default syntax. It is also available as an optional authoring and
rendering flavor in the editor; the Wmdx `±` form remains the default.

### Footnote and callout mapping rules

| Wmdx structure | CommonMark | GFM | Obsidian |
| --- | --- | --- | --- |
| Automatically numbered footnotes | CommonMark has no native footnotes; emit linked HTML `<sup>` references and ordered definitions with back-links. If raw HTML is removed, report that footnotes were lost. | Emit `[^1]` references and `[^1]:` definitions, generating numeric labels; `^N` reuses the same label. | Emit `^[note text]` for a single-use note; use `[^label]` plus a definition when a note is reused. |
| Unfolded callouts | Use semantic `<aside>` markup with the callout type, title, and body visible. | Map supported types to GitHub alerts (`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`); put an optional Wmdx title on the first bold body line. Use HTML `<aside>` for other types. | Emit `> [!type] Title` and prefix each body line with `>`. |
| Folded/expanded callouts and dropdowns | Use `<details><summary>Title</summary>…</details>`; add `open` for initially expanded content. | Use the same `<details>` representation; alerts do not encode fold state. | Emit `> [!type]- Title` when closed and `> [!type]+ Title` when open, including `dropdown` as the type. Prefix every body line with `>`. |

Do not reinterpret ordinary block quotes as callouts. Import callouts only from
Obsidian syntax or recognized GFM alerts. Import generic HTML `<details>` as
the Wmdx `dropdown` type, mapping the `open` state to `+` or `-` and its
`summary` to the visible title. Generic HTML `<aside>` does not identify a
specific Wmdx callout type; preserve visible content and convert it to the
closest native Wmdx structure, reporting any classification loss. For Markdown
footnote imports, resolve reference labels and definitions first, then assign
Wmdx numbers by first-reference order; repeated references keep the same
number. Convert Obsidian inline footnotes into a Wmdx reference and definition,
preserving their source order.
For HTML, recognize footnotes only when linked references match definitions;
ordinary `<sup>` elements remain superscript text. HTML is portable export, not
a Wmdx round-trip format. Emit usable standard HTML without hidden Wmdx metadata.
These mappings follow
[GitHub footnotes and alerts](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax),
[Obsidian footnotes](https://help.obsidian.md/Editing+and+formatting/Basic+formatting+syntax),
and [Obsidian callouts](https://help.obsidian.md/callouts).
GitHub footnotes and alerts are GitHub-specific extensions and may not work in
generic GFM renderers. Map Wmdx `info`/`note` to `NOTE`, `tip` to `TIP`,
`important` to `IMPORTANT`, `warning` to `WARNING`, and `caution` to `CAUTION`;
use the HTML fallback for unsupported types such as `question`. GitHub alerts
cannot fold or nest, so those cases use HTML and may lose native alert styling.

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
HTML import is best-effort content conversion, especially for copied web
content and standalone HTML documents or ebooks; it is not expected to reproduce
the original page or document perfectly. HTML export is the portable handoff
format users can take to other tools for conversion, using standard HTML rather
than Wmdx-specific metadata.

### Resource mapping rules: links and embeds

Prefer the target format's native link syntax. Use HTML in exported Markdown
when needed to preserve Wmdx image captions or layout; HTML import still
converts content into native Wmdx.

| Wmdx content | CommonMark/GFM | Obsidian |
| --- | --- | --- |
| Text link `[SOURCE|TITLE||]` | Export as `[TITLE](SOURCE)`. URL-encode local path spaces; decode them on import. | For local files, use `[[SOURCE]]` when the title is the filename, otherwise `[[SOURCE|TITLE]]`. For URLs, use `[TITLE](URL)`. |
| Image embed `![SOURCE|TITLE|SIZE|ALIGN]` | Use an HTML `<figure>` to preserve `TITLE` as both alt text and visible caption, plus size/alignment. Plain `![TITLE](SOURCE)` loses the visible caption and layout. | Use `![[SOURCE]]` for a plain local image embed; `|WIDTH` and `|WIDTHxHEIGHT` map to pixel sizes. External images use `![TITLE](URL)`. Use an HTML `<figure>` to preserve Wmdx captions, percentage sizes, or alignment. |
| CommonMark/GFM link import | Inline/reference links become Wmdx links; resolve reference definitions. CommonMark angle-bracket autolinks and GFM bare URL/email autolinks become Wmdx links. `![ALT](SOURCE)` becomes an image embed; empty `ALT` uses the filename fallback. | Not applicable |
| Obsidian link/embed import | Not applicable | Standard Markdown links/images follow the CommonMark mapping. `[[SOURCE|ALIAS]]` becomes a Wmdx text link; `![[SOURCE]]` becomes an embedded resource. Obsidian image pixel dimensions map to Wmdx pixel sizes. |
| Audio/video embed | Use HTML `<figure>` with `<audio>` or `<video controls>` to preserve the title and layout. If the target renderer strips raw HTML, export a normal link and report the lost preview. | Use `![[SOURCE]]` for supported local media. Use HTML fallback for Wmdx title, size, or alignment not expressible in the native embed. |
| Embedded document or other attachment | Export as `[TITLE](SOURCE)` and report that the inline preview became a link; CommonMark/GFM have no native embedded-document syntax. | Use `![[SOURCE]]` for file types Obsidian can embed, with HTML fallback when Wmdx title or layout must be preserved. For unsupported types such as MDZip, export `[[SOURCE]]` and report the lost preview. |

Optional Markdown link/image tooltip titles are distinct from visible link or
alt text and have no Wmdx field; report them as conversion losses rather than
replacing the link label or image title. These mappings follow [CommonMark links](https://spec.commonmark.org/0.31.2/#links),
[images](https://spec.commonmark.org/0.31.2/#images), and
[autolinks](https://spec.commonmark.org/0.31.2/#autolinks);
[GFM links](https://github.github.com/gfm/#links), [images](https://github.github.com/gfm/#images),
[autolinks](https://github.github.com/gfm/#autolinks-extension-), and
[raw HTML](https://github.github.com/gfm/#raw-html); and Obsidian's
[internal links](https://help.obsidian.md/links),
[embeds](https://help.obsidian.md/embeds), and
[accepted file formats](https://help.obsidian.md/file-formats).

### Block mapping rules: headings, lists, and tables

| Wmdx structure | CommonMark/GFM export | Obsidian export |
| --- | --- | --- |
| Headings `.1`–`.6` | Map directly to `#` through `######`; import them back by heading level. | Same six-level mapping. |
| Unordered lists `-`, `+`, `*` | Keep the same marker character so a Wmdx round trip retains the bullet-shape choice. Other Markdown renderers may display all three with the same bullet shape. | Same marker-preserving rule. |
| Decimal ordered lists | Use ordinary numbered Markdown lists. | Same. |
| Alphabetic/Roman ordered lists | Use HTML `<ol type="a">`, `<ol type="A">`, `<ol type="i">`, or `<ol type="I">` to preserve numbering; if raw HTML is removed by the target, fall back to decimal and report the style loss. | Same. |
| Task lists | Export as `- [ ]`/`- [x]` in GFM and Obsidian. For CommonMark, use list items with disabled HTML checkboxes so state is retained without interactive controls. Add the dialect's list marker on export; remove it when importing into Wmdx's `[ ]`/`[x]` form. Preserve nesting and checkbox state. |
| Unmerged tables | CommonMark has no native table syntax, so export as HTML `<table>`. GFM uses pipe tables. | Use GFM pipe tables. |
| Merged tables | Export as HTML `<table>` with `colspan`/`rowspan`; pipe-table syntax cannot represent merged cells. | Same. |

For imports, convert HTML ordered-list `type` and checkbox state to the matching
Wmdx list style/task state. Preserve list nesting. These mappings follow
[CommonMark raw HTML](https://spec.commonmark.org/0.31.2/#html-blocks),
[GFM tables](https://github.github.com/gfm/#tables-extension-) and
[task lists](https://github.github.com/gfm/#task-list-items-extension-), and
[Obsidian Flavored Markdown](https://help.obsidian.md/obsidian-flavored-markdown).

### Alignment, anchors, and tags mapping rules

| Wmdx structure | CommonMark/GFM | Obsidian |
| --- | --- | --- |
| Paragraph alignment `<`, `><`, `->`, `<>` | Wrap the paragraph in HTML `<div align="VALUE">`, where `VALUE` is `left`, `center`, `right`, or `justify`; report if the renderer strips alignment. | Same. |
| Standalone aligned link or resource | Use the same HTML alignment wrapper. Inline links inherit paragraph alignment. | Same. |
| Named anchor `#id` | Emit `<a id="id"></a>`; link to it with `[TITLE](#id)`. Heading links use the target renderer's generated heading slug. | Use a block ID `^id` on the anchored block and link with `[[SOURCE#^id|TITLE]]` (or `[[#^id|TITLE]]` within the same note); heading links use `[[SOURCE#Heading|TITLE]]` or `[[#Heading]]`. |
| Tag `#tag` | Preserve as literal text; tag navigation is not portable. | Preserve as an Obsidian tag. |

An Obsidian block ID must use Latin letters, numbers, or hyphens. If a Wmdx
anchor ID falls outside that set, use an HTML anchor fallback and report that
Obsidian's native block-link behavior is not preserved. Attach the block ID to
the following block, or to the preceding block if the anchor is at the end of
the document. Read HTML `align`
attributes as paragraph/object alignment; continue to ignore CSS `style`
attributes on import. The same alignment wrapper applies to media embeds, while
percentage sizing may require an output-only style attribute.

### Paragraph, quote, code, and definition-list mapping rules

| Wmdx structure | CommonMark/GFM | Obsidian |
| --- | --- | --- |
| Paragraphs and line breaks | Separate paragraphs with blank lines. Join Markdown soft line breaks as spaces on import; preserve explicit hard breaks. Export Wmdx hard line breaks with two trailing spaces before the newline, not a backslash. | Same. |
| Horizontal rule | Emit the existing `---` form. | Same. |
| Fenced code block | Preserve the language label and use matching backtick or tilde fences; choose a fence longer than any matching run inside the code. | Same. |
| Block quotes | Preserve `>` nesting and prefix every quoted line, including blank lines between quoted paragraphs. | Same. |
| Definition lists | Use HTML `<dl>`, `<dt>`, and `<dd>`; there is no core Markdown form. | Same. |

On import, preserve explicit line breaks and fenced-code content literally.
Convert HTML definition lists to a term paragraph followed by Wmdx definition
lines beginning `: `, as already agreed.

HTML input is best-effort content conversion for copied web pages and
standalone HTML documents or ebooks, not a pixel-perfect page importer. Extract
readable content and semantic structure; do not read or apply CSS stylesheets or
inline `style` attributes, and never execute scripts. Convert recognized HTML
structure and semantic formatting elements to Wmdx syntax, and report meaningful
losses. When document content has no suitable Wmdx equivalent, identify it and
propose a native syntax before implementing that conversion.

## HTML import inventory

The CommonMark 0.31.2 parser suite holds 77 HTML-interoperability examples out
of native Markdown parsing. These are parser conformance cases, not 77 distinct
features: they include ordinary elements, custom or malformed tags, comments,
processing instructions, and script/style blocks.

The entries below record agreed conversion behavior. This inventory is not a
batch implementation plan.

### Existing Wmdx equivalents

| HTML construct | Wmdx conversion |
| --- | --- |
| `h1`–`h6`, paragraphs, line breaks, and thematic breaks | `.1`–`.6`, normal paragraphs, the existing hard-break spelling, and the existing thematic-break syntax |
| Lists and nested lists | Existing list markers and nesting; HTML checkboxes inside list items map to task items |
| Block quotes and simple tables | Existing `>` quotes and current pipe tables; do not change table syntax or editing behavior |
| Bold, italic, underline, strike, superscript, subscript, highlight, and inline code | Existing Wmdx inline formatting markers |
| Links, images, audio, video, and supported documents | The unified resource syntax; map URL, label/alt text, size, and alignment where present |
| HTML media `width`/`height` attributes | Resource size with proportions preserved; do not derive dimensions from CSS |
| `figure`/`figcaption` when its caption matches the image alt text | The resource title, which serves as alt text and visible caption |
| `pre`/`code` | Fenced code, preserving the code text and a recognized language |

### Additional agreed HTML conversions and exclusions

The following entries record agreed conversion behavior:

| HTML feature | Wmdx conversion or handling |
| --- | --- |
| `details`/`summary` | **Agreed direction:** convert to the `dropdown` callout type. Map a closed `<details>` to `±dropdown-` and an open `<details open>` to `±dropdown+`; use `<summary>` as its title and the body as automatically indented content. |
| Definition lists (`dl`/`dt`/`dd`) | **Agreed direction:** a term paragraph followed by definition lines beginning `: `; a new term paragraph starts the next group |
| HTML image alt text and visible caption | **Agreed direction:** the unified resource `TITLE` serves as both alt text and visible caption. An empty title falls back to the source filename; an empty HTML `alt` is treated as missing. Do not add a separate caption field or parentheses sub-syntax |
| Responsive images (`picture`/`srcset`) | **Agreed direction:** import the file path from `<img src>` as one Wmdx resource and let Wmdx sizing control its display. Ignore alternate `srcset` and `<picture><source>` candidates; do not add multi-source syntax for responsive display variants |
| HTML comments | **Agreed direction:** use `/* comment */` for both inline and multiline Wmdx comments, with the same opening and closing markers. Convert HTML `<!-- ... -->` and Obsidian `%% ... %%` comments to this native form and map them back on export. Recognize comment markers before italic syntax; do not use backslash as a comment marker |
| Named anchors (`id`/`name`) | **Agreed direction:** a standalone `#id` line declares a named target, and links refer to it with `#id`. Headings remain targets automatically. Tags remain `#tag` in tag context. Import/export converters translate Wmdx anchors to each target format's syntax |
| CSS stylesheets, `<style>` blocks, and `style` attributes | **Agreed direction:** do not import or apply them; CSS is not document content. Convert semantic HTML formatting elements instead |
| `<script>` blocks | **Agreed direction:** never execute them; omit script behavior as non-document content |
| Malformed HTML | **Agreed direction:** recover and convert recognizable document content, reporting meaningful losses. If no usable content can be recovered, stop and leave the destination unchanged |
| HTML tables with `rowspan`/`colspan` | **Agreed direction:** preserve spans using the existing Wmdx merge markers: `<` for horizontally covered cells and `^` for vertically covered cells. Keep the source cell content once in its origin cell. Do not change table syntax or editing behavior |
| Forms, iframes, custom elements, and other active or unknown content | **Agreed direction:** retain readable text, labels, and ordinary links; convert recognized media to resource syntax; omit interactive controls and behavior; never execute active content or retain raw tags; report meaningful losses |

HTML document metadata such as `<title>` and `<meta>` is not ordinary body text.
**Agreed direction:** use `<title>` only as a suggested filename when creating
a new Wmdx document; never insert it into the body. Ignore other `<meta>` fields.
Paste-from imports leave the current document filename unchanged.

## Wmdx-owned implementation work

For CommonMark, GFM, Obsidian, and HTML, define how input is converted to native
Wmdx and how native constructs are exported. Preserve semantics where possible
and make unavoidable information loss explicit. Use the same conversion rules
for **Convert from** and **Paste from**; test both entry points and dialect
round trips where relevant. HTML export is portable output, while HTML import is
best-effort content conversion; do not treat them as a promised round trip.

## Implementation plan (syntax agreed; implementation in progress)

The agreed syntax is being implemented in small, testable slices. A syntax
listed here is not considered fully supported until its parser, visual modes,
editing behavior, and persistence are verified. Import/export conversion remains
a separate later phase.

### Implemented parser and rendering slices

- `.1`–`.6` headings map to the six structural heading levels while preserving
  their original source.
- Native `±type`, `±type-`, and `±type+` callouts support editable titles,
  Return-driven body indentation, nested indentation, blank paragraphs, and
  dedenting. Foldable callouts use a leading `+`/`−` control, and the visible
  heading toggles the body while editable title text still receives the caret.
  While an empty title is being typed, the opener stays editable; Return on a
  blank body line exits one callout level, including mobile paragraph input.
- Native task markers `[ ]` and `[x]` render as interactive checkboxes without
  a leading list bullet.
- Native footnote references and definitions support automatic numbering and
  reuse of an existing `^N` note.

These slices pass the focused web test suite. Android phone rendering and
editing still require normal project/device verification.

### Resource syntax groundwork

- The fixed-slot resource parser/formatter validates `[SOURCE|TITLE|SIZE|ALIGN]`
  and `![SOURCE|TITLE|SIZE|ALIGN]`, including escaped pipes, optional title
  fallback, pixel/percentage sizing, and the four resource alignment markers.
- The CodeMirror parser recognizes valid resource references and embeds as one
  native token; escaped text and code spans remain literal.
- Text resource links now render as clickable titles with optional alignment
  when they stand alone; the link toolbar inserts the native form. Resource
  right alignment uses `>`; legacy `->` remains readable. Bare web domains are
  stored without a scheme and opened using HTTPS. In WYSIWYG, long-pressing a
  native text link opens Edit and Delete actions; deleting removes the link
  syntax while keeping its displayed title as plain text.
- Link settings now control CommonMark/GFM links, reference links, Obsidian
  wikilinks, and Wmdx resource links. The single Links toolbar action opens
  external/internal/reference insertion choices, with one blank-by-default
  shortcut. Reference insertion creates or reuses a Markdown definition and
  moves the cursor to a new definition. Long-press Edit/Delete actions cover
  Wmdx, CommonMark, reference, and Obsidian text links.
- Heading links resolve both native decimal headings and CommonMark headings;
  live-preview link syntax uses the same active-line behavior across flavors.
- Image/media rendering and edit dialogs, media insertion controls, and
  import/export are still pending. Table syntax and editing remain unchanged;
  its row splitter treats pipes inside a valid resource token as field
  separators, not cell boundaries.

### 0. Finish remaining specification details

In particular, the callout/dropdown behavior stays in scope, with
agreed markers `±type`, `±type-`, and `±type+`; `-` starts closed and `+`
starts open. Optional titles follow the type and state marker after one space.
The generic dropdown is the `dropdown` callout type and requires one of those
suffixes. Its body uses the same automatic indentation rules as other callouts.
Callout bodies use automatic list-like indentation, blank lines for paragraphs,
and dedenting to end the block. Callout body lines do not need repeated `>`
markers; ordinary quotes retain them.

- Confirm remaining native grammar and parser edge cases.
- Finish the CommonMark, GFM, Obsidian, and HTML conversion matrix, including
  explicit losses and HTML's best-effort content-import behavior.
- Test automatic footnote numbering, `^N` reuse, paired superscript, escaped
  carets, and the unchanged table merge marker.
- Keep the current table syntax and editing behavior unchanged.
- Prepare examples that exercise valid, nested, escaped, unmatched, and
  malformed syntax before implementing parser changes.

**Gate:** the native grammar and conversion behavior are documented as agreed,
not merely proposed.

### 1. Implement and verify the native parser

- Extend the existing CodeMirror/Lezer Markdown parser with the agreed Wmdx
  grammar; preserve the original source instead of rewriting it when parsing.
- Share the Wmdx grammar configuration across the main and embedded editors,
  while retaining their intentional differences in Markdown extensions.
- Verify Source, Live Preview, and WYSIWYG behavior, including view changes,
  save/reopen, Markdown files, MDZip files, and embedded documents.
- Add parser and serialization tests for precedence, escaping, literal code,
  nested formatting, malformed markers, and table non-regressions.

**Gate:** the same source has consistent intended meaning in all applicable
editor contexts and remains intact through view changes and persistence.

### 2. Add editing and insertion controls

- Add toolbar and shortcut actions for the agreed syntax, with dialogs for
  fields that should not require users to memorize the full grammar.
- Verify selection, caret placement, undo/redo, and keyboard behavior for
  inserted and edited syntax.
- Verify automatic list-like indentation in callouts, including blank-line
  paragraphs, dedenting, and nested callouts.
- Keep Source view usable for direct editing and ensure visual modes expose
  malformed syntax instead of silently changing user text.

**Gate:** toolbar and keyboard actions produce the same valid source and
behavior as direct Source-view entry.

**Implementation update:** Existing toolbar actions now insert native `.1`–`.6`
headings, `[ ]` tasks, `±type` callouts, and the selected footnote flavor. The
callout action wraps whole lines, and the footnote dialog can reuse an existing
numbered note with Wmdx `^N` or a Markdown reference.

### 3. Add format converters

- Implement CommonMark, GFM, and Obsidian import and export using the agreed
  mapping matrix.
- Implement HTML paste/import as best-effort conversion of readable web or
  document content; do not apply CSS or promise pixel-perfect reproduction.
- Keep HTML export standards-based and portable, without Wmdx-only metadata.
- Use the same source-format conversion rules for **Convert from** and
  **Paste from**, with explicit reporting for meaningful conversion losses.

**Gate:** each supported input/output mapping has focused tests for content,
structure, and known losses.

### 4. Integrate and validate on Android

- Connect the converters to the agreed toolbar actions and shortcuts for file
  conversion, clipboard paste, and export.
- Run the web test suite, Android editor-bridge and unit checks, and the normal
  Android build/CI path.
- Use a phone checklist covering all editor views, direct file save/open,
  clipboard paste, Markdown/MDZip, embeds, and converter loss notices.

**Gate:** automated checks pass and the phone checklist confirms the user-facing
flows before considering the syntax revision complete.

