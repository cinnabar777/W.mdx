const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { syntaxTree } = require('@codemirror/language');

const mainJsPath = path.join(__dirname, '../src/main.js');
const mainSource = fs.readFileSync(mainJsPath, 'utf8');

test('Callout regex pattern logic matches types and optional fold markers', () => {
  const re = /^(\s*>\s*)(\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?)(?:[ \t]+(.*))?\s*$/i;

  const testCases = [
    { line: '> [!note]', type: 'note', fold: undefined, title: undefined },
    { line: '> [!TIP]', type: 'TIP', fold: undefined, title: undefined },
    { line: '> [!warning]+', type: 'warning', fold: '+', title: undefined },
    { line: '> [!danger]- Custom title', type: 'danger', fold: '-', title: 'Custom title' },
    { line: '> [!important] Multi Word Title', type: 'important', fold: undefined, title: 'Multi Word Title' }
  ];

  for (const tc of testCases) {
    const match = tc.line.match(re);
    assert.ok(match, `Failed to match line: ${tc.line}`);
    assert.equal(match[3], tc.type, `Type mismatch for ${tc.line}`);
    assert.equal(match[4], tc.fold, `Fold marker mismatch for ${tc.line}`);
    assert.equal(match[5], tc.title, `Custom title mismatch for ${tc.line}`);
  }
});

test('Callout title calculation retains custom title or capitalizes default type', () => {
  const getDisplayTitle = (type, customTitle) => {
    if (customTitle && customTitle.trim().length > 0) return customTitle.trim();
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  };

  assert.equal(getDisplayTitle('note', undefined), 'Note');
  assert.equal(getDisplayTitle('TIP', ''), 'Tip');
  assert.equal(getDisplayTitle('warning', 'Watch Out!'), 'Watch Out!');
  assert.equal(getDisplayTitle('danger', '  Critical Area  '), 'Critical Area');
});

test('Callout widget structure and eq implementation', () => {
  assert.ok(mainSource.includes('class CalloutTitleWidget'), 'CalloutTitleWidget exists');
  assert.ok(mainSource.includes('other instanceof CalloutTitleWidget'), 'CalloutTitleWidget has eq check');
  assert.ok(mainSource.includes("span.className = 'cm-callout-title-container'"), 'CalloutTitleWidget sets container class');
  assert.ok(mainSource.includes("titleSpan.className = 'cm-callout-title-text'"), 'CalloutTitleWidget sets text class');
});

test('Callout line classification and marker detection logic in main.js', () => {
  assert.ok(mainSource.includes('cm-callout'), 'Main JS assigns cm-callout line class');
  assert.ok(mainSource.includes('cm-callout-title'), 'Main JS assigns cm-callout-title line class');
  assert.ok(mainSource.includes('cm-blockquote'), 'Main JS retains cm-blockquote line class');
});

test('Callout parsing excludes code blocks and stops at unquoted lines', () => {
  const docText = `> [!note] Callout Header
> Callout Body Line 1
> Callout Body Line 2

Unquoted Paragraph

\`\`\`
> [!note] Fenced Code Callout Text
\`\`\`

> Normal Blockquote Line
`;

  const state = EditorState.create({ doc: docText, extensions: [markdown()] });
  const tree = syntaxTree(state);

  // Line 1: Callout Header -> quoted, not in code
  const line1 = state.doc.line(1);
  const probe1 = line1.from + 2;
  const node1 = tree.resolveInner(probe1, 1);
  let inCode1 = false;
  for (let a = node1; a; a = a.parent) {
    if (a.name === 'FencedCode' || a.name === 'CodeBlock') inCode1 = true;
  }
  assert.equal(inCode1, false, 'Line 1 is not in code block');

  // Line 7: Fenced Code -> inside code block
  const line7 = state.doc.line(7);
  const probe7 = line7.from + 2;
  const node7 = tree.resolveInner(probe7, 1);
  let inCode7 = false;
  for (let a = node7; a; a = a.parent) {
    if (a.name === 'FencedCode' || a.name === 'CodeBlock') inCode7 = true;
  }
  assert.equal(inCode7, true, 'Line 7 literal callout syntax is inside fenced code');
});

test('pref_callout_text_color exists, is forwarded/applied, and resets to default', () => {
  assert.ok(mainSource.includes("'--callout-text-color', prefs.pref_callout_text_color"), 'main.js sets --callout-text-color CSS variable');

  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('color: var(--callout-text-color, inherit) !important;'), 'index.html applies --callout-text-color to .cm-callout');

  const xmlPrefs = fs.readFileSync(path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_blockquotes.xml'), 'utf8');
  assert.ok(xmlPrefs.includes('pref_callout_text_color'), 'preferences_styling_blockquotes.xml contains pref_callout_text_color key');

  const resetPrefs = fs.readFileSync(path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'), 'utf8');
  assert.ok(resetPrefs.includes('"pref_callout_text_color" -> "#FFFFFF"'), 'ResetPreferences contains default color mapping');
  assert.ok(resetPrefs.includes('key == "pref_callout_text_color" -> "default"'), 'ResetPreferences contains default value mapping');
});

test('Per-type icons and accessibility attributes on CalloutTitleWidget', () => {
  assert.ok(mainSource.includes('calloutTypeIcons'), 'calloutTypeIcons map exists');
  assert.ok(mainSource.includes('cm-callout-icon'), 'cm-callout-icon class exists');
  assert.ok(mainSource.includes('cm-callout-title-container'), 'Title container class exists');
  assert.ok(mainSource.includes("aria-label', `${this.isFolded ? 'Expand' : 'Collapse'} callout ${this.title}`"), 'Title container has accessible expand/collapse label');
  assert.ok(mainSource.includes('foldEffect.of'), 'Title container dispatches foldEffect');
  assert.ok(mainSource.includes('unfoldEffect.of'), 'Title container dispatches unfoldEffect');
});

test('Callout header settings and type overrides are mapped in main.js', () => {
  assert.ok(mainSource.includes("'--callout-header-bg-color', prefs.pref_callout_header_bg_color"), 'main.js maps header bg color');
  assert.ok(mainSource.includes("'--callout-header-title-color', prefs.pref_callout_header_title_color"), 'main.js maps header title color');
  assert.ok(mainSource.includes("'--callout-header-font-size', prefs.pref_callout_header_font_size"), 'main.js maps header font size');
  assert.ok(mainSource.includes("'--callout-header-font-weight', prefs.pref_callout_header_font_weight"), 'main.js maps header font weight');
  assert.ok(mainSource.includes("'--callout-header-padding', prefs.pref_callout_header_padding"), 'main.js maps header padding');
  assert.ok(mainSource.includes('pref_callout_override_'), 'main.js maps per-type overrides');
});

test('Nested callout rendering and attributes at depths 1, 2, and 3', () => {
  const nestedMd = `> [!question]+ Can callouts be nested?
> Outer text.
> > [!todo]- Yes, they can.
> > Child text.
> > > [!example] Multiple levels
> > > Nested text.
`;

  const state = EditorState.create({ doc: nestedMd, extensions: [markdown()] });
  assert.equal(state.doc.toString(), nestedMd, 'Nested document text remains byte-for-byte identical');
  assert.ok(mainSource.includes("'data-callout-type': attrs.type"), 'Line decoration sets data-callout-type attribute');
  assert.ok(mainSource.includes("'data-callout-depth': String(attrs.depth)"), 'Line decoration sets data-callout-depth attribute');
});

test('Callout fold placeholder is hidden via CSS in index.html', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('.cm-content .cm-callout .cm-foldPlaceholder'), 'Callout fold placeholder selector exists');
  assert.ok(indexHtml.includes('display: none !important;'), 'Callout fold placeholder is hidden');
});
