const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mainSource = fs.readFileSync(
  path.join(__dirname, '../src/main.js'),
  'utf8'
);

test('list syntax settings default to enabled Wmdx authoring with Markdown compatibility', async () => {
  const { normalizeListSyntaxSettings } = await import('../src/listSyntax.mjs');
  assert.deepEqual(normalizeListSyntaxSettings(), {
    enabled: true,
    markdown: true,
    gfmTasks: true,
    wmdx: true,
    authoringSyntax: 'wmdx',
    bulletMarker: '-',
    orderedStyle: 'decimal'
  });
});

test('list authoring follows the sole enabled flavor and stops when lists are disabled', async () => {
  const { normalizeListSyntaxSettings } = await import('../src/listSyntax.mjs');
  assert.equal(
    normalizeListSyntaxSettings({
      pref_list_syntax_markdown_enabled: false
    }).authoringSyntax,
    'wmdx'
  );
  assert.equal(
    normalizeListSyntaxSettings({
      pref_list_syntax_wmdx_enabled: false
    }).authoringSyntax,
    'markdown'
  );
  assert.equal(
    normalizeListSyntaxSettings({
      pref_list_syntax_enabled: false
    }).authoringSyntax,
    null
  );
});

test('list toolbar prefixes use the chosen bullet, numbering, and task syntax', async () => {
  const {
    getDefaultBulletPrefix,
    getDefaultOrderedPrefix,
    getDefaultTaskPrefix,
    normalizeListSyntaxSettings
  } = await import('../src/listSyntax.mjs');
  const wmdx = normalizeListSyntaxSettings({
    pref_list_default_bullet_marker: '+',
    pref_list_default_ordered_style: 'roman_lower'
  });
  assert.equal(getDefaultBulletPrefix(wmdx), '+ ');
  assert.equal(getDefaultOrderedPrefix(wmdx), 'i. ');
  assert.equal(getDefaultTaskPrefix(wmdx), '[ ] ');

  const markdown = normalizeListSyntaxSettings({
    pref_list_authoring_syntax: 'markdown',
    pref_list_default_bullet_marker: '*',
    pref_list_default_ordered_style: 'alpha_lower'
  });
  assert.equal(getDefaultBulletPrefix(markdown), '* ');
  assert.equal(getDefaultOrderedPrefix(markdown), '1. ');
  assert.equal(getDefaultTaskPrefix(markdown), '- [ ] ');
});

test('ordered Wmdx list markers auto-increment alphabetic and Roman labels', async () => {
  const {
    getOrderedMarkerLabel,
    parseWmdxOrderedListMarker
  } = await import('../src/listSyntax.mjs');
  assert.equal(getOrderedMarkerLabel('alpha_lower', 1), 'a.');
  assert.equal(getOrderedMarkerLabel('alpha_lower', 27), 'aa.');
  assert.equal(getOrderedMarkerLabel('alpha_upper', 2), 'B.');
  assert.equal(getOrderedMarkerLabel('roman_lower', 4), 'iv.');
  assert.equal(getOrderedMarkerLabel('roman_upper', 9), 'IX.');
  assert.deepEqual(
    parseWmdxOrderedListMarker('  i. Nested'),
    {
      marker: 'i.',
      markerFrom: 2,
      markerTo: 4,
      textFrom: 4,
      indent: 2,
      style: 'roman_lower',
      delimiter: '.'
    }
  );
  assert.equal(parseWmdxOrderedListMarker('inline a. text'), null);
});

test('selected lines receive a list prefix and matching prefixes toggle off together', async () => {
  const { getSelectedListPrefixChanges } = await import('../src/listSyntax.mjs');
  const lines = [
    { from: 0, text: 'First' },
    { from: 6, text: 'Second' },
    { from: 13, text: 'Third' }
  ];
  assert.deepEqual(getSelectedListPrefixChanges(lines, '- '), [
    { from: 0, to: 0, insert: '- ' },
    { from: 6, to: 6, insert: '- ' },
    { from: 13, to: 13, insert: '- ' }
  ]);

  const alreadyBulleted = [
    { from: 0, text: '- First' },
    { from: 8, text: '- Second' }
  ];
  assert.deepEqual(getSelectedListPrefixChanges(alreadyBulleted, '- '), [
    { from: 0, to: 2, insert: '' },
    { from: 8, to: 10, insert: '' }
  ]);
});

test('selected list conversion preserves quote and indentation prefixes', async () => {
  const { getSelectedListPrefixChanges } = await import('../src/listSyntax.mjs');
  assert.deepEqual(
    getSelectedListPrefixChanges([
      { from: 0, text: '> First' },
      { from: 8, text: '  I. Second' }
    ], '[ ] '),
    [
      { from: 2, to: 2, insert: '[ ] ' },
      { from: 10, to: 13, insert: '[ ] ' }
    ]
  );
});

test('list toolbar actions cover selected lines and custom markers refresh while typing', () => {
  const helperStart = mainSource.indexOf('function cmToggleSelectedListPrefix');
  const helperEnd = mainSource.indexOf('\nfunction cmToggleLinePrefix', helperStart);
  const selectedLineHelper = mainSource.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(selectedLineHelper, /getSelectedListLineNumbers\(doc, selection\)/);
  assert.match(mainSource, /cmdName === 'bulletedList'[\s\S]*?cmToggleSelectedListPrefix\(view, prefix\)/);
  assert.match(mainSource, /cmdName === 'numberedList'[\s\S]*?cmToggleSelectedListPrefix\(view, prefix\)/);
  assert.match(mainSource, /cmdName === 'todoList'[\s\S]*?cmToggleSelectedListPrefix\(view, prefix\)/);
  assert.equal(
    (mainSource.match(/linePattern: \/\^\[ \\t\]\*\(\?:\[aAiI\]\[\.\)\]\)\(\?:\[ \\t\]\|\$\)\//g) || []).length,
    2
  );
});

test('list selection includes every touched line without an unselected trailing line', async () => {
  const { EditorSelection, EditorState } = await import('@codemirror/state');
  const { getSelectedListLineNumbers } = await import('../src/listSyntax.mjs');
  const state = EditorState.create({ doc: 'First\nSecond\nThird' });
  const selection = range =>
    EditorSelection.create(Array.isArray(range) ? range : [range]);

  assert.deepEqual(
    getSelectedListLineNumbers(
      state.doc,
      selection(EditorSelection.range(0, 18))
    ),
    [1, 2, 3]
  );
  assert.deepEqual(
    getSelectedListLineNumbers(
      state.doc,
      selection(EditorSelection.range(0, 13))
    ),
    [1, 2]
  );
  assert.deepEqual(
    getSelectedListLineNumbers(
      state.doc,
      selection(EditorSelection.cursor(8))
    ),
    [2]
  );
});
