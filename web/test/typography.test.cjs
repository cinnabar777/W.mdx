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
