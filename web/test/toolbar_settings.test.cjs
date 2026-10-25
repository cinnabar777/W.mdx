const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'web/toolbar-settings-preview.html'), 'utf8');
const sharedCss = fs.readFileSync(path.join(root, 'web/toolbar.css'), 'utf8');
const settingsSource = fs.readFileSync(
  path.join(root, 'web/src/toolbarSettingsPreview.js'),
  'utf8'
);
const androidSource = fs.readFileSync(
  path.join(root, 'app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'),
  'utf8'
);
const preferenceXml = fs.readFileSync(
  path.join(root, 'app/src/main/res/xml/preferences_styling_controlbar.xml'),
  'utf8'
);
const resetSource = fs.readFileSync(
  path.join(root, 'app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
  'utf8'
);
const mainSource = fs.readFileSync(path.join(root, 'web/src/main.js'), 'utf8');

test('bottom toolbar preview uses the same renderer, icon source, and toolbar stylesheet as the editor', () => {
  assert.match(settingsSource, /renderBottomToolbarKeys/);
  assert.match(settingsSource, /from '\.\/toolbarIcons\.js'/);
  assert.match(settingsSource, /toolbar-preview-popup/);
  assert.match(html, /toolbar-preview-dock/);
  assert.match(html, /toolbar\.css/);
  assert.match(fs.readFileSync(path.join(root, 'web/index.html'), 'utf8'), /toolbar\.css/);
  assert.match(sharedCss, /\.grouped-control-bar\s*\{/);
  assert.match(sharedCss, /\.grouped-key-btn\s*\{/);
});

test('toolbar settings support drag ordering, a hidden-key tray, icon colors, and per-key SVG colors', () => {
  assert.match(settingsSource, /beginPossibleDrag/);
  assert.match(settingsSource, /toolbar-holding-tray/);
  assert.match(settingsSource, /pickBottomToolbarColor/);
  assert.match(settingsSource, /preserveSvgColors/);
  assert.match(androidSource, /saveBottomToolbarConfig/);
  assert.match(androidSource, /pickBottomToolbarColor/);
  assert.match(androidSource, /editBottomToolbarIcon/);
  assert.match(androidSource, /pref_toolbar_padding/);
  assert.match(mainSource, /--toolbar-padding/);
  assert.match(preferenceXml, /app:key="pref_toolbar_padding"/);
  assert.match(resetSource, /key == "pref_toolbar_padding" -> 4/);
});

test('global toolbar settings collapse above a bottom-docked toolbar preview', () => {
  assert.match(
    preferenceXml,
    /ExpandablePreference[\s\S]*?pref_toolbar_global_settings[\s\S]*?preference_expand_chevron/
  );
  assert.match(androidSource, /TOOLBAR_APPEARANCE_PREFERENCE_KEYS/);
  assert.match(androidSource, /toolbarAppearancePreferences\.forEach \{ it\.isVisible = toolbarAppearanceExpanded \}/);
  assert.match(androidSource, /fun collapseToolbarAppearance\(\)/);
  assert.match(androidSource, /activity\?\.runOnUiThread \{ collapseToolbarAppearanceSettings\(\) \}/);
  const preferencesViewAdd = androidSource.search(/wrapper\.addView\(\s*preferencesView/);
  const previewAdd = androidSource.search(/wrapper\.addView\(\s*preview/);
  assert.ok(
    preferencesViewAdd >= 0 &&
      previewAdd > preferencesViewAdd,
    'the settings list must be placed above the fixed toolbar preview'
  );
});

test('runtime toolbar consumes the saved bottom toolbar configuration', () => {
  assert.match(mainSource, /normalizeBottomToolbarConfig\(\s*prefs\.pref_toolbar_bottom_config\s*\)/);
  assert.match(mainSource, /renderBottomToolbarKeys\(bar, bottomToolbarConfig, svgIcons/);
});
