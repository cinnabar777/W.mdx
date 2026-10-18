# Jules task: typography wiring + toolbar/reset bugs

**Branch:** start from the current Jules working branch, whose checked tip is f2201c5557eb3177d7d4b999906f662da4fc9d5a. Do not work on main or replace this branch. Recheck the branch tip first in case Jules has added commits since this review.

**Goal:** In one focused pass, fix the remaining typography wiring and the confirmed toolbar/reset layout issues. Investigate the undo and cursor-navigation reports with tests; do not make speculative editor rewrites.

## 1) Fix heading font and underline CSS wiring

In web/src/main.js, the code sets --heading-font-family and per-level --heading-N-underline-* variables. In web/index.html, heading CSS does not consume the font variable, and the shared heading rule reads global underline variables instead of the per-level variables. This is why heading font files and underline-style controls still fail.

Add the family to the common heading rule:


```css
.cm-content .cm-heading {
  font-family: var(--heading-font-family, inherit) !important;
}
```

For underline style, map the preference to the two distinct CSS concepts: the line is none or underline; the style is solid, double, dashed, dotted, or wavy. In the per-heading loop in main.js, derive and set --heading-N-underline-line and --heading-N-underline-style. For none, set line to none and style to a harmless valid fallback such as solid. In CSS, consume the per-level variables for each .cm-heading-N, including per-level thickness and color. Do not pass values like dashed into text-decoration-line.

## 2) Fix hyperlink decoration variable mismatch

In main.js the preference already sets --link-decoration-line and --link-decoration-style. Change the .cm-link CSS in web/index.html to consume those names:


```css
.cm-link {
  color: var(--link-color, #29b6f6) !important;
  text-decoration-line: var(--link-decoration-line, underline) !important;
  text-decoration-style: var(--link-decoration-style, solid) !important;
}
```

Keep the existing behavior that none removes the line. Do not change link parsing or popup behavior in this fix.

## 3) Make the toolbar toggle actually hide/show the bar

In the current branch, toggleBottomToolbar() toggles body.toolbar-hidden and updates the floating button, but web/index.html has no CSS selector that uses .toolbar-hidden. Add an explicit hidden-state rule for .grouped-control-bar (and a matching visible-state rule if required by the existing stylesheet). Keep #floating-toggle-btn visible and tappable in both states. Update aria-expanded and its accessible label when toggled. Avoid changing editor height/scroll behavior beyond what is needed to show or hide the bar.

## 4) Normalize reset icon size, position, and reserved space

In app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt, reset buttons currently use different sizes: the normal path creates a 32dp button, while sliders expand it to 48dp. Unmodified settings set it to GONE, so the row can reflow when the reset icon appears. The color preview is added separately to the widget frame.

Use one shared, fixed-width reset slot for every resettable preference type, align it at the far end of the row, and keep the slot reserved when reset is unavailable (for example, use an invisible icon rather than removing the slot). Use one consistent medium icon glyph size with a comfortable touch target; do not shrink the clickable target to the visual glyph size. Keep color swatches and other existing widgets visible and tappable. Do not add the reset button to a slider's title or description row in a way that overlaps text. Confirm reset still resets color, slider, list, switch, and font preferences.

## 5) Undo and selection/navigation: reproduce before changing behavior

The current web adapter calls CodeMirror 6's cmUndo(view) directly, and setMarkdown() marks programmatic replacements as not part of undo history. Add a small guard using CodeMirror's undoDepth(state) so undo immediately returns false when no user edit is available. Do not replace the document with empty text as an error fallback.

Add/review a regression test for: open a document, make one edit, undo once, press undo again, and confirm the document remains unchanged on the second press. Reproduce separately with the toolbar undo button and a hardware keyboard. If either path still deletes content, trace the exact caller before changing history behavior.

For the reported cursor-selection/navigation jumps, test the current branch in WYSIWYG mode around headings, links, lists, checkboxes, tables, and code blocks, then test the same documents in Source mode. The checklist says this was fixed on a different branch, so do not alter decorations or selection mapping unless a reproducible failing case exists on this branch. If one does, make that narrow change and add the failing case as a regression test.

## Verification before calling it done

- Run cd web && npm test && npm run build.
- Build the Android app with the repo's normal workflow.
- Manually verify on the phone: heading font/underline values; link decoration; toolbar button hides and restores the bar without hiding itself; reset buttons stay aligned and do not shift rows; undo at empty history does not change the document; cursor movement across formatted items remains correct.
- Update Typography.md only with behaviors tested in the built app. Report any item that still needs a phone reproduction rather than marking it fixed.

**Out of scope:** implementing a footnote parser/renderer, adding the WYSIWYG link popup, changing app architecture, and unrelated styling/performance work.
