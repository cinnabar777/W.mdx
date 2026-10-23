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

test('Wikilinks rendering and refined link styling rules in main.js and index.html', () => {
  // Regex pattern test for wikilinks
  const wikilinkRegex = /(?<!\!)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

  const testCases = [
    { input: '[[Target]]', target: 'Target', alias: undefined },
    { input: '[[Target|Alias]]', target: 'Target', alias: 'Alias' },
    { input: '[[#Heading]]', target: '#Heading', alias: undefined },
    { input: '[[File#Heading]]', target: 'File#Heading', alias: undefined },
    { input: '[[File#Heading|Custom Alias]]', target: 'File#Heading', alias: 'Custom Alias' }
  ];

  for (const tc of testCases) {
    wikilinkRegex.lastIndex = 0;
    const match = wikilinkRegex.exec(tc.input);
    assert.ok(match, `Failed to match wikilink: ${tc.input}`);
    assert.equal(match[1], tc.target, `Target mismatch for ${tc.input}`);
    assert.equal(match[2], tc.alias, `Alias mismatch for ${tc.input}`);
  }

  // Embed exclusion check
  const embedInput = '![[EmbedImage.png]]';
  wikilinkRegex.lastIndex = 0;
  const embedMatch = wikilinkRegex.exec(embedInput);
  assert.equal(embedMatch, null, '![[...]] embeds must not be matched as text wikilinks');

  // Verify main.js contains wikilink decoration
  assert.ok(source.includes('cm-wikilink'), 'main.js applies cm-wikilink decoration class');

  // Verify index.html contains link refinements
  assert.ok(indexHtml.includes('text-underline-offset: 3px !important;'), 'index.html includes text-underline-offset');
  assert.ok(indexHtml.includes('text-decoration-skip-ink: auto !important;'), 'index.html includes text-decoration-skip-ink');
  assert.ok(indexHtml.includes('cursor: pointer !important;'), 'index.html includes cursor pointer');
});

test('Link underline thickness and dialog insertion helpers in main.js and XML preferences', () => {
  const inlineSettingsPath = path.join(
    __dirname,
    '../../app/src/main/res/xml/preferences_styling_inline.xml'
  );
  const inlineSettings = fs.readFileSync(inlineSettingsPath, 'utf8');

  assert.match(inlineSettings, /app:key="pref_link_underline_thickness"/);
  assert.match(source, /pref_link_underline_thickness/);
  assert.match(source, /--link-decoration-thickness/);
  assert.match(indexHtml, /text-decoration-thickness:\s*var\(--link-decoration-thickness,\s*1px\)\s*!important/);

  assert.match(source, /export function cleanHeadingText/);
  assert.match(source, /export function scrollToHeading/);
  assert.match(source, /export function getDocumentHeadings/);
  assert.match(source, /export function openLinkInsertionDialog/);
  assert.match(source, /export function openCalloutInsertionDialog/);
});

test('Heading links inside lists and upper-middle scroll helper', () => {
  assert.match(source, /if \(insideListItem\) \{\s*addLineClass\(line\.from, 'cm-list-item'\);\s*\}/);
  assert.match(source, /export function scrollToPositionUpperMiddle/);
});
