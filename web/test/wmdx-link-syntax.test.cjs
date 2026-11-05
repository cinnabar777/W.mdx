const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { syntaxTree } = require('@codemirror/language');
const { Autolink } = require('@lezer/markdown');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('link preferences default to preserving all supported syntax flavors', async () => {
  const {
    DEFAULT_LINK_SYNTAX_SETTINGS,
    normalizeLinkSyntaxSettings,
    isLinkFlavorEnabled,
    linkActionAvailability
  } = await import('../src/wmdxLinkSyntax.mjs');

  assert.deepEqual(normalizeLinkSyntaxSettings(), DEFAULT_LINK_SYNTAX_SETTINGS);
  assert.deepEqual(linkActionAvailability(DEFAULT_LINK_SYNTAX_SETTINGS), {
    external: true,
    internal: true,
    reference: true
  });
  assert.equal(isLinkFlavorEnabled(
    normalizeLinkSyntaxSettings({ pref_links_enabled: false }),
    'wmdx'
  ), false);
  assert.equal(isLinkFlavorEnabled(
    normalizeLinkSyntaxSettings({ pref_links_commonmark_enabled: false }),
    'commonmark'
  ), false);
});

test('CommonMark inline, reference, autolink, and definition nodes classify separately', async () => {
  const { getMarkdownLinkFlavor } = await import('../src/wmdxLinkSyntax.mjs');
  const state = EditorState.create({
    doc: [
      '[inline](https://example.com)',
      '[reference][guide]',
      '<https://example.org/>',
      'www.example.net',
      '',
      '[guide]: https://example.com/guide'
    ].join('\n'),
    extensions: [markdown({ extensions: [Autolink] })]
  });
  const flavors = [];
  syntaxTree(state).iterate({
    enter(node) {
      const flavor = getMarkdownLinkFlavor(node, state.doc);
      if (flavor) flavors.push({
        flavor,
        raw: state.doc.sliceString(node.from, node.to)
      });
    }
  });

  assert.ok(flavors.some(item =>
    item.raw === '[inline](https://example.com)' && item.flavor === 'commonmark'
  ));
  assert.ok(flavors.some(item =>
    item.raw === '[reference][guide]' && item.flavor === 'reference'
  ));
  assert.ok(flavors.some(item =>
    item.raw === '<https://example.org/>' && item.flavor === 'commonmark'
  ));
  assert.ok(flavors.some(item =>
    item.raw === '[guide]: https://example.com/guide' && item.flavor === 'reference'
  ));
});

test('link insertion uses the chosen authoring syntax and creates reusable reference definitions', async () => {
  const {
    createMarkdownReferenceInsertion,
    formatMarkdownLinkInsertion,
    DEFAULT_LINK_SYNTAX_SETTINGS
  } = await import('../src/wmdxLinkSyntax.mjs');

  assert.equal(
    formatMarkdownLinkInsertion({
      kind: 'external',
      target: 'example.com',
      title: 'Example',
      settings: DEFAULT_LINK_SYNTAX_SETTINGS
    }).markdown,
    '[example.com|Example||]'
  );
  assert.equal(
    formatMarkdownLinkInsertion({
      kind: 'external',
      target: 'example.com',
      title: 'Example',
      settings: { ...DEFAULT_LINK_SYNTAX_SETTINGS, authoringSyntax: 'commonmark' }
    }).markdown,
    '[Example](https://example.com)'
  );
  assert.equal(
    formatMarkdownLinkInsertion({
      kind: 'internal',
      target: 'Notes/Guide.md',
      title: 'Guide',
      settings: { ...DEFAULT_LINK_SYNTAX_SETTINGS, authoringSyntax: 'obsidian' }
    }).markdown,
    '[[Notes/Guide.md|Guide]]'
  );

  const first = createMarkdownReferenceInsertion({
    label: 'CommonMark guide',
    target: 'https://example.com/guide'
  });
  assert.deepEqual(first, {
    markdown: '[CommonMark guide][commonmark-guide]',
    definition: '[commonmark-guide]: https://example.com/guide',
    reference: 'commonmark-guide'
  });
  assert.equal(
    createMarkdownReferenceInsertion({
      label: 'Website',
      target: 'example.com'
    }).definition,
    '[website]: https://example.com'
  );
  const reused = createMarkdownReferenceInsertion({
    label: 'Guide again',
    target: 'https://example.com/guide',
    existingTargets: new Map([['commonmark-guide', 'https://example.com/guide']])
  });
  assert.equal(reused.markdown, '[Guide again][commonmark-guide]');
  assert.equal(reused.definition, null);
});

test('Links settings, one blank shortcut, and the unified toolbar action are wired', () => {
  const settings = read('app/src/main/res/xml/preferences_styling_inline.xml');
  const hotkeys = read('app/src/main/res/xml/preferences_hotkeys.xml');
  const reset = read('app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt');
  const activity = read('app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const main = read('web/src/main.js');
  const toolbarPreview = read('web/src/toolbarSettingsPreview.js');

  for (const key of [
    'pref_links_enabled',
    'pref_links_commonmark_enabled',
    'pref_links_reference_enabled',
    'pref_links_obsidian_enabled',
    'pref_links_wmdx_enabled',
    'pref_links_authoring_syntax'
  ]) {
    assert.ok(settings.includes(`app:key="${key}"`), `Missing ${key} setting`);
  }
  assert.match(hotkeys, /app:key="pref_hotkey_link"[\s\S]*?app:title="Links"[\s\S]*?app:defaultValue=""/);
  assert.match(activity, /"link" to prefs\.getString\("pref_hotkey_link", ""\)/);
  assert.match(reset, /key == "pref_hotkey_link" -> ""/);
  assert.match(main, /link: ''/);
  assert.match(main, /title: 'Links'[\s\S]*?action: \(\) => execCmd\('link'\)/);
  assert.match(main, /customHotkeys\.link[\s\S]*?execCmd\('link'\)/);
  assert.match(main, /formatMarkdownLinkInsertion\(/);
  assert.match(main, /option value="reference"[\s\S]*?availability\.reference/);
  assert.match(toolbarPreview, /id: 'link', title: 'Links'/);
});

test('all visual editor paths gate link decorations by their selected flavor', () => {
  const main = read('web/src/main.js');
  const heightMapStart = main.indexOf('function buildHeightMapValue(state)');
  const heightMap = main.slice(
    heightMapStart,
    main.indexOf('const heightMapField =', heightMapStart)
  );

  assert.match(main, /isLinkFlavorEnabledNow\('obsidian'\)/);
  assert.match(main, /isLinkFlavorEnabledNow\('wmdx'\)/);
  assert.match(main, /isLinkFlavorEnabledNow\('reference'\)/);
  assert.match(main, /isLinkFlavorEnabledNow\('commonmark'\)/);
  assert.match(main, /isMarkdownLinkEnabledNow\(node, doc\)/);
  assert.match(heightMap, /isLinkFlavorEnabledNow\('obsidian'\)/);
  assert.match(heightMap, /isLinkFlavorEnabledNow\('wmdx'\)/);
  assert.match(heightMap, /isLinkFlavorEnabledNow\('reference'\)/);
  assert.match(heightMap, /isLinkFlavorEnabledNow\('commonmark'\)/);
  assert.match(heightMap, /isMarkdownLinkEnabledNow\(node, doc\)/);
});
