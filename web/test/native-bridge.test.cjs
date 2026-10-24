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
const storageSettingsXml = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_storage_access.xml'),
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

test('document rename supports exact-file access when Android blocks folder selection', () => {
  assert.ok(mainActivitySource.includes('Intent.ACTION_OPEN_DOCUMENT'));
  assert.ok(mainActivitySource.includes('EXTRA_INITIAL_URI, uri'));
  assert.ok(mainActivitySource.includes('handleRenameFileSelection(result.resultCode, result.data)'));
  assert.ok(mainActivitySource.includes('isSameDocumentSelection(request.uri, selectedUri)'));
  assert.ok(mainActivitySource.includes('offerFolderFallback = true'));
  assert.ok(mainActivitySource.includes('queryRenameDocumentMetadata'));
  const handlerStart = mainActivitySource.indexOf('private fun handleRenameFileSelection(');
  const handlerEnd = mainActivitySource.indexOf('private data class RenameDocumentMetadata', handlerStart);
  const handler = mainActivitySource.slice(handlerStart, handlerEnd);
  assert.ok(!handler.includes('hasWriteUriPermission(selectedUri)'));
  assert.ok(handler.includes('The picker did not return a file.'));
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
  assert.ok(mainActivitySource.includes('resolveRenameTargetInTree(permission.uri, documentUri)'));
  assert.ok(storageSettingsXml.includes('Downloads folder itself'));
});

test('rename access dialog renders file, folder, and Save As buttons alongside its explanation', () => {
  const start = mainActivitySource.indexOf('private fun showRenameAccessOptions(');
  const end = mainActivitySource.indexOf('private fun remapDocumentNavigationHistory(', start);
  const dialog = mainActivitySource.slice(start, end);

  assert.ok(dialog.includes('.setMessage('));
  assert.ok(dialog.includes('.setPositiveButton("Grant File Access")'));
  assert.ok(dialog.includes('.setNeutralButton("Choose Folder")'));
  assert.ok(dialog.includes('.setNegativeButton("Save As")'));
  assert.ok(!dialog.includes('.setItems('), 'a message and item list hide one another in Android AlertDialogs');
});
