const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('TOC headings use Markdown structure and ignore fenced code', async () => {
  const { extractTocHeadings } = await import('../src/tocHeadings.js');
  const markdown = [
    '# Overview',
    '',
    '## A *bold* heading ###',
    '',
    '```md',
    '# This is code, not a heading',
    '```',
    '',
    'Setext section',
    '--------------',
    '',
    '> ### Quoted heading',
    '',
    '#### Final section',
    '',
    '> Quoted section',
    '> --------------'
  ].join('\n');

  assert.deepEqual(extractTocHeadings(markdown), [
    { level: 1, title: 'Overview', lineIndex: 0 },
    { level: 2, title: 'A *bold* heading', lineIndex: 2 },
    { level: 2, title: 'Setext section', lineIndex: 8 },
    { level: 3, title: 'Quoted heading', lineIndex: 11 },
    { level: 4, title: 'Final section', lineIndex: 13 },
    { level: 2, title: 'Quoted section', lineIndex: 15 }
  ]);
});

test('TOC heading extraction handles empty text and CRLF line endings', async () => {
  const { extractTocHeadings } = await import('../src/tocHeadings.js');

  assert.deepEqual(extractTocHeadings(''), []);
  assert.deepEqual(extractTocHeadings('Text\r\n===\r\n'), [
    { level: 1, title: 'Text', lineIndex: 0 }
  ]);
});

test('TOC expansion controls are adjustable and reset to the H2, one-level defaults', () => {
  const preferencesXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_toc.xml'),
    'utf8'
  );
  const resetPreferences = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
    'utf8'
  );

  assert.match(
    preferencesXml,
    /app:key="pref_toc_default_level"[\s\S]*?app:min="1"[\s\S]*?android:max="6"[\s\S]*?app:defaultValue="2"/
  );
  assert.match(
    preferencesXml,
    /app:key="pref_toc_expand_levels_per_tap"[\s\S]*?app:min="1"[\s\S]*?android:max="5"[\s\S]*?app:defaultValue="1"/
  );
  assert.match(resetPreferences, /key == "pref_toc_default_level" -> 2/);
  assert.match(resetPreferences, /key == "pref_toc_expand_levels_per_tap" -> 1/);
});
