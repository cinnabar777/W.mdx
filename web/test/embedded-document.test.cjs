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

test('text-based files and MDZip can be embedded, but legacy formats cannot', async () => {
  const { parseMarkdownEmbeddedDocumentLink } =
    await import('../src/markdownMedia.js');

  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Notes](assets/notes.txt "wmdx-embed")')?.url,
    'assets/notes.txt'
  );
  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Source](assets/MainActivity.kt "wmdx-embed")')?.url,
    'assets/MainActivity.kt'
  );
  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Readme](assets/README "wmdx-embed")')?.url,
    'assets/README'
  );
  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Legacy](assets/Legacy.textpack "wmdx-embed")'),
    null
  );
  assert.equal(
    parseMarkdownEmbeddedDocumentLink('[Legacy](assets/Legacy.textpack.zip "wmdx-embed")'),
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
  const settingsActivity = readProjectFile(
    'app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'
  );
  const preferenceLayout = readProjectFile('app/src/main/res/layout/preference_help_switch.xml');
  const themedToast = readProjectFile('app/src/main/java/com/wmdx/markdownapp/ThemedToast.kt');
  const resetPreferences = readProjectFile(
    'app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'
  );

  assert.match(toolbar, /'embed'/);
  assert.match(icons, /embed:/);
  assert.match(preview, /\{ id: 'embed', title: 'Embed Document', icon: svgIcons\.embed \}/);
  assert.match(main, /customHotkeys\.embed/);
  assert.match(main, /window\.AndroidNative\?\.loadEmbeddedMarkdown/);
  assert.match(hotkeys, /app:key="pref_hotkey_embed"[\s\S]*?app:title="Document: Embed"/);
  assert.doesNotMatch(settings, /app:key="pref_embedded_document_method"/);
  assert.match(stylingPage, /app:key="pref_embedded_document_method_copy"[\s\S]*?android:defaultValue="true"/);
  assert.match(stylingPage, /app:key="pref_embedded_document_method_link"[\s\S]*?android:defaultValue="false"/);
  assert.match(stylingPage, /app:key="pref_embedded_content_limited_interaction"[\s\S]*?android:defaultValue="true"/);
  assert.match(stylingPage, /app:key="pref_embedded_content_full_inline_editing"[\s\S]*?android:defaultValue="false"/);
  assert.equal(
    (stylingPage.match(/<com\.wmdx\.markdownapp\.HelpResetSwitchPreference/g) || []).length,
    4
  );
  assert.doesNotMatch(stylingPage, /pref_embedded_(?:document_method|content_interaction)_help/);
  assert.match(styling, /app:key="pref_styling_page_embedded_content"/);
  assert.match(stylingPage, /pref_embedded_content_bg_color/);
  assert.match(stylingPage, /pref_embedded_content_border_radius/);
  assert.match(stylingPage, /pref_embedded_content_title_bg_color/);
  assert.match(stylingPage, /pref_embedded_content_title_text_color/);
  assert.match(settingsActivity, /selectEmbeddedDocumentMethod/);
  assert.match(settingsActivity, /selectEmbeddedInteractionMode/);
  assert.match(settingsActivity, /Edits are saved back to the original linked file/);
  assert.match(settingsActivity, /setHelpContent\(/);
  assert.match(resetPreferences, /class HelpResetSwitchPreference/);
  assert.match(resetPreferences, /R\.id\.preference_help/);
  assert.match(preferenceLayout, /@\+id\/preference_help/);
  assert.match(themedToast, /Gravity\.TOP or Gravity\.CENTER_HORIZONTAL/);
  assert.match(resetPreferences, /pref_embedded_content_title_bg_color/);
  assert.match(resetPreferences, /pref_embedded_content_title_text_color/);
  assert.match(main, /--bg-color:var\(--embedded-content-bg-color/);
  assert.match(main, /--text-color:var\(--embedded-content-text-color/);
  assert.match(main, /--body-font-size:var\(--embedded-content-font-size/);
  assert.match(main, /--embedded-content-title-bg-color/);
  assert.match(main, /--embedded-content-title-text-color/);
  assert.match(main, /childEditor\.scrollDOM\.style\.background = 'transparent'/);
  assert.match(main, /Long-press for embedded document options/);
  assert.match(main, /Remove embed/);
  assert.match(main, /openEmbeddedDocumentEditDialog/);
  assert.match(native, /"embed" -> handleInsertEmbeddedDocument\(\)/);
  assert.match(native, /fun loadEmbeddedMarkdown/);
  assert.match(native, /fun saveEmbeddedMarkdown/);
  assert.match(native, /fun resolveEmbeddedAssetUrl/);
});

test('embedded Markdown renders GFM task lists without enabling table changes', async () => {
  const main = readProjectFile('web/src/main.js');
  const native = readProjectFile('app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const childExtensions = main.match(
    /const state = EditorState\.create\(\{\s*doc: markdownText,\s*extensions: \[([\s\S]*?)\n      \]\s*\}\);/
  )?.[1];
  assert.ok(childExtensions, 'the embedded document must create its own editor');
  assert.match(
    childExtensions,
    /cmMarkdown\(\{ extensions: \[GFM, GFMStrikethrough, GFMTaskList\] \}\)/
  );
  assert.match(childExtensions, /syntaxHighlighting\(customHighlightStyle\)/);
  assert.doesNotMatch(childExtensions, /GFMTable/);
  assert.match(childExtensions, /EditorState\.readOnly\.of\(!fullInlineEditing\)/);
  assert.match(childExtensions, /drawSelection\(\)/);
  assert.match(childExtensions, /\.cm-cursor, \.cm-dropCursor/);
  assert.match(childExtensions, /EditorView\.updateListener\.of\(update => \{/);
  assert.match(main, /UNSAVED EMBEDDED EDITS/);
  assert.match(main, /setAttribute\('role', fullInlineEditing \? 'alert' : 'status'\)/);
  assert.match(main, /position:fixed/);
  assert.match(
    main,
    /pendingEmbeddedDocumentEdits\.has\(saveKey\)[\s\S]*?childEditor\?\.state\.doc\.toString\(\)/
  );
  assert.match(main, /input\.disabled = view\.state\.readOnly && !allowReadOnlyCheckboxChanges/);
  assert.match(main, /window\.AndroidNative\?\.saveEmbeddedMarkdown/);
  assert.match(
    main,
    /actions\.hidden = true;\s*actions\.style\.cssText = 'display:none;[\s\S]*?const closeActions = \(\) => \{\s*actions\.hidden = true;\s*actions\.style\.display = 'none';/
  );
  assert.match(
    main,
    /const showActions = \(\) => \{\s*actions\.hidden = false;\s*actions\.style\.display = 'flex';/
  );
  assert.match(
    native,
    /private fun mdzipSessionForAssetRequest\(sessionDirName: String\): MdzipSession\? \{[\s\S]*?currentMdzipSession[\s\S]*?embeddedMdzipSessions\.entries\.firstOrNull \{\s*it\.value\.sessionDir\.name == sessionDirName\s*\}[\s\S]*?embeddedMdzipSessions\[entry\.key\]/
  );
  assert.match(native, /val session = mdzipSessionForAssetRequest\(segments\[1\]\)/);

  const { EditorState } = await import('@codemirror/state');
  const { syntaxTree } = await import('@codemirror/language');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { GFM, Strikethrough, TaskList } = await import('@lezer/markdown');
  const state = EditorState.create({
    doc: '- [x] Checked task\n- [ ] Open task',
    extensions: [markdown({ extensions: [GFM, Strikethrough, TaskList] })]
  });
  assert.match(syntaxTree(state).toString(), /TaskMarker/);
});

test('embedded picker offers text and MDZip MIME types and validates text content', () => {
  const native = readProjectFile('app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  assert.match(
    native,
    /pickEmbeddedDocumentLauncher\.launch\(\s*arrayOf\([\s\S]*?"text\/\*",[\s\S]*?"application\/json"[\s\S]*?MdzipManager\.MIME_TYPE,[\s\S]*?"application\/octet-stream"[\s\S]*?\)\s*\)/
  );
  assert.match(native, /private fun isUnsupportedEmbeddedFileName/);
  assert.match(native, /fileName\.endsWith\("\.textpack\.zip", ignoreCase = true\)/);
  assert.match(native, /CodingErrorAction/);
  assert.match(native, /Character\.isISOControl/);
  assert.match(native, /else -> readEmbeddedMarkdown\(sourceUri, fileName, isMdzip = false\)/);
});

test('unset embedded-document source routes ordinary media through the normal resolver', async () => {
  const main = readProjectFile('web/src/main.js');
  const { EditorState, Facet } = await import('@codemirror/state');

  assert.match(
    main,
    /const embeddedDocumentSourceFacet = Facet\.define\(\{\s*combine: values => values\[0\] \?\? null\s*\}\);/
  );
  assert.match(
    main,
    /if \(embeddedSource\) \{\s*return window\.AndroidNative\?\.resolveEmbeddedAssetUrl/
  );
  assert.match(main, /return window\.AndroidNative\?\.resolveMdzipMediaUrl/);

  const sourceFacet = Facet.define({ combine: values => values[0] ?? null });
  const regularDocument = EditorState.create({ extensions: [] });
  const embeddedDocument = EditorState.create({
    extensions: [sourceFacet.of('assets/notes.md')]
  });

  assert.equal(regularDocument.facet(sourceFacet), null);
  assert.equal(embeddedDocument.facet(sourceFacet), 'assets/notes.md');
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
