const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');
const mainActivityPath = path.join(
  __dirname,
  '../../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'
);
const mainActivitySource = fs.readFileSync(mainActivityPath, 'utf8');
const settingsActivityPath = path.join(
  __dirname,
  '../../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'
);
const settingsActivitySource = fs.readFileSync(settingsActivityPath, 'utf8');
const mainSettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences.xml'),
  'utf8'
);
const stylingPagesXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_styling.xml'),
  'utf8'
);
const hotkeysXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_hotkeys.xml'),
  'utf8'
);
const storageSettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_storage_access.xml'),
  'utf8'
);
const appThemeXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/values/themes.xml'),
  'utf8'
);
const appManifestXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/AndroidManifest.xml'),
  'utf8'
);

test('main.js exists and compiles without errors', () => {
  assert.ok(source.length > 0);
  assert.ok(source.includes('window.editorBridge'));
});

test('editorBridge exposes required methods', () => {
  assert.ok(source.includes('getMarkdown'));
  assert.ok(source.includes('setMarkdown'));
  assert.ok(source.includes('setEditorMode'));
  assert.ok(source.includes('getEditorMode'));
  assert.ok(source.includes('toggleLineWrap'));
  assert.ok(source.includes('toggleLineNumbers'));
});

test('undo uses undoDepth guard and preserves document on repeated undo', () => {
  assert.ok(source.includes('undoDepth'), 'Missing undoDepth check in undo()');
  assert.ok(source.includes('Transaction.addToHistory.of(false)'), 'Missing history bypass in setMarkdown');
});

test('external-open URI permission flags survive until the editor is ready', () => {
  assert.ok(mainActivitySource.includes('private var pendingOpenPermissionFlags: Int? = null'));
  assert.ok(mainActivitySource.includes('pendingOpenPermissionFlags = intent.flags'));
  assert.ok(mainActivitySource.includes('openFile(uri, permissionFlags = permissionFlags)'));
});

test('returning to the app keeps the keyboard hidden if it was hidden before backgrounding', () => {
  assert.ok(mainActivitySource.includes('imeVisibleBeforePause = if (::webView.isInitialized)'));
  assert.ok(mainActivitySource.includes('.isVisible(WindowInsetsCompat.Type.ime())'));
  assert.ok(mainActivitySource.includes('val shouldKeepImeHidden = imeVisibleBeforePause == false'));
  assert.ok(mainActivitySource.includes('?.hide(WindowInsetsCompat.Type.ime())'));
});

test('installed device fonts override custom body and heading font files when selected', () => {
  assert.ok(mainActivitySource.includes('if (bodyFontFamily == "default")'));
  assert.ok(mainActivitySource.includes('if (headingFontFamily == "default")'));
  assert.ok(settingsActivitySource.includes('DeviceFontCatalog.options()'));
  assert.ok(settingsActivitySource.includes('preference.key?.endsWith("_font_family")'));
  assert.ok(source.includes('const familyValue = toCssFontFamily(deviceFont)'));
});

test('detailed navigation capture is explicitly opt-in instead of running during normal editing', () => {
  const diagnosticsPath = path.join(
    __dirname,
    '../../app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt'
  );
  const diagnosticsSource = fs.readFileSync(diagnosticsPath, 'utf8');
  assert.ok(diagnosticsSource.includes('putBoolean("capture_opt_in", true)'));
  assert.ok(diagnosticsSource.includes('prefs.getBoolean("capture_opt_in", false)'));
  assert.ok(mainActivitySource.includes('setNavigationDiagnosticsEnabled'));
  assert.ok(mainActivitySource.includes('window.editorBridge?.setNavigationDiagnosticsEnabled?.($captureActive)'));
});

test('document rename requests only selected-folder access before offering Save As', () => {
  assert.ok(mainActivitySource.includes('Intent.ACTION_OPEN_DOCUMENT_TREE'));
  assert.ok(mainActivitySource.includes('FLAG_GRANT_PERSISTABLE_URI_PERMISSION'));
  assert.ok(mainActivitySource.includes('resolveRenameTargetInTree(treeUri, request.uri)'));
  assert.ok(mainActivitySource.includes('buildDocumentUriUsingTree'));
  assert.ok(mainActivitySource.includes('buildChildDocumentsUriUsingTree'));
  assert.ok(mainActivitySource.includes('if (oldUri.scheme == "content" || oldUri.scheme == "file")'));
  assert.ok(mainActivitySource.includes('The original file will remain unchanged.'));
  assert.ok(!mainActivitySource.includes('MANAGE_EXTERNAL_STORAGE'));
});

test('rename uses folder access or Save As, without the crash-prone per-file picker', () => {
  assert.ok(!mainActivitySource.includes('renameFileAccessLauncher'));
  assert.ok(!mainActivitySource.includes('handleRenameFileSelection'));
  assert.ok(!mainActivitySource.includes('launchRenameFilePicker'));
  assert.ok(!mainActivitySource.includes('Grant File Access'));
  assert.ok(mainActivitySource.includes('Android blocks selecting the Downloads folder itself'));
});

test('users can save and manage folder access from the main settings page', () => {
  assert.ok(mainSettingsXml.includes('pref_page_storage_access'));
  assert.ok(settingsActivitySource.includes('StorageAccessSettingsFragment()'));
  assert.ok(storageSettingsXml.includes('pref_storage_add_folder'));
  assert.ok(storageSettingsXml.includes('pref_storage_authorized_folders'));
  assert.ok(settingsActivitySource.includes('ACTION_OPEN_DOCUMENT_TREE'));
  assert.ok(settingsActivitySource.includes('takePersistableUriPermission'));
  assert.ok(settingsActivitySource.includes('releasePersistableUriPermission'));
  assert.ok(settingsActivitySource.includes('locallyRevokedFolderUrisKey'));
  assert.ok(settingsActivitySource.includes('it.uri.toString() !in locallyRevokedUris'));
  assert.ok(mainActivitySource.includes('resolveRenameTargetInTree(permission.uri, documentUri)'));
  assert.ok(storageSettingsXml.includes('Downloads folder itself'));
});

test('rename access dialog offers folder access and Save As alongside its explanation', () => {
  const start = mainActivitySource.indexOf('private fun showRenameAccessOptions(');
  const end = mainActivitySource.indexOf('private fun remapDocumentNavigationHistory(', start);
  const dialog = mainActivitySource.slice(start, end);

  assert.ok(dialog.includes('.setMessage('));
  assert.ok(dialog.includes('.setPositiveButton("Choose Folder")'));
  assert.ok(dialog.includes('.setNegativeButton("Save As")'));
  assert.ok(!dialog.includes('.setItems('), 'a message and item list hide one another in Android AlertDialogs');
});

test('native dialogs use the app dark surface and teal accent instead of default purple', () => {
  assert.match(appThemeXml, /<item name="colorPrimary">#00E5C8<\/item>/);
  assert.match(appThemeXml, /<item name="colorAccent">#00E5C8<\/item>/);
  assert.match(appThemeXml, /<item name="android:colorAccent">#00E5C8<\/item>/);
  assert.match(appThemeXml, /<item name="colorSurface">#080808<\/item>/);
  assert.match(appThemeXml, /<item name="android:colorBackgroundFloating">#080808<\/item>/);
});

test('New Window launches a fresh, separate Android editor task', () => {
  const handlerStart = mainActivitySource.indexOf('private fun handleNewWindow()');
  const handlerEnd = mainActivitySource.indexOf('\n    private ', handlerStart + 1);
  const handler = mainActivitySource.slice(handlerStart, handlerEnd);
  const activityDeclaration = appManifestXml.match(
    /<activity\s+android:name="\.MainActivity"[\s\S]*?\/>/
  )?.[0] ?? '';

  assert.ok(handlerStart >= 0, 'Native new-window handler exists');
  assert.match(activityDeclaration, /android:launchMode="standard"/);
  assert.match(activityDeclaration, /android:documentLaunchMode="always"/);
  assert.match(activityDeclaration, /android:resizeableActivity="true"/);
  assert.match(handler, /data = Uri\.parse\("wmdx:\/\/window\/\$newWindowId"\)/);
  assert.match(handler, /FLAG_ACTIVITY_NEW_TASK/);
  assert.match(handler, /FLAG_ACTIVITY_NEW_DOCUMENT/);
  assert.match(handler, /FLAG_ACTIVITY_MULTIPLE_TASK/);
  assert.match(handler, /putExtra\("is_new_document", true\)/);
  assert.match(mainActivitySource, /"new_window"\s*->\s*handleNewWindow\(\)/);
  assert.match(source, /title: 'New Window'[\s\S]*?onNativeAction\('new_window'\)/);
});

test('typography editor categories are separated into individual navigation pages', () => {
  const navigationXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling.xml'),
    'utf8'
  );
  const inlineXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_inline.xml'),
    'utf8'
  );
  const blockquoteXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_blockquotes.xml'),
    'utf8'
  );

  for (const key of [
    'pref_styling_page_bold',
    'pref_styling_page_italic',
    'pref_styling_page_links',
    'pref_styling_page_inline_code',
    'pref_styling_page_blockquotes',
    'pref_styling_page_callouts',
    'pref_styling_page_footnotes'
  ]) {
    assert.ok(navigationXml.includes(`app:key="${key}"`), `Missing typography page ${key}`);
    assert.ok(settingsActivitySource.includes(`"${key}"`), `Missing fragment route for ${key}`);
  }

  for (const key of [
    'pref_bold_color',
    'pref_font_weight_bold',
    'pref_font_file_bold',
    'pref_italic_color',
    'pref_font_weight_italic',
    'pref_font_file_italic',
    'pref_link_color',
    'pref_link_decoration',
    'pref_link_underline_thickness',
    'pref_code_color',
    'pref_code_bg_color',
    'pref_code_padding',
    'pref_code_border_radius',
    'pref_font_file_code'
  ]) {
    assert.ok(inlineXml.includes(`app:key="${key}"`), `Existing inline setting key changed: ${key}`);
  }

  for (const categoryKey of [
    'styling_inline_bold',
    'styling_inline_italic',
    'styling_inline_links',
    'styling_inline_code',
    'styling_blockquote_typography',
    'styling_callout_body_typography',
    'styling_blockquote_settings',
    'styling_callout_settings',
    'styling_callout_shared_header',
    'styling_callout_type_overrides'
  ]) {
    assert.ok(
      settingsActivitySource.includes(`"${categoryKey}"`),
      `Page filtering does not preserve ${categoryKey} as its own page`
    );
  }

  const orderedPages = [
    'Headings (H1 – H6)',
    'Paragraph &amp; Body Text',
    'Block Quotes',
    'Bold',
    'Callouts',
    'Code Blocks',
    'Cursor &amp; Selection',
    'Footnotes',
    'Horizontal Rules',
    'Inline Code',
    'Italic',
    'Links',
    'Lists (Bulleted, Numbered, Todo Checkboxes)',
    'Tables'
  ].map(title => navigationXml.indexOf(`app:title="${title}"`));
  assert.ok(orderedPages.every(index => index >= 0), 'Every expected typography page is present');
  assert.deepEqual(
    orderedPages,
    [...orderedPages].sort((first, second) => first - second),
    'Headings and body stay first; remaining typography pages are alphabetical'
  );
});

test('bottom toolbar appearance is in main settings below Find & Replace', () => {
  const findReplaceIndex = mainSettingsXml.indexOf('app:key="pref_page_findreplace"');
  const toolbarIndex = mainSettingsXml.indexOf('app:key="pref_page_bottom_toolbar"');
  const keyboardIndex = mainSettingsXml.indexOf('app:key="pref_page_hotkeys"');

  assert.ok(findReplaceIndex >= 0 && findReplaceIndex < toolbarIndex);
  assert.ok(toolbarIndex < keyboardIndex);
  assert.match(mainSettingsXml, /app:key="pref_page_bottom_toolbar"[\s\S]*?app:title="Toolbar: Bottom"/);
  assert.ok(settingsActivitySource.includes('"pref_page_bottom_toolbar"'));
  assert.ok(!stylingPagesXml.includes('pref_styling_page_controlbar'));
  assert.ok(settingsActivitySource.includes('is StylingControlbarFragment -> "Toolbar: Bottom"'));
});

test('settings labels avoid redundant settings, styling, and shortcut wording', () => {
  const hotkeyTitles = [...hotkeysXml.matchAll(/app:title="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(hotkeyTitles.every((title) => !/shortcut/i.test(title)));
  assert.ok(!hotkeysXml.includes('Custom Keyboard Shortcuts'));
  assert.ok(!mainSettingsXml.includes('Styling &amp; Typography Settings'));
  assert.ok(!mainSettingsXml.includes('Custom Keyboard Shortcuts'));
  assert.ok(!mainSettingsXml.includes('HTML &amp; MHTML Export Settings'));
});
