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
      ordinal: 1,
      delimiter: '.'
    }
  );
  assert.equal(
    parseWmdxOrderedListMarker('B. Second').style,
    'alpha_upper'
  );
  assert.equal(
    parseWmdxOrderedListMarker('B. Second').ordinal,
    2
  );
  assert.equal(
    parseWmdxOrderedListMarker('II. Second').style,
    'roman_upper'
  );
  assert.equal(
    parseWmdxOrderedListMarker('IV. Fourth').ordinal,
    4
  );
  assert.equal(
    parseWmdxOrderedListMarker('V. Fifth', 'roman_upper').ordinal,
    5
  );
  assert.equal(parseWmdxOrderedListMarker('inline a. text'), null);
});

test('ordered Wmdx numbering restarts at each indentation level', async () => {
  const {
    getOrderedListPrefixGenerator,
    getWmdxOrderedListMarkerChanges,
    getWmdxOrderedListSequence
  } = await import('../src/listSyntax.mjs');
  const source = [
    'I. Parent',
    '  II. Child',
    '    III. Grandchild',
    '  IV. Next child',
    'II. Next parent'
  ];
  let from = 0;
  const lines = source.map((text, index) => {
    const line = { from, to: from + text.length, number: index + 1, text };
    from = line.to + 1;
    return line;
  });
  const items = getWmdxOrderedListSequence(lines);
  assert.deepEqual(
    items.map(item => item.displayText),
    ['I.', 'I.', 'I.', 'II.', 'II.']
  );
  assert.deepEqual(
    getWmdxOrderedListMarkerChanges(lines),
    [
      { from: 12, to: 15, insert: 'I.' },
      { from: 26, to: 30, insert: 'I.' },
      { from: 44, to: 47, insert: 'II.' }
    ]
  );

  const prefix = getOrderedListPrefixGenerator('roman_upper');
  assert.deepEqual(
    source.map((text, index) => prefix(index, { text, number: index + 1 })),
    ['I. ', 'I. ', 'I. ', 'II. ', 'II. ']
  );
});

test('CommonMark ordered numbering follows indentation levels', async () => {
  const {
    getMarkdownOrderedListMarkerChanges,
    getMarkdownOrderedListSequence
  } = await import('../src/listSyntax.mjs');
  const source = [
    '1. Parent',
    '   2. Child',
    '   3. Next child',
    '      4. Grandchild',
    '      5. Next grandchild',
    '   6. Third child',
    '7. Next parent'
  ];
  let from = 0;
  const lines = source.map((text, index) => {
    const line = { from, to: from + text.length, number: index + 1, text };
    from = line.to + 1;
    return line;
  });

  assert.deepEqual(
    getMarkdownOrderedListSequence(lines).map(item => item.displayText),
    ['1.', '1.', '2.', '1.', '2.', '3.', '2.']
  );
  assert.deepEqual(
    getMarkdownOrderedListMarkerChanges(lines).map(change => change.insert),
    ['1.', '2.', '1.', '2.', '3.', '2.']
  );
});

test('pasted nested decimal lists are normalized in source by indentation', async () => {
  const { normalizeMarkdownOrderedListText } =
    await import('../src/listSyntax.mjs');
  const pasted = [
    '1. Parent',
    '   2. Child',
    '   3. Next child',
    '      4. Grandchild',
    '      5. Next grandchild',
    '   6. Third child',
    '7. Next parent'
  ].join('\n');

  assert.equal(
    normalizeMarkdownOrderedListText(pasted),
    [
      '1. Parent',
      '   1. Child',
      '   2. Next child',
      '      1. Grandchild',
      '      2. Next grandchild',
      '   3. Third child',
      '2. Next parent'
    ].join('\n')
  );
  assert.equal(
    normalizeMarkdownOrderedListText('1. First\n2. Second'),
    '1. First\n2. Second'
  );
});

test('Return continues Wmdx and GFM checkbox items and exits an empty item', async () => {
  const { getTaskListEnterEdit } = await import('../src/listSyntax.mjs');
  const cursor = (source, position = source.length) => ({
    from: position,
    to: position,
    head: position,
    empty: true
  });

  assert.deepEqual(
    getTaskListEnterEdit('[ ] First', cursor('[ ] First')),
    {
      from: 9,
      to: 9,
      insert: '\n[ ] ',
      cursor: 14,
      exitsList: false
    }
  );
  assert.deepEqual(
    getTaskListEnterEdit('- [x] Done', cursor('- [x] Done')),
    {
      from: 10,
      to: 10,
      insert: '\n- [ ] ',
      cursor: 17,
      exitsList: false
    }
  );
  assert.deepEqual(
    getTaskListEnterEdit('  [ ] ', cursor('  [ ] ')),
    {
      from: 0,
      to: 6,
      insert: '',
      cursor: 0,
      exitsList: true
    }
  );
  assert.equal(
    getTaskListEnterEdit('- [ ] Markdown task', cursor('- [ ] Markdown task'), (
      _lineText,
      match
    ) => !match[2]),
    null
  );
  assert.equal(
    getTaskListEnterEdit(
      '[ ] Wmdx task',
      cursor('[ ] Wmdx task'),
      () => false
    ),
    null
  );
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

  const numberedLines = [
    { from: 0, text: 'Neque magna' },
    { from: 13, text: 'nesciunt' },
    { from: 22, text: 'qui sint' }
  ];
  const numberedPrefix = index => `${index + 1}. `;
  assert.deepEqual(
    getSelectedListPrefixChanges(numberedLines, numberedPrefix),
    [
      { from: 0, to: 0, insert: '1. ' },
      { from: 13, to: 13, insert: '2. ' },
      { from: 22, to: 22, insert: '3. ' }
    ]
  );
  const alphabeticPrefix = index => `${String.fromCharCode(65 + index)}. `;
  assert.deepEqual(
    getSelectedListPrefixChanges(numberedLines, alphabeticPrefix),
    [
      { from: 0, to: 0, insert: 'A. ' },
      { from: 13, to: 13, insert: 'B. ' },
      { from: 22, to: 22, insert: 'C. ' }
    ]
  );
  const romanPrefix = index => `${['I', 'II', 'III'][index]}. `;
  assert.deepEqual(
    getSelectedListPrefixChanges(numberedLines, romanPrefix),
    [
      { from: 0, to: 0, insert: 'I. ' },
      { from: 13, to: 13, insert: 'II. ' },
      { from: 22, to: 22, insert: 'III. ' }
    ]
  );
  assert.deepEqual(
    getSelectedListPrefixChanges([
      { from: 0, text: '1. Neque magna' },
      { from: 16, text: '2. nesciunt' },
      { from: 28, text: '3. qui sint' }
    ], numberedPrefix),
    [
      { from: 0, to: 3, insert: '' },
      { from: 16, to: 19, insert: '' },
      { from: 28, to: 31, insert: '' }
    ]
  );
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
  assert.match(mainSource, /getDefaultOrderedStyle\(listSyntaxSettings\)/);
  assert.match(mainSource, /getOrderedListPrefixGenerator\(/);
  assert.match(mainSource, /getTaskListEnterEdit\(/);
  assert.match(mainSource, /handleCalloutEnter\(view, event\) \|\|[\s\S]*?handleTaskListEnter\(view, event\)/);
  assert.match(mainSource, /handleCalloutEnter\(view, event\) \|\|[\s\S]*?handleWmdxOrderedListEnter\(view, event\)/);
  // Syntax presentation retains its incremental structural guard. Shared
  // semantic layout is now rebuilt from the cached document model on edits.
  assert.match(mainSource, /linePattern: \/\^\[ \\t\]\*\[A-Za-z\]\+\[\.\)\]/);
  assert.match(mainSource, /return buildPersistentLayoutDecorations\(tr\.state\)/);
});

test('Return continues Wmdx alpha and Roman lists, and a blank item exits', async () => {
  const { getWmdxOrderedListEnterEdit } = await import('../src/listSyntax.mjs');
  const cursor = position => ({
    from: position,
    to: position,
    head: position,
    empty: true
  });

  assert.deepEqual(
    getWmdxOrderedListEnterEdit('A. First', cursor(8)),
    {
      from: 8,
      to: 8,
      insert: '\nB. ',
      cursor: 12,
      exitsList: false
    }
  );
  assert.deepEqual(
    getWmdxOrderedListEnterEdit('  > I. First', cursor(12)),
    {
      from: 12,
      to: 12,
      insert: '\n  > II. ',
      cursor: 21,
      exitsList: false
    }
  );
  const romanContinuation = 'IV. Fourth\nV. Fifth';
  assert.equal(
    getWmdxOrderedListEnterEdit(
      romanContinuation,
      cursor(romanContinuation.length)
    ).insert,
    '\nVI. '
  );
  const romanContinuationAfterBlank = 'IV. Fourth\n\nV. Fifth';
  assert.equal(
    getWmdxOrderedListEnterEdit(
      romanContinuationAfterBlank,
      cursor(romanContinuationAfterBlank.length)
    ).insert,
    '\nVI. '
  );
  const alphabeticContinuation = 'H. Eighth\nI. Ninth';
  assert.equal(
    getWmdxOrderedListEnterEdit(
      alphabeticContinuation,
      cursor(alphabeticContinuation.length)
    ).insert,
    '\nJ. '
  );
  const repeatedAlphabetic = 'A. First\nA. Second';
  assert.equal(
    getWmdxOrderedListEnterEdit(
      repeatedAlphabetic,
      cursor(repeatedAlphabetic.length)
    ).insert,
    '\nC. '
  );
  const repeatedRoman = 'I. First\nI. Second';
  assert.equal(
    getWmdxOrderedListEnterEdit(
      repeatedRoman,
      cursor(repeatedRoman.length)
    ).insert,
    '\nIII. '
  );
  assert.equal(
    getWmdxOrderedListEnterEdit('ii. Second', cursor(10)).insert,
    '\niii. '
  );
  assert.deepEqual(
    getWmdxOrderedListEnterEdit('i. ', cursor(3)),
    {
      from: 0,
      to: 3,
      insert: '',
      cursor: 0,
      exitsList: true
    }
  );
  const nestedContinuation = 'I. Parent\n  II. Child';
  assert.equal(
    getWmdxOrderedListEnterEdit(
      nestedContinuation,
      cursor(nestedContinuation.length)
    ).insert,
    '\n  II. '
  );
  assert.deepEqual(
    getWmdxOrderedListEnterEdit(
      'I. Parent\n  II. ',
      cursor('I. Parent\n  II. '.length)
    ),
    {
      from: 10,
      to: 16,
      insert: '',
      cursor: 10,
      exitsList: true
    }
  );
  assert.deepEqual(
    getWmdxOrderedListEnterEdit(
      'I. Parent\n  II. Child\n    III. ',
      cursor('I. Parent\n  II. Child\n    III. '.length)
    ),
    {
      from: 22,
      to: 31,
      insert: '  ',
      cursor: 24,
      exitsList: true
    }
  );
  assert.equal(
    getWmdxOrderedListEnterEdit('A. First', cursor(8), () => true),
    null
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
