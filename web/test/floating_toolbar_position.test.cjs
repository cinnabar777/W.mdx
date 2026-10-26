const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { getFloatingToolbarPosition } = require('../src/toolbarPositioning.js');

test('floating toolbar stays inside the visible viewport and centers on the selection', () => {
  const position = getFloatingToolbarPosition({
    start: { left: 340, right: 350, top: 150, bottom: 170 },
    end: { left: 390, right: 400, top: 150, bottom: 170 },
    toolbarWidth: 300,
    toolbarHeight: 48,
    viewport: { offsetLeft: 0, offsetTop: 0, width: 420, height: 800 }
  });

  assert.deepEqual(position, { left: 112, top: 94, width: 300 });
  assert.ok(position.left >= 8);
  assert.ok(position.left + position.width <= 412);
  assert.ok(position.top >= 8);
  assert.ok(position.top + 48 <= 792);
});

test('floating toolbar moves below a selection near the top and respects viewport offsets', () => {
  const position = getFloatingToolbarPosition({
    start: { left: 30, right: 40, top: 120, bottom: 140 },
    end: { left: 80, right: 90, top: 120, bottom: 140 },
    toolbarWidth: 180,
    toolbarHeight: 48,
    viewport: {
      offsetLeft: 20,
      offsetTop: 100,
      width: 400,
      height: 600
    }
  });

  assert.deepEqual(position, { left: 28, top: 148, width: 180 });
});

test('oversized floating toolbar is clamped to the viewport width', () => {
  const position = getFloatingToolbarPosition({
    start: { left: 170, right: 180, top: 300, bottom: 320 },
    end: { left: 210, right: 220, top: 300, bottom: 320 },
    toolbarWidth: 900,
    toolbarHeight: 48,
    viewport: { offsetLeft: 0, offsetTop: 0, width: 360, height: 640 }
  });

  assert.equal(position.width, 344);
  assert.equal(position.left, 8);
  assert.ok(position.left + position.width <= 352);
});

test('floating toolbar has an independent saved layout and replaces the native selection menu', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const readWeb = relativePath =>
    readFileSync(path.join(repositoryRoot, 'web', relativePath), 'utf8');
  const readApp = relativePath =>
    readFileSync(path.join(repositoryRoot, 'app', relativePath), 'utf8');
  const main = readWeb('src/main.js');
  const settings = readWeb('src/toolbarSettingsPreview.js');
  const settingsHtml = readWeb('toolbar-settings-preview.html');
  const nativeActivity = readApp('src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const editorWebView = readApp('src/main/java/com/wmdx/markdownapp/EditorWebView.kt');
  const settingsActivity = readApp('src/main/java/com/wmdx/markdownapp/SettingsActivity.kt');
  const controlbarPrefs = readApp('src/main/res/xml/preferences_styling_controlbar.xml');
  const activityLayout = readApp('src/main/res/layout/activity_main.xml');
  const styles = readWeb('toolbar.css');

  assert.match(main, /let floatingToolbarConfig = normalizeBottomToolbarConfig\(null\)/);
  assert.match(main, /applyFloatingToolbarConfig: function\(rawConfig\)/);
  assert.match(main, /updateFloatingSelectionToolbar\(update\.view\)/);
  assert.match(settings, /configsBySurface = \{\s*bottom: config,\s*floating:/);
  assert.match(settings, /setToolbarSurface\(surface\)/);
  assert.match(settingsHtml, /data-toolbar-surface="floating"/);
  assert.match(settingsActivity, /pref_toolbar_floating_config/);
  assert.match(controlbarPrefs, /pref_toolbar_floating_key_width/);
  assert.match(controlbarPrefs, /pref_toolbar_floating_corner_radius/);
  assert.doesNotMatch(nativeActivity, /setCustomSelectionActionModeCallback/);
  assert.match(editorWebView, /override fun startActionMode\(callback: ActionMode\.Callback\)/);
  assert.match(editorWebView, /override fun startActionMode\(callback: ActionMode\.Callback, type: Int\)/);
  assert.match(activityLayout, /<com\.wmdx\.markdownapp\.EditorWebView/);
  assert.match(styles, /--toolbar-floating-key-width/);
  assert.match(styles, /--toolbar-floating-corner-radius/);
});
