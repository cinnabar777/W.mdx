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

test('footnote syntax settings cover Wmdx, shared Markdown, and Obsidian inline', async () => {
  const {
    DEFAULT_FOOTNOTE_SYNTAX_SETTINGS,
    isFootnoteAuthoringAvailable,
    isFootnoteFlavorEnabled,
    normalizeFootnoteSyntaxSettings
  } = await import('../src/footnoteSyntax.mjs');
  const resetPreferences = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
    'utf8'
  );
  const arrays = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/values/arrays.xml'),
    'utf8'
  );

  assert.deepEqual(normalizeFootnoteSyntaxSettings(), {
    ...DEFAULT_FOOTNOTE_SYNTAX_SETTINGS
  });
  assert.equal(
    normalizeFootnoteSyntaxSettings({
      pref_footnote_authoring_syntax: 'obsidian_inline'
    }).authoringSyntax,
    'obsidian_inline'
  );
  const onlyMarkdown = normalizeFootnoteSyntaxSettings({
    pref_footnote_syntax_wmdx_enabled: false,
    pref_footnote_syntax_obsidian_inline_enabled: false,
    pref_footnote_authoring_syntax: 'wmdx'
  });
  assert.equal(onlyMarkdown.authoringSyntax, 'markdown');
  assert.equal(isFootnoteFlavorEnabled(onlyMarkdown, 'markdown'), true);
  assert.equal(isFootnoteFlavorEnabled(onlyMarkdown, 'wmdx'), false);
  const disabled = normalizeFootnoteSyntaxSettings({
    pref_footnote_syntax_enabled: false
  });
  assert.equal(isFootnoteAuthoringAvailable(disabled), false);
  assert.equal(isFootnoteFlavorEnabled(disabled, 'obsidian_inline'), false);

  for (const key of [
    'pref_footnote_syntax_enabled',
    'pref_footnote_syntax_wmdx_enabled',
    'pref_footnote_syntax_markdown_enabled',
    'pref_footnote_syntax_obsidian_inline_enabled',
    'pref_footnote_authoring_syntax'
  ]) {
    assert.ok(footnotePreferences.includes(key), `settings define ${key}`);
  }
  assert.match(arrays, /name="footnote_authoring_syntax_values"[\s\S]*?<item>wmdx<\/item>[\s\S]*?<item>markdown<\/item>[\s\S]*?<item>obsidian_inline<\/item>/);
  assert.match(settingsActivity, /pref_footnote_authoring_syntax/);
  assert.match(resetPreferences, /pref_footnote_authoring_syntax" -> "wmdx"/);
  assert.match(source, /normalizeFootnoteSyntaxSettings\(prefs\)/);
});

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

test('native footnotes auto-number new notes and reuse existing numbers', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = [
    'First note.^',
    'Reuse the first note.^1',
    'Second note.^',
    '',
    '^ First definition.',
    '^ Second definition.',
    '',
    'Superscript ^text^ and ^2^; escaped \\^.'
  ].join('\n');
  const parsed = parseFootnotes(source);

  assert.deepEqual(
    parsed.references.map(reference => [reference.label, reference.syntax]),
    [['1', 'wmdx'], ['1', 'wmdx'], ['2', 'wmdx']]
  );
  assert.deepEqual(
    parsed.definitions.map(definition => [definition.label, definition.body]),
    [['1', 'First definition.'], ['2', 'Second definition.']]
  );
});

test('native multiline footnotes retain continuations and automatic numbering skips reused numbers', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = [
    'First note.^',
    'Reuse note two.^2',
    'Third note.^',
    '',
    '^ First definition.',
    '^ Second definition.',
    '^ Third definition.',
    '  Continued definition line.'
  ].join('\n');
  const parsed = parseFootnotes(source);

  assert.deepEqual(
    parsed.references.map(reference => reference.label),
    ['1', '2', '3']
  );
  assert.deepEqual(
    parsed.definitions.map(definition => [definition.label, definition.body]),
    [
      ['1', 'First definition.'],
      ['2', 'Second definition.'],
      ['3', 'Third definition.\nContinued definition line.']
    ]
  );
});

test('Obsidian inline footnotes become numbered references with editable notes', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = 'First ^[inline note], then ^[nested [note] text].';
  const parsed = parseFootnotes(source);

  assert.deepEqual(
    parsed.references.map(reference => [reference.label, reference.syntax]),
    [['1', 'obsidian_inline'], ['2', 'obsidian_inline']]
  );
  assert.deepEqual(
    parsed.definitions.map(definition => [
      definition.label,
      definition.body,
      definition.syntax,
      source.slice(definition.from, definition.to),
      definition.renderAt
    ]),
    [
      ['1', 'inline note', 'obsidian_inline', '^[inline note]', source.length],
      ['2', 'nested [note] text', 'obsidian_inline', '^[nested [note] text]', source.length]
    ]
  );
});

test('Obsidian inline footnotes ignore escaped markers, code, and tables', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = [
    String.raw`Escaped \^[not a note].`,
    'Real ^[note].',
    '',
    '`^[inline code]`',
    '',
    'Table ^[table text]'
  ].join('\n');
  const codeStart = source.indexOf('`^[inline code]`');
  const codeEnd = codeStart + '`^[inline code]`'.length;
  const tableStart = source.indexOf('Table');
  const parsed = parseFootnotes(
    source,
    position => position >= codeStart && position < codeEnd,
    () => false,
    position => position >= tableStart,
  );

  assert.deepEqual(
    parsed.definitions.map(definition => definition.body),
    ['note']
  );
  assert.deepEqual(
    parsed.references.map(reference => reference.label),
    ['1']
  );
});

test('inline Wmdx and Obsidian footnotes remain distinct when mixed', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = [
    'Inline note ^[first note].',
    'Wmdx note.^',
    '',
    '^ Wmdx definition.'
  ].join('\n');
  const parsed = parseFootnotes(source);

  assert.deepEqual(
    parsed.references.map(reference => [reference.label, reference.syntax]),
    [['1', 'obsidian_inline'], ['2', 'wmdx']]
  );
  assert.deepEqual(
    parsed.definitions.map(definition => [definition.label, definition.body]),
    [['1', 'first note'], ['2', 'Wmdx definition.']]
  );
});

test('footnote flavor switches independently gate editor parsing', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = [
    'Wmdx.^ Markdown [^md]. Inline ^[note].',
    '',
    '^ Wmdx definition.',
    '[^md]: Markdown definition.'
  ].join('\n');
  const wmdxOnly = parseFootnotes(source, () => false, () => false, () => false, {
    syntaxSettings: {
      pref_footnote_syntax_wmdx_enabled: true,
      pref_footnote_syntax_markdown_enabled: false,
      pref_footnote_syntax_obsidian_inline_enabled: false
    }
  });
  assert.deepEqual(
    wmdxOnly.references.map(reference => reference.syntax),
    ['wmdx']
  );
  assert.deepEqual(
    wmdxOnly.definitions.map(definition => definition.syntax),
    ['wmdx']
  );

  const allDisabled = parseFootnotes(source, () => false, () => false, () => false, {
    syntaxSettings: { pref_footnote_syntax_enabled: false }
  });
  assert.deepEqual(allDisabled, { definitions: [], references: [] });
});

test('new native notes continue imported numbering and reserve later explicit references', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = [
    'New note.^',
    'Reuse one.^1',
    'Reuse two.^2',
    'Reuse three.^3',
    '',
    '[^1]: First imported definition',
    '[^2]: Second imported definition',
    '[^3]: Third imported definition',
    '^ New native definition'
  ].join('\n');
  const parsed = parseFootnotes(source);

  assert.deepEqual(
    parsed.references.map(reference => reference.label),
    ['4', '1', '2', '3']
  );
  assert.deepEqual(
    parsed.definitions.map(definition => [definition.label, definition.syntax]),
    [
      ['1', 'markdown'],
      ['2', 'markdown'],
      ['3', 'markdown'],
      ['4', 'wmdx']
    ]
  );

  const nativeSource = [
    'New note.^',
    'Reuse one.^1',
    'Reuse two.^2',
    'Reuse three.^3',
    '',
    '^ First definition',
    '^ Second definition',
    '^ Third definition',
    '^ New definition'
  ].join('\n');
  const nativeParsed = parseFootnotes(nativeSource);
  assert.deepEqual(
    nativeParsed.references.map(reference => reference.label),
    ['4', '1', '2', '3']
  );
  assert.deepEqual(
    nativeParsed.definitions.map(definition => definition.label),
    ['1', '2', '3', '4']
  );
});

test('WYSIWYG leaves native footnote markers editable until the cursor leaves', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { buildFootnoteDecorations } = await import('../src/footnotes.js');
  const doc = 'Reuse.^2\n\n^ First definition.\n^ Second definition.';
  const referenceFrom = doc.indexOf('^2');
  const activeState = EditorState.create({
    doc,
    selection: { anchor: referenceFrom + 2 }
  });
  const active = buildFootnoteDecorations(activeState, { mode: 'wysiwyg' });
  const activeReferenceDecorations = [];
  active.decorations.between(referenceFrom, referenceFrom + 2, (from, to, decoration) => {
    if (from === referenceFrom && to === referenceFrom + 2) {
      activeReferenceDecorations.push(decoration);
    }
  });
  assert.equal(activeReferenceDecorations.length, 0);

  const inactiveState = EditorState.create({ doc, selection: { anchor: 0 } });
  const inactive = buildFootnoteDecorations(inactiveState, { mode: 'wysiwyg' });
  const inactiveReferenceDecorations = [];
  inactive.decorations.between(referenceFrom, referenceFrom + 2, (from, to, decoration) => {
    if (from === referenceFrom && to === referenceFrom + 2) {
      inactiveReferenceDecorations.push(decoration);
    }
  });
  assert.equal(inactiveReferenceDecorations.length, 1);

  const unfinishedDoc = 'New note.^\n\n^ First definition.';
  const bareMarker = unfinishedDoc.indexOf('^');
  const unfinished = buildFootnoteDecorations(
    EditorState.create({
      doc: unfinishedDoc,
      selection: { anchor: bareMarker + 1 }
    }),
    { mode: 'wysiwyg' }
  );
  let unfinishedMarkerDecorated = false;
  unfinished.decorations.between(bareMarker, bareMarker + 1, (from, to) => {
    if (from === bareMarker && to === bareMarker + 1) {
      unfinishedMarkerDecorated = true;
    }
  });
  assert.equal(unfinishedMarkerDecorated, false);
});

test('footnote decorations refresh after the cursor leaves a native marker', () => {
  assert.match(
    source,
    /const revealRefresh =\s*currentEditorMode !== 'source' &&\s*tr\.selectionSet &&\s*current\.hasFootnotes/
  );
});

test('native footnote markers are ignored in tables and code', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const source = 'Table cell ^\n\n```\nText.^\n^ code definition\n```';
  const codeStart = source.indexOf('```');
  const codeEnd = source.lastIndexOf('```') + 3;
  const parsed = parseFootnotes(
    source,
    position => position >= codeStart && position < codeEnd,
    position => position >= codeStart && position < codeEnd,
    position => position < source.indexOf('\n\n')
  );

  assert.deepEqual(parsed.definitions, []);
  assert.deepEqual(parsed.references, []);
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

test('ordinary edits reuse cached footnote positions; note edits trigger a full parse', async () => {
  const { EditorState } = await import('@codemirror/state');
  const {
    buildFootnoteDecorations,
    footnoteEditRequiresReparse,
    updateFootnoteDecorationsFromCached
  } = await import('../src/footnotes.js');
  const markdown = 'Ordinary body [^1].\n\n[^1]: note\n\nMore body';
  const state = EditorState.create({ doc: markdown });
  const options = { mode: 'wysiwyg' };
  const current = buildFootnoteDecorations(state, options);

  const ordinaryEdit = state.update({
    changes: { from: markdown.indexOf('Ordinary') + 3, insert: 'x' }
  });
  assert.equal(footnoteEditRequiresReparse(current, ordinaryEdit, 'wysiwyg'), false);
  const mapped = updateFootnoteDecorationsFromCached(
    ordinaryEdit.state,
    current,
    ordinaryEdit.changes,
    options
  );
  assert.equal(
    mapped.footnotes.references[0].from,
    current.footnotes.references[0].from + 1,
    'reference positions shift with ordinary text inserted before them'
  );
  assert.equal(
    mapped.footnotes.definitions[0].from,
    current.footnotes.definitions[0].from + 1,
    'definition positions shift with ordinary text inserted before them'
  );

  const referenceStart = markdown.indexOf('[^1]');
  const editReference = state.update({
    changes: { from: referenceStart + 2, to: referenceStart + 3, insert: '2' }
  });
  assert.equal(footnoteEditRequiresReparse(current, editReference, 'wysiwyg'), true);

  const plainState = EditorState.create({ doc: 'Plain text' });
  const noFootnotes = buildFootnoteDecorations(plainState, options);
  const addReference = plainState.update({
    changes: { from: 0, insert: '[^new]' }
  });
  assert.equal(footnoteEditRequiresReparse(noFootnotes, addReference, 'wysiwyg'), true);
});

test('footnote formatters keep Markdown and native Wmdx definitions distinct', async () => {
  const {
    formatFootnoteDefinition,
    formatObsidianInlineFootnote,
    formatWmdxFootnoteDefinition,
    nextFootnoteLabel
  } = await import('../src/footnotes.js');

  assert.equal(nextFootnoteLabel('Text [^1]\n\n[^1]: note\n[^3]: other'), '4');
  assert.equal(formatFootnoteDefinition('4', 'First line\nSecond line'), '[^4]: First line\n    Second line');
  assert.equal(formatWmdxFootnoteDefinition('First line\nSecond line'), '^ First line\n  Second line');
  assert.equal(
    formatObsidianInlineFootnote('First line\nSecond line]'),
    '^[First line Second line\\]]'
  );
});

test('toolbar insertion opens the footnote dialog and all footnote settings reach rendered styles', () => {
  assert.match(source, /title: 'Insert Footnote', disabled: !isFootnoteAuthoringAvailableNow\(\), action: \(\) => openFootnoteInsertionDialog\(\)/);
  assert.match(source, /function openFootnoteInsertionDialog/);
  assert.match(source, /formattedDefinition \+ '\\n\\n'/, 'inserted footnotes leave a blank editable line after the final definition');
  assert.match(source, /: '\^'/, 'new Wmdx toolbar footnotes use the native marker');
  assert.match(source, /authoringSyntax === 'obsidian_inline'/);
  assert.match(source, /formatObsidianInlineFootnote/);
  assert.match(source, /Reuse footnote \$\{label\}/, 'the toolbar can link to an existing numbered note');
  assert.match(
    source,
    /cmdName === 'todoList'\)\s*\{\s*const prefix = getDefaultTaskPrefix\(listSyntaxSettings\);\s*if \(prefix\) cmToggleLinePrefix\(view, prefix\);/
  );
  assert.match(source, /applyHeadingCommand\(view, val\)/);
  assert.match(source, /getHeadingPrefix\(level, syntax\)/);
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
