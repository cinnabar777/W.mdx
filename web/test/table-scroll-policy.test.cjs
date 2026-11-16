const assert = require('node:assert/strict');
const test = require('node:test');

test('raw and syntax-exposed tables use the Source scrolling preference', async () => {
  const {
    getTableScrollSurface,
    getTableScrollPreferenceKey
  } = await import('../src/tableScrollPolicy.mjs');

  for (const mode of ['source', 'rendered']) {
    assert.equal(
      getTableScrollSurface({ mode, syntaxExposed: mode === 'rendered' }),
      'source'
    );
  }
  assert.equal(
    getTableScrollSurface({ mode: 'rendered', syntaxExposed: false }),
    'wysiwyg'
  );
  assert.equal(
    getTableScrollPreferenceKey('source'),
    'pref_table_scroll_source_enabled'
  );
  assert.equal(
    getTableScrollPreferenceKey('wysiwyg'),
    'pref_table_scroll_wysiwyg_enabled'
  );
});
