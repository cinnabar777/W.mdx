const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const shortcuts = read('app/src/main/res/xml/preferences_styling.xml');
const main = read('web/src/main.js');
const styles = read('web/index.html');
const reset = read('app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt');
const settingsActivity = read('app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt');
const paragraph = read('app/src/main/res/xml/preferences_styling_paragraph.xml');
const lists = read('app/src/main/res/xml/preferences_styling_lists.xml');
const blocks = read('app/src/main/res/xml/preferences_styling_blockquotes.xml');
const tables = read('app/src/main/res/xml/preferences_styling_tables.xml');
const footnotes = read('app/src/main/res/xml/preferences_styling_footnotes.xml');
const tableWidget = read('web/src/tableWidget.js');

test('Typography pages keep headings and body first, then alphabetical element pages', () => {
  const keys = [...shortcuts.matchAll(/app:key="(pref_styling_page_[^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(keys, [
    'pref_styling_page_headings',
    'pref_styling_page_paragraph',
    'pref_styling_page_blockquotes',
    'pref_styling_page_bold',
    'pref_styling_page_callouts',
    'pref_styling_page_code',
    'pref_styling_page_cursor',
    'pref_styling_page_footnotes',
    'pref_styling_page_hr',
    'pref_styling_page_inline_code',
    'pref_styling_page_italic',
    'pref_styling_page_links',
    'pref_styling_page_lists',
    'pref_styling_page_tables'
  ]);
});

test('custom font pickers remain connected on the rearranged typography pages', () => {
  for (const fragmentName of [
    'StylingParagraphFragment',
    'StylingInlineElementFragment',
    'StylingCalloutsFragment'
  ]) {
    const start = settingsActivity.indexOf(`class ${fragmentName}`);
    assert.notEqual(start, -1, `${fragmentName} exists`);
    const nextClass = settingsActivity.indexOf('\nclass ', start + 1);
    const fragment = settingsActivity.slice(start, nextClass === -1 ? undefined : nextClass);
    assert.match(fragment, /configureFontPreferences\(\)/, `${fragmentName} configures custom font pickers`);
  }
});

test('Body typography exposes font weight, text color, and hyphenation', () => {
  for (const key of [
    'pref_body_font_weight',
    'pref_body_text_color',
    'pref_paragraph_hyphenate'
  ]) {
    assert.ok(paragraph.includes(`app:key="${key}"`), `${key} is configurable`);
    assert.ok(main.includes(key), `${key} is applied`);
  }
  for (const variable of [
    '--body-font-weight',
    '--body-text-color',
    '--paragraph-hyphens'
  ]) {
    assert.ok(main.includes(variable), `${variable} is set from preferences`);
    assert.ok(styles.includes(variable), `${variable} affects rendered text`);
  }
  assert.match(
    reset,
    /"pref_body_text_color", "pref_list_text_color" ->\s*if \(isLightTheme\) "#111111" else "#FFFFFF"/,
    'Default color swatches follow the active light or dark editor theme'
  );
});

test('List, block quote, callout, and table settings inherit body typography by default', () => {
  const pages = [
    { name: 'lists', xml: lists, scope: 'list' },
    { name: 'block quotes', xml: blocks, scope: 'blockquote' },
    { name: 'callouts', xml: blocks, scope: 'callout' },
    { name: 'tables', xml: tables, scope: 'table' }
  ];

  for (const page of pages) {
    const inheritKey = `pref_${page.scope}_inherit_body_typography`;
    assert.match(
      page.xml,
      new RegExp(`app:key="${inheritKey}"[\\s\\S]*?app:disableDependentsState="true"[\\s\\S]*?android:defaultValue="true"`),
      `${page.name} inherit body typography by default`
    );
    assert.match(
      reset,
      new RegExp(`key == "${inheritKey}" -> true`),
      `${page.name} reset restores inheritance`
    );
    const dependentKeys = page.scope === 'table'
      ? [
        'pref_table_font_family', 'pref_table_font_weight', 'pref_table_font_size',
        'pref_table_letter_spacing', 'pref_table_hyphenate', 'pref_table_line_height',
        'pref_table_header_text_color', 'pref_table_header_font_weight',
        'pref_table_cell_text_color'
      ]
      : [
        `pref_${page.scope}_font_family`, `pref_${page.scope}_font_weight`,
        `pref_${page.scope}_font_size`, `pref_${page.scope}_letter_spacing`,
        `pref_${page.scope}_text_color`, `pref_${page.scope}_text_align`,
        `pref_${page.scope}_hyphenate`, `pref_${page.scope}_line_height`
      ];
    for (const key of dependentKeys) {
      assert.match(
        page.xml,
        new RegExp(`app:key="${key}"[\\s\\S]{0,500}app:dependency="${inheritKey}"`),
        `${key} is disabled while the parent typography is inherited`
      );
    }
    assert.ok(main.includes(`pref_${page.scope}_font_family`), `${page.name} font family is applied`);
    assert.ok(main.includes(`pref_${page.scope}_font_weight`), `${page.name} font weight is applied`);
    assert.ok(main.includes(`pref_${page.scope}_font_size`), `${page.name} font size is applied`);
    assert.ok(main.includes(`pref_${page.scope}_letter_spacing`), `${page.name} letter spacing is applied`);
    assert.ok(main.includes(`--${page.scope}-hyphens`), `${page.name} hyphenation is applied`);
    assert.ok(main.includes(`--${page.scope}-line-height`), `${page.name} line height is applied`);
  }
});

test('Typography overrides reach rendered elements without renaming existing saved keys', () => {
  for (const variable of [
    '--list-font-family',
    '--list-text-color',
    '--list-text-align',
    '--blockquote-font-family',
    '--blockquote-text-color',
    '--callout-font-family',
    '--callout-text-color',
    '--table-font-family',
    '--table-cell-color'
  ]) {
    assert.ok(main.includes(variable), `${variable} receives preference values`);
  }
  for (const variable of [
    '--list-font-weight',
    '--blockquote-font-weight',
    '--callout-font-weight',
    '--table-font-weight',
    '--table-header-font-weight'
  ]) {
    assert.ok(styles.includes(variable) || tableWidget.includes(variable), `${variable} affects rendered text`);
  }

  for (const legacyKey of [
    'pref_blockquote_text_color',
    'pref_callout_text_color',
    'pref_table_cell_text_color',
    'pref_table_header_font_weight',
    'pref_footnote_inherit_body_typography'
  ]) {
    assert.ok(
      [blocks, tables, footnotes].some((xml) => xml.includes(`app:key="${legacyKey}"`)),
      `${legacyKey} remains available, preserving existing saved preferences`
    );
  }
  assert.match(tableWidget, /font-size:\s*var\(--table-font-size/);
  assert.match(tableWidget, /font-family:\s*var\(--table-font-family/);
});

test('system and custom font choices are available and connected across typography pages', () => {
  for (const [xml, preferenceKey] of [
    [blocks, 'pref_font_file_blockquote'],
    [blocks, 'pref_font_file_callout'],
    [lists, 'pref_font_file_list'],
    [tables, 'pref_font_file_table']
  ]) {
    assert.ok(xml.includes(`app:key="${preferenceKey}"`), `${preferenceKey} is available`);
    assert.ok(settingsActivity.includes(`"${preferenceKey}"`), `${preferenceKey} opens the font picker`);
  }

  for (const [xml, key] of [
    [paragraph, 'pref_body_font_family'],
    [blocks, 'pref_blockquote_font_family'],
    [blocks, 'pref_callout_font_family'],
    [lists, 'pref_list_font_family'],
    [tables, 'pref_table_font_family']
  ]) {
    assert.ok(xml.includes(`app:key="${key}"`), `${key} has a system-font selector`);
  }

  assert.match(settingsActivity, /key = prefix \+ "font_family"/);
  assert.match(main, /fontFamilies\[`heading\$\{level\}`\]/);
  assert.match(main, /fontFiles\.blockquote/);
  assert.match(main, /fontFiles\.callout/);
  assert.match(main, /fontFiles\.list/);
  assert.match(main, /fontFiles\.table/);
  assert.match(styles, /font-family:\s*var\(--code-block-font-family/);
  assert.match(main, /--italic-decoration-line/);
});
