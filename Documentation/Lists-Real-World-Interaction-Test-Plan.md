# Lists: Real-World Interaction Test Plan

The dedicated suite is `web/browser-tests/list-workflow-matrix.cjs`. It is opt-in:

```sh
npm --prefix web run build
npm --prefix web run test:browser:lists
```

In GitHub Actions, select **Focused Interaction Tests → lists**. The suite uses a 412×844 mobile viewport, visible taps, mouse-drag text selection, keyboard input, real toolbar buttons, and real task-checkbox clicks. It saves a screenshot for each scenario; the workflow uploads those screenshots even when an assertion fails. Select **android-lists** to run the separate emulator test that changes the Body and Lists switches through the actual Android Settings screens, relaunches the editor, and checks the visible result.

The list matrix is not included in `test:browser` or the normal build workflow; it runs only when explicitly selected.

## Coverage built into the suite

| Workflow | Cases and observable assertions |
| --- | --- |
| Word editing and wrapping | CommonMark, GFM, Obsidian, and Wmdx; WYSIWYG hidden/caret/line/block exposure plus Source mode. A visible drag selects an exact multiword phrase in root or nested list text, keyboard input replaces it, exact Markdown is checked, undo/redo is exercised, wrapped rows are compared, and the edited Markdown is loaded again through the editor. |
| Return and Backspace | Each profile in WYSIWYG and Source mode. Return creates a new item, text input adds multiple words, another Return creates an empty item, and Backspace must remove that empty item without damaging either neighbor; undo must restore it. |
| Lists inside other blocks | Real word selection and replacement in blockquote lists for all four profiles and in callout lists for Obsidian and Wmdx. The exact parent Markdown must remain intact. |
| List toolbar actions | Each profile and each WYSIWYG exposure. Visible menu buttons create a bullet or ordered item, indent/outdent a selected item, and create a task where the profile supports it. CommonMark is expected not to author the non-standard task marker. |
| Task checkboxes | A visible checkbox is tapped in each WYSIWYG exposure for all four profiles. GFM, Obsidian, and Wmdx must update `[ ]` to `[x]`; CommonMark must preserve the source literally. |
| List settings | The rendered effects of left indent, item spacing, font size, font weight, and wrapping-under-marker behavior are compared before and after preference changes. |
| Soft line breaks | With the preference off, one newline remains visible; when on, it joins visually without changing Markdown. A two-trailing-space hard break remains visible, and Source mode always preserves the newline. |

The browser test seeds fixture text and preference values through the editor bridge, but the actions being evaluated—selection, typing, Return, Backspace, toolbar buttons, and checkbox toggles—are performed through the visible editor UI. This is not a cursor-only or single-character test.

## Not covered yet

- The browser matrix changes most preference values through the editor bridge rather than the Settings UI. The separate Android instrumentation case exercises the real Body soft-break and Lists wrapping switches, but it does not yet cover every list preference control, reset-state activation, or all-setting persistence.
- “Reload” resets the editor from the exact Markdown string. It is not a filesystem save, app close, and document reopen.
- Android WebView touch behavior, importing/exporting Markdown, HTML conversion, and round-trip fidelity across formats are separate suites.
- Wmdx-only marker variations, restart numbering, every task marker/state, non-empty-item Backspace behavior, and all interactions between lists and every other block type remain to be added.

Both suites have been authored but not run yet. A passing build alone is not a behavior pass; record the case count and inspect the uploaded screenshots/diagnostics after their first focused GitHub runs.
