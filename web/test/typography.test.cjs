const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');

test('applyAllPreferences handles Android XML preference keys correctly', () => {
  assert.ok(source.includes('pref_body_font_size'), 'Missing pref_body_font_size');
  assert.ok(source.includes('pref_paragraph_line_height'), 'Missing pref_paragraph_line_height');
  assert.ok(source.includes('pref_letter_spacing'), 'Missing pref_letter_spacing');
  assert.ok(source.includes('pref_paragraph_align'), 'Missing pref_paragraph_align');
  assert.ok(source.includes('pref_paragraph_first_line_indent'), 'Missing pref_paragraph_first_line_indent');

  assert.ok(source.includes('pref_heading_scale_percent'), 'Missing pref_heading_scale_percent');
  assert.ok(source.includes('pref_font_weight_heading'), 'Missing pref_font_weight_heading');
  assert.ok(source.includes('pref_heading_align'), 'Missing pref_heading_align');
  assert.ok(source.includes('pref_heading_line_height'), 'Missing pref_heading_line_height');

  assert.ok(source.includes('pref_list_left_indent'), 'Missing pref_list_left_indent');
  assert.ok(source.includes('pref_todo_unchecked_color'), 'Missing pref_todo_unchecked_color');

  assert.ok(source.includes('pref_blockquote_line_thickness'), 'Missing pref_blockquote_line_thickness');
  assert.ok(source.includes('pref_table_border_thickness'), 'Missing pref_table_border_thickness');
  assert.ok(source.includes('pref_table_header_bg_color'), 'Missing pref_table_header_bg_color');

  assert.ok(source.includes('pref_hr_thickness'), 'Missing pref_hr_thickness');
  assert.ok(source.includes('pref_hr_width_percent'), 'Missing pref_hr_width_percent');
});

test('applyAllPreferences sets all required CSS variables', () => {
  const variables = [
    '--body-font-size',
    '--paragraph-line-height',
    '--paragraph-letter-spacing',
    '--paragraph-align',
    '--paragraph-indent',
    '--heading-scale',
    '--bold-color',
    '--italic-color',
    '--link-color',
    '--code-color',
    '--code-bg-color',
    '--list-left-indent',
    '--todo-border-color',
    '--todo-accent-color',
    '--blockquote-border-width',
    '--table-border-width',
    '--table-header-bg',
    '--table-cell-bg',
    '--code-block-color',
    '--code-block-bg-color',
    '--hr-thickness',
    '--hr-width'
  ];

  for (const v of variables) {
    assert.ok(source.includes(v), `Missing CSS variable mapping for ${v}`);
  }
});

const indexHtmlPath = path.join(__dirname, '../index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const paragraphSettingsPath = path.join(
  __dirname,
  '../../app/src/main/res/xml/preferences_styling_paragraph.xml'
);
const paragraphSettings = fs.readFileSync(paragraphSettingsPath, 'utf8');
const codeSettingsPath = path.join(
  __dirname,
  '../../app/src/main/res/xml/preferences_styling_code.xml'
);
const codeSettings = fs.readFileSync(codeSettingsPath, 'utf8');

test('paragraph and list typography selectors have matching editor line classes', () => {
  assert.match(source, /tree\.resolveInner\(probe, 1\)/);
  assert.match(source, /ancestor\.name === 'Paragraph'/);
  assert.match(source, /ancestor\.name === 'ListItem'/);
  assert.match(source, /addLineClass\(line\.from, 'cm-paragraph'\)/);
  assert.match(source, /addLineClass\(line\.from, 'cm-list-item'\)/);
  assert.match(source, /addLineClass\(line\.from, 'cm-paragraph-first'\)/);
  assert.match(source, /addLineClass\(line\.from, 'cm-paragraph-last'\)/);
  assert.match(indexHtml, /\.cm-content \.cm-paragraph:not\(\.cm-list-item\)/);
  assert.match(indexHtml, /\.cm-content \.cm-list-item/);
});

test('letter-spacing control is labeled as paragraph-only, not global', () => {
  assert.match(paragraphSettings, /app:key="pref_letter_spacing"/);
  assert.match(paragraphSettings, /app:title="Paragraph Letter Spacing \(px\)"/);
  assert.match(paragraphSettings, /Letter spacing for regular paragraph text only/);
  assert.doesNotMatch(paragraphSettings, /Global Letter Spacing/);
});

test('code blocks have a separate font-size preference and CSS variable', () => {
  assert.match(codeSettings, /app:key="pref_code_block_font_size"/);
  assert.match(codeSettings, /app:title="Code Block Text Size \(px\)"/);
  assert.match(source, /pref_code_block_font_size/);
  assert.match(source, /setCssVar\('--code-block-font-size', prefs\.pref_code_block_font_size, 'px'\)/);
  assert.match(indexHtml, /font-size:\s*var\(--code-block-font-size,\s*14px\)\s*!important/);
});

const cursorSettingsPath = path.join(
  __dirname,
  '../../app/src/main/res/xml/preferences_styling_cursor.xml'
);
const cursorSettings = fs.readFileSync(cursorSettingsPath, 'utf8');

test('cursor and selection styling page is configured', () => {
  assert.match(cursorSettings, /app:key="pref_cursor_color"/);
  assert.match(cursorSettings, /app:key="pref_cursor_width"/);
  assert.match(cursorSettings, /app:key="pref_selection_highlight_bg_color"/);
  assert.match(source, /setCssVar\('--cursor-color', prefs\.pref_cursor_color\)/);
  assert.match(source, /setCssVar\('--cursor-width', prefs\.pref_cursor_width, 'px'\)/);
});
