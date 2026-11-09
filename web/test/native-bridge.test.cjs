const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');
const tableWidgetSource = fs.readFileSync(
  path.join(__dirname, '../src/tableWidget.js'),
  'utf8'
);
const mainActivityPath = path.join(
  __dirname,
  '../../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'
);
const mainActivitySource = fs.readFileSync(mainActivityPath, 'utf8');
const editorWebViewSource = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/EditorWebView.kt'),
  'utf8'
);
const textPackManagerSource = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/TextPackManager.kt'),
  'utf8'
);
const leftPanelSource = fs.readFileSync(
  path.join(__dirname, '../src/leftPanel.js'),
  'utf8'
);
const leftPanelHtml = fs.readFileSync(
  path.join(__dirname, '../index.html'),
  'utf8'
);
const leftPanelSettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_left_panel.xml'),
  'utf8'
);
const tocSettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_toc.xml'),
  'utf8'
);
const resetPreferencesSource = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
  'utf8'
);
const paragraphSettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_paragraph.xml'),
  'utf8'
);
const bodySettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_body.xml'),
  'utf8'
);
const editorHtml = fs.readFileSync(
  path.join(__dirname, '../index.html'),
  'utf8'
);
const settingsActivityPath = path.join(
  __dirname,
  '../../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'
);
const settingsActivitySource = fs.readFileSync(settingsActivityPath, 'utf8');
const toolbarSettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_controlbar.xml'),
  'utf8'
);
const toolbarPreviewSource = fs.readFileSync(
  path.join(__dirname, '../src/toolbarSettingsPreview.js'),
  'utf8'
);
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

test('CodeMirror caret bounds are forwarded to Android input methods', () => {
  assert.match(source, /scheduleNativeCursorAnchor\(update\.view\)/);
  assert.match(source, /bridge\.onSelectionChanged\(JSON\.stringify\(\{/);
  assert.match(source, /left:\s*caret\.left/);
  assert.match(mainActivitySource, /fun onSelectionChanged\(selectionJson: String\)/);
  assert.match(mainActivitySource, /CursorAnchorInfo\.Builder\(\)/);
  assert.match(
    mainActivitySource,
    /updateCursorAnchorInfo\(webView,\s*cursorAnchor\)/
  );
});

test('undo uses undoDepth guard and preserves document on repeated undo', () => {
  assert.ok(source.includes('undoDepth'), 'Missing undoDepth check in undo()');
  assert.ok(source.includes('Transaction.addToHistory.of(false)'), 'Missing history bypass in setMarkdown');
});

test('external-open URI permission flags survive until the editor is ready', () => {
  assert.ok(mainActivitySource.includes('private var pendingOpenPermissionFlags: Int? = null'));
  assert.ok(mainActivitySource.includes('pendingOpenPermissionFlags = intent.flags'));
  assert.match(
    mainActivitySource,
    /openFile\(\s*uri,\s*skipExistingWindowFocus = skipExistingWindowFocus,\s*permissionFlags = permissionFlags\s*\)/s
  );
});

test('Android Open With advertises text and supported source-code MIME types', () => {
  const viewFilter = appManifestXml.match(
    /<intent-filter>\s*<action android:name="android.intent.action.VIEW"[\s\S]*?<\/intent-filter>/
  )?.[0];
  assert.ok(viewFilter, 'external file opening has a VIEW intent filter');
  for (const mimeType of [
    'text/*',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/yaml',
    'application/x-yaml',
    'application/sql',
    'application/x-sql',
    'application/toml'
  ]) {
    assert.ok(
      viewFilter.includes(`android:mimeType="${mimeType}"`),
      `the app should appear for ${mimeType} documents`
    );
  }
  assert.ok(
    !viewFilter.includes('android:mimeType="application/octet-stream"'),
    'generic binary files should not be offered as text documents'
  );
});

test('returning to the app keeps the keyboard hidden until the user touches the editor', () => {
  assert.ok(mainActivitySource.includes('suppressImeUntilUserTouch = true'));
  assert.ok(mainActivitySource.includes('SOFT_INPUT_STATE_ALWAYS_HIDDEN'));
  assert.ok(mainActivitySource.includes('SOFT_INPUT_ADJUST_NOTHING'));
  assert.match(mainActivitySource, /restoreImeResizeAfterResume\(generation\)/);
  assert.match(mainActivitySource, /stableHiddenChecks < 2/);
  assert.match(mainActivitySource, /SOFT_INPUT_ADJUST_RESIZE or/);
  assert.ok(mainActivitySource.includes('event.actionMasked == MotionEvent.ACTION_DOWN'));
  assert.ok(mainActivitySource.includes('suppressImeUntilUserTouch = false'));
  assert.ok(mainActivitySource.includes('SOFT_INPUT_STATE_UNSPECIFIED'));
  assert.ok(mainActivitySource.includes('?.hide(WindowInsetsCompat.Type.ime())'));
});

test('tapping editor content explicitly requests the Android keyboard', () => {
  assert.match(source, /contentDOM\.addEventListener\('pointerdown'/);
  assert.match(source, /contentDOM\.addEventListener\('pointerup'/);
  assert.match(
    source,
    /contentDOM\.addEventListener\('pointerup'[\s\S]*?if \(this\.view\?\.dom\.isConnected\) \{\s*window\.AndroidNative\?\.showEditorKeyboard\?\.\(\)/
  );
  assert.doesNotMatch(
    source,
    /this\.view\.hasFocus\)[\s\S]{0,120}AndroidNative\?\.showEditorKeyboard/
  );
  assert.match(
    mainActivitySource,
    /fun showEditorKeyboard\(\)\s*\{\s*this@MainActivity\.requestEditorKeyboard\(refocusWebView = true\)/
  );
  assert.match(
    mainActivitySource,
    /private fun requestEditorKeyboard\(refocusWebView: Boolean\)[\s\S]*?SOFT_INPUT_STATE_UNSPECIFIED[\s\S]*?requestFocusFromTouch\(\)[\s\S]*?showSoftInput\(webView, InputMethodManager\.SHOW_IMPLICIT\)/
  );
  assert.doesNotMatch(mainActivitySource, /setImeInputAllowed|toolbarImeSuppressedUntilEditorTouch/);
  assert.doesNotMatch(editorWebViewSource, /imeInputAllowed|onCheckIsTextEditor|onCreateInputConnection|override fun requestFocus/);
});

test('table-cell editing shows the keyboard without reclaiming WebView focus', () => {
  assert.match(
    tableWidgetSource,
    /function showCellEditorKeyboard\(\)[\s\S]*?showEditorKeyboardForFocusedInput/
  );
  assert.match(
    tableWidgetSource,
    /overlay\.focus\(\)[\s\S]*?showCellEditorKeyboard\(\)/
  );
  assert.match(
    source,
    /target\.matches\('\.cm-wp-cell-editor'\)[\s\S]*?showEditorKeyboardForFocusedInput/
  );
  assert.match(
    mainActivitySource,
    /fun showEditorKeyboardForFocusedInput\(\)\s*\{\s*this@MainActivity\.requestEditorKeyboard\(refocusWebView = false\)/
  );
  const focusedInputKeyboardPath = mainActivitySource.slice(
    mainActivitySource.indexOf('private fun requestEditorKeyboard(refocusWebView: Boolean)'),
    mainActivitySource.indexOf('private fun hideImeWhileResumeIsSuppressed')
  );
  assert.match(focusedInputKeyboardPath, /if \(refocusWebView\) webView\.requestFocusFromTouch\(\)/);
  assert.match(focusedInputKeyboardPath, /showSoftInput\(webView, InputMethodManager\.SHOW_IMPLICIT\)/);
});

test('toolbar touch handling stays local and preserves click and pointer paths', () => {
  const toolbarTouchSource = fs.readFileSync(
    path.join(__dirname, '../src/toolbarTouchHandling.js'),
    'utf8'
  );
  assert.match(source, /installToolbarTouchHandling\(document, toolbarTouchSurfaceSelector\)/);
  assert.match(
    source,
    /toolbarTouchSurfaceSelector\s*=\s*'#[^']*popup-toolbar-strip[^']*floating-toggle-btn/
  );
  assert.match(toolbarTouchSource, /addEventListener\('touchstart', onTouchStart, \{\s*capture: true,\s*passive: false/);
  assert.match(toolbarTouchSource, /addEventListener\('pointerup', onPointerUp\)/);
  assert.match(toolbarTouchSource, /control\.click\?\.\(\)/);
  assert.match(toolbarTouchSource, /toolbarGestureSuppressClick/);
  assert.doesNotMatch(mainActivitySource, /toolbarImeInteraction|toolbarImeSuppressedUntilEditorTouch|setImeInputAllowed/);
  assert.doesNotMatch(editorWebViewSource, /imeInputAllowed|onCreateInputConnection|override fun requestFocus/);
});

test('auto-save snapshots the editor before pausing WebView and runs once per leave', () => {
  const pauseStart = mainActivitySource.indexOf('override fun onPause()');
  const pauseEnd = mainActivitySource.indexOf('override fun onSharedPreferenceChanged', pauseStart);
  const pauseBody = mainActivitySource.slice(pauseStart, pauseEnd);
  const saveRequest = pauseBody.indexOf('performAutoSaveOnLeave()');
  const webViewPause = pauseBody.indexOf('webView.onPause()');
  assert.ok(saveRequest >= 0);
  assert.ok(webViewPause > saveRequest);
  assert.equal(mainActivitySource.indexOf('override fun onStop()'), -1);
});

test('editor edits publish the latest Markdown snapshot before app lifecycle save', () => {
  assert.match(source, /onContentChanged\(\s*update\.state\.doc\.toString\(\),\s*this\.revision,\s*this\.documentSessionId\s*\)/);
  assert.match(mainActivitySource, /@Volatile private var latestMarkdownContent: String\? = null/);
  assert.match(mainActivitySource, /@Volatile private var isDirty: Boolean = false/);
  assert.match(mainActivitySource, /saveFileToUri\(uri, cachedMarkdownText = cachedMarkdownContent\)/);
  assert.match(mainActivitySource, /latestMarkdownContent = content/);
});

test('cached leave-save writes without waiting for evaluateJavascript callback', () => {
  const saveStart = mainActivitySource.indexOf('private fun saveFileToUri(');
  const saveEnd = mainActivitySource.indexOf('private fun handleNewWindow()', saveStart);
  const saveBody = mainActivitySource.slice(saveStart, saveEnd);
  assert.ok(saveBody.indexOf('if (cachedMarkdownText != null)') < saveBody.indexOf('webView.evaluateJavascript'));
  assert.match(saveBody, /source=\$snapshotSource/);
});

test('asynchronous saves are rejected if the active document session changed', () => {
  const saveStart = mainActivitySource.indexOf('private fun saveFileToUri(');
  const saveEnd = mainActivitySource.indexOf('private fun handleNewWindow()', saveStart);
  const saveBody = mainActivitySource.slice(saveStart, saveEnd);
  assert.match(mainActivitySource, /pendingCreateDocumentSessionId = currentDocumentSessionId/);
  assert.match(mainActivitySource, /pref_toolbar_default_corrected/);
  assert.match(saveBody, /saveSessionId != currentDocumentSessionId/);
  assert.match(saveBody, /return@persistSnapshot/);
  assert.match(saveBody, /onDocumentSavedAs\?\.\(\$escapedOldUri, \$escapedUri, \$escapedName, \$escapedSessionId\)/);
});

test('save completion only clears the tab matching the saved file identity', () => {
  const leftPanelSource = fs.readFileSync(
    path.join(__dirname, '../src/leftPanel.js'),
    'utf8'
  );
  assert.match(leftPanelSource, /onDocumentSavedAs\(oldUri, newUri, name, sessionId\)/);
  const saveCallbackStart = leftPanelSource.indexOf('onNativeDocumentSaved(uri)');
  const saveCallbackEnd = leftPanelSource.indexOf('onWindowClosing()', saveCallbackStart);
  const saveCallback = leftPanelSource.slice(saveCallbackStart, saveCallbackEnd);
  assert.match(saveCallback, /tabs\.find\(\(item\) => item\.uri === uri\)/);
  assert.doesNotMatch(saveCallback, /activeTab\(\)/);
  assert.match(mainActivitySource, /save_skipped_unconfirmed_empty_snapshot/);
});

test('dirty file tabs save on switch independently of the leave-autosave preference', () => {
  const leftPanelSource = fs.readFileSync(
    path.join(__dirname, '../src/leftPanel.js'),
    'utf8'
  );
  const persistStart = leftPanelSource.indexOf('const persistDirtyTab =');
  const leaveSaveStart = leftPanelSource.indexOf('const autoSaveDirtyTab =', persistStart);
  const persistBody = leftPanelSource.slice(persistStart, leaveSaveStart);
  const switchStart = leftPanelSource.indexOf('const activateTab =');
  const switchEnd = leftPanelSource.indexOf('const activateUntitledTab =', switchStart);
  const switchBody = leftPanelSource.slice(switchStart, switchEnd);

  assert.doesNotMatch(persistBody, /isAutoSaveOnLeaveEnabled/);
  assert.match(switchBody, /persistDirtyTab\(outgoingTab\)/);
  assert.doesNotMatch(switchBody, /activeSection\s*=\s*'tabs'/);
  assert.match(leftPanelSource, /const autoSaveDirtyTab = \(tab\) => \{\s*if \(native\?\.isAutoSaveOnLeaveEnabled/);
});

test('tab snapshots read the live editor and reject stale or empty state', () => {
  const leftPanelSource = fs.readFileSync(
    path.join(__dirname, '../src/leftPanel.js'),
    'utf8'
  );
  const getMarkdownStart = source.indexOf('getMarkdown: function()');
  const setMarkdownStart = source.indexOf('setMarkdown: function()', getMarkdownStart);
  const getMarkdownBody = source.slice(getMarkdownStart, setMarkdownStart);
  const syncStart = leftPanelSource.indexOf('const syncActiveTab =');
  const syncEnd = leftPanelSource.indexOf('const refreshRestoredTabFromStorage', syncStart);
  const syncBody = leftPanelSource.slice(syncStart, syncEnd);
  const activateStart = leftPanelSource.indexOf('const activateTab =');
  const activateEnd = leftPanelSource.indexOf('const activateUntitledTab =', activateStart);
  const activateBody = leftPanelSource.slice(activateStart, activateEnd);

  assert.ok(
    getMarkdownBody.indexOf('return activeAdapter.getMarkdown()') <
      getMarkdownBody.indexOf('if (pendingMarkdown !== null)')
  );
  assert.match(source, /activeAdapter = adapter;\s*if \(pendingMarkdown !== null\)/);
  assert.match(source, /window\.editorBridge\?\.setMarkdown\?\.\(latestPendingMarkdown\)/);
  assert.match(source, /pendingMarkdown = null;\s*isProgrammaticChange = true/);
  assert.match(syncBody, /switchingTab \|\| loadedTabId !== activeTabId/);
  assert.match(
    syncBody,
    /sameDocumentUri\(context\?\.uri \|\| null, tab\.uri \|\| null\)/
  );
  assert.match(syncBody, /markdown === '' && tab\.markdown !== ''/);
  assert.match(activateBody, /switchingTab = false;\s*renderTabs\(\)/);
  assert.doesNotMatch(activateBody, /requestAnimationFrame\(\(\) => \{\s*switchingTab = false/);
});

test('scroll positions are stored by file URI and reused across windows', () => {
  const leftPanelSource = fs.readFileSync(
    path.join(__dirname, '../src/leftPanel.js'),
    'utf8'
  );
  const historyKeyStart = mainActivitySource.indexOf('private fun currentDocumentHistoryKey()');
  const historyKeyEnd = mainActivitySource.indexOf('private fun persistDocumentUriPermission', historyKeyStart);
  const historyKey = mainActivitySource.slice(historyKeyStart, historyKeyEnd);
  const scrollSaveStart = mainActivitySource.indexOf('fun onScrollChanged(');
  const scrollSaveEnd = mainActivitySource.indexOf('\n        }', scrollSaveStart);
  const scrollSave = mainActivitySource.slice(scrollSaveStart, scrollSaveEnd);

  assert.match(historyKey, /currentFileUri\?\.toString\(\)/);
  assert.match(scrollSave, /cursor_scroll_\$\{currentDocumentHistoryKey\(\)\}/);
  assert.match(leftPanelSource, /persistCurrentScrollPosition\?\.\(\)/);
});

test('native keyboard request gives WebView touch focus before showing IME', () => {
  assert.ok(mainActivitySource.includes('webView.isFocusable = true'));
  assert.ok(mainActivitySource.includes('webView.isFocusableInTouchMode = true'));
  const touchFocus = mainActivitySource.indexOf('webView.requestFocusFromTouch()');
  const showIme = mainActivitySource.indexOf('insetsController?.show(WindowInsetsCompat.Type.ime())', touchFocus);
  assert.ok(touchFocus >= 0);
  assert.ok(showIme > touchFocus);
  assert.ok(mainActivitySource.includes('touchFocus='));
});

test('keyboard diagnostics record suppression, native show, and observed IME visibility', () => {
  assert.ok(mainActivitySource.includes('"ime_resume_suppression_started"'));
  assert.ok(mainActivitySource.includes('"ime_user_touch_released_suppression"'));
  assert.ok(mainActivitySource.includes('"ime_resume_hide_applied"'));
  assert.ok(mainActivitySource.includes('"ime_show_requested"'));
  assert.ok(mainActivitySource.includes('"ime_show_dispatched"'));
  assert.ok(mainActivitySource.includes('immAccepted='));
  assert.ok(mainActivitySource.includes('"ime_show_observed"'));
  assert.ok(mainActivitySource.includes('imeVisible='));
  assert.ok(mainActivitySource.includes('fun editorImeVisible(): Boolean'));
});

test('installed device fonts override custom body and heading font files when selected', () => {
  assert.ok(mainActivitySource.includes('if (bodyFontFamily == "default")'));
  assert.ok(mainActivitySource.includes('if (headingFontFamily == "default")'));
  assert.ok(settingsActivitySource.includes('DeviceFontCatalog.options()'));
  assert.ok(settingsActivitySource.includes('preference.key?.endsWith("_font_family")'));
  assert.ok(source.includes('const familyValue = toCssFontFamily(deviceFont)'));
});

test('detailed navigation capture is opt-in in debug and disabled in release builds', () => {
  const diagnosticsPath = path.join(
    __dirname,
    '../../app/src/main/java/com/wmdx/markdownapp/AppDiagnostics.kt'
  );
  const diagnosticsSource = fs.readFileSync(diagnosticsPath, 'utf8');
  assert.ok(diagnosticsSource.includes('putBoolean("capture_opt_in", true)'));
  assert.ok(diagnosticsSource.includes('prefs.getBoolean("capture_opt_in", false)'));
  assert.ok(diagnosticsSource.includes('if (!BuildConfig.DEBUG) return'));
  assert.ok(diagnosticsSource.includes('if (!isNavigationCaptureActive(activity)) return'));
  assert.ok(mainActivitySource.includes('setNavigationDiagnosticsEnabled'));
  assert.ok(mainActivitySource.includes('window.editorBridge?.setNavigationDiagnosticsEnabled?.($captureActive)'));
  assert.ok(mainActivitySource.includes('if (BuildConfig.DEBUG && jsonRecord != null'));
  assert.ok(mainActivitySource.includes('if (BuildConfig.DEBUG && jsonBatch != null)'));
  assert.ok(settingsActivitySource.includes('isVisible = BuildConfig.DEBUG'));
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
  assert.match(mainSettingsXml, /ResetPreferenceCategory app:title="Preferences"/);
  assert.doesNotMatch(mainSettingsXml, /Display &amp; Images/);
  assert.match(
    mainSettingsXml,
    /app:key="pref_page_storage_access"[\s\S]*?\/>\s*<com\.wmdx\.markdownapp\.ResetListPreference\s+app:key="pref_markdown_image_location"/
  );
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

test('body background color is configurable independently of the app theme', () => {
  assert.match(
    bodySettingsXml,
    /app:key="pref_body_background_color"[\s\S]*?app:defaultValue="default"/
  );
  assert.match(resetPreferencesSource, /key == "pref_body_background_color" -> "default"/);
  assert.match(
    resetPreferencesSource,
    /"pref_body_background_color" ->\s*if \(isLightTheme\) "#FFFFFF" else "#000000"/
  );
  assert.match(
    source,
    /const bodyBackgroundColor = prefs\.pref_body_background_color;[\s\S]*?setCssVar\(\s*'--body-background-color',\s*bodyBackgroundColor && bodyBackgroundColor !== 'default'\s*\?\s*androidArgbToCss\(bodyBackgroundColor\)\s*:\s*undefined/
  );
  assert.match(
    editorHtml,
    /html, body\s*\{[\s\S]*?background-color: var\(--body-background-color, var\(--bg-color\)\)/
  );
  assert.match(
    editorHtml,
    /\.cm-editor\s*\{[\s\S]*?background-color: var\(--body-background-color, var\(--bg-color\)\) !important/
  );
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
    'Attachments',
    'Block Quotes',
    'Body',
    'Bold',
    'Callouts',
    'Code Blocks',
    'Cursor &amp; Selection',
    'Footnotes',
    'Headings (H1 – H6)',
    'Highlights &amp; Pens',
    'Horizontal Rules',
    'Inline Code',
    'Italic',
    'Links',
    'Lists (Bulleted, Numbered, Todo Checkboxes)',
    'Media Playback',
    'Paragraph',
    'Tables',
    'Underline'
  ].map(title => navigationXml.indexOf(`app:title="${title}"`));
  assert.ok(orderedPages.every(index => index >= 0), 'Every expected typography page is present');
  assert.deepEqual(
    orderedPages,
    [...orderedPages].sort((first, second) => first - second),
    'Every Document Appearance page is alphabetized by title'
  );
});

test('UI Appearance contains the requested pages in order', () => {
  const uiAppearanceXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_ui_appearance.xml'),
    'utf8'
  );
  const pages = [...uiAppearanceXml.matchAll(
    /app:key="([^"]+)"\s+app:title="([^"]+)"/g
  )];
  assert.deepEqual(
    pages.map(([, key, title]) => [key, title.replaceAll('&amp;', '&')]),
    [
      ['pref_page_settings_theme', 'Settings'],
      ['pref_app_theme', 'App Theme'],
      ['pref_page_new_tab_appearance', 'New Tab'],
      ['pref_page_findreplace', 'Find & Replace'],
      ['pref_hide_status_bar', 'Hide Status Bar'],
      ['pref_hide_nav_bar', 'Hide Navigation Bar'],
      ['pref_page_left_panel', 'Left Panel'],
      ['pref_page_toc', 'Right Panel: TOC'],
      ['pref_page_bottom_toolbar', 'Toolbars']
    ]
  );
  assert.match(mainSettingsXml, /app:key="pref_page_ui_appearance"[\s\S]*?app:title="UI Appearance"/);
  assert.match(mainSettingsXml, /app:key="pref_page_styling"[\s\S]*?app:title="Document Appearance"/);
  assert.doesNotMatch(mainSettingsXml, /app:key="pref_page_(settings_theme|findreplace|left_panel|toc|bottom_toolbar)"/);
  assert.doesNotMatch(mainSettingsXml, /app:key="(pref_app_theme|pref_hide_status_bar|pref_hide_nav_bar)"/);
  assert.ok(settingsActivitySource.includes('UIAppearanceSettingsFragment'));
  assert.ok(settingsActivitySource.includes('is SettingsThemeFragment -> "Settings"'));
  assert.ok(settingsActivitySource.includes('is StylingSettingsFragment -> "Document Appearance"'));
  assert.ok(settingsActivitySource.includes('"pref_styling_page_media" -> MediaPlaybackSettingsFragment()'));
  assert.ok(settingsActivitySource.includes('"pref_styling_page_body" -> StylingBodyFragment()'));
  assert.ok(settingsActivitySource.includes('"pref_styling_page_paragraph" -> StylingParagraphFragment()'));
  assert.ok(settingsActivitySource.includes('"pref_page_toc" -> TocPanelSettingsFragment()'));
  assert.ok(settingsActivitySource.includes('"pref_page_left_panel" -> LeftPanelSettingsFragment()'));
  assert.ok(settingsActivitySource.includes('"pref_page_bottom_toolbar" -> StylingControlbarFragment()'));
  assert.ok(!stylingPagesXml.includes('pref_styling_page_controlbar'));
  assert.ok(settingsActivitySource.includes('is StylingControlbarFragment -> "Toolbars"'));
});

test('toolbar preview finalizes drops from Android native touch release', () => {
  assert.match(
    settingsActivitySource,
    /setOnTouchListener\s*\{[\s\S]*?MotionEvent\.ACTION_UP[\s\S]*?finishToolbarDragFromNative/
  );
  assert.match(toolbarPreviewSource, /window\.finishToolbarDragFromNative\s*=/);
});

test('toolbar layout is explicitly saved from the separate preview when settings change or collapse', () => {
  assert.match(toolbarPreviewSource, /window\.saveToolbarLayout\s*=\s*\(\) => saveConfig\(\)/);
  assert.match(
    settingsActivitySource,
    /appearanceHeader\.setOnPreferenceClickListener\s*\{[\s\S]*?saveToolbarPreviewLayout\(\)/
  );
  assert.match(
    settingsActivitySource,
    /override fun onSettingPreferenceChanged[\s\S]*?saveToolbarPreviewLayout\(\)[\s\S]*?updateToolbarPreview\(includeToolbarConfig = false\)/
  );
});

test('toolbar layout saves automatically without a manual save row', () => {
  assert.doesNotMatch(toolbarSettingsXml, /pref_toolbar_save_layout|Save toolbar layout/);
  assert.doesNotMatch(settingsActivitySource, /pref_toolbar_save_layout|showFeedback/);
  assert.match(settingsActivitySource, /private fun saveToolbarPreviewLayout\(\)/);
  assert.match(settingsActivitySource, /findViewWithTag<android\.webkit\.WebView>/);
  assert.match(settingsActivitySource, /toolbar-preview-save-target/);
  assert.match(settingsActivitySource, /var save = window\.saveToolbarLayout/);
  assert.match(settingsActivitySource, /private lateinit var toolbarPreferences: SharedPreferences/);
  assert.match(
    settingsActivitySource,
    /PreferenceManager\.getDefaultSharedPreferences\(requireContext\(\)\.applicationContext\)/
  );
  assert.match(settingsActivitySource, /Failed to write toolbar layout preferences/);
  assert.match(settingsActivitySource, /SharedPreferences commit failed for toolbar layout/);
  assert.match(settingsActivitySource, /fun saveBottomToolbarConfig\(raw: String\): String/);
  assert.match(settingsActivitySource, /toolbarSaveFailureReason = "invalid_config"/);
  assert.match(settingsActivitySource, /toolbarSaveFailureReason = "commit_failed"/);
  assert.doesNotMatch(settingsActivitySource, /removeJavascriptInterface\("ToolbarSettings"\)/);
  assert.match(settingsActivitySource, /toolbarPreviewWebView\?\.apply\s*\{[\s\S]*?stopLoading\(\)[\s\S]*?destroy\(\)/);
  assert.match(
    toolbarPreviewSource,
    /bridge\.saveBottomToolbarConfig\(JSON\.stringify\(config\)\)/
  );
  assert.doesNotMatch(
    toolbarPreviewSource,
    /const save = window\.ToolbarSettings\?\.saveBottomToolbarConfig/
  );
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

test('keyboard shortcuts are one flat alphabetical list with no section headings', () => {
  assert.doesNotMatch(hotkeysXml, /ResetPreferenceCategory/);
  const titles = [...hotkeysXml.matchAll(/app:title="([^"]+)"/g)]
    .map(([, title]) => title.replace(/&amp;/g, '&'));
  assert.equal(titles.length, 71, 'All shortcut preferences remain present');
  assert.deepEqual(
    titles,
    [...titles].sort((first, second) =>
      first.localeCompare(second, undefined, { sensitivity: 'base' })
    ),
    'Shortcut names are alphabetized across the full list'
  );
});

test('every visible hotkey preference reaches a matching editor action', () => {
  const preferenceKeys = [...hotkeysXml.matchAll(/app:key="pref_hotkey_([^"]+)"/g)]
    .map(([, key]) => key);
  const mappings = [...mainActivitySource.matchAll(/"([^"]+)"\s+to\s+prefs\.getString\("pref_hotkey_([^"]+)"/g)]
    .map(([, editorKey, preferenceKey]) => [preferenceKey, editorKey]);
  const mappingByPreference = new Map(mappings);
  const keyboardHandler = source.slice(source.indexOf('function setupKeyboardShortcuts()'), source.indexOf('// Global JS Bridge exposure'));
  for (const preferenceKey of preferenceKeys) {
    const editorKey = mappingByPreference.get(preferenceKey);
    assert.ok(editorKey, 'Missing native mapping for ' + preferenceKey);
    assert.ok(keyboardHandler.includes('customHotkeys.' + editorKey), 'Missing editor handler for ' + preferenceKey);
  }
  assert.ok(keyboardHandler.includes("execCmd('InsertFootnote')"));
  assert.ok(keyboardHandler.includes("setEditorMode(currentModePreference === 'source' ? 'rendered' : 'source')"));
});

test('Ctrl+O is intercepted before the editor handles the key', () => {
  const keyboardHandler = source.slice(
    source.indexOf('function setupKeyboardShortcuts()'),
    source.indexOf('// Global JS Bridge exposure')
  );
  assert.match(
    keyboardHandler,
    /window\.addEventListener\('keydown',\s*\(e\)\s*=>\s*\{[\s\S]*?parseAndMatchHotkey\(e,\s*customHotkeys\.open\)[\s\S]*?e\.stopImmediatePropagation\(\)[\s\S]*?onNativeAction\?\.\('open'\)[\s\S]*?\},\s*true\)/
  );
});

test('left panel search options reach native search and the file filters', () => {
  assert.match(leftPanelHtml, /id="left-panel-search-whole-words"[\s\S]*?<span>word<\/span>/);
  assert.match(leftPanelHtml, /id="left-panel-search-contents"[\s\S]*?<span>in files<\/span>/);
  assert.match(leftPanelHtml, /id="left-panel-search-markdown-only"[\s\S]*?<span>\*\.md<\/span>/);
  assert.match(
    leftPanelSource,
    /searchLeftPanelFiles\(\s*query,\s*Boolean\(searchContents\?\.checked\),\s*Boolean\(searchWholeWords\?\.checked\),\s*Boolean\(searchMarkdownOnly\?\.checked\),\s*requestId/s
  );
  assert.match(
    mainActivitySource,
    /fun searchLeftPanelFiles\(\s*query: String,\s*includeContents: Boolean,\s*wholeWords: Boolean,\s*markdownOnly: Boolean,\s*requestId: Int/s
  );
  assert.match(
    mainActivitySource,
    /markdownExtensions = setOf\("\.md", "\.textpack", "\.textpack\.zip", "\.mdz"\)/
  );
  assert.match(
    mainActivitySource,
    /Regex\(\s*"\(\^\|\[\^\\\\p\{L\}\\\\p\{N\}_\]\).*Regex\.escape\(needle\).*IGNORE_CASE/s
  );
});

test('New Tab keeps open documents and exposes session, search, and styling paths', () => {
  const uiAppearanceXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_ui_appearance.xml'),
    'utf8'
  );
  const newTabAppearanceXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_new_tab.xml'),
    'utf8'
  );

  assert.match(leftPanelSource, /const openNewTab = \(\) =>/);
  assert.match(leftPanelSource, /isStartPage: Boolean\(documentData\.isStartPage\)/);
  assert.match(leftPanelSource, /isStartPage: Boolean\(savedTab\.isStartPage\)/);
  assert.match(leftPanelSource, /const visible = !active \|\| Boolean\(active\.isStartPage\)/);
  assert.match(leftPanelSource, /native\.requestDefaultSearchFolderAccess\?\.\(\)/);
  assert.match(
    leftPanelSource,
    /launcherWindow \? 'open_session_new_window' : 'open_session'/
  );
  assert.match(source, /window\.leftPanelController\?\.openNewTab\?\.\(\)/);
  assert.match(hotkeysXml, /app:key="pref_hotkey_new"[\s\S]*?app:title="Document: New Tab"/);
  assert.match(leftPanelHtml, /data-start-page-action="open-session-new-window"/);

  assert.match(
    mainActivitySource,
    /openWmdxTabSessionLauncher\.launch\(createOpenWmdxTabSessionIntent\(\)\)/
  );
  assert.match(mainActivitySource, /if \(!isWmdxTabSession\(uri\)\)/);
  assert.match(mainActivitySource, /openWmdxTabSessionInNewWindow\(uri, permissionFlags\)/);
  assert.match(mainActivitySource, /putExtra\("open_wmdx_tab_session_uri"/);

  assert.ok(
    uiAppearanceXml.indexOf('app:key="pref_app_theme"') <
      uiAppearanceXml.indexOf('app:key="pref_page_new_tab_appearance"') &&
      uiAppearanceXml.indexOf('app:key="pref_page_new_tab_appearance"') <
        uiAppearanceXml.indexOf('app:key="pref_page_findreplace"'),
    'New Tab styling appears after App Theme and before Find & Replace'
  );
  assert.match(settingsActivitySource, /pref_page_new_tab_appearance" -> NewTabAppearanceSettingsFragment\(\)/);
  assert.match(newTabAppearanceXml, /app:key="pref_start_page_bg_color"/);
  assert.match(newTabAppearanceXml, /app:key="pref_start_page_action_border_color"/);
  assert.match(source, /setCssVar\('--start-page-bg-color'/);
});

test('tab long-press menu includes New tab without replacing other tabs', () => {
  assert.match(
    leftPanelSource,
    /const showTabMenu = \(tab, x = 16, y = 120\) => \{[\s\S]*?const actions = \[[\s\S]*?\['New tab', \(\) => openNewTab\(\)\]/
  );
  assert.match(leftPanelSource, /const openNewTab = \(\) =>/);
});

test('empty file search requests read access to Documents instead of silently returning nothing', () => {
  assert.match(
    leftPanelSource,
    /Choose Documents when prompted to allow file search\.[\s\S]*?requestDefaultSearchFolderAccess/
  );
  assert.match(mainActivitySource, /ACTION_OPEN_DOCUMENT_TREE/);
  assert.match(
    mainActivitySource,
    /DocumentsContract\.buildDocumentUri\(\s*"com\.android\.externalstorage\.documents",\s*"primary:Documents"/
  );
  assert.match(
    mainActivitySource,
    /takePersistableUriPermission\(uri, readFlag\)/
  );
});

test('search paths are hidden by default and controlled by left panel settings', () => {
  assert.match(
    leftPanelSettingsXml,
    /app:key="pref_left_panel_show_search_path"[\s\S]*?app:defaultValue="false"/
  );
  assert.match(
    resetPreferencesSource,
    /key == "pref_left_panel_show_search_path" -> false/
  );
  assert.match(leftPanelSource, /if \(showSearchPath && result\.path\)/);
  assert.match(
    leftPanelSource,
    /prefs\?\.pref_left_panel_show_search_path === true/
  );
});

test('left panel search checkboxes use list typography and todo checkbox colors', () => {
  assert.match(
    leftPanelHtml,
    /\.left-panel-search-option\s*\{[\s\S]*?font-family:\s*var\(--list-font-family[\s\S]*?font-size:\s*var\(--list-font-size[\s\S]*?font-weight:\s*var\(--list-font-weight/
  );
  assert.match(leftPanelHtml, /border:\s*1\.5px solid var\(--todo-border-color/);
  assert.match(leftPanelHtml, /background:\s*var\(--todo-accent-color/);
  assert.match(leftPanelHtml, /border:\s*solid var\(--todo-checkmark-color/);
});

test('search options stay in one row', () => {
  assert.match(leftPanelHtml, /class="left-panel-search-options"[\s\S]*?id="left-panel-search-whole-words"[\s\S]*?id="left-panel-search-contents"[\s\S]*?id="left-panel-search-markdown-only"/);
  assert.match(leftPanelHtml, /\.left-panel-search-options\s*\{[\s\S]*?display:\s*flex/);
  assert.match(leftPanelHtml, /\.left-panel-search-options\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
});

test('panel and tab controls default enabled, and tab labels hide extensions', () => {
  assert.match(
    leftPanelSettingsXml,
    /app:key="pref_left_panel_enabled"[\s\S]*?app:defaultValue="true"/
  );
  assert.match(
    leftPanelSettingsXml,
    /app:key="pref_left_panel_tabs_enabled"[\s\S]*?app:defaultValue="true"/
  );
  assert.match(
    leftPanelSettingsXml,
    /app:key="pref_left_panel_hide_file_extension"[\s\S]*?app:defaultValue="true"/
  );
  assert.match(
    tocSettingsXml,
    /app:key="pref_toc_panel_enabled"[\s\S]*?app:defaultValue="true"/
  );
  assert.match(
    resetPreferencesSource,
    /key == "pref_left_panel_hide_file_extension" -> true/
  );
  assert.match(
    leftPanelSource,
    /prefs\?\.pref_left_panel_tabs_enabled !== false/
  );
  assert.match(leftPanelSource, /displayTabName\(tab\.name\)/);
  assert.match(leftPanelSource, /if \(!panelEnabled && panel\.classList\.contains\('open'\)\) closePanel\(\)/);
  assert.match(source, /if \(!tocPanelEnabled\) return/);
});

test('active tab text and background colors are configurable with existing defaults preserved', () => {
  assert.match(
    leftPanelSettingsXml,
    /app:key="pref_left_panel_active_tab_text_color"[\s\S]*?app:defaultValue="default"/
  );
  assert.match(
    leftPanelSettingsXml,
    /app:key="pref_left_panel_active_tab_bg_color"[\s\S]*?app:defaultValue="default"/
  );
  assert.match(
    resetPreferencesSource,
    /key == "pref_left_panel_active_tab_text_color" \|\|\s*key == "pref_left_panel_active_tab_bg_color" -> "default"/
  );
  assert.match(
    resetPreferencesSource,
    /"pref_left_panel_active_tab_bg_color" -> \{[\s\S]*?ColorPickerDialog\.parseHexColor\(panelTextColor, fallback\)/
  );
  assert.match(
    leftPanelHtml,
    /\.left-panel-row\.selected\s*\{[\s\S]*?--left-panel-active-tab-text-color[\s\S]*?--left-panel-active-tab-bg-color/
  );
  assert.match(source, /--left-panel-active-tab-text-color/);
  assert.match(source, /--left-panel-active-tab-bg-color/);
});

test('folder file actions keep open, open-in-new-tab, rename, and delete distinct', () => {
  assert.match(leftPanelSource, /\['Rename', \(\) => renameFolderFile\(entry\)\]/);
  assert.match(leftPanelSource, /\['Open in new tab', \(\) => openDocument\(entry\.uri\)\]/);
  assert.match(leftPanelSource, /\['Open', \(\) => openDocument\(entry\.uri, \{ replaceActive: true \}\)\]/);
  assert.match(leftPanelSource, /deleteTabFile\(openTab \|\| \{/);
  assert.match(
    mainActivitySource,
    /fun readLeftPanelDocumentForNavigation[\s\S]*?synchronized\(documentHistoryLock\)[\s\S]*?currentFileUri\?\.let \{ current -> documentHistoryStack\.push\(current\) \}[\s\S]*?documentForwardStack\.clear\(\)/
  );
});

test('tab group membership persists alongside file tab state', () => {
  assert.match(
    leftPanelSource,
    /JSON\.stringify\(\{\s*activeTabId,\s*tabs,\s*groups,\s*portableSessionUri:\s*activePortableSessionUri\s*\}\)/
  );
  assert.match(leftPanelSource, /groupId: groups\.some\(\(group\) => group\.id === savedTab\.groupId\)/);
  assert.match(leftPanelSource, /dissolveTabGroup\(tabs, groups, group\.id\)/);
});

test('document history is stored and restored with the active tab', () => {
  assert.match(leftPanelSource, /documentHistoryBack: \[\]/);
  assert.match(leftPanelSource, /documentHistoryBack: Array\.isArray\(savedTab\.documentHistoryBack\)/);
  assert.match(leftPanelSource, /captureTabHistoryState\(tab\)/);
  assert.match(leftPanelSource, /serializeTabHistoryState\(next\)/);
  assert.match(leftPanelSource, /pendingTabHistoryNavigation && current/);
  assert.match(mainActivitySource, /fun getDocumentNavigationHistory\(\)/);
  assert.match(mainActivitySource, /restoreDocumentHistoryState\(historyStateJson\.orEmpty\(\)\)/);
  assert.match(
    mainActivitySource,
    /beginTabHistoryNavigation\(\)\s*openFile\(uri, rememberHistory = false, skipExistingWindowFocus = true\)/
  );
});

test('opening a file already in another tab or window focuses its existing owner', () => {
  const windowRegistrySource = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/WindowRegistry.kt'),
    'utf8'
  );
  assert.match(leftPanelSource, /native\?\.focusOpenDocument\?\.\(uri\) === true/);
  assert.match(leftPanelSource, /focusDocumentUri\(uri\)/);
  assert.match(leftPanelSource, /sameDocumentUri\(tab\.uri, uri\)/);
  assert.match(leftPanelSource, /normalizeDocumentUri/);
  assert.match(mainActivitySource, /fun registerLeftPanelOpenTabUris\(urisJson: String\)/);
  assert.match(windowRegistrySource, /openTabUris\(context, taskId\)/);
  assert.match(windowRegistrySource, /activity\.requestExistingDocumentFocus\(targetUri\)/);
  assert.match(windowRegistrySource, /matchedFocusUri = matchingTabUri \?\: currentUri/);
  assert.match(windowRegistrySource, /Os\.fstat\(parcelFile\.fileDescriptor\)/);
  assert.match(windowRegistrySource, /tab_file_identity/);
  assert.match(windowRegistrySource, /via=\$matchedBy/);
  assert.match(mainActivitySource, /window_focus_tab_result/);
  assert.match(mainActivitySource, /if \(!isActivityResumed \|\| !isEditorReady/);
});

test('long-press menus stay above the bottom toolbar', () => {
  assert.match(leftPanelSource, /const positionTabMenu = \(x, y\) =>/);
  assert.match(leftPanelSource, /toolbarRect\.top/);
  assert.match(leftPanelSource, /tabMenu\.style\.maxHeight/);
  assert.match(leftPanelHtml, /\.left-panel-context-menu\s*\{[\s\S]*z-index:\s*10020 !important;[\s\S]*overflow-y:\s*auto;/);
});

test('launcher tabs persist while file-manager window tabs are temporary', () => {
  assert.match(
    leftPanelSource,
    /const tabsStorageKey = launcherWindow\s*\? LAUNCHER_TABS_KEY\s*:\s*`\$\{TASK_TABS_KEY_PREFIX\}\$\{windowContext\.taskId \?\? 'untracked'\}`/
  );
  assert.match(
    leftPanelSource,
    /onWindowClosing\(\)\s*\{\s*if \(!launcherWindow\)\s*\{[\s\S]*?localStorage\.removeItem\(tabsStorageKey\)/
  );
});

test('tab sessions save and restore tab references and scroll positions only', () => {
  const toolbarConfigSource = fs.readFileSync(
    path.join(__dirname, '../src/toolbarConfig.js'),
    'utf8'
  );
  const toolbarIconsSource = fs.readFileSync(
    path.join(__dirname, '../src/toolbarIcons.js'),
    'utf8'
  );
  const sanitizerStart = mainActivitySource.indexOf('private fun sanitizeWmdxTabSession');
  const sanitizerEnd = mainActivitySource.indexOf('private fun isWmdxTabSession', sanitizerStart);
  const sanitizerSource = mainActivitySource.slice(sanitizerStart, sanitizerEnd);

  assert.match(leftPanelSource, /format: 'wmdx-tabs-session'/);
  assert.match(leftPanelSource, /restorePortableSession/);
  assert.match(leftPanelSource, /scrollTop: Number\.isFinite\(tab\.scrollTop\)/);
  assert.match(mainActivitySource, /saveWmdxTabSession\(sessionJson: String\)/);
  assert.match(mainActivitySource, /readWmdxTabSession\(uriString: String\)/);
  assert.match(
    mainActivitySource,
    /openWmdxTabSessionLauncher[\s\S]*?StartActivityForResult\(\)\)[\s\S]*?resultIntent\?\.flags/
  );
  assert.match(mainActivitySource, /createOpenWmdxTabSessionIntent\(\)/);
  assert.match(mainActivitySource, /clipData = android\.content\.ClipData\.newRawUri\("W\.mdx session", uri\)/);
  assert.match(mainActivitySource, /open_session[\s\S]*?openWmdxTabSessionLauncher\.launch\(createOpenWmdxTabSessionIntent\(\)\)/);
  assert.match(mainActivitySource, /Wmdx Session\.wmdx/);
  assert.match(mainActivitySource, /name\.endsWith\("\.wmdx", ignoreCase = true\)/);
  assert.doesNotMatch(mainActivitySource, /name\.endsWith\("\.wmds", ignoreCase = true\)/);
  assert.doesNotMatch(mainActivitySource, /name\.endsWith\("\.mds", ignoreCase = true\)/);
  assert.doesNotMatch(mainActivitySource, /name\.endsWith\("\.wmdxsession", ignoreCase = true\)/);
  assert.match(mainActivitySource, /updateWmdxTabSession\(sessionJson: String, uriString: String\)/);
  assert.match(mainActivitySource, /cachePendingWmdxTabSessionSave/);
  assert.match(mainActivitySource, /clearPendingWmdxTabSessionSave/);
  assert.match(leftPanelSource, /native\.updateWmdxTabSession\(sessionJson, activePortableSessionUri\)/);
  assert.match(leftPanelSource, /hasPendingWmdxTabSessionSave/);
  assert.match(leftPanelSource, /onWmdxTabSessionSaved/);
  assert.match(leftPanelSource, /onWmdxTabSessionSaveFailed/);
  assert.doesNotMatch(sanitizerSource, /\.put\("markdown"/);
  assert.match(appManifestXml, /application\/vnd\.wmdx\.tabs-session\+json/);
  assert.match(
    mainActivitySource,
    /createTextPackDocumentLauncher[\s\S]*?CreateDocument\("application\/vnd\.wmdx\.textpack"\)/
  );
  assert.match(
    mainActivitySource,
    /private fun defaultTextPackSaveAsName\(\)[\s\S]*?return "\$base\.textpack"/
  );
  assert.match(textPackManagerSource, /ZipInputStream\(inputStream\)/);
  assert.match(hotkeysXml, /pref_hotkey_save_tabs[\s\S]*app:defaultValue=""/);
  assert.match(resetPreferencesSource, /pref_hotkey_save_tabs" -> ""/);
  assert.match(mainActivitySource, /"save_tabs" to prefs\.getString\("pref_hotkey_save_tabs", ""\)/);
  assert.match(source, /save_tabs: ''/);
  assert.match(toolbarConfigSource, /'saveTabs'/);
  assert.match(toolbarIconsSource, /saveTabs:/);
});

test('session restore clearly explains when referenced files need folder access', () => {
  assert.match(
    mainActivitySource,
    /put\("needsFolderAccess", true\)/
  );
  assert.match(
    leftPanelSource,
    /if \(documentData\?\.needsFolderAccess\)[\s\S]*?title: 'Folder access required'[\s\S]*?cannot be restored[\s\S]*?one or more files it references[\s\S]*?every folder containing files used by this session[\s\S]*?Settings > File & Folder Access[\s\S]*?reopen the session/
  );
});

test('New tab saves new documents before opening them and keeps an empty launcher at the start page', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../web/index.html'), 'utf8');

  for (const action of ['new-markdown', 'new-mdzip', 'go-to-file', 'open-file', 'open-session']) {
    assert.match(html, new RegExp(`data-start-page-action="${action}"`));
  }
  assert.match(html, /<button[^>]+data-start-page-action="go-to-file"[^>]*>\s*Search\s*<\/button>/);
  assert.match(html, /<button[^>]+data-start-page-action="open-file"[^>]*>\s*Open file\s*<\/button>/);
  assert.match(leftPanelSource, /case 'open-file':\s*native\?\.onNativeAction\?\.\('open'\);/);
  assert.match(leftPanelSource, /const activateStartPage = \(\) =>/);
  assert.match(leftPanelSource, /else activateStartPage\(\);/);
  assert.match(leftPanelSource, /false,\s*false,\s*false,\s*false,\s*false,\s*'\{\}'/);
  assert.match(mainActivitySource, /historyStateJson: String\?/);
  assert.doesNotMatch(
    leftPanelSource,
    /addTab\(\{ uri: null, name: 'Untitled', markdown: currentMarkdown\(\) \}/
  );
  assert.match(mainActivitySource, /requestNewDocument\(DocumentFormat\.MARKDOWN\)/);
  assert.match(mainActivitySource, /requestNewDocument\(DocumentFormat\.MDZIP\)/);
  assert.match(mainActivitySource, /ensureDocumentExtension\(uri, extension\)/);
  assert.match(mainActivitySource, /openDocumentFromNative/);
  assert.match(mainActivitySource, /openWmdxTabSessionLauncher\.launch/);
});

test('TextPack image previews resolve paths from the active package assets', () => {
  assert.match(
    mainActivitySource,
    /url\.path\?\.startsWith\("\/textpack-assets\/"\)/
  );
  assert.match(
    mainActivitySource,
    /fun resolveTextPackAssetUrl\(relativeLink: String\)/
  );
  assert.match(
    mainActivitySource,
    /TextPackManager\.resolveAssetFile\(session, archivePath\)/
  );
  assert.match(source, /resolveTextPackAssetUrl\?\.\(this\.url\)/);
});

test('Image insertion separates file, Base64, and URL options and stores file images by format', () => {
  assert.match(mainActivitySource, /Choose image file and embed as Base64/);
  assert.match(mainActivitySource, /"Paste Base64"/);
  assert.match(mainActivitySource, /"Enter URL"/);
  assert.match(mainActivitySource, /Download image to document assets/);
  assert.match(mainActivitySource, /Embed image as Base64/);
  assert.match(mainActivitySource, /Leave both options unchecked to use the URL directly/);
  assert.match(mainActivitySource, /pref_markdown_image_location/);
  assert.match(mainActivitySource, /TextPackManager\.addAssetImage/);
  assert.match(mainActivitySource, /MdzipManager\.addAttachment/);
  assert.match(mainActivitySource, /MarkdownAssetManager\.addImage/);
  assert.ok(
    mainActivitySource.includes('window.editorBridge.insertImage($escapedReference'),
    'insertImage receives a raw URL or path and adds Markdown exactly once'
  );
  assert.doesNotMatch(mainActivitySource, /pref_image_mode/);
  assert.doesNotMatch(mainActivitySource, /markdownImageTag/);
  assert.match(source, /resolveMdzipAttachmentUrl\?\.\(this\.url\)/);
  assert.match(source, /resolveMarkdownAssetUrl\?\.\(this\.url\)/);
});

test('Save preserves the active document format for direct save and fallback', () => {
  const saveStart = mainActivitySource.indexOf('private fun handleSaveFile()');
  const saveEnd = mainActivitySource.indexOf('private fun handleSaveAsFile()', saveStart);
  const saveHandler = mainActivitySource.slice(saveStart, saveEnd);
  assert.match(saveHandler, /requestedAsMdzip = currentDocumentFormat == DocumentFormat\.MDZIP/);
  assert.match(saveHandler, /requestedAsTextPack = currentDocumentFormat == DocumentFormat\.TEXT_PACK/);
  assert.match(saveHandler, /when \(currentDocumentFormat\)/);
  assert.match(saveHandler, /DocumentFormat\.MDZIP -> handleSaveAsMdzipFile\(\)/);
  assert.match(saveHandler, /DocumentFormat\.TEXT_PACK -> handleSaveAsTextPackFile\(\)/);
  assert.match(mainActivitySource, /"save_action"/);
});

test('editor keyboard behavior no longer depends on toolbar input gating', () => {
  assert.doesNotMatch(source, /beginToolbarInteraction|endToolbarInteraction|onEditorPointerDown/);
  assert.doesNotMatch(mainActivitySource, /toolbarImeInteraction|toolbarImeSuppressedUntilEditorTouch|setImeInputAllowed/);
  assert.doesNotMatch(editorWebViewSource, /imeInputAllowed|InputConnection|override fun requestFocus/);
  assert.match(source, /document\.addEventListener\('pointerdown'[\s\S]*isTextInput[\s\S]*showEditorKeyboard/);
});

test('Markdown image storage can recover document ancestry from the approved tree', () => {
  const assetManagerSource = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/MarkdownAssetManager.kt'),
    'utf8'
  );
  assert.match(assetManagerSource, /findPathByTreeTraversal/);
  assert.match(assetManagerSource, /findPathsByDisplayNameInTree/);
  assert.match(assetManagerSource, /queryDisplayName\(context, documentUri\)/);
  assert.match(assetManagerSource, /hasSameContent\(context, documentUri, candidateUri\)/);
  assert.match(assetManagerSource, /strategy=unique_name_and_content/);
  assert.match(assetManagerSource, /uniqueNameMatches\.size == 1/);
  assert.match(assetManagerSource, /MAX_PATH_SEARCH_DOCUMENTS/);
  assert.match(assetManagerSource, /MAX_PATH_SEARCH_DEPTH/);
  assert.match(assetManagerSource, /exactMatches\.maxByOrNull \{ it\.parentDocumentIds\.size \}/);
});

test('Document Appearance pages are alphabetized by title', () => {
  const styleRoot = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling.xml'),
    'utf8'
  );
  const titles = [...styleRoot.matchAll(
    /app:key="pref_styling_page_[^"]+"\s+app:title="([^"]+)"/g
  )].map(match => match[1].replaceAll('&amp;', '&'));
  assert.deepEqual(titles, [
    'Attachments',
    'Block Quotes',
    'Body',
    'Bold',
    'Callouts',
    'Code Blocks',
    'Cursor & Selection',
    'Embedded Content',
    'Footnotes',
    'Headings (H1 – H6)',
    'Highlights & Pens',
    'Horizontal Rules',
    'Inline Code',
    'Italic',
    'Links',
    'Lists (Bulleted, Numbered, Todo Checkboxes)',
    'Media Playback',
    'Paragraph',
    'Tables',
    'Underline'
  ]);
  assert.doesNotMatch(styleRoot, /ResetPreferenceCategory[^>]*app:title="Text Elements"/);
});

test('Attachment style preferences are reachable and applied to packaged attachment links', () => {
  const styleRoot = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling.xml'),
    'utf8'
  );
  const attachmentSettings = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_attachments.xml'),
    'utf8'
  );
  const settingsActivity = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'),
    'utf8'
  );
  assert.match(styleRoot, /pref_styling_page_attachments/);
  assert.match(settingsActivity, /pref_styling_page_attachments" -> StylingAttachmentsFragment/);
  assert.match(attachmentSettings, /pref_mdzip_attachment_bg_color/);
  assert.match(attachmentSettings, /pref_mdzip_attachment_text_color/);
  assert.match(attachmentSettings, /pref_mdzip_attachment_border_color/);
  assert.match(attachmentSettings, /pref_mdzip_attachment_border_radius/);
  assert.match(source, /--mdzip-attachment-bg-color/);
  assert.match(source, /--mdzip-attachment-border-radius/);
});

