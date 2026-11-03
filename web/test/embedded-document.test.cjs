const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const readProjectFile = relativePath =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('formats embedded Markdown and MDZip links while retaining media base metadata', async () => {
  const {
    formatMarkdownEmbeddedDocumentLink,
    parseMarkdownEmbeddedDocumentLink
  } = await import('../src/markdownMedia.js');
  const originalFolder = 'content://provider/tree/folder/document/notes%3AProject.md';
  const markdown = formatMarkdownEmbeddedDocumentLink(
    'Project notes',
    'assets/Project notes (final).md',
    originalFolder
  );

  assert.match(markdown, /^\[Project notes\]\(assets\/Project%20notes%20%28final%29\.md /);
  assert.deepEqual(parseMarkdownEmbeddedDocumentLink(markdown), {
    label: 'Project notes',
    url: 'assets/Project%20notes%20%28final%29.md',
    mediaBaseUrl: originalFolder
  });
  assert.deepEqual(
    parseMarkdownEmbeddedDocumentLink(
      formatMarkdownEmbeddedDocumentLink('Archive', 'attachments/Archive.mdz')
    ),
    {
      label: 'Archive',
      url: 'attachments/Archive.mdz',
      mediaBaseUrl: null
    }
  );
});

test('only .md, .mdz, and local content URIs can be embedded', async () => {
  const { parseMarkdownEmbeddedDocumentLink } =
    await import('../src/markdownMedia.js');

  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Legacy](assets/Legacy.textpack "wmdx-embed")'),
    null
  );
  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Old](assets/Old.mdx "wmdx-embed")'),
    null
  );
  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Remote](https://example.com/notes.md "wmdx-embed")'),
    null
  );
  assert.equal(
    parseMarkdownEmbeddedDocumentLink(
      '[Local](content%3A%2F%2Fprovider%2Fdocument%2Fid "wmdx-embed")'
    )?.url,
    'content%3A%2F%2Fprovider%2Fdocument%2Fid'
  );
});

test('embedded document action is wired to toolbar, shortcut, native picker, and styling settings', () => {
  const main = readProjectFile('web/src/main.js');
  const toolbar = readProjectFile('web/src/toolbarConfig.js');
  const icons = readProjectFile('web/src/toolbarIcons.js');
  const preview = readProjectFile('web/src/toolbarSettingsPreview.js');
  const hotkeys = readProjectFile('app/src/main/res/xml/preferences_hotkeys.xml');
  const settings = readProjectFile('app/src/main/res/xml/preferences.xml');
  const styling = readProjectFile('app/src/main/res/xml/preferences_styling.xml');
  const stylingPage = readProjectFile(
    'app/src/main/res/xml/preferences_styling_embedded_content.xml'
  );
  const native = readProjectFile('app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');

  assert.match(toolbar, /'embed'/);
  assert.match(icons, /embed:/);
  assert.match(preview, /\{ id: 'embed', title: 'Embed Document', icon: svgIcons\.embed \}/);
  assert.match(main, /customHotkeys\.embed/);
  assert.match(main, /window\.AndroidNative\?\.loadEmbeddedMarkdown/);
  assert.match(hotkeys, /app:key="pref_hotkey_embed"[\s\S]*?app:title="Document: Embed"/);
  assert.match(settings, /app:key="pref_embedded_document_method"[\s\S]*?app:defaultValue="copy"/);
  assert.match(styling, /app:key="pref_styling_page_embedded_content"/);
  assert.match(stylingPage, /pref_embedded_content_bg_color/);
  assert.match(stylingPage, /pref_embedded_content_border_radius/);
  assert.match(main, /Long-press for embedded document options/);
  assert.match(main, /Remove embed/);
  assert.match(main, /openEmbeddedDocumentEditDialog/);
  assert.match(native, /"embed" -> handleInsertEmbeddedDocument\(\)/);
  assert.match(native, /fun loadEmbeddedMarkdown/);
  assert.match(native, /fun resolveEmbeddedAssetUrl/);
});

test('migrates existing toolbar layouts to include Embed without restoring removed or hidden keys', async () => {
  const {
    DEFAULT_BOTTOM_TOOLBAR_CONFIG,
    normalizeBottomToolbarConfig
  } = await import('../src/toolbarConfig.js');
  const previousConfig = JSON.parse(JSON.stringify(DEFAULT_BOTTOM_TOOLBAR_CONFIG));
  previousConfig.version = 10;
  previousConfig.popupGroups.insert.order =
    previousConfig.popupGroups.insert.order.filter(id => id !== 'embed');

  const migrated = normalizeBottomToolbarConfig(previousConfig);
  assert.ok(migrated.popupGroups.insert.order.includes('embed'));

  const removedConfig = {
    ...previousConfig,
    deletedKeys: ['embed']
  };
  assert.ok(
    !normalizeBottomToolbarConfig(removedConfig).popupGroups.insert.order.includes('embed')
  );
});

test('inserting an embed does not force keyboard focus back into the editor', () => {
  const main = readProjectFile('web/src/main.js');
  const method = main.match(
    /insertEmbeddedDocumentLink\(relativeUrl, label, mediaBaseUrl = null\) \{([\s\S]*?)\n  \}/
  )?.[1];
  assert.ok(method, 'the editor adapter must provide embedded-document insertion');
  assert.doesNotMatch(method, /this\.view\.focus\(\)/);
});
