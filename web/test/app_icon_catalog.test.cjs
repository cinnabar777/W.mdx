const test = require('node:test');
const assert = require('node:assert/strict');

test('the available icon catalog includes every reusable app icon set', async () => {
  const [
    { APP_ICON_CHOICES },
    { audioControlIcons },
    { calloutTypeIcons },
    { findReplaceIcons },
    { TABLE_ACTIONS },
    { svgIcons }
  ] = await Promise.all([
    import('../src/appIconCatalog.js'),
    import('../src/audioControlIcons.js'),
    import('../src/calloutIcons.js'),
    import('../src/findReplaceIcons.js'),
    import('../src/tableActions.js'),
    import('../src/toolbarIcons.js')
  ]);
  const catalogMarkup = new Set(APP_ICON_CHOICES.map(choice => choice.markup));

  for (const icon of Object.values(svgIcons)) assert.ok(catalogMarkup.has(icon));
  for (const icon of Object.values(audioControlIcons)) assert.ok(catalogMarkup.has(icon));
  for (const icon of Object.values(calloutTypeIcons)) assert.ok(catalogMarkup.has(icon));
  for (const icon of Object.values(findReplaceIcons)) assert.ok(catalogMarkup.has(icon));
  for (const action of TABLE_ACTIONS) assert.ok(catalogMarkup.has(action.icon));
  assert.equal(new Set(APP_ICON_CHOICES.map(choice => choice.id)).size, APP_ICON_CHOICES.length);
  assert.ok(APP_ICON_CHOICES.every(choice => choice.markup.startsWith('<svg')));
});

test('the icon picker includes the requested text marks and replacement icons', async () => {
  const [{ APP_ICON_CHOICES }, { svgIcons }] = await Promise.all([
    import('../src/appIconCatalog.js'),
    import('../src/toolbarIcons.js')
  ]);
  const choicesById = new Map(APP_ICON_CHOICES.map(choice => [choice.id, choice]));
  const requestedLetters = [
    ['text-mdz-upper', 'MDZ'],
    ['text-mdz-lower', 'mdz'],
    ['text-mdzip-lower', 'mdzip'],
    ['text-mdzip-upper', 'MDZIP'],
    ['text-wmds-lower', 'wmds'],
    ['text-wmds-upper', 'WMDS'],
    ['text-w', 'W'],
    ['text-l', 'L'],
    ['text-s', 'S'],
    ['text-html-upper', 'HTML'],
    ['text-html-lower', 'html'],
    ['text-mhtml-upper', 'MHTML'],
    ['text-mhtml-lower', 'mhtml'],
    ['text-mht-upper', 'MHT'],
    ['text-mht-lower', 'mht'],
    ['text-sa-mixed', 'Sa'],
    ['text-s-lower', 's'],
    ['text-sa-lower', 'sa']
  ];

  for (const [id, text] of requestedLetters) {
    const choice = choicesById.get(id);
    assert.ok(choice, `missing ${text} icon`);
    assert.equal(choice.title, text);
    assert.ok(choice.markup.includes(`>${text}</text>`));
  }
  assert.match(svgIcons.clearFormatting, /M21 21H8/);
  assert.match(svgIcons.codeBlock, /m10 9-3 3 3 3/);
  assert.match(svgIcons.lineNumbers, /x1="10" x2="8"/);
  assert.ok(choicesById.get('pasteAsPlainTextClipboard')?.markup.includes('>pt</text>'));
  assert.ok(choicesById.get('plainTextPT')?.markup.includes('>PT</text>'));
  assert.ok(choicesById.get('toc-expand-collapse').markup.includes('<path d="M12 3v14"/>'));
});
