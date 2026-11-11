const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EditorState, EditorSelection } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { syntaxTree } = require('@codemirror/language');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('heading syntax preferences preserve all forms and default authoring to Wmdx', async () => {
  const {
    DEFAULT_HEADING_SYNTAX_SETTINGS,
    normalizeHeadingSyntaxSettings,
    isHeadingFlavorEnabled,
    isHeadingLevelAvailable
  } = await import('../src/headingSyntax.mjs');

  assert.deepEqual(normalizeHeadingSyntaxSettings(), DEFAULT_HEADING_SYNTAX_SETTINGS);
  assert.equal(
    normalizeHeadingSyntaxSettings({
      pref_heading_syntax_wmdx_enabled: false,
      pref_heading_syntax_setext_enabled: false
    }).authoringSyntax,
    'hash'
  );
  assert.equal(
    normalizeHeadingSyntaxSettings({
      pref_heading_syntax_hash_enabled: false,
      pref_heading_syntax_setext_enabled: false
    }).authoringSyntax,
    'wmdx'
  );
  assert.equal(
    isHeadingFlavorEnabled(
      normalizeHeadingSyntaxSettings({ pref_heading_syntax_enabled: false }),
      'hash'
    ),
    false
  );
  const setext = normalizeHeadingSyntaxSettings({
    pref_heading_authoring_syntax: 'setext'
  });
  assert.equal(isHeadingLevelAvailable(setext, 2), true);
  assert.equal(isHeadingLevelAvailable(setext, 3), false);
});

test('Wmdx, hash, and Setext headings classify as distinct flavors', async () => {
  const {
    getHeadingFlavor,
    getHeadingLevel,
    getHeadingPrefix
  } = await import('../src/headingSyntax.mjs');
  const source = '.1 Wmdx\n## Hash\nSetext one\n===\nSetext two\n---';
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ extensions: [
      (await import('../src/commonmark-compat.mjs')).wmdxCommonMarkCompatibility
    ] })]
  });
  const headings = [];

  syntaxTree(state).iterate({
    enter(node) {
      const level = getHeadingLevel(node.name);
      if (!level) return;
      headings.push({
        level,
        flavor: getHeadingFlavor(
          node.name,
          state.doc.sliceString(node.from, node.to)
        )
      });
    }
  });

  assert.deepEqual(headings, [
    { level: 1, flavor: 'wmdx' },
    { level: 2, flavor: 'hash' },
    { level: 1, flavor: 'setext' },
    { level: 2, flavor: 'setext' }
  ]);
  assert.equal(getHeadingPrefix(1, 'setext'), '=');
  assert.equal(getHeadingPrefix(2, 'setext'), '-');
  assert.equal(getHeadingPrefix(3, 'setext'), null);
});

test('table of contents honors heading enable and flavor preferences', async () => {
  const { extractTocHeadings } = await import('../src/tocHeadings.js');
  const source = '.1 Native\n# Hash\nSetext\n---';

  assert.deepEqual(
    extractTocHeadings(source).map(({ level, title }) => [level, title]),
    [[1, 'Native'], [1, 'Hash'], [2, 'Setext']]
  );
  assert.deepEqual(
    extractTocHeadings(source, {
      enabled: true,
      wmdx: false,
      hash: true,
      setext: false
    }).map(({ level, title }) => [level, title]),
    [[1, 'Hash']]
  );
  assert.deepEqual(
    extractTocHeadings(source, { enabled: false }),
    []
  );
});

test('Auto Heading uses Setext and cycles only its two available levels', async () => {
  const { applyAutoHeading } = await import('../src/autoHeading.js');
  const { wmdxCommonMarkCompatibility } =
    await import('../src/commonmark-compat.mjs');
  const document = '.1 Previous\nA title';
  let state = EditorState.create({
    doc: document,
    selection: EditorSelection.cursor(document.length),
    extensions: [markdown({ extensions: [wmdxCommonMarkCompatibility] })]
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(transaction) {
      state = state.update(transaction).state;
    },
    focus() {}
  };
  const settings = {
    enabled: true,
    wmdx: true,
    hash: true,
    setext: true,
    authoringSyntax: 'setext'
  };

  assert.equal(applyAutoHeading(view, settings), true);
  assert.equal(state.doc.toString(), '.1 Previous\nA title\n-------');
  assert.equal(applyAutoHeading(view, settings), true);
  assert.equal(state.doc.toString(), '.1 Previous\nA title\n=======');
});

test('heading preferences expose feature, flavor, and authoring controls', () => {
  const preferences = read('app/src/main/res/xml/preferences_styling_headings.xml');
  const arrays = read('app/src/main/res/values/arrays.xml');
  const reset = read('app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt');
  const settingsActivity = read('app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt');
  const main = read('web/src/main.js');

  for (const key of [
    'pref_heading_syntax_enabled',
    'pref_heading_syntax_wmdx_enabled',
    'pref_heading_syntax_hash_enabled',
    'pref_heading_syntax_setext_enabled',
    'pref_heading_authoring_syntax'
  ]) {
    assert.ok(preferences.includes(key), `missing preference ${key}`);
  }
  assert.match(arrays, /heading_authoring_syntax_entries/);
  assert.match(reset, /key == "pref_heading_authoring_syntax" -> "wmdx"/);
  assert.match(settingsActivity, /enabledFlavors\.size == 1/);
  assert.match(main, /applyHeadingCommand\(view, val\)/);
  assert.match(main, /normalizeHeadingSyntaxSettings\(prefs\)/);
});
