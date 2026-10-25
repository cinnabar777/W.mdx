const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const footnotePreferences = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_footnotes.xml'),
  'utf8'
);
const inlinePreferences = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_inline.xml'),
  'utf8'
);
const settingsActivity = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'),
  'utf8'
);
const mainActivity = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'),
  'utf8'
);

test('footnote parsing handles references, numbered definitions, and continued lines', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const markdown = 'A reference [^1].\n\n[^1]: First line\n    Second line';
  const parsed = parseFootnotes(markdown);

  assert.equal(parsed.references.length, 1);
  assert.equal(parsed.references[0].label, '1');
  assert.equal(parsed.definitions.length, 1);
  assert.equal(parsed.definitions[0].body, 'First line\nSecond line');
  assert.equal(
    markdown.slice(parsed.definitions[0].from, parsed.definitions[0].to),
    '[^1]: First line\n    Second line'
  );
});

test('footnote parser ignores references and definitions in code when given syntax ranges', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const markdown = 'Text [^1]\n\n[^1]: note\n\n```md\n[^2]: code\n```\n`[^1]`';
  const fenceStart = markdown.indexOf('```md');
  const fenceEnd = markdown.indexOf('\n```', fenceStart) + 4;
  const inlineStart = markdown.lastIndexOf('`[^1]`');
  const parsed = parseFootnotes(markdown, position =>
    (position >= fenceStart && position < fenceEnd) ||
    (position >= inlineStart && position < inlineStart + 6)
  );

  assert.deepEqual(parsed.definitions.map(definition => definition.label), ['1']);
  assert.equal(parsed.references.length, 1);
  assert.equal(parsed.references[0].label, '1');
});

test('footnote labels remain unique and multiline definitions use Markdown continuation indentation', async () => {
  const { formatFootnoteDefinition, nextFootnoteLabel } = await import('../src/footnotes.js');

  assert.equal(nextFootnoteLabel('Text [^1]\n\n[^1]: note\n[^3]: other'), '4');
  assert.equal(formatFootnoteDefinition('4', 'First line\nSecond line'), '[^4]: First line\n    Second line');
});

test('toolbar insertion opens the footnote dialog and all footnote settings reach rendered styles', () => {
  assert.match(source, /title: 'Insert Footnote', action: \(\) => openFootnoteInsertionDialog\(\)/);
  assert.match(source, /function openFootnoteInsertionDialog/);
  assert.match(source, /footnoteStateField/);
  assert.match(source, /--footnote-text-color/);
  assert.match(source, /setCssVar\('--footnote-bg-color', androidArgbToCss/);
  assert.match(source, /setCssVar\('--footnote-ref-color', androidArgbToCss/);
  assert.match(source, /setCssVar\('--footnote-link-color', androidArgbToCss/);
  assert.match(source, /setCssVar\(\s*'--footnote-font-size'/);
  assert.match(source, /--footnote-font-weight/);
  assert.match(source, /--footnote-letter-spacing/);
  assert.match(source, /--footnote-line-height/);
  assert.match(source, /--footnote-text-align/);
  assert.match(source, /--footnote-hyphens/);
  assert.match(html, /\.cm-footnote-reference/);
  assert.match(html, /\.cm-footnote-definition/);
  assert.match(html, /font-family: var\(--footnote-font-family/);
  assert.match(html, /font-weight: var\(--footnote-font-weight/);
  assert.match(html, /letter-spacing: var\(--footnote-letter-spacing/);
  assert.match(html, /line-height: var\(--footnote-line-height/);
  assert.match(html, /text-align: var\(--footnote-text-align/);
  assert.match(html, /hyphens: var\(--footnote-hyphens/);

  const navigationStart = source.indexOf('function navigateFootnote');
  const navigationEnd = source.indexOf('function restoreTocNavigationState', navigationStart);
  const navigationFunction = source.slice(navigationStart, navigationEnd);
  assert.match(navigationFunction, /recordTocNavigation\(view, targetPos\)/);
  assert.match(navigationFunction, /scrollToPositionUpperMiddle\(view, targetPos/);
  assert.match(source, /onNavigate: navigateFootnote/);
});

test('footnote typography has its own page and includes the planned overrides', () => {
  const footnoteKeys = [
    'pref_footnote_inherit_body_typography',
    'pref_font_file_footnote',
    'pref_footnote_font_weight',
    'pref_footnote_letter_spacing',
    'pref_footnote_font_size',
    'pref_footnote_text_color',
    'pref_footnote_text_align',
    'pref_footnote_line_height',
    'pref_footnote_hyphenate',
    'pref_footnote_ref_color',
    'pref_footnote_link_color',
    'pref_footnote_bg_color'
  ];
  for (const key of footnoteKeys) {
    assert.ok(footnotePreferences.includes(`app:key="${key}"`), `${key} is on the footnote page`);
    assert.ok(!inlinePreferences.includes(`app:key="${key}"`), `${key} is no longer under inline formats`);
  }
  assert.match(
    footnotePreferences,
    /app:key="pref_footnote_font_size"[\s\S]*?app:min="4"/,
    'footnote font size can be reduced to 4 px'
  );
  assert.match(footnotePreferences, /app:disableDependentsState="true"/);
  assert.match(settingsActivity, /"pref_styling_page_footnotes" -> StylingFootnotesFragment\(\)/);
  assert.match(settingsActivity, /"pref_font_file_footnote"/);
  assert.match(mainActivity, /pref_font_file_footnote_path/);
  assert.match(mainActivity, /pref_footnote_inherit_body_typography/);
});
