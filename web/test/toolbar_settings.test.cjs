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
const toolbarConfigSource = fs.readFileSync(path.join(root, 'web/src/toolbarConfig.js'), 'utf8');
const colorPickerSource = fs.readFileSync(
  path.join(root, 'app/src/main/java/com/wmdx/markdownapp/ColorPickerDialog.kt'),
  'utf8'
);

test('bottom toolbar preview uses the same renderer, icon source, and toolbar stylesheet as the editor', () => {
  assert.match(settingsSource, /renderBottomToolbarKeys/);
  assert.match(settingsSource, /from '\.\/toolbarIcons\.js'/);
  assert.match(settingsSource, /toolbar-preview-popup/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /toolbar-preview-editor-close/);
  assert.match(html, /position: fixed/);
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
  assert.match(settingsSource, /editBottomToolbarIcon\?\.\(selectedKey\)/);
  assert.match(html, /id="toolbar-add-custom"/);
  assert.match(html, /id="toolbar-open-icon-picker"/);
  assert.match(html, /id="toolbar-icon-picker-back"/);
  assert.match(html, /id="toolbar-icon-search"/);
  assert.match(html, /id="toolbar-icon-list"/);
  assert.match(html, /id="toolbar-current-icon"/);
  assert.match(html, /id="toolbar-paste-svg"/);
  assert.match(html, /id="toolbar-choose-svg"/);
  assert.match(html, /Paste SVG/);
  assert.match(html, /Choose file/);
  assert.match(html, /id="toolbar-reset-key-style"/);
  assert.match(html, /id="toolbar-reset-key-style"[^>]*class="toolbar-preview-editor-reset-all"/);
  assert.doesNotMatch(html, /id="toolbar-reset-key-colors"/);
  assert.match(html, /id="toolbar-reset-layout"/);
  assert.match(settingsSource, /classList\.toggle\(\s*'active'/);
  assert.match(androidSource, /saveBottomToolbarConfig/);
  assert.match(androidSource, /pickBottomToolbarColor/);
  assert.match(androidSource, /editBottomToolbarIcon/);
  assert.match(androidSource, /fun pasteBottomToolbarSvg/);
  assert.match(androidSource, /fun chooseBottomToolbarSvg/);
  assert.match(androidSource, /pref_toolbar_padding/);
  assert.match(mainSource, /--toolbar-padding/);
  assert.match(preferenceXml, /app:key="pref_toolbar_padding"/);
  assert.match(resetSource, /key == "pref_toolbar_padding" -> 4/);
});

test('popup toolbar actions accept the same persisted styles in web preview and Android settings', async () => {
  const { BOTTOM_TOOLBAR_POPUP_ITEM_IDS, BOTTOM_TOOLBAR_STYLE_IDS } =
    await import('../src/toolbarConfig.js');
  const kotlinPopupIdsBlock = androidSource.match(
    /TOOLBAR_STYLE_IDS = TOOLBAR_ITEM_IDS \+ listOf\(([\s\S]*?)\n\s*\)/
  )?.[1];
  assert.ok(kotlinPopupIdsBlock, 'Android must allow-list popup item style IDs');
  const kotlinPopupIds = [...kotlinPopupIdsBlock.matchAll(/"([^"]+)"/g)]
    .map(match => match[1])
    .sort();
  assert.deepEqual(kotlinPopupIds, [...BOTTOM_TOOLBAR_POPUP_ITEM_IDS].sort());
  assert.equal(BOTTOM_TOOLBAR_STYLE_IDS.length, BOTTOM_TOOLBAR_POPUP_ITEM_IDS.length + 7);
  assert.match(mainSource, /const styleId = item\.styleId \|\| item\.id \|\| item\.command/);
  assert.match(mainSource, /dataset\.toolbarStyleId/);
  assert.match(sharedCss, /--toolbar-key-icon-color, var\(--toolbar-icon-color/);
  assert.match(settingsSource, /PREVIEW_ITEM_DEFINITIONS\.get\(selectedKey\)/);
  assert.match(toolbarConfigSource, /for \(const id of BOTTOM_TOOLBAR_STYLE_IDS\)/);
});

test('choosing a color in a transparent color picker makes the selected color visible', () => {
  assert.match(colorPickerSource, /makePickedColorVisible\(\)/);
  assert.match(
    colorPickerSource,
    /private fun makePickedColorVisible\(\) \{\s*if \(currentAlpha == 0\) \{\s*currentAlpha = 255/
  );
  assert.doesNotMatch(
    sharedCss,
    /\.toolbar-preview-key\.is-selected/,
    'key selection should not paint an extra accent over the configured colors'
  );
  assert.doesNotMatch(
    sharedCss,
    /\.grouped-key-btn svg\s*\{[^}]*stroke:/,
    'fill-only SVGs must not receive a forced stroke that makes them appear bold'
  );
  assert.doesNotMatch(sharedCss, /--toolbar-active-icon-color/);
  assert.doesNotMatch(settingsSource, /pref_toolbar_active_icon_color|--toolbar-active-icon-color/);
  assert.doesNotMatch(mainSource, /pref_toolbar_active_icon_color|--toolbar-active-icon-color/);
  assert.doesNotMatch(preferenceXml, /pref_toolbar_active_icon_color|Active Icon Color/);
  assert.match(
    sharedCss,
    /\.grouped-key-btn svg\s*\{\s*color:\s*var\(--toolbar-key-icon-color/
  );
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
  assert.match(androidSource, /isNestedScrollingEnabled = false/);
  assert.match(
    androidSource,
    /preferencesView\.layoutParams = android\.widget\.LinearLayout\.LayoutParams\([\s\S]*?WRAP_CONTENT/
  );
  const preferencesViewAdd = androidSource.search(/wrapper\.addView\(\s*preferencesView/);
  const previewAdd = androidSource.search(/wrapper\.addView\(\s*preview/);
  assert.ok(
    preferencesViewAdd >= 0 &&
      previewAdd > preferencesViewAdd,
    'the content-sized settings list must be placed above a preview that uses the remaining space'
  );
  assert.match(
    androidSource.slice(previewAdd, previewAdd + 500),
    /0,\s*1f/
  );
});

test('runtime toolbar consumes the saved bottom toolbar configuration', () => {
  assert.match(mainSource, /normalizeBottomToolbarConfig\(\s*prefs\.pref_toolbar_bottom_config\s*\)/);
  assert.match(mainSource, /renderBottomToolbarKeys\(bar, bottomToolbarConfig, svgIcons/);
});
