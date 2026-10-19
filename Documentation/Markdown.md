# MD CHEAT SHEET

## MARKDOWN QR

1. Bold: ** or __ [[#BOLD|Link]]
2. Code: ` [[#CODE|Link]]
3. Embed: ![[]] [[#EMBED|Link]]
4. Escape: \
5. Footnote: ^[] [[#Footnotes|Link]]
6. Headings: # [[#HEADINGS|Link]]
7. Highlight: == [[#TEXT HIGHLIGHT|Link]]
8. Horizontal line: 3+ of _ * -
9. Image: ![]() [[#LINK IMAGES|Link]]
10. Italic: * or _ [[#ITALICS|Link]]
11. Links: []() [[#LINKS|Link]]
12. Numbered list: 1. [[#ORDERED LISTS|Link]]
13. Quote (block): > [[#BLOCK QUOTE|Link]]
14. Strikethrough: ~~ [[#STRIKETHROUGH|Link]]
15. Tables: [[#TABLES|Link]]
16. Tags: # [[#TAGS|Link]]
17. Tasks & Checkbox: - [ ] [[#Checklist|Link]]
18. Unordered lists: - + * [[#UNORDERED LISTS|Link]]
19. Underline; <u></u> → [[#UNDERLINE |Link]]

## MARKDOWN SHORTCUTS

1. mdcal: > [!NOTE] Title
2. mdcheck: - [ ]
3. mdalign: <div align="">
4. mdcode: ```
5. mdcolor: <span style="color: lime; font-weight: bold;">
6. mdive: </div>
7. mdembed: ![[
8. mdlink: [[
9. mdq: >
10. mdspane: </span>
11. mdstrike: ~~
12. mdsub: $_{
13. mdsup: $^{
14. mdsue: }$
15. mdu: <u>
16. mdue: </u>
17. mdyellow: <span style="color: black; font-weight: bold; background-color: yellow;">

---

# OBSIDIAN SPECIFIC

Obsidian doesn't support Markdown syntax or blank lines **within** HTML blocks.

OBSIDIAN uses a slightly **unorthodox** combination of flavors of _Markdown_, mainly CommonMark, with some functionality from GitHub Flavored Markdown and LaTeX.

In addition, Obsidian adds the following syntax:

| **Syntax**        | **Description**                 |
| ----------------- | ------------------------------- |
| [[File name]]   | Internal link to file           |
| [[#Header]]     | Internal link to header         |
| [[File#Header]] | link to header in internal file |
| ![[File]]       | Embedding files                 |
| %%. . .%%         | Comments                        |
| > [!note]        | Callouts                        |

---

# CODE

**METHODS**

1. Three tildes on the first and last line of the code block: ~~~
2. Three backticks on the first and last line of the code block: ```
3. Four spaces (not optimal)

**EXAMPLES:**

**TILDES**:

```plaintext
Code block with Tildes
```

**TICKS**:

```plaintext
Code blocks with ticks
```

**SPACES:**

```plaintext
Code Block with four spaces
No spaces at the end
Doesn't always work
Notice no copy in right corner
```

## SYNTAX HIGHLIGHTING

Add syntax highlighting by adding a language code after the first set of backticks.

**EXAMPLE:**

```javascript
function fancyAlert(arg) {
	if (arg) {
		$.facebox({ div: "#foo" });
	}
}
```

## INLINE CODE

```plaintext
`Inline code`
```

---

# COMMENTS

1. <!-- comment -->
2. %% comment %% (Obsidian specific)

Comments are visible in Obsidian **edit mode** unless within another element. **EXAMPLES:**

%% comment here %%

---

# HEADINGS

Use the `#` with a space after it before the heading. Each `#` decreases the heading 1-6.

**EXAMPLES:**

# HEADING ONE

## HEADING TWO

### HEADING THREE

#### HEADING FOUR

##### HEADING FIVE

###### HEADING SIX

---

# TEXT FORMAT

## ITALICS

*Italic emphasis* = _Italic emphasis_
OR
_Alternative_ = _Alternative_

## BOLD

**Bold emphasis** = **Bold emphasis**

OR
__Alternative__ = **Alternative**

## STRIKETHROUGH

~~Strikethrough~~ = ~~strikethrough~~

## UNDERLINE

<u>Underline</u> = _underline_

## LINE BREAKS

two spaces at end of line
Gives you no extra spacing
And doesn't run text together
In one long paragraph

## BLOCK QUOTE

Use > with a space after it at the beginning of a line (space isn't always necessary depending on app): > Block Quote =

> Block quote
> is good

## TEXT HIGHLIGHT

Text highlight in Obsidian

==Highlight== ==highlight==

**Using HTML**

```plaintext
<span style='background-color: red;'> Text highlight </span>
```

Text with background color

## TEXT COLOR

**Using HTML**

```plaintext
<span style='color:red;'>Text color</span>
```

Text foreground color

**Text with colored outline** (theme specific)

```plaintext
<span style='text-shadow: 0px 0px 2px [[FF0000]];'>Text with colored outline</span>
```

## SUB & SUPERSCRIPT

<sub>subscript</sub> <sup>superscript</sup>

Example subscript superscript

**OTHER OPTIONS**

100m$_2$ = 100m$_2$
100m$^2$ = 100m $^2$&#xA;_`H$_2$O`_&#x20;= H $*2$ O
Word$^{label}$ = Word$^{label}$
Word$_{label}$ = Word$_{label}$

Super special characters: ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁼ ⁽ ⁾ ⁿ ™ ® ℠

# TEXT POSITIONING

## ALIGN TEXT

<div align='right'>text on the right</div>

text on the right

<div align='center'>text in the center</div>

text in the center

## BLOCK TEXT (JUSTIFY)

<div style='text-align: justify; text-justify: inter-word;'>text here</div>

lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum.

## DROPDOWN & CALLOUTS

### CALLOUTS

> [!info] header

The type identifier determines how the callout looks and feels.

Example:

> [!info] optional title
> Here's a callout block.
> It supports **Markdown**, [[Internal link|Wikilinks]], and embeds ![[Rich Solar panel.jpg]]

#### FOLDABLE CALLOUTS

+ for start expanded or a - for start closed
**EXAMPLES:**

> [!faq]- Start collapsed
> Yes! In a foldable callout, the contents are hidden when the callout is collapsed.

> [!faq]+ Start expanded
> Yes! In a foldable callout, the contents are hidden when the callout is collapsed.

#### NESTED CALLOUTS

> [!question] Can callouts be nested?

> > [!todo] Yes!, they can.

> > > [!example] multiple levels

> [!question] Can callouts be nested?
>
> > [!todo] Yes!, they can.
> >
> > > [!example] multiple levels

With +-

> [!question]+ Can callouts be nested?
>
> > [!todo]- Yes!, they can.
> >
> > > [!example]- multiple levels

## DROPDOWN

<details><summary> Click to Expand & Collapse </summary>

Expanded content. Shows up and keeps visible when clicking expand. Hide again by clicking the dropdown button again.

</details>

Click to Expand & CollapseExpanded content. Shows up and keeps visible when clicking expand. Hide again by clicking the dropdown button again.

# PAGE BREAK

To break the page (start a new page), put the div below into its own line. Relevant for creating printable pages from the document (Print / PDF).

```plaintext
<div style="page-break-after: always;"></div>
```

---

# LISTS

## UNORDERED LISTS

Use - or * with space before list item:
* Unordered list
* ...with asterisk/star
- Unordered list
- ...with hyphen/minus

* Unordered list
  * ...with asterisk/star
    OR
* Unordered list
  * ...with hyphen/minus

## ORDERED LISTS

Line starts with a number and period (.)

1. Ordered list

2. Test
3. Test
4. Test

## NESTED LISTS

Indent the line next line by one or more spaces before the identifier, the more spaces the bigger the indent. Unordered can be mixed into the nested of an ordered list.

1. Ordered nested list
   * Test

2. Test
   1. Test
   2. Test

3. Test

## CHECKLIST

- [ ] dash (-), a space, brackets with space in middle, and a space after. Check lists can be ordered or unordered. Anything placed in the brackets toggles it marked, though different items give strikethrough and others don't.

* [ ]  Salad
* [x]  Potatoes

- [?] what's this, ? Used in brackets

* [ ] Clean
* [ ] COOK 

---

# TABLES

Vertical bars separate columns, and hyphens define the column header. Each header row must have at least two hyphens. You can use basic formatting syntax to style content within a table. You can align text to the left, right, or center of a column by adding colons (:) to the header row.

```plaintext
| left | centered | right |
| :-------- | :-------: | --------: |
| Test      | Test      | Test      |
| Test      | Test      | Test      |
```

| left | centered | right |
| ---- | -------- | ----- |
| Test | Test     | Test  |
| Test | Test     | Test  |

Vertical bars on ends are optional

```plaintext
Shorter | Table | Syntax
:---: | ---: | :---
Test | Test | Test
Test | Test | Test
```

| Shorter | Table | Syntax |
| ------- | ----- | ------ |
| Test    | Test  | Test   |
| Test    | Test  | Test   |

---

# LINKS

## INTERNAL LINKS

### OBSIDIAN

Obsidian has the option to use wiki links which uses two brackets [[example]] for internal links:

[[File name]] Internal link to file
[[#Header]] Internal link to header
[[File#Header]] links to header in internal file

[[File#H 1#H 2]] links to sub heading
[[file#^Block]] link to block in file
[[file | display]] Change the Display text

Link to file in different vault
[Note](obsidian://open?vault=MainVault&file=Note.md)

To escape blank spaces use %20 for spaces!
You can also escape the URL by wrapping it with angled brackets < >.

### MARKDOWN

[Title of link ](file%20name.md)
[File name](Three-laws-of-motion.md)
Have to account for spaces!

Link to a Block within a Note:
[[QuickNote#^a124fc | water]] to make it readable

Link to a Note but Change the Display text:
[custom display text](Internal%20links.md)

## EXTERNAL LINKS

Create an inline link by surrounding the link text in brackets `[ ]`, and then the URL in parentheses `( )`.

[Link]([https://duckduckgo.com/](https://duckduckgo.com/))

[File in same folder as the document.](markor-markdown-reference.md)

## LINK IMAGES

You can add images with external URLs, by adding a ! symbol before an external link.

![Engelbart]([https://history-computer.com/ModernComputer/Basis/images/Engelbart.jpg](https://history-computer.com/ModernComputer/Basis/images/Engelbart.jpg)

Change image dimensions by adding |640x480 to the link destination, where 640 is the width and 480 is the height.

![Engelbart|640x480]([https://history-computer.com/ModernComputer/Basis/images/Engelbart.jpg](https://history-computer.com/ModernComputer/Basis/images/Engelbart.jpg))

If you only specify the width the image scales according to its original aspect ratio. For example:
![[Engelbart.jpg|100]]

# EMBED

By embedding the original note into new notes, you only have to update the original and all will be updated.

![[Note to Embed]]

Blocks can also be embedded

![[linkexample^Block]]

Embed Headings

![[linkexample#Heading]]

**The trick for changing the display text will work when embedding too.**

![[linkexample|Change Display Text]]

## EMBEDDING IN OBSIDIAN

Drag & drop if available or

![[Image.jpg]]
[Image]([https://facedragons.com/wp-content/uploads/2022/08/cropped-roundlogo-FD.png](https://facedragons.com/wp-content/uploads/2022/08/cropped-roundlogo-FD.png))
![[Video.mp4]]

![[Audio.mp3]]

![[Document.pdf]]

To link a file that's online
![Image]([https://URL.com/image.png](https://URL.com/image.png))

---

# FOOTNOTES

You can add footnotes to your notes using the following syntax: [^1]
[^1]: This is the referenced text.
[^2]: Add 2 spaces at the start of each new line.

Obsidian has a good built in tool for adding footnotes.

[^note]: Named footnotes still appears as numbers, but can make it easier to identify and link references.

You can also use inline footnotes. ^[This is an inline footnote.] Note that the caret goes outside the brackets.

---

# OTHER OBSIDIAN SYNTAX

## QUERIES

Queries will embed a list of results into your note, the query below will return any notes with the tag `#Bible` for example. You can add more than one parameter, as shown further down.

````plaintext
```query
#Bible
````

````plaintext
```query
#Bible + New Testament
````

## TEMPLATE SYNTAX

```plaintext
{{title}}
{{date}}
{{time}}
```

## COMMENTS

Wrap text with %%
Comments are only visible in Editing view.

```plaintext
This is an %%inline%% comment.

%%
This is a block comment.

Block comments can span multiple lines.
%%
```

## TAGS

hashtag symbol (#) in the editor followed by a keyword. Can be used in the properties (at beginning of note):

```plaintext
---
tag: meeting
---
Or, add several tags:  
---
tags:
  - recipe
  - cooking
---
Or  
---
tags: recipe, cooking
---

Nested tags
#inbox/processing
```

Tags can use letters, numbers, hyphens, underscores with at least one non-number, and not spaces.

## ALIAS

An alias is an alternative name for a note, add an alias, or aliases, property in the note properties

```plaintext
---
alias: Doggo
---

multiple aliases:
---
aliases: Doggo, Woofer, Yapper
---

Or using a YAML array:
---
aliases:
  - Doggo
  - Woofer
  - Yapper
---

---
Alias:
Author:
Status:
ISBN:
Cover:
---
```

### LINK USING AN ALIAS

Any alias shows up in the list of suggestions with a curved arrow icon next to it. Obsidian creates the link with the alias as its custom display text, for example `[[Levenson-KEYS TO THE ULTIMATE FREEDOM|keys to ultimate freedom]]`

---

# MULTIMEDIA

## IMAGES

![Image](file:///android_asset/img/schindelpattern.jpg)`

## VIDEOS

**Youtube** [Welcome to Upper Austria]([https://www.youtube.com/watch?v=RJREFH7Lmm8](https://www.youtube.com/watch?v=RJREFH7Lmm8))

**Local video:**

```plaintext
<div><video controls><source src='voice-parrot.mp4' </source></video></div>
```

## AUDIO & MUSIC

**Web audio**

```plaintext
[Guifrog - Xia Yu](https://www.freemusicarchive.org/music/Guifrog/Xia_Yu)
<audio controls src='https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Guifrog/Xia_Yu/Guifrog_-_Xia_Yu.mp3'></audio>
```

**Local audio**

```plaintext
Yellowcard - Lights up in the sky<audio controls src='../Music/mp3/Yellowcard/[2007]%20Paper%20Walls/Yellowcard%20-%2005%20-%20Light%20Up%20the%20Sky.mp3'></audio>
```