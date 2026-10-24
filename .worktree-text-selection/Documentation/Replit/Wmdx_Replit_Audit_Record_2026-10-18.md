# W.mdx — Replit audit and collaboration record

**Record date:** October 18, 2026  
**Purpose:** A consolidated historical record for project documentation. This is not a new Jules task prompt and does not authorize changes to the repository.

## 1. Project context

The current project discussed in this record is [`cinnabar777/W.mdx`](https://github.com/cinnabar777/W.mdx), a Markdown editor built around CodeMirror 6 with a WYSIWYG-style mode. Earlier conversations concerned a separate CKEditor Android app in `cinnabar777/ckeditor5`; that is a different repository and its Android fixes/build results do not apply to W.mdx.

The user collaborates with Jules through separate working branches and tests Android builds on a phone. The user is not a developer and is often working from a phone, so instructions and reference material need to be consolidated, specific, and easy to pass to Jules. Pull requests are not central to this workflow.

## 2. Repository and branch checks performed

### Main

- At the last API check, `main` pointed to `602e57cdccfb2d301fb7d49d4978f33731528c80`, with commit message “Add files via upload — Replit next task.”
- `Typography.md` was present on `main`; its last-read blob was `2f611f6217dc6bae99eb863b4a26f4d620cb8171`.
- The proposed path `REPLIT_JULES_HANDOFF_2026-10-18.md` did not exist at that check.
- The user may have changed the name of a Jules file after that check. This record is intended to be uploaded by the user as past documentation; no GitHub write was performed for this record.

### Jules working branch

- Branch checked: [`jules-3492949419147525921-af940c11`](https://github.com/cinnabar777/W.mdx/tree/jules-3492949419147525921-af940c11).
- Latest tip checked: [`eeaa62473cbae23a7fcc0ad8d5c0fa8f3278a460`](https://github.com/cinnabar777/W.mdx/commit/eeaa62473cbae23a7fcc0ad8d5c0fa8f3278a460).
- The latest commit’s tree SHA was identical to its parent’s tree SHA. GitHub also returned an empty changed-files list. Therefore, despite the commit message referring to configuring GitHub Actions/YAML and building Android, that commit contained no tracked-file changes.
- GitHub Actions run [39154127487](https://github.com/cinnabar777/W.mdx/actions/runs/39154127487), “Build Debug APK,” completed successfully for that commit and produced a debug APK artifact. Because the tracked tree was unchanged, this was a successful build of the prior code—not evidence that any new editor fix was applied.

## 3. User-reported behavior and decisions

- A plain-text document scrolls without jumping.
- Screen movement is especially noticeable around headings and also occurs around formatted content such as lists.
- A brief screen flicker occurred and then stopped; some document jumping remains, and the problem is worse than in Obsidian.
- The bottom toolbar toggle works, confirmed by the user.
- The “Undo deletes all when there is nothing to undo” issue is marked fixed in the user’s test log.
- Text selection and keyboard navigation remain reported as not working correctly. Keyboard navigation can jump across formatted elements.
- The user’s intended experience is a Markdown editor with CodeMirror 6 behavior; do not reintroduce CKEditor.
- The user wanted a single consolidated reference to avoid Jules receiving multiple similarly named files. This record is for archival upload, not a replacement task prompt.

## 4. Code observations from the latest checked Jules tree

These are source observations, not proof of a runtime cause:

1. `web/src/main.js` builds CodeMirror decorations by iterating `view.visibleRanges`. It adds heading and list line classes during this viewport-scoped walk.
2. In `web/index.html`, heading/list CSS sets layout-affecting values including font size, line height, and margins. This is a credible explanation for viewport movement when formatted lines enter/leave the decorated range, especially because the user sees no jump in plain text and reports it around headings/lists. It remains a hypothesis until reproduced and verified on the phone.
3. `CheckboxWidget`, `CodeBlockHeaderWidget`, and `ImagePreviewWidget` do not implement CodeMirror `eq()` methods in the checked source. Rebuilt decorations may therefore recreate these widget DOM nodes unnecessarily. This could contribute to flicker or movement.
4. `ListMarkerWidget` and `GFMTableWidget` do implement `eq()` in the checked source.
5. The `Table` syntax node is rendered as a separate `GFMTableWidget`, an HTML table with editable cells and add/remove buttons. On cell blur, the widget rewrites the Markdown table in the CodeMirror document. That can disturb caret/selection and scroll anchoring when editing tables.

## 5. Latest user test log snapshot

This snapshot is from `Typography.md` on `main` as last read on October 18, 2026. It reflects user-reported tests; it is not a claim that Replit independently tested the app.

### Headings

- Size scale, font weight, font file, text alignment, line height, letter spacing, text transform, underline style/thickness/color, and top/bottom margins: **fixed**.
- Heading settings should support global defaults and per-heading overrides.

### Paragraph and body typography

- Paragraph line height, paragraph font, alignment, first-line indent, paragraph-only justification, top/bottom margin, and line wrap: **fixed**.
- Body text size works but affects all text except headings.
- Global letter spacing works but still affects list items; user expects paragraph-only behavior.
- Body paragraph font and top margin also affect list items.

### Inline formats, links, and footnotes

- Bold/italic text colors, weights, and font files; hyperlink color; inline-code text/background/padding/radius; and code font file: **fixed**.
- Hyperlink decoration: **not working**.
- Adding a link in WYSIWYG mode needs a URL popup because the Markdown link syntax is hidden.
- Footnote font size, text color, reference color, back-link color, and section background: **not working**.
- Footnotes may need a proper parser/renderer plugin. Footnote settings are missing reset icons.

### Lists and checkboxes

- List indentation, item spacing, line height, bullet/number colors, checkbox border, and checkbox accent: **fixed**.
- Still requested: unchecked-checkbox background; an option to hide the bullet before a checkbox or show proper `[ ]` syntax; and checkmark color.
- List wrapping/indentation remains visually wrong: the first line is indented farther than continuation lines, which sit flush with the bullet.

### Blockquotes and callouts

- Blockquote border thickness/style/color, text color, left margin, and inside padding: **fixed**.
- Callouts are not functional yet; the user reported no toolbar key or shortcut setting.

### Tables

- Border thickness/color, header background/text/weight, and cell background/text/padding: **fixed**.
- Border styles “none” and dashed work.
- The user does not like the extra editable table widget/buttons around tables; see the table-rendering issue above.

### Code blocks

- Text color, background color, padding, border radius, line height, and language-label text color: **fixed**.
- A code-block text-background color is still requested.
- Language and Copy controls appear only when the cursor is inside the code block.
- Styling for the language/Copy controls (background, text, and border colors) was reported not working.

### Horizontal dividers

- Thickness, style, color, width, and top/bottom margins: **fixed**.
- Width still needs to be centered or support an offset.

### Toolbar and other bugs

- Bottom control bar: user-reported **working**.
- Toolbar toggle: user-reported **working**.
- Undo when history is empty: marked **fixed** in the test log.
- Text selection: still reported not working properly.
- Keyboard text navigation: still reported to jump over elements.
- Reset icons: some are missing; current sizes differ; placement should be at the far end; reserve space so settings rows do not resize as reset icons appear.

## 6. Repair ideas previously prepared for Jules

The following implementation direction was prepared based on source review and the user’s reports. It has **not** been confirmed as implemented by the latest commit:

- Reproduce scrolling with plain text as the passing baseline, then headings/lists first, followed by checkboxes, code blocks, images, and tables.
- Investigate the viewport-scoped heading/list decorations and layout metrics. Keep typography choices intact; do not “fix” the jump by flattening font sizes, margins, or line heights.
- Prefer a CodeMirror-supported approach that keeps layout-affecting styles stable across viewport changes. Avoid rescanning/parsing the entire large document on every scroll.
- Add regression coverage around scrolling across heading/list boundaries and preserve a stable mapping between document location and viewport.
- Add `eq(other)` to Checkbox, CodeBlockHeader, and ImagePreview widgets, comparing all fields that affect rendering or event behavior (`checked/pos/len`, `lang/codeText`, and `url/alt`, respectively).
- Replace the table’s separate content-editable widget with line-class and inline-mark decorations while keeping Markdown as the actual editor document. Do not rewrite the whole table on blur.
- Implement `Tab`/`Shift+Tab` navigation between table cells using unescaped pipe delimiters and skipping the separator row. Preserve regular Tab behavior outside tables.
- Re-test text selection and keyboard navigation around headings, links, lists, checkboxes, tables, and code blocks.
- Run `cd web && npm test && npm run build`, then build Android and verify on the phone. A green CI compile alone is not proof of the reported behavior.

## 7. Verification boundaries

- The latest user test confirms plain-text scrolling is stable and that movement is more noticeable around headings/lists.
- Source inspection identifies plausible causes, but the exact trigger has not been isolated.
- The latest GitHub Actions build succeeded on an unchanged tracked tree.
- The latest Jules commit did not contain the reported scrolling fix or YAML/config changes.
- No claim is made here that scrolling, table editing, selection, keyboard navigation, or any remaining typography issue has been fixed in a new Android build.

