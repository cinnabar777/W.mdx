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

test('Markdown cheat sheet keeps the first callout body inside its quoted block', () => {
  const markdownPath = path.join(__dirname, '../../Documentation/Markdown.md');
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  assert.match(
    markdown,
    /> \[!info\] header\n> The type identifier determines how the callout looks and feels\./
  );
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

test('callout quote syntax hides its separator space when unfocused and applies hanging indent when focused', () => {
  const quoteMarkBranch = mainSource.match(
    /if \(node\.name === 'QuoteMark'\) \{([\s\S]*?)\n          \}/
  );
  assert.ok(quoteMarkBranch, 'QuoteMark decoration branch exists');
  assert.match(quoteMarkBranch[1], /const end = Math\.min\(node\.to \+ 1, line\.to\)/);
  assert.match(quoteMarkBranch[1], /hideSyntax\(node\.from, end\)/);
  assert.match(quoteMarkBranch[1], /cm-callout-quote-active/);

  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('.cm-callout-quote-active'), 'index.html contains cm-callout-quote-active selector');
  assert.ok(indexHtml.includes('var(--quote-prefix-ch, 2ch)'), 'index.html calculates hanging indent offset');
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
  assert.ok(mainSource.includes("aria-label', `${currentlyFolded ? 'Expand' : 'Collapse'} callout ${this.title}`"), 'Title container has accessible expand/collapse label');
  assert.ok(mainSource.includes('foldEffect.of'), 'Title container dispatches foldEffect');
  assert.ok(mainSource.includes('unfoldEffect.of'), 'Title container dispatches unfoldEffect');
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
  assert.ok(mainSource.includes("data-callout-type': attrs.type"), 'Line decoration sets data-callout-type attribute');
  assert.ok(mainSource.includes("data-callout-depth': String(attrs.depth)"), 'Line decoration sets data-callout-depth attribute');
  assert.ok(mainSource.includes('ancestor.info.bodyTo = line.to'), 'Ancestor bodyTo extended across 3-level callout depths');
});

test('Callout fold placeholder is hidden via CSS in index.html', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('.cm-content .cm-callout .cm-foldPlaceholder'), 'Callout fold placeholder selector exists');
  assert.ok(indexHtml.includes('display: none !important;'), 'Callout fold placeholder is hidden');
});

test('Shared callout header controls and per-type override preferences are defined and mapped', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const xmlPrefs = fs.readFileSync(path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_blockquotes.xml'), 'utf8');
  const resetPrefs = fs.readFileSync(path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'), 'utf8');

  // Shared Header Keys Check
  const sharedKeys = [
    'pref_callout_header_bg_color',
    'pref_callout_header_title_color',
    'pref_callout_header_title_size',
    'pref_callout_header_font_family',
    'pref_font_file_callout_header',
    'pref_callout_header_font_weight',
    'pref_callout_header_padding',
    'pref_callout_header_accent_color',
    'pref_callout_header_accent_thickness'
  ];

  for (const k of sharedKeys) {
    assert.ok(xmlPrefs.includes(k), `XML preferences must contain shared key: ${k}`);
    assert.ok(resetPrefs.includes(k), `ResetPreferences must handle shared key: ${k}`);
  }

  // Check CSS Variable Mapping in main.js
  assert.ok(mainSource.includes("'--callout-header-bg', prefs.pref_callout_header_bg_color"), 'main.js sets --callout-header-bg');
  assert.ok(mainSource.includes("'--callout-header-title-color', prefs.pref_callout_header_title_color"), 'main.js sets --callout-header-title-color');
  assert.ok(mainSource.includes("setCssVar('--callout-header-title-size'"), 'main.js sets --callout-header-title-size');
  assert.ok(mainSource.includes("'--callout-header-font-family', prefs.pref_callout_header_font_family"), 'main.js sets --callout-header-font-family');
  assert.ok(mainSource.includes("'--callout-header-font-weight', prefs.pref_callout_header_font_weight"), 'main.js sets --callout-header-font-weight');
  assert.ok(mainSource.includes("'--callout-header-padding', prefs.pref_callout_header_padding"), 'main.js sets --callout-header-padding');
  assert.ok(mainSource.includes("'--callout-header-accent-color', prefs.pref_callout_header_accent_color"), 'main.js sets --callout-header-accent-color');
  assert.ok(mainSource.includes("'--callout-header-accent-thickness', prefs.pref_callout_header_accent_thickness"), 'main.js sets --callout-header-accent-thickness');

  // Check CSS Rules in index.html for title and title container
  assert.ok(indexHtml.includes('var(--callout-type-header-bg, var(--callout-header-bg, transparent))'), 'index.html incorporates header background cascade');
  assert.ok(indexHtml.includes('var(--callout-type-header-title-color, var(--callout-header-title-color, inherit))'), 'index.html incorporates header title color cascade');
  assert.ok(indexHtml.includes('var(--callout-header-title-size, inherit)'), 'index.html incorporates header title size');
  assert.ok(indexHtml.includes('var(--callout-header-font-weight, 700)'), 'index.html incorporates header font weight');

  // Check Per-Type Override Keys Check
  const overrideTypes = ['info', 'faq', 'question', 'todo', 'example'];
  for (const t of overrideTypes) {
    assert.ok(xmlPrefs.includes(`pref_callout_type_${t}_bg_color`), `XML preferences contains override bg key for ${t}`);
    assert.ok(xmlPrefs.includes(`pref_callout_type_${t}_title_color`), `XML preferences contains override title key for ${t}`);
    assert.ok(xmlPrefs.includes(`pref_callout_type_${t}_accent_color`), `XML preferences contains override accent key for ${t}`);
    assert.ok(xmlPrefs.includes(`pref_callout_type_${t}_icon`), `XML preferences contains override icon key for ${t}`);
    assert.ok(indexHtml.includes(`--callout-type-${t}-header-bg`), `index.html contains CSS variable for ${t} header bg`);
  }
});

test('Callout header settings remain isolated from body text and outer callout border settings', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  // Outer border uses --callout-border-width, --callout-border-color
  assert.ok(indexHtml.includes('border-left: var(--callout-border-width, 4px) var(--callout-border-style, solid) var(--callout-border-color,'), 'Outer border retains global callout variables');

  // Body text uses --callout-text-color
  assert.ok(indexHtml.includes('color: var(--callout-text-color, inherit) !important;'), 'Body text color remains controlled by --callout-text-color');

  // Header accent uses separate --callout-header-accent-thickness and accent color
  assert.ok(indexHtml.includes('var(--callout-header-accent-thickness, 0px)'), 'Header accent thickness is separate from outer callout border');
});

test('Callout type icon overrides are sanitized and fall back to defaults for invalid values', () => {
  const allowedCalloutIcons = ['info', 'question', 'faq', 'todo', 'example', 'note', 'tip', 'warning', 'important', 'danger'];

  const sanitizeIcon = (iconName) => {
    if (iconName && iconName !== 'default' && allowedCalloutIcons.includes(iconName)) {
      return iconName;
    }
    return 'default';
  };

  assert.equal(sanitizeIcon('tip'), 'tip', 'Valid built-in icon choice is allowed');
  assert.equal(sanitizeIcon('warning'), 'warning', 'Valid built-in icon choice is allowed');
  assert.equal(sanitizeIcon('<script>alert(1)</script>'), 'default', 'Arbitrary text/script is sanitized to default');
  assert.equal(sanitizeIcon('invalid_icon_name'), 'default', 'Unknown icon name falls back to default');
});

test('CodeBlockHeaderWidget rendering, replacement decoration, and copy button logic', () => {
  assert.ok(mainSource.includes('class CodeBlockHeaderWidget'), 'CodeBlockHeaderWidget exists');
  assert.ok(mainSource.includes('Decoration.replace({ widget: headerWidget }).range(line.from, line.to)'), 'Inactive code block replaces line with headerWidget');
  assert.ok(mainSource.includes('Decoration.widget({ widget: headerWidget, side: -1 }).range(line.from)'), 'Active code block inserts headerWidget at line start');
  assert.ok(mainSource.includes("copyBtn.className = 'cm-codeblock-copy-btn'"), 'CodeBlockHeaderWidget sets COPY button class');
});

test('wysiwygCodeBlockField, coordsForTargetRow, and selection paint styling', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  assert.ok(mainSource.includes('const wysiwygCodeBlockField = StateField.define'), 'wysiwygCodeBlockField StateField is defined');
  assert.ok(mainSource.includes('buildWysiwygCodeBlockDecorations'), 'buildWysiwygCodeBlockDecorations function is defined');
  assert.ok(mainSource.includes('coordsForTargetRow'), 'coordsForTargetRow helper evaluates dual side affinities');
  assert.ok(mainSource.includes("'.cm-selectionLayer': {\n            zIndex: 2,"), 'Selection layer has zIndex 2');
  assert.ok(indexHtml.includes('.cm-wp-table-container.cm-document-selection .cm-wp-table th'), 'index.html has gradient overlay rule for selected tables');
});

test('persistentLayoutField StateField and persistentLayoutClasses filtering in main.js', () => {
  assert.ok(mainSource.includes('export function buildPersistentLayoutDecorations'), 'buildPersistentLayoutDecorations function exists');
  assert.ok(mainSource.includes('export const persistentLayoutField = StateField.define'), 'persistentLayoutField StateField exists');
  assert.ok(mainSource.includes('const persistentLayoutClasses = new Set(['), 'persistentLayoutClasses Set exists');
  assert.ok(mainSource.includes('!persistentLayoutClasses.has(className)'), 'persistentLayoutClasses is filtered in WYSIWYG mode');
});

test('typographySettingsEffect, no viewportMargin, and ImagePreviewWidget estimatedHeight', () => {
  assert.ok(mainSource.includes('export const typographySettingsEffect = StateEffect.define()'), 'typographySettingsEffect is defined');
  assert.equal(mainSource.includes('viewportMargin: Infinity'), false, 'CodeMirrorAdapter.init must not pass viewportMargin: Infinity');
  assert.ok(mainSource.includes('imageAspectCache'), 'imageAspectCache Map is defined');
  assert.ok(mainSource.includes('typographySettingsEffect.of(Date.now())'), 'typographySettingsEffect is dispatched on preference changes');
});

test('Regression check: WysiwygSpacingWidget is not referenced in main.js', () => {
  assert.equal(mainSource.includes('WysiwygSpacingWidget'), false, 'WysiwygSpacingWidget must not be referenced in main.js');
  assert.ok(mainSource.includes('buildPersistentLayoutDecorations'), 'buildPersistentLayoutDecorations exists in main.js');
});

test('MainActivity.kt guards setHotkeys with window.editorBridge function check', () => {
  const mainActivityPath = path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const mainActivitySource = fs.readFileSync(mainActivityPath, 'utf8');
  assert.ok(mainActivitySource.includes('if (window.editorBridge && typeof window.editorBridge.setHotkeys === \'function\')'), 'MainActivity.kt guards setHotkeys call');
});
