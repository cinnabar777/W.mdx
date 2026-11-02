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
  assert.match(main, /export const markdownIndentKeymap = keymap\.of\([\s\S]*?key: 'Tab'[\s\S]*?applyMarkdownIndent\(view, 'indent'\)/);
  assert.match(main, /key: 'Shift-Tab'[\s\S]*?applyMarkdownIndent\(view, 'outdent'\)/);
  assert.match(
    main,
    /Prec\.highest\(\[tableNavigationKeymap,\s*markdownIndentKeymap\]\)/,
    'table navigation and list indentation must run before CodeMirror default Tab behavior'
  );
  assert.match(main, /cmdName === 'indent'\) \{\s*applyMarkdownIndent\(view, 'indent', '  ', editorCommandOptions\)/);
  assert.match(main, /cmdName === 'outdent'\) \{\s*applyMarkdownIndent\(view, 'outdent', '  ', editorCommandOptions\)/);
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
