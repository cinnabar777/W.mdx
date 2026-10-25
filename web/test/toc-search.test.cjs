const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('TOC search matches heading text, keeps ancestor context, and counts document text', async () => {
  const { countDocumentText, findTocMatchRanges, getTocSearchState } = await import('../src/tocSearch.js');
  const items = [
    { level: 1, title: 'Guide' },
    { level: 2, title: 'Setup' },
    { level: 3, title: 'Install the app' },
    { level: 2, title: 'Reference' },
    { level: 3, title: 'Install plugins' }
  ];

  const search = getTocSearchState(items, 'install');
  assert.deepEqual([...search.matchingIndexes], [2, 4]);
  assert.deepEqual([...search.visibleIndexes].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  assert.deepEqual(
    [...getTocSearchState(items, 'reference').visibleIndexes].sort((a, b) => a - b),
    [0, 3]
  );
  assert.deepEqual(findTocMatchRanges('Heading heading', 'head'), [
    { from: 0, to: 4 },
    { from: 8, to: 12 }
  ]);
  assert.deepEqual(countDocumentText('A **bold**\n你好'), {
    words: 3,
    characters: 13
  });
});

test('TOC search is non-navigating, appears above history arrows, and has a resettable highlight color', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const preferences = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_toc.xml'),
    'utf8'
  );
  const resetPreferences = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
    'utf8'
  );

  const searchInputIndex = html.indexOf('id="toc-search-input"');
  const historyIndex = html.indexOf('id="toc-history-back"');
  assert.ok(searchInputIndex >= 0 && searchInputIndex < historyIndex);
  assert.ok(html.indexOf('id="toc-document-stats"') < html.indexOf('id="toc-document-name"'));
  assert.match(main, /tocSearchInput\.addEventListener\('input', \(\) => \{\s*applyTocCollapseState\(\);/);
  assert.match(main, /pref_toc_search_highlight_bg_color/);
  assert.match(html, /\.toc-search-match\s*\{[^}]*var\(--toc-search-highlight-bg-color/s);
  assert.match(
    preferences,
    /app:key="pref_toc_search_highlight_bg_color"[\s\S]*?app:defaultValue="#FFFFC107"/
  );
  assert.match(resetPreferences, /"pref_toc_search_highlight_bg_color" -> "#FFFFC107"/);
  assert.match(resetPreferences, /key == "pref_toc_search_highlight_bg_color" -> "#FFFFC107"/);
});
