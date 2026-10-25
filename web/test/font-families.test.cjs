const test = require('node:test');
const assert = require('node:assert/strict');

test('installed font family names are quoted safely for CSS', async () => {
  const { toCssFontFamily } = await import('../src/fontFamilies.js');

  assert.equal(toCssFontFamily('Noto Sans'), '"Noto Sans"');
  assert.equal(toCssFontFamily('sans-serif'), 'sans-serif');
  assert.equal(toCssFontFamily('var(--body-font-family, inherit)'), 'var(--body-font-family, inherit)');
  assert.equal(toCssFontFamily('default'), null);
  assert.equal(toCssFontFamily('A "Quoted" Family'), '"A \\"Quoted\\" Family"');
});
