# Jules patch: make Up-arrow stop visibly on horizontal rules

Target: `cinnabar777/W.mdx`, branch
`jules-3492949419147525921-af940c11`, currently at `b9961bf`.

The user reports that heading sizing and general navigation are now acceptable,
scrolling is close to Obsidian, and only Up-arrow movement across a horizontal
rule is still wrong. Tables are unchanged; do not modify table code or broaden
this patch.

The current branch already has `horizontalRuleNavigationKeymap`, which puts
the caret at the start of a horizontal-rule line. However, the current
`isNodeActive` calculation deliberately disables active syntax in pure
WYSIWYG mode, so the `HorizontalRule` replacement still hides the rule text
when the caret is placed there. Also, `.cm-hr` uses CSS margins on a
CodeMirror line. Make the stop visible and use measured padding instead.

## 1. Reveal the HR source only while the caret is on it

In `web/src/main.js`, inside the `HorizontalRule` node branch, replace:

```js
if (node.name === 'HorizontalRule') {
  addLineClass(line.from, 'cm-hr');
  if (!isNodeActive) {
    builder.push(Decoration.replace({}).range(node.from, node.to));
  }
}
```

with:

```js
if (node.name === 'HorizontalRule') {
  addLineClass(line.from, 'cm-hr');

  // Pure WYSIWYG normally keeps Markdown syntax hidden even under the caret.
  // Let this one line reveal its source when the Up-arrow handler lands here,
  // so the caret has a visible position and can be moved away normally.
  const caretIsOnRule =
    selection.empty &&
    selection.head >= node.from &&
    selection.head <= node.to;

  if (!isNodeActive && !caretIsOnRule) {
    builder.push(Decoration.replace({}).range(node.from, node.to));
  }
}
```

Keep the existing `horizontalRuleNavigationKeymap` and its registration
unchanged for this test. Do not add a global ArrowUp/ArrowDown override.

## 2. Keep HR spacing inside the measured CodeMirror line box

In `web/index.html`, replace the existing `.cm-hr` rule with:

```css
.cm-content .cm-line.cm-hr {
  box-sizing: border-box !important;
  border-bottom: var(--hr-thickness, 2px) var(--hr-style, solid)
    var(--hr-color, #444444) !important;
  width: var(--hr-width, 100%) !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: var(--hr-margin-top, 16px) !important;
  padding-bottom: var(--hr-margin-bottom, 16px) !important;
}
```

The existing spacing preferences remain in effect, but padding contributes to
the line's measured box instead of placing the space outside it.

## Test

In WYSIWYG mode, place the caret in the first paragraph below an HR and press
Up once. The caret should visibly land on the HR source line; press Up again
to leave it. Press Down back through it. Repeat in live-preview mode and check
that the HR is hidden again after the caret leaves. Recheck the heading sizes,
tables, and scrolling without changing their implementation.

Do not report the issue fixed until Up and Down through the HR both pass on the
phone.
