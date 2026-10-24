# Jules follow-up after build `40fc54a`

Target branch: `cinnabar777/W.mdx`
`jules-3492949419147525921-af940c11`

Latest commit checked: `40fc54abfe24b0c165a54899a1c6c185df6eef49`.

## What changed and what the reference shows

The user reports the tables look unchanged, scrolling has some small jumps but
is much closer to Obsidian, and Up-arrow navigation now jumps around code
blocks, headings, and lists.

The commit immediately before this one, `91b64e3`, was the better navigation
build (apart from Up sometimes skipping a horizontal rule). The new commit
`40fc54a` made two changes:

1. It assigned `cm-heading` and `cm-heading-1`…`cm-heading-6` to the heading
   lines. That activated heading CSS that was previously present but dormant.
2. It added an Up-arrow handler for horizontal rules.

The old CodeMirror branch
[`ckeditor5` / `Wmd-V0.2-13424438593115341489-8007187214692561893](https://github.com/cinnabar777/ckeditor5/tree/Wmd-V0.2-13424438593115341489-8007187214692561893)
uses the regular `defaultKeymap` for Up/Down too; it has no custom Up/Down
handler. Its heading layout uses **padding** for the heading spacing. The
current Wmdx CSS instead applies `margin-top`/`margin-bottom` to decorated
CodeMirror lines. Since the navigation regression appeared in the same build
that activated those CSS classes, line margins are the strongest specific
cause to test. This is a source-based diagnosis; verify it on the phone.

Do not change the current table code in this patch. The latest commit did not
change table rendering, which matches the user's observation that tables look
the same.

## Patch: use padding, not margins, for CodeMirror heading spacing

In `web/index.html`, inside the heading CSS:

### A. Replace the two base spacing declarations

In `.cm-content .cm-heading`, replace:

```css
margin-top: var(--heading-margin-top, 16px) !important;
margin-bottom: var(--heading-margin-bottom, 8px) !important;
```

with:

```css
margin-top: 0 !important;
margin-bottom: 0 !important;
padding-top: var(--heading-margin-top, 16px) !important;
padding-bottom: var(--heading-margin-bottom, 8px) !important;
```

### B. Add exact per-level spacing overrides

Insert this block **after the existing `.cm-heading-6` rule**. Do not rewrite
the existing typography/color rules:

```css
/* CodeMirror line margins can confuse vertical caret positioning.
   Preserve the same visual spacing with measured line-box padding. */
.cm-content .cm-heading {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--heading-margin-top, 16px) !important;
  padding-bottom: var(--heading-margin-bottom, 8px) !important;
}
.cm-content .cm-heading-1 {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--heading-1-margin-top, var(--heading-margin-top, 16px)) !important;
  padding-bottom: var(--heading-1-margin-bottom, var(--heading-margin-bottom, 8px)) !important;
}
.cm-content .cm-heading-2 {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--heading-2-margin-top, var(--heading-margin-top, 16px)) !important;
  padding-bottom: var(--heading-2-margin-bottom, var(--heading-margin-bottom, 8px)) !important;
}
.cm-content .cm-heading-3 {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--heading-3-margin-top, var(--heading-margin-top, 16px)) !important;
  padding-bottom: var(--heading-3-margin-bottom, var(--heading-margin-bottom, 8px)) !important;
}
.cm-content .cm-heading-4 {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--heading-4-margin-top, var(--heading-margin-top, 16px)) !important;
  padding-bottom: var(--heading-4-margin-bottom, var(--heading-margin-bottom, 8px)) !important;
}
.cm-content .cm-heading-5 {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--heading-5-margin-top, var(--heading-margin-top, 16px)) !important;
  padding-bottom: var(--heading-5-margin-bottom, var(--heading-margin-bottom, 8px)) !important;
}
.cm-content .cm-heading-6 {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--heading-6-margin-top, var(--heading-margin-top, 16px)) !important;
  padding-bottom: var(--heading-6-margin-bottom, var(--heading-margin-bottom, 8px)) !important;
}
```

The more-specific per-level selectors preserve each level's spacing preference.

Padding preserves the visible spacing but is included in the CodeMirror line's
measured box; margins can sit outside that measured line box and throw off
CodeMirror's Up-arrow position mapping.

## Keep the horizontal-rule handler for this test

Do **not** change `horizontalRuleNavigationKeymap` or any other keyboard
mapping in this patch. It only targets a caret directly below a horizontal
rule, and does not explain jumps around headings, lists, or code blocks. Keep
it so this build tests one likely cause at a time. If navigation is still bad
after the heading spacing change, compare/revert that handler in a separate
test rather than changing multiple navigation behaviors at once.

Keep the `defaultKeymap` and existing table keymap unchanged.

## Phone checks

Use a short document with a heading, ordinary paragraph, list, fenced code
block, horizontal rule, and another paragraph:

- Press Up/Down through the heading and surrounding paragraphs. It should move
  to the visually adjacent line instead of skipping to another block.
- Press Up/Down through multiple lines of a fenced code block.
- Press Up/Down from before, within, and after a list.
- Confirm one Up from the paragraph immediately after an HR can reach the HR
  line; confirm Down works.
- Compare scrolling and table appearance to the previous build.
- Confirm heading levels still differ in size and the per-level spacing
  preferences still apply.

Do not claim the navigation issue is fixed until the phone test passes.
