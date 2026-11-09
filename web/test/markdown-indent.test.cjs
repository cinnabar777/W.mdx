const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function makeDoc(source) {
  const lines = [];
  let from = 0;
  for (const [number, text] of source.split('\n').entries()) {
    lines.push({ number: number + 1, from, to: from + text.length, text });
    from += text.length + 1;
  }
  return {
    length: source.length,
    lines: lines.length,
    line: number => lines[number - 1],
    lineAt: position => lines.find(line =>
      position >= line.from && position <= line.to
    ) || lines[lines.length - 1]
  };
}

function applyChanges(source, changes) {
  let result = source;
  for (const change of [...changes].reverse()) {
    result = result.slice(0, change.from) + change.insert + result.slice(change.to);
  }
  return result;
}

test('indent nests a selected list block under its preceding sibling', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '- parent\n- first\n- second\n- next';
  const doc = makeDoc(source);
  const changes = getMarkdownIndentChanges(
    doc,
    { from: doc.line(2).from, to: doc.line(3).to },
    'indent'
  );

  assert.equal(
    applyChanges(source, changes),
    '- parent\n  - first\n  - second\n- next'
  );
});

test('a Tab at the cursor nests only the current list item', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '- first\n- second\n- third';
  const doc = makeDoc(source);
  const cursor = doc.line(2).from + 4;
  const changes = getMarkdownIndentChanges(
    doc,
    { from: cursor, to: cursor },
    'indent'
  );

  assert.equal(
    applyChanges(source, changes),
    '- first\n  - second\n- third'
  );
});

test('indent uses the preceding ordered marker width for one nested level', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '10. parent\n1. child';
  const doc = makeDoc(source);
  const changes = getMarkdownIndentChanges(
    doc,
    { from: doc.line(2).from, to: doc.line(2).to },
    'indent'
  );

  assert.equal(applyChanges(source, changes), '10. parent\n    1. child');
});

test('indent recognizes alphabetic and multi-letter Roman Wmdx markers', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = 'I. parent\nII. child';
  const doc = makeDoc(source);
  const changes = getMarkdownIndentChanges(
    doc,
    { from: doc.line(2).from, to: doc.line(2).to },
    'indent'
  );

  assert.equal(applyChanges(source, changes), 'I. parent\n   II. child');
});

test('task-list checkboxes do not add extra columns to the nested indent', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '- [ ] parent\n- [ ] child';
  const doc = makeDoc(source);
  const changes = getMarkdownIndentChanges(
    doc,
    { from: doc.line(2).from, to: doc.line(2).to },
    'indent'
  );

  assert.equal(
    applyChanges(source, changes),
    '- [ ] parent\n  - [ ] child'
  );
});

test('list indentation can find a sibling across blank and wrapped lines', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '- parent\n\n  wrapped continuation\n- child';
  const doc = makeDoc(source);
  const changes = getMarkdownIndentChanges(
    doc,
    { from: doc.line(4).from, to: doc.line(4).to },
    'indent'
  );

  assert.equal(
    applyChanges(source, changes),
    '- parent\n\n  wrapped continuation\n  - child'
  );
});

test('indent does not turn an unparented root list into a code block', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '- first\n- second';
  const changes = getMarkdownIndentChanges(
    makeDoc(source),
    { from: 0, to: source.length },
    'indent'
  );

  assert.deepEqual(changes, []);
});

test('indent still inserts spaces for ordinary paragraph text', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = 'plain text';
  const changes = getMarkdownIndentChanges(
    makeDoc(source),
    { from: 0, to: source.length },
    'indent'
  );

  assert.equal(applyChanges(source, changes), '  plain text');
});

test('indent step preference selects one or two spaces and defaults to one', async () => {
  const {
    getMarkdownIndentChanges,
    getMarkdownIndentSpaces
  } = await import('../src/markdownIndent.js');
  assert.equal(getMarkdownIndentSpaces(undefined), ' ');
  assert.equal(getMarkdownIndentSpaces('1'), ' ');
  assert.equal(getMarkdownIndentSpaces('2'), '  ');
  assert.equal(getMarkdownIndentSpaces('invalid'), ' ');

  const source = 'plain text';
  const oneSpace = getMarkdownIndentSpaces('1');
  const twoSpaces = getMarkdownIndentSpaces('2');
  assert.equal(
    applyChanges(
      source,
      getMarkdownIndentChanges(
        makeDoc(source),
        { from: 0, to: source.length },
        'indent',
        oneSpace
      )
    ),
    ' plain text'
  );
  assert.equal(
    applyChanges(
      source,
      getMarkdownIndentChanges(
        makeDoc(source),
        { from: 0, to: source.length },
        'indent',
        twoSpaces
      )
    ),
    '  plain text'
  );
});

test('toolbar paragraph indentation moves all source lines and can create indented code', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { syntaxTree } = await import('@codemirror/language');
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  let source = 'first source line\nwrapped source line';

  source = applyChanges(
    source,
    getMarkdownIndentChanges(
      makeDoc(source),
      { from: 0, to: source.length },
      'indent'
    )
  );
  assert.equal(source, '  first source line\n  wrapped source line');
  const paragraphState = EditorState.create({
    doc: source,
    extensions: [markdown()]
  });
  assert.equal(syntaxTree(paragraphState).topNode.firstChild.name, 'Paragraph');

  const firstIndent = getMarkdownIndentChanges(
    makeDoc(source),
    { from: 0, to: source.length },
    'indent'
  );
  source = applyChanges(source, firstIndent);
  assert.equal(source, '    first source line\n    wrapped source line');

  const state = EditorState.create({
    doc: source,
    extensions: [markdown()]
  });
  assert.equal(syntaxTree(state).topNode.firstChild.name, 'CodeBlock');
});

test('a collapsed indent targets all source lines of the current paragraph', async () => {
  const {
    applyMarkdownIndent,
    getMarkdownIndentTargetSelection
  } = await import('../src/markdownIndent.js');
  const source = 'first source line\nwrapped source line\nnext paragraph';
  const doc = makeDoc(source);
  const cursor = doc.line(1).from + 5;
  const selection = { from: cursor, to: cursor, empty: true };
  const target = getMarkdownIndentTargetSelection(doc, selection, {
    first: 1,
    last: 2
  });
  const dispatches = [];
  const view = {
    state: {
      doc,
      selection: { main: selection, map: changes => changes },
      changes: changes => changes
    },
    dispatch: transaction => dispatches.push(transaction),
    focus() {}
  };

  applyMarkdownIndent(view, 'indent', '  ', { selection: target });
  assert.equal(
    applyChanges(source, dispatches[0].changes),
    '  first source line\n  wrapped source line\nnext paragraph'
  );
});

test('source wrapping keeps paragraph, quote, and list content aligned', async () => {
  const { getMarkdownSourceLineLayout } =
    await import('../src/markdownIndent.js');

  assert.deepEqual(
    getMarkdownSourceLineLayout('  indented paragraph'),
    { kind: 'paragraph', contentOffsetColumns: 2 }
  );
  assert.deepEqual(
    getMarkdownSourceLineLayout('>   quoted paragraph'),
    { kind: 'quote', contentOffsetColumns: 4 }
  );
  assert.deepEqual(
    getMarkdownSourceLineLayout('  10. [ ] nested item'),
    {
      kind: 'list',
      markerOffsetColumns: 2,
      contentOffsetColumns: 10
    }
  );
  assert.deepEqual(
    getMarkdownSourceLineLayout('[ ] task item'),
    {
      kind: 'list',
      markerOffsetColumns: 0,
      contentOffsetColumns: 4
    }
  );
  assert.equal(getMarkdownSourceLineLayout('ordinary paragraph'), null);
});

test('list continuation stays under its item text after a blank line is deleted', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { getMarkdownSourceLineLayoutForState } =
    await import('../src/markdownIndent.js');

  const continuedList = EditorState.create({
    doc: '1. item\nparagraph',
    extensions: [markdown()]
  });
  assert.deepEqual(
    getMarkdownSourceLineLayoutForState(continuedList, 2),
    {
      kind: 'list-continuation',
      contentOffsetColumns: 3,
      sourceOffsetColumns: 3
    }
  );
  const nestedListItems = EditorState.create({
    doc: '- parent\n  - child',
    extensions: [markdown()]
  });
  assert.deepEqual(
    getMarkdownSourceLineLayoutForState(nestedListItems, 2),
    {
      kind: 'list',
      markerOffsetColumns: 2,
      contentOffsetColumns: 4
    },
    'a nested list item must retain its own marker offset in Source'
  );
  const indentedContinuation = EditorState.create({
    doc: '1. item\n  paragraph',
    extensions: [markdown()]
  });
  assert.deepEqual(
    getMarkdownSourceLineLayoutForState(indentedContinuation, 2),
    {
      kind: 'list-continuation',
      contentOffsetColumns: 3,
      sourceOffsetColumns: 1
    }
  );
  const furtherIndentedContinuation = EditorState.create({
    doc: '1. item\n    paragraph',
    extensions: [markdown()]
  });
  assert.deepEqual(
    getMarkdownSourceLineLayoutForState(furtherIndentedContinuation, 2),
    {
      kind: 'list-continuation',
      contentOffsetColumns: 4,
      sourceOffsetColumns: 0
    }
  );

  const separateParagraph = EditorState.create({
    doc: '1. item\n\nparagraph',
    extensions: [markdown()]
  });
  assert.equal(
    getMarkdownSourceLineLayoutForState(separateParagraph, 3),
    null
  );

  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const renderedContinuationRule = html.match(
    /\.cm-content \.cm-line\.cm-list-continuation\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(renderedContinuationRule, 'rendered list continuation rule is missing');
  assert.match(
    renderedContinuationRule,
    /padding-left:\s*max\([\s\S]*?--list-continuation-offset/
  );
  assert.match(renderedContinuationRule, /text-indent:\s*0/);
  assert.doesNotMatch(html, /cm-source-list-(?:continuation|wrapped)/);
  assert.match(html, /--layout-visible-indent/);
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /markdownRenderPlan\(state\)\.lines\.values/);
  const shared = fs.readFileSync(path.join(__dirname, '../src/markdownDocumentLayout.js'), 'utf8');
  assert.match(shared, /entry\.kind = 'list-continuation'/);
});

test('rendered indented code moves shared leading spaces to every wrapped row', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { syntaxTree } = await import('@codemirror/language');
  const { getIndentedCodeBlockRenderLayout } =
    await import('../src/markdownIndent.js');

  const source = '     first\n      second';
  const state = EditorState.create({
    doc: source,
    extensions: [markdown()]
  });
  let codeBlockRange = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'CodeBlock') {
        codeBlockRange = { from: node.from, to: node.to };
      }
    }
  });
  assert.ok(codeBlockRange, 'indented source should parse as a code block');
  const layout = getIndentedCodeBlockRenderLayout(
    state,
    codeBlockRange.from,
    codeBlockRange.to
  );
  assert.deepEqual(layout, {
    hiddenRanges: [
      { from: 0, to: 5 },
      { from: 11, to: 16 }
    ],
    commonIndentColumns: 1
  });
  assert.equal(state.doc.sliceString(5, state.doc.line(1).to), 'first');
  assert.equal(state.doc.sliceString(16, state.doc.line(2).to), ' second');

  const fencedState = EditorState.create({
    doc: '```\n    fenced\n```',
    extensions: [markdown()]
  });
  let fencedBlockRange = null;
  syntaxTree(fencedState).iterate({
    enter(node) {
      if (node.name === 'FencedCode') {
        fencedBlockRange = { from: node.from, to: node.to };
      }
    }
  });
  assert.ok(fencedBlockRange);
  assert.deepEqual(
    getIndentedCodeBlockRenderLayout(
      fencedState,
      fencedBlockRange.from,
      fencedBlockRange.to
    ),
    { hiddenRanges: [], commonIndentColumns: 0 }
  );

  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const shared = fs.readFileSync(path.join(__dirname, '../src/markdownDocumentLayout.js'), 'utf8');
  assert.match(shared, /getIndentedCodeBlockRenderLayout\(state,\s*node\.from,\s*node\.to\s*\)/);
  assert.match(main, /renderPlan\.semantic\.codeBlocks/);
  assert.match(html, /padding-left:\s*calc\([\s\S]*?--code-block-common-indent/);
  assert.match(shared, /--code-block-common-indent:\$\{[^}]+}ch/);
  assert.match(main, /codeBlockLayout\.hiddenRanges/);
});

test('Backspace removes one indented-code source space at the visual start', async () => {
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { backspaceIndentedCodeBlockIndent } =
    await import('../src/markdownIndent.js');
  const view = {
    state: EditorState.create({
      doc: '    code',
      selection: EditorSelection.cursor(0),
      extensions: [markdown()]
    }),
    dispatch(transaction) {
      this.state = this.state.update(transaction).state;
    }
  };

  assert.equal(backspaceIndentedCodeBlockIndent(view), true);
  assert.equal(view.state.doc.toString(), '   code');
  assert.equal(view.state.selection.main.head, 0);
  assert.equal(backspaceIndentedCodeBlockIndent(view), false);

  const fencedView = {
    state: EditorState.create({
      doc: '```\n    code\n```',
      selection: EditorSelection.cursor(4),
      extensions: [markdown()]
    }),
    dispatch(transaction) {
      this.state = this.state.update(transaction).state;
    }
  };
  assert.equal(backspaceIndentedCodeBlockIndent(fencedView), false);

  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /indentedCodeBlockBackspaceKeymap/);
  assert.match(main, /currentEditorMode !== 'source'[\s\S]*backspaceIndentedCodeBlockIndent\(view\)/);
});

test('indent and outdent move a selected list item with its wrapped and nested lines', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = [
    '- parent',
    '- child',
    '  wrapped continuation',
    '  - nested child',
    '    nested continuation',
    '- next sibling'
  ].join('\n');
  const doc = makeDoc(source);
  const selection = {
    from: doc.line(2).from,
    to: doc.line(5).to
  };
  const indented = applyChanges(
    source,
    getMarkdownIndentChanges(doc, selection, 'indent')
  );
  assert.equal(indented, [
    '- parent',
    '  - child',
    '    wrapped continuation',
    '    - nested child',
    '      nested continuation',
    '- next sibling'
  ].join('\n'));

  const indentedDoc = makeDoc(indented);
  const outdented = applyChanges(
    indented,
    getMarkdownIndentChanges(
      indentedDoc,
      {
        from: indentedDoc.line(2).from,
        to: indentedDoc.line(5).to
      },
      'outdent'
    )
  );
  assert.equal(outdented, source);
});

test('a collapsed toolbar indent targets the complete parsed list item', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const {
    getMarkdownIndentChanges,
    getMarkdownIndentTargetSelection,
    getMarkdownListItemLineRange
  } = await import('../src/markdownIndent.js');
  const source = [
    '- parent',
    '- child',
    '  wrapped continuation',
    '  - nested child',
    '    nested continuation',
    '- next sibling'
  ].join('\n');
  const state = EditorState.create({
    doc: source,
    extensions: [markdown()]
  });
  const cursor = state.doc.line(2).from + 5;
  const range = getMarkdownListItemLineRange(state, cursor);
  assert.deepEqual(range, { first: 2, last: 5 });

  const selection = getMarkdownIndentTargetSelection(
    state.doc,
    { from: cursor, to: cursor, empty: true },
    range
  );
  assert.equal(
    applyChanges(
      source,
      getMarkdownIndentChanges(state.doc, selection, 'indent')
    ),
    [
      '- parent',
      '  - child',
      '    wrapped continuation',
      '    - nested child',
      '      nested continuation',
      '- next sibling'
    ].join('\n')
  );
});

test('a Wmdx ordered item cursor targets its wrapped and nested lines only', async () => {
  const { getWmdxOrderedListSequence } =
    await import('../src/listSyntax.mjs');
  const {
    getMarkdownIndentChanges,
    getMarkdownIndentTargetSelection,
    getWmdxOrderedListItemLineRange
  } = await import('../src/markdownIndent.js');
  const source = [
    'I. Parent',
    'II. Current item',
    '  continuation text',
    '  i. Nested item',
    '    nested continuation',
    'III. Next sibling'
  ].join('\n');
  const doc = makeDoc(source);
  const items = getWmdxOrderedListSequence(
    Array.from({ length: doc.lines }, (_, index) => doc.line(index + 1))
  );
  const cursor = doc.line(3).from + 4;
  const range = getWmdxOrderedListItemLineRange(doc, cursor, items);
  assert.deepEqual(range, { first: 2, last: 5 });

  const selection = getMarkdownIndentTargetSelection(
    doc,
    { from: cursor, to: cursor, empty: true },
    range
  );
  const indented = applyChanges(
    source,
    getMarkdownIndentChanges(doc, selection, 'indent')
  );
  assert.equal(indented, [
    'I. Parent',
    '   II. Current item',
    '     continuation text',
    '     i. Nested item',
    '       nested continuation',
    'III. Next sibling'
  ].join('\n'));

  const indentedDoc = makeDoc(indented);
  const indentedItems = getWmdxOrderedListSequence(
    Array.from(
      { length: indentedDoc.lines },
      (_, index) => indentedDoc.line(index + 1)
    )
  );
  const outdentRange = getWmdxOrderedListItemLineRange(
    indentedDoc,
    indentedDoc.line(3).from + 4,
    indentedItems
  );
  assert.deepEqual(outdentRange, { first: 2, last: 5 });
  const outdentedSelection = getMarkdownIndentTargetSelection(
    indentedDoc,
    {
      from: indentedDoc.line(3).from + 4,
      to: indentedDoc.line(3).from + 4,
      empty: true
    },
    outdentRange
  );
  assert.equal(
    applyChanges(
      indented,
      getMarkdownIndentChanges(indentedDoc, outdentedSelection, 'outdent')
    ),
    source
  );
});

test('selected list items move with each wrapped continuation line', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = [
    '- parent',
    '- first selected item',
    '  first continuation',
    '- second selected item',
    '  second continuation',
    '- next sibling'
  ].join('\n');
  const doc = makeDoc(source);
  const selection = {
    from: doc.line(2).from,
    to: doc.line(5).to
  };

  assert.equal(
    applyChanges(source, getMarkdownIndentChanges(doc, selection, 'indent')),
    [
      '- parent',
      '  - first selected item',
      '    first continuation',
      '  - second selected item',
      '    second continuation',
      '- next sibling'
    ].join('\n')
  );
});

test('Wmdx checkbox indentation moves the task and its continuation together', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '[ ] parent\n[ ] child\n  task continuation';
  const doc = makeDoc(source);
  const changes = getMarkdownIndentChanges(
    doc,
    { from: doc.line(2).from, to: doc.line(3).to },
    'indent'
  );

  assert.equal(
    applyChanges(source, changes),
    '[ ] parent\n    [ ] child\n      task continuation'
  );
});

test('source indentation counts paragraph and blockquote content spacing', async () => {
  const {
    getMarkdownSourceIndentColumns,
    getMarkdownSourceIndentRanges
  } =
    await import('../src/markdownIndent.js');

  assert.equal(getMarkdownSourceIndentColumns('  paragraph'), 2);
  assert.equal(getMarkdownSourceIndentColumns('>   quoted paragraph'), 2);
  assert.equal(getMarkdownSourceIndentColumns('  > quoted paragraph'), 2);
  assert.equal(getMarkdownSourceIndentColumns('> > nested quote'), 0);
  assert.equal(getMarkdownSourceIndentColumns('\tparagraph'), 4);
  assert.deepEqual(getMarkdownSourceIndentRanges('  paragraph'), [
    { from: 0, to: 2 }
  ]);
  assert.deepEqual(getMarkdownSourceIndentRanges('>   quoted paragraph'), [
    { from: 2, to: 4 }
  ]);
  assert.deepEqual(getMarkdownSourceIndentRanges('  >   nested paragraph'), [
    { from: 0, to: 2 },
    { from: 4, to: 6 }
  ]);
  assert.deepEqual(getMarkdownSourceIndentRanges('> > nested quote'), []);
});

test('outdent reduces nested indentation and removes a root list marker', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '  - nested\n  text\n- root';
  const changes = getMarkdownIndentChanges(
    makeDoc(source),
    { from: 0, to: source.length },
    'outdent'
  );

  assert.equal(applyChanges(source, changes), '- nested\ntext\nroot');
});

test('outdent removes ordered and checkbox list syntax at the root', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const source = '1. ordered\n- [ ] task\nplain text';
  const changes = getMarkdownIndentChanges(
    makeDoc(source),
    { from: 0, to: source.length },
    'outdent'
  );

  assert.equal(applyChanges(source, changes), 'ordered\ntask\nplain text');
});

test('a selection ending at the next line start does not indent that line', async () => {
  const { getMarkdownIndentChanges } = await import('../src/markdownIndent.js');
  const changes = getMarkdownIndentChanges(
    makeDoc('first\nsecond'),
    { from: 0, to: 6 },
    'indent'
  );

  assert.deepEqual(changes.map(change => change.from), [0]);
});

test('Tab and toolbar indent actions share the same Markdown-aware implementation', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
  assert.match(main, /export const markdownIndentKeymap = keymap\.of\([\s\S]*?key: 'Tab'[\s\S]*?applyEditorMarkdownIndent\(view, 'indent'\)/);
  assert.match(main, /key: 'Shift-Tab'[\s\S]*?applyEditorMarkdownIndent\(view, 'outdent'\)/);
  assert.match(
    main,
    /Prec\.highest\(\[\s*tableNavigationKeymap,\s*markdownIndentKeymap,\s*indentedCodeBlockBackspaceKeymap\s*\]\)/,
    'table navigation and list indentation must run before CodeMirror default Tab behavior'
  );
  assert.match(main, /cmdName === 'indent'\) \{\s*applyEditorMarkdownIndent\(view, 'indent', markdownIndentSpaces, editorCommandOptions\)/);
  assert.match(main, /cmdName === 'outdent'\) \{\s*applyEditorMarkdownIndent\(view, 'outdent', markdownIndentSpaces, editorCommandOptions\)/);
  assert.match(main, /spaces = markdownIndentSpaces/);
  assert.match(
    main,
    /markdownIndentSpaces = getMarkdownIndentSpaces\(\s*prefs\.pref_indent_step_spaces\s*\)/
  );
  assert.match(
    main,
    /getCurrentParagraphLineRange\(view\.state,\s*selection\.head,\s*\{\s*excludeListItems:\s*true\s*\}\)/
  );
  assert.match(main, /getMarkdownListItemLineRange,/);
  assert.match(
    main,
    /getMarkdownListItemLineRange\(view\.state,\s*selection\.head\)\s*\?\?/
  );
  assert.match(
    main,
    /getWmdxOrderedListItemLineRange\([\s\S]*?wmdxListItems/
  );
  assert.match(
    main,
    /getMarkdownRenderPlan\(state, mode, documentLayoutSettings\(\)\)/
  );
  assert.match(main, /selection:\s*indentSelection/);
  assert.match(
    main,
    /line\.dataset\.listMarkerMeasurementSignature === signature/
  );
  assert.match(
    main,
    /scheduleListMarkerMeasurements\(\s*update\.view,\s*typographyChanged\s*\)/
  );
  assert.match(
    main,
    /update\.selectionSet \|\|\s*update\.focusChanged \|\|\s*update\.viewportChanged \|\|\s*update\.geometryChanged/
  );
  assert.match(main, /semantic\.kind === 'paragraph' \|\| semantic\.kind === 'heading'/);
  assert.match(
    main,
    /const tabInEditor = e\.key === 'Tab' &&\s*activeAdapter\?\.view\?\.contentDOM\?\.contains\(e\.target\)/,
    'the global shortcut handler must leave editor Tab events to the prioritized editor keymap'
  );
  assert.match(
    main,
    /window\.addEventListener\('keydown', \(e\) => \{\s*if \(e\.defaultPrevented\) return;\s*const k =/,
    'global shortcuts must not run again after the editor keymap consumes Tab'
  );
});

test('the shared indent command dispatches mapped changes and consumes an empty outdent', async () => {
  const { applyMarkdownIndent } = await import('../src/markdownIndent.js');
  const doc = makeDoc('- item');
  const selection = { from: 0, to: 0 };
  const dispatches = [];
  let focused = false;
  const view = {
    state: {
      doc,
      selection: {
        main: selection,
        map: (changes, assoc) => ({ changes, assoc })
      },
      changes: changes => changes
    },
    dispatch: transaction => dispatches.push(transaction),
    focus: () => { focused = true; }
  };

  assert.equal(applyMarkdownIndent(view, 'outdent'), true);
  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0].changes, [{
    from: 0,
    to: 2,
    insert: ''
  }]);
  assert.equal(dispatches[0].selection.assoc, 1);
  assert.equal(focused, true);

  focused = false;
  assert.equal(
    applyMarkdownIndent(view, 'outdent', '  ', { preserveKeyboard: true }),
    true
  );
  assert.equal(focused, false, 'toolbar indentation does not reopen a closed keyboard');
});

test('the shared indent command retains two-space Markdown indentation', async () => {
  const { applyMarkdownIndent } = await import('../src/markdownIndent.js');
  const doc = makeDoc('plain text');
  const selection = { from: 0, to: doc.length };
  const dispatches = [];
  const view = {
    state: {
      doc,
      selection: {
        main: selection,
        map: changes => changes
      },
      changes: changes => changes
    },
    dispatch: transaction => dispatches.push(transaction),
    focus() {}
  };

  applyMarkdownIndent(view, 'indent', '  ');

  assert.deepEqual(dispatches[0].changes, [{
    from: 0,
    to: 0,
    insert: '  '
  }]);
});

test('indent and outdent update Wmdx numbering at each list depth', async () => {
  const { ChangeSet, EditorState } = await import('@codemirror/state');
  const { applyMarkdownIndent } = await import('../src/markdownIndent.js');
  const initial = 'I. Parent\nII. Child\nIII. Next child\nIV. Next parent';
  const doc = EditorState.create({ doc: initial }).doc;
  const selection = {
    from: doc.line(2).from,
    to: doc.line(3).to
  };
  const dispatches = [];
  const view = {
    state: {
      doc,
      selection: {
        main: selection,
        map: (changes, assoc) => ({ changes, assoc })
      },
      changes: changes => changes
    },
    dispatch: transaction => dispatches.push(transaction),
    focus: () => {}
  };

  applyMarkdownIndent(view, 'indent', '  ', { renumberWmdx: true });
  const changes = ChangeSet.of(dispatches[0].changes, doc.length);
  assert.equal(
    changes.apply(doc).toString(),
    'I. Parent\n   I. Child\n   II. Next child\nII. Next parent'
  );

  const nestedSource =
    'I. Parent\n  II. Child\n  III. Next child\nII. Next parent';
  const nestedDoc = EditorState.create({ doc: nestedSource }).doc;
  const nestedSelection = {
    from: nestedDoc.line(2).from,
    to: nestedDoc.line(3).to
  };
  const outdentDispatches = [];
  const outdentView = {
    state: {
      doc: nestedDoc,
      selection: {
        main: nestedSelection,
        map: (changes, assoc) => ({ changes, assoc })
      },
      changes: changes => changes
    },
    dispatch: transaction => outdentDispatches.push(transaction),
    focus: () => {}
  };
  applyMarkdownIndent(outdentView, 'outdent', '  ', { renumberWmdx: true });
  const outdentChanges = ChangeSet.of(
    outdentDispatches[0].changes,
    nestedDoc.length
  );
  assert.equal(
    outdentChanges.apply(nestedDoc).toString(),
    'I. Parent\nII. Child\nIII. Next child\nIV. Next parent'
  );
});

test('indent and outdent normalize Markdown decimal numbering by depth', async () => {
  const { ChangeSet, EditorState } = await import('@codemirror/state');
  const { applyMarkdownIndent } = await import('../src/markdownIndent.js');
  const source = '1. Parent\n2. Child\n3. Next child\n4. Next parent';
  const doc = EditorState.create({ doc: source }).doc;
  const selection = { from: doc.line(2).from, to: doc.line(3).to };
  const dispatches = [];
  const view = {
    state: {
      doc,
      selection: {
        main: selection,
        map: (changes, assoc) => ({ changes, assoc })
      },
      changes: changes => changes
    },
    dispatch: transaction => dispatches.push(transaction),
    focus: () => {}
  };

  applyMarkdownIndent(view, 'indent', '  ', { renumberMarkdown: true });
  const indentChanges = ChangeSet.of(dispatches[0].changes, doc.length);
  const nestedSource =
    '1. Parent\n   1. Child\n   2. Next child\n2. Next parent';
  assert.equal(indentChanges.apply(doc).toString(), nestedSource);

  const nestedDoc = EditorState.create({ doc: nestedSource }).doc;
  const outdentDispatches = [];
  const outdentView = {
    state: {
      doc: nestedDoc,
      selection: {
        main: { from: nestedDoc.line(2).from, to: nestedDoc.line(3).to },
        map: (changes, assoc) => ({ changes, assoc })
      },
      changes: changes => changes
    },
    dispatch: transaction => outdentDispatches.push(transaction),
    focus: () => {}
  };
  applyMarkdownIndent(outdentView, 'outdent', '  ', { renumberMarkdown: true });
  const outdentChanges = ChangeSet.of(
    outdentDispatches[0].changes,
    nestedDoc.length
  );
  assert.equal(outdentChanges.apply(nestedDoc).toString(), source);
});

test('indent does not normalize unrelated Wmdx lists elsewhere in the document', async () => {
  const { ChangeSet, EditorState } = await import('@codemirror/state');
  const { applyMarkdownIndent } = await import('../src/markdownIndent.js');
  const source = 'A. First\nA. Second\n\nParagraph';
  const doc = EditorState.create({ doc: source }).doc;
  const selection = { from: doc.line(4).from, to: doc.line(4).from };
  const dispatches = [];
  const view = {
    state: {
      doc,
      selection: {
        main: selection,
        map: (changes, assoc) => ({ changes, assoc })
      },
      changes: changes => changes
    },
    dispatch: transaction => dispatches.push(transaction),
    focus: () => {}
  };

  applyMarkdownIndent(view, 'indent', '  ', { renumberWmdx: true });
  const changeSet = ChangeSet.of(dispatches[0].changes, doc.length);
  assert.equal(
    changeSet.apply(doc).toString(),
    'A. First\nA. Second\n\n  Paragraph'
  );
});
