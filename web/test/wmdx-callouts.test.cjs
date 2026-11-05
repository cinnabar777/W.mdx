const assert = require('node:assert/strict');
const test = require('node:test');

test('native callouts parse titles, fold state, nested bodies, and dedent boundaries', async () => {
  const { parseWmdxCallouts } = await import('../src/wmdxCallouts.js');
  const source = [
    '±note Outer title',
    '  Outer paragraph.',
    '',
    '  ±tip- Inner title',
    '    Inner paragraph.',
    '  Back in the outer callout.',
    'Outside.'
  ].join('\n');
  const parsed = parseWmdxCallouts(source);

  assert.equal(parsed.openers.length, 2);
  assert.deepEqual(
    parsed.openers.map(({ info }) => [
      info.type,
      info.foldMarker,
      info.customTitle,
      info.depth
    ]),
    [
      ['note', null, 'Outer title', 1],
      ['tip', '-', 'Inner title', 2]
    ]
  );
  assert.deepEqual(
    parsed.openers.map(({ info }) => source.slice(info.markerStart, info.markerEnd)),
    ['±note', '±tip-']
  );
  assert.deepEqual(
    parsed.openers.map(({ info }) => source.slice(info.titleStart, info.titleStart + info.customTitle.length)),
    ['Outer title', 'Inner title']
  );
  assert.equal(
    source.slice(parsed.openers[0].info.bodyFrom, parsed.openers[0].info.bodyTo)
      .includes('Back in the outer callout.'),
    true
  );
  assert.equal(
    source.slice(parsed.openers[1].info.bodyFrom, parsed.openers[1].info.bodyTo),
    '\n    Inner paragraph.'
  );
  assert.equal(parsed.lineAttributes.has(source.indexOf('Outside.')), false);
});

test('native callouts retain paragraph gaps and hide only callout indentation', async () => {
  const { parseWmdxCallouts } = await import('../src/wmdxCallouts.js');
  const source = '  ±dropdown+\n    First paragraph.\n\n    Second paragraph.\n';
  const parsed = parseWmdxCallouts(source);
  const [opener] = parsed.openers;
  const firstBodyLine = source.indexOf('    First');
  const blankLine = source.indexOf('\n\n') + 1;
  const secondBodyLine = source.indexOf('    Second');

  assert.equal(opener.info.type, 'dropdown');
  assert.equal(opener.info.foldMarker, '+');
  assert.equal(parsed.lineAttributes.get(0).indentToHide, 2);
  assert.equal(parsed.lineAttributes.get(firstBodyLine).indentToHide, 4);
  assert.equal(parsed.lineAttributes.get(blankLine).type, 'dropdown');
  assert.equal(parsed.lineAttributes.get(secondBodyLine).indentToHide, 4);
});

test('empty callout title drafts stay editable until text is entered', async () => {
  const {
    isWmdxCalloutTitleDraftActive,
    parseWmdxCallouts
  } = await import('../src/wmdxCallouts.js');
  const source = '±note+ ';
  const info = parseWmdxCallouts(source).openers[0].info;

  assert.equal(info.customTitle, null);
  assert.equal(info.titleStart, source.length);
  assert.equal(
    isWmdxCalloutTitleDraftActive(
      { empty: true, head: source.length },
      info,
      source.length
    ),
    true
  );

  const markerOnly = parseWmdxCallouts('±note+').openers[0].info;
  assert.equal(
    isWmdxCalloutTitleDraftActive(
      { empty: true, head: '±note+'.length },
      markerOnly,
      '±note+'.length
    ),
    true
  );

  const completed = parseWmdxCallouts('±note+ Title').openers[0].info;
  assert.equal(
    isWmdxCalloutTitleDraftActive(
      { empty: true, head: 12 },
      completed,
      '±note+ Title'.length
    ),
    false
  );
});

test('Enter continues callout content and exits the current level on a blank line', async () => {
  const {
    getWmdxCalloutContinuationIndent,
    getWmdxCalloutEnterEdit,
    parseWmdxCallouts
  } = await import('../src/wmdxCallouts.js');
  const source = '±note Title\n  Body\n  ';

  assert.equal(
    getWmdxCalloutContinuationIndent(source, source.indexOf('Title')),
    2
  );
  assert.equal(
    getWmdxCalloutContinuationIndent(source, source.indexOf('Body')),
    2
  );
  assert.equal(
    getWmdxCalloutContinuationIndent(source, source.length),
    0
  );
  const firstReturn = getWmdxCalloutEnterEdit(source.slice(0, -3), {
    empty: true,
    from: source.length - 3,
    head: source.length - 3,
    to: source.length - 3
  });
  assert.equal(firstReturn.insert, '\n  ');
  assert.equal(firstReturn.exitsCurrentCallout, false);

  const blankReturn = getWmdxCalloutEnterEdit(source, {
    empty: true,
    from: source.length,
    head: source.length,
    to: source.length
  });
  assert.equal(blankReturn.from, source.lastIndexOf('\n') + 1);
  assert.equal(blankReturn.to, source.length);
  assert.equal(blankReturn.insert, '\n');
  assert.equal(blankReturn.exitsCurrentCallout, true);

  const nested = '±note Outer\n  ±tip Inner\n    Body';
  assert.equal(
    getWmdxCalloutContinuationIndent(nested, nested.indexOf('Inner')),
    4
  );
  assert.equal(
    getWmdxCalloutContinuationIndent(nested, nested.indexOf('Body')),
    4
  );
  assert.equal(
    getWmdxCalloutContinuationIndent(nested, nested.indexOf('Outer')),
    2
  );
  assert.equal(
    getWmdxCalloutContinuationIndent(nested, nested.indexOf('Body') + 4),
    4
  );
  assert.equal(getWmdxCalloutContinuationIndent('Outside', 3), null);

  const nestedBlank = `${nested}\n    `;
  assert.equal(
    getWmdxCalloutContinuationIndent(nestedBlank, nestedBlank.length),
    2
  );
  const nestedExit = getWmdxCalloutEnterEdit(nestedBlank, {
    empty: true,
    from: nestedBlank.length,
    head: nestedBlank.length,
    to: nestedBlank.length
  });
  assert.equal(nestedExit.insert, '\n  ');
  assert.equal(
    nestedBlank.slice(0, nestedExit.from) +
      nestedExit.insert +
      nestedBlank.slice(nestedExit.to),
    `${nested}\n\n  `
  );

  const outerBlank = `${nested}\n\n  `;
  const outerBlankLine = outerBlank.lastIndexOf('\n') + 1;
  const outerBlankAttributes = parseWmdxCallouts(outerBlank)
    .lineAttributes.get(outerBlankLine);
  assert.equal(outerBlankAttributes.depth, 1);
  assert.equal(
    getWmdxCalloutContinuationIndent(outerBlank, outerBlank.length),
    0
  );
});

test('callout-like markers in excluded code and table ranges are ignored', async () => {
  const { parseWmdxCallouts } = await import('../src/wmdxCallouts.js');
  const source = '±note Visible\n  Body\n\n±warning Hidden';
  const hiddenStart = source.indexOf('±warning');
  const parsed = parseWmdxCallouts(source, position => position >= hiddenStart);

  assert.deepEqual(parsed.openers.map(({ info }) => info.type), ['note']);
});
