# Jules follow-up after build `91b64e3`

This is one focused patch for the current `W.mdx` branch
`jules-3492949419147525921-af940c11`, currently at commit
`91b64e3fb17cb5e781fab5ab52c719b7853fb483`.

The user reports that scrolling and navigation are now much better and tables
are close. Preserve those improvements. The remaining observed issues are:

1. All heading levels appear the same size.
2. Pressing **Up** jumps over a horizontal rule; **Down** appears to work.

Do not reintroduce `persistentLayoutField` or whole-document raw-regex scans.
The latest fix correctly moved layout work away from the full-document field.
Keep the existing table rendering, reset controls, TOC-scroll containment,
toolbar, and WYSIWYG behavior unchanged.

## 1. Restore heading-level styling in the existing syntax-tree pass

### Why headings are now the same size

`web/index.html` already defines `.cm-heading-1` through `.cm-heading-6`, but
the latest `web/src/main.js` no longer assigns those classes. The prior
`persistentLayoutField` implementation that added `cm-heading` and the
level-specific class was removed, and the replacement `livePreviewPlugin`
does not currently add heading classes.

Add the following immediately after this existing line inside
`livePreviewPlugin`'s `tree.iterate({ ..., enter: (node) => { ... } })`:

```js
const line = view.state.doc.lineAt(node.from);
```

Add:

```js
// Give each Markdown heading its own CSS class. Keep this in the existing
// visible-range syntax-tree pass; do not scan the whole document with regex.
const atxHeading = /^ATXHeading([1-6])$/.exec(node.name);
const setextHeading = /^SetextHeading([12])$/.exec(node.name);
const headingLevel = atxHeading?.[1] ?? setextHeading?.[1];

if (headingLevel) {
  addLineClass(
    line.from,
    'cm-heading',
    `cm-heading-${headingLevel}`
  );
}
```

The parser node names are `ATXHeading1`…`ATXHeading6` for `#` headings and
`SetextHeading1`/`SetextHeading2` for underlined headings. The existing CSS
provides the typography settings; this code restores the classes it expects.
Apply the classes whether or not the caret is in the heading, so the size
doesn't change when editing it.

Do not change the heading CSS or preference-variable names for this repair.
Do not replace the syntax-tree implementation with regex styling; that can
mistake heading-looking text inside fenced code for actual headings.

## 2. Make one Up-arrow press stop on a horizontal-rule line

Add this helper and keymap near the existing `tableNavigationKeymap` in
`web/src/main.js`. `syntaxTree` and `keymap` are already imported/used there.

```js
function isHorizontalRuleLine(state, lineNumber) {
  const line = state.doc.line(lineNumber);
  let found = false;

  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (
        node.name === 'HorizontalRule' &&
        node.from >= line.from &&
        node.to <= line.to
      ) {
        found = true;
      }
    }
  });

  return found;
}

const horizontalRuleNavigationKeymap = keymap.of([
  {
    key: 'ArrowUp',
    run(view) {
      const selection = view.state.selection.main;
      if (!selection.empty) return false;

      const currentLine = view.state.doc.lineAt(selection.head);
      if (currentLine.number <= 1) return false;

      const previousLineNumber = currentLine.number - 1;
      if (!isHorizontalRuleLine(view.state, previousLineNumber)) return false;

      const horizontalRuleLine = view.state.doc.line(previousLineNumber);
      view.dispatch({
        selection: { anchor: horizontalRuleLine.from },
        scrollIntoView: false,
        userEvent: 'select.keyboard'
      });
      return true;
    }
  }
]);
```

Register it in the `EditorState.create({ extensions: [...] })` list before
`tableNavigationKeymap` and before the default keymap:

```js
horizontalRuleNavigationKeymap,
tableNavigationKeymap,
keymap.of([
  ...defaultKeymap,
  ...historyKeymap
])
```

This only intercepts Up when the immediately preceding document line is a
parsed horizontal rule. Other Up/Down behavior and selections remain with
CodeMirror's normal keymaps. Setting the caret on the rule line also lets the
existing `isNodeActive` logic reveal its Markdown syntax while it is active.
Do not add a global Up/Down override.

## Checks

- Build and run the existing test suite.
- Test `#` through `######` headings: each level must visibly use its own
  configured size; changing a heading's font/scale settings must still work.
- Test a Setext level-1 and level-2 heading if the app supports them.
- Confirm `# Heading` text inside a fenced code block remains code and does not
  receive heading styling.
- Place the caret in the first paragraph below a horizontal rule. One Up press
  should place it on the rule line; another Up should move to the preceding
  paragraph. Confirm Up elsewhere and Down still behave normally.
- Recheck the user's previous scrolling, navigation, and table cases to ensure
  they have not regressed.

The horizontal-rule key behavior is a targeted implementation to test on the
device; do not claim it is fixed until that test succeeds.
