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
