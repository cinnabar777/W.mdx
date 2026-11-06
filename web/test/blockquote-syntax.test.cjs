const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

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
});
