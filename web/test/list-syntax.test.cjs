const test = require('node:test');
const assert = require('node:assert/strict');

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
