const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function makeDoc(source) {
  const lines = [];
  let from = 0;
  for (const [index, text] of source.split('\n').entries()) {
    lines.push({ number: index + 1, from, to: from + text.length, text });
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

test('block quote syntax is enabled by default and can be disabled app-wide', async () => {
  const {
    DEFAULT_BLOCKQUOTE_SYNTAX_SETTINGS,
    normalizeBlockquoteSyntaxSettings
  } = await import('../src/blockquoteSyntax.mjs');

  assert.deepEqual(
    normalizeBlockquoteSyntaxSettings(),
    DEFAULT_BLOCKQUOTE_SYNTAX_SETTINGS
  );
  assert.deepEqual(
    normalizeBlockquoteSyntaxSettings({
      pref_blockquote_syntax_enabled: false
    }),
    { enabled: false }
  );
});

test('the quote toolbar nests selected lines and Outdent removes one level', async () => {
  const {
    getBlockquoteNestingChanges,
    getBlockquoteOutdentChanges
  } = await import('../src/blockquoteSyntax.mjs');
  const source = '> Parent\n> Child\n> > Grandchild';
  const doc = makeDoc(source);
  const selection = {
    from: doc.line(2).from,
    to: doc.line(3).to
  };
  const apply = changes => {
    let result = source;
    for (const change of [...changes].reverse()) {
      result = result.slice(0, change.from) +
        change.insert +
        result.slice(change.to);
    }
    return result;
  };

  assert.equal(
    apply(getBlockquoteNestingChanges(doc, selection)),
    '> Parent\n> > Child\n> > > Grandchild'
  );

  const nested = '> > Child\n> > Grandchild';
  const nestedDoc = makeDoc(nested);
  assert.equal(
    applyChangesForTest(
      nested,
      getBlockquoteOutdentChanges(nestedDoc, {
        from: 0,
        to: nested.length
      })
    ),
    '> Child\n> Grandchild'
  );
});

test('a caret action nests or outdents only the current quoted paragraph', async () => {
  const {
    getBlockquoteNestingChanges,
    getBlockquoteOutdentChanges
  } = await import('../src/blockquoteSyntax.mjs');
  const source = '> Parent\n>\n> Child\n> continuation\n>\n> Sibling\nOutside';
  const doc = makeDoc(source);
  const nestedCaret = doc.line(3).from + 3;
  const caretSelection = { from: nestedCaret, to: nestedCaret };
  const paragraphLines = { first: 3, last: 4 };

  assert.equal(
    applyChangesForTest(
      source,
      getBlockquoteNestingChanges(doc, caretSelection, paragraphLines)
    ),
    '> Parent\n>\n> > Child\n> > continuation\n>\n> Sibling\nOutside'
  );

  assert.equal(
    applyChangesForTest(
      source,
      getBlockquoteOutdentChanges(doc, caretSelection, paragraphLines)
    ),
    '> Parent\n>\nChild\ncontinuation\n>\n> Sibling\nOutside'
  );
});

test('Return continues ordinary and nested blockquotes at their current depth', async () => {
  const { getBlockquoteEnterEdit } =
    await import('../src/blockquoteSyntax.mjs');

  const source = '> Outer\n> > Nested';
  const edit = getBlockquoteEnterEdit(source, {
    empty: true,
    head: source.length
  });
  assert.deepEqual(edit, {
    from: source.length,
    to: source.length,
    insert: '\n> > ',
    cursor: source.length + 5,
    exitsQuote: false
  });

  const splitSource = '> First second';
  const split = getBlockquoteEnterEdit(splitSource, {
    empty: true,
    head: splitSource.indexOf('second')
  });
  assert.equal(split.insert, '\n> ');
  assert.equal(split.from, splitSource.indexOf('second'));
});

test('Return on a blank nested quote exits one level; top-level exits fully', async () => {
  const { getBlockquoteEnterEdit } =
    await import('../src/blockquoteSyntax.mjs');

  const nestedSource = '> Outer\n> > ';
  const nested = getBlockquoteEnterEdit(nestedSource, {
    empty: true,
    head: nestedSource.length
  });
  assert.deepEqual(nested, {
    from: nestedSource.lastIndexOf('\n') + 1,
    to: nestedSource.length,
    insert: '> ',
    cursor: nestedSource.lastIndexOf('\n') + 3,
    exitsQuote: true
  });

  const outerSource = '> ';
  const outer = getBlockquoteEnterEdit(outerSource, {
    empty: true,
    head: outerSource.length
  });
  assert.equal(outer.insert, '');
  assert.equal(outer.cursor, 0);
  assert.equal(outer.exitsQuote, true);
});

test('block quote Return does not run inside code, tables, or before the marker', async () => {
  const { getBlockquoteEnterEdit } =
    await import('../src/blockquoteSyntax.mjs');
  const source = '> literal';
  const selection = { empty: true, head: source.length };

  assert.equal(
    getBlockquoteEnterEdit(source, selection, () => true),
    null
  );
  assert.equal(
    getBlockquoteEnterEdit(source, { empty: true, head: 0 }),
    null
  );
});

test('block quote setting is wired to typography preferences and editor behavior', () => {
  const preferenceXml = read('app/src/main/res/xml/preferences_styling_blockquotes.xml');
  const resetPreferences = read('app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt');
  const mainSource = read('web/src/main.js');

  assert.match(preferenceXml, /app:key="pref_blockquote_syntax_enabled"/);
  assert.match(resetPreferences, /key == "pref_blockquote_syntax_enabled" -> true/);
  assert.match(mainSource, /function handleBlockquoteEnter\(view, event\)/);
  assert.match(mainSource, /getBlockquoteEnterEdit\(/);
  assert.match(mainSource, /disabled: !isBlockquoteSyntaxEnabledNow\(\)/);
  assert.match(
    mainSource,
    /isBlockquoteSyntaxEnabledNow\(\) && parseAndMatchHotkey\(e, customHotkeys\.blockQuote\)/
  );
  assert.match(
    mainSource,
    /node\.name === 'QuoteMark'[\s\S]*?isBlockquoteSyntaxEnabledNow\(\)/
  );
  assert.match(mainSource, /getBlockquoteNestingChanges\(/);
  assert.match(mainSource, /getBlockquoteOutdentChanges\(/);
});

function applyChangesForTest(source, changes) {
  let result = source;
  for (const change of [...changes].reverse()) {
    result = result.slice(0, change.from) +
      change.insert +
      result.slice(change.to);
  }
  return result;
}
