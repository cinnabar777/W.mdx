# Jules handoff: repair visual caret navigation

## Current branch and evidence

Work on the active Jules branch at commit `a7764f2425281f14ee93d8c0b94e65b60845d173`. Do not switch branches or cherry-pick.

The Android debug build and the checked-in test suite pass, but caret navigation is still reported as bad. The current CodeMirror keymap installs `defaultKeymap` and `historyKeymap`; it has no general ArrowUp/ArrowDown handler. The earlier `horizontalRuleNavigationKeymap` was only a horizontal-rule special case and was removed in commit `b43b50f884ea679c835e49a62fd036fbcc95621c`.

The latest commit changed visual layout around cursor positions:

- Removed `line-height: 0` from `.cm-hidden-syntax`.
- Changed hidden Markdown link syntax from empty `Decoration.replace` ranges to `Decoration.mark` ranges using `.cm-hidden-syntax`.
- Changed fenced-code opening syntax to a mark while retaining a code-block header widget.

These are plausible layout/position-mapping contributors, not a confirmed root cause. The new navigation test only checks source strings and CSS; it does not move a caret in a rendered editor.

## Task

Fix actual CodeMirror caret movement through the rendered WYSIWYG document. Up and down must visit the visible text the user expects, including blank lines and formatted blocks. Preserve the normal CodeMirror preferred horizontal position when moving vertically, including through wrapped visual lines.

Investigate the rendered DOM and CodeMirror position geometry for hidden syntax and widgets. In particular, test `coordsAtPos`/`posAtCoords` and the positions around hidden link delimiters, headings, list markers, callout quote markers, code fences, and replaced widgets. Fix the decoration/layout mapping at its source where possible.

Do **not** add a document-line-number shortcut for ArrowUp/ArrowDown, a global key handler, or an HR-only workaround presented as a general navigation fix. Do not make unrelated changes to link insertion, tables, callouts, toolbar, settings, or scroll behavior.

## Required regression coverage

Add a test that exercises a real rendered `EditorView` and performs ArrowUp and ArrowDown; source-string assertions alone do not verify navigation. Cover both directions across:

- Consecutive paragraphs, blank lines, and lines containing only bold/italic text.
- Headings of different levels.
- Ordered and unordered lists, including wrapped list lines.
- Callout headers and bodies, including nested callouts.
- Code-block opening fence, first content line, remaining content, and closing fence.
- A horizontal rule.
- A link at the end of a paragraph and a link within a list item.

Assert that each move lands on the nearest expected visible text position, does not skip an intervening visible line, and retains the expected horizontal column when possible. Include a long wrapped line so visual-line movement is tested separately from document-line movement.

Retain the existing link-selection/table-cell fix and the currently working callout folding and rendering. Run the web regression suite and Android debug build.

## Completion criteria

- Explain the confirmed cause in terms of the actual decoration/layout or position-mapping behavior.
- The rendered-editor navigation regression test passes for up and down across the cases above.
- Existing tests and the Android debug build pass.
- No unrelated files or behaviors are changed.
