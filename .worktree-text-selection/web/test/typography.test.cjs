const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');
const settingsSource = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'),
  'utf8'
);
const resetSource = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
  'utf8'
);

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

test('each heading-level rule outranks the global heading rule', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  assert.ok(indexHtml.includes('.cm-content .cm-heading {'), 'The global heading rule remains in place');
  for (let level = 1; level <= 6; level++) {
    assert.ok(
      indexHtml.includes(`.cm-content .cm-line.cm-heading-${level} {`),
      `H${level} uses a more specific selector than the global heading rule`
    );
  }
});

test('per-heading reset clears the override and inherits the matching global heading value', () => {
  const inheritedMappings = [
    ['scale_percent', 'pref_heading_scale_percent'],
    ['font_weight', 'pref_font_weight_heading'],
    ['color', 'pref_heading_color'],
    ['align', 'pref_heading_align'],
    ['line_height', 'pref_heading_line_height'],
    ['letter_spacing', 'pref_heading_letter_spacing'],
    ['word_spacing', 'pref_heading_word_spacing'],
    ['text_transform', 'pref_heading_text_transform'],
    ['underline_style', 'pref_heading_underline_style'],
    ['underline_thickness', 'pref_heading_underline_thickness'],
    ['underline_color', 'pref_heading_underline_color'],
    ['margin_left', 'pref_heading_margin_left'],
    ['margin_right', 'pref_heading_margin_right'],
    ['margin_top', 'pref_heading_margin_top'],
    ['margin_bottom', 'pref_heading_margin_bottom']
  ];

  for (const [suffix, globalKey] of inheritedMappings) {
    assert.ok(
      resetSource.includes(`"${suffix}" -> "${globalKey}"`),
      `Heading ${suffix} must inherit ${globalKey}`
    );
  }

  assert.match(resetSource, /if \(isHeadingOverride\) \{\s*prefs\.edit\(\)\.remove\(key\)\.apply\(\)/);
  assert.ok(settingsSource.includes('applyCustomLayouts(screen)'), 'Dynamic H1–H6 settings use the same compact row layout');
  assert.ok(settingsSource.includes('sharedPreferences.edit().remove(preference.key).apply()'), 'Inherited H-level scale values do not persist as overrides');
});

test('untouched per-heading defaults are migrated and are not saved as overrides', () => {
  assert.ok(
    resetSource.includes('fun migratePersistedHeadingDefaults'),
    'Existing generated heading defaults are cleaned up once'
  );
  assert.ok(
    resetSource.includes('pref_heading_override_defaults_migrated_v1'),
    'Heading-default migration runs only once'
  );
  assert.ok(
    settingsSource.includes('val hadStoredOverride = key != null && sharedPreferences.contains(key)'),
    'The settings screen distinguishes existing user values from generated defaults'
  );
  assert.ok(
    settingsSource.includes('generatedHeadingDefaults.forEach { remove(it) }'),
    'Newly generated heading defaults are removed after preference initialization'
  );
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
  assert.match(source, /if \(insideListItem\) \{\s*addLineClass\(line\.from, 'cm-list-item'\);/);
  assert.match(source, /export function scrollToPositionUpperMiddle/);
});

test('Margin preferences and CSS variable mappings are defined for all block elements', () => {
  const resetPrefs = fs.readFileSync(path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'), 'utf8');

  const marginKeys = [
    { key: 'pref_body_margin_left', default: 16 },
    { key: 'pref_body_margin_right', default: 16 },
    { key: 'pref_heading_margin_left', default: 0 },
    { key: 'pref_heading_margin_right', default: 0 },
    { key: 'pref_list_left_indent', default: 24 },
    { key: 'pref_list_right_margin', default: 0 },
    { key: 'pref_code_block_margin_left', default: 0 },
    { key: 'pref_code_block_margin_right', default: 0 },
    { key: 'pref_blockquote_left_indent', default: 0 },
    { key: 'pref_blockquote_right_margin', default: 0 },
    { key: 'pref_callout_margin_left', default: 0 },
    { key: 'pref_callout_margin_right', default: 0 },
    { key: 'pref_table_margin_left', default: 0 },
    { key: 'pref_table_margin_right', default: 0 },
    { key: 'pref_hr_margin_left', default: 0 },
    { key: 'pref_hr_margin_right', default: 0 },
    { key: 'pref_hr_centered', default: false },
    { key: 'pref_list_wrap_under_text', default: false }
  ];

  for (const m of marginKeys) {
    assert.ok(resetPrefs.includes(`key == "${m.key}" -> ${m.default}`), `ResetPreferences must set default for ${m.key}`);
  }

  // CSS Variable mappings in main.js
  assert.ok(source.includes("'--body-margin-left', prefs.pref_body_margin_left ?? 16, 'px'"));
  assert.ok(source.includes("'--body-margin-right', prefs.pref_body_margin_right ?? 16, 'px'"));
  assert.ok(source.includes("'--heading-margin-left', prefs.pref_heading_margin_left ?? 0, 'px'"));
  assert.ok(source.includes("'--heading-margin-right', prefs.pref_heading_margin_right ?? 0, 'px'"));
  assert.ok(source.includes("'--list-margin-right', prefs.pref_list_right_margin ?? 0, 'px'"));
  assert.ok(source.includes("'--code-block-margin-left', prefs.pref_code_block_margin_left ?? 0, 'px'"));
  assert.ok(source.includes("'--code-block-margin-right', prefs.pref_code_block_margin_right ?? 0, 'px'"));
  assert.ok(source.includes("'--blockquote-right-margin', prefs.pref_blockquote_right_margin ?? 0, 'px'"));
  assert.ok(source.includes("'--callout-margin-left', prefs.pref_callout_margin_left ?? 0, 'px'"));
  assert.ok(source.includes("'--callout-margin-right', prefs.pref_callout_margin_right ?? 0, 'px'"));
  assert.ok(source.includes("'--table-margin-left', prefs.pref_table_margin_left ?? 0, 'px'"));
  assert.ok(source.includes("'--table-margin-right', prefs.pref_table_margin_right ?? 0, 'px'"));
  assert.ok(source.includes("'--hr-margin-left', prefs.pref_hr_margin_left ?? 0, '%'"));
  assert.ok(source.includes("'--hr-margin-right', prefs.pref_hr_margin_right ?? 0, '%'"));
  assert.ok(source.includes("prefs.pref_hr_centered === true"));
  assert.ok(source.includes("prefs.pref_list_wrap_under_text === true"));
  assert.match(source, /scheduleListMarkerMeasurements\(\s*update\.view,/);

  // CSS rules in index.html
  assert.ok(indexHtml.includes('padding: 12px var(--body-margin-right, 16px) 12px var(--body-margin-left, 16px) !important;'));
  assert.ok(indexHtml.includes('margin-left: var(--heading-margin-left, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-right: var(--heading-margin-right, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-right: var(--list-margin-right, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-left: var(--code-block-margin-left, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-right: var(--code-block-margin-right, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-left: var(--blockquote-left-margin, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-right: var(--blockquote-right-margin, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-left: var(--callout-margin-left, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-right: var(--callout-margin-right, 0px) !important;'));
  assert.ok(indexHtml.includes('.cm-content .cm-blockquote:not(.cm-callout)'));
  assert.ok(indexHtml.includes('.cm-content .cm-paragraph-first.cm-callout'));
  assert.ok(indexHtml.includes('body.list-wrap-under-text .cm-content .cm-line.cm-list-item'));
  assert.ok(indexHtml.includes('.cm-list-block-text'));
  assert.ok(indexHtml.includes('display: flex !important;'));
  assert.ok(indexHtml.includes('align-items: flex-start !important;'));
  assert.ok(indexHtml.includes('flex: 1 1 0% !important;'));
  assert.ok(indexHtml.includes('.cm-content .cm-line.cm-callout:not(.cm-list-item)'));
  assert.ok(indexHtml.includes('.cm-content .cm-line.cm-callout-body:not(.cm-callout-list-item)'));
  assert.ok(indexHtml.includes('.cm-content .cm-line.cm-callout-list-item'));
  assert.ok(indexHtml.includes('text-indent: 0 !important;'));
  assert.ok(indexHtml.includes('body.hr-centered .cm-content .cm-line.cm-hr'));
  assert.ok(indexHtml.includes('margin-left: var(--table-margin-left, 0px) !important;'));
  assert.ok(indexHtml.includes('margin-right: var(--table-margin-right, 0px) !important;'));
  assert.ok(indexHtml.includes('var(--callout-depth-offset, 0px)'));
  assert.ok(indexHtml.includes('var(--callout-depth-offset, 0px) + var(--list-left-indent, 24px)'));
  assert.ok(indexHtml.includes('max-width: calc(100% - var(--hr-margin-left, 0%) - var(--hr-margin-right, 0%)) !important;'));

  const hrPreferences = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_hr.xml'),
    'utf8'
  );
  assert.match(hrPreferences, /app:key="pref_hr_margin_left"[\s\S]*?android:max="50"/);
  assert.match(hrPreferences, /app:key="pref_hr_margin_right"[\s\S]*?android:max="50"/);
  assert.match(hrPreferences, /app:key="pref_hr_centered"[\s\S]*?android:defaultValue="false"/);

  const listPreferences = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_lists.xml'),
    'utf8'
  );
  assert.match(listPreferences, /app:key="pref_list_wrap_under_text"[\s\S]*?android:defaultValue="false"/);
});
