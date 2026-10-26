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
  assert.match(settingsSource, /toolbar-create-group-form/);
  assert.match(settingsSource, /config\.customGroups\[id\]/);
  assert.match(html, /id="toolbar-add-custom"/);
  assert.match(html, /id="toolbar-create-group-form"/);
  assert.match(html, /id="toolbar-delete-custom-group"/);
  assert.match(html, /id="toolbar-open-icon-picker"/);
  assert.match(html, /id="toolbar-icon-picker-modal"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /id="toolbar-icon-search"/);
  assert.match(html, /id="toolbar-icon-list"/);
  assert.match(html, /toolbar-preview-action-assignment/);
  assert.match(html, /Swipe up/);
  assert.match(html, /id="toolbar-swipe-up-icon"/);
  assert.match(html, /id="toolbar-action-picker-modal"/);
  assert.match(html, /id="toolbar-action-search"/);
  assert.match(html, /id="toolbar-preview-title-input"/);
  assert.match(html, /id="toolbar-edit-key-name"/);
  assert.match(html, /id="toolbar-delete-custom-group"[^>]*aria-label="Delete custom group"/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) 48px/);
  assert.match(sharedCss, /--toolbar-label-display/);
  assert.match(preferenceXml, /pref_toolbar_show_labels/);
  assert.match(preferenceXml, /pref_toolbar_label_size/);
  assert.match(preferenceXml, /pref_toolbar_label_color/);
  assert.match(mainSource, /function runToolbarGestureAction/);
  assert.match(mainSource, /installPopupToolbarSwipeUp/);
  assert.doesNotMatch(html, /Action chip|Action icon/);
  assert.match(settingsSource, /createPreviewPopupKey/);
  assert.match(settingsSource, /renderHeldPopupKeys/);
  assert.match(settingsSource, /applyPopupDrop/);
  assert.match(settingsSource, /orderBottomToolbarPopupItems/);
  assert.match(settingsSource, /releasePopupGroupToHoldingArea/);
  assert.doesNotMatch(settingsSource, /restorePopupGroupKey/);
  assert.match(settingsSource, /config\.holding/);
  assert.doesNotMatch(settingsSource, /toolbar-preview-held-group/);
  assert.match(html, /id="toolbar-paste-svg"/);
  assert.match(html, /id="toolbar-choose-svg"/);
  assert.match(html, /Paste SVG/);
  assert.match(html, /Choose SVG file/);
  assert.match(html, /toolbar-preview-icon-actions/);
  assert.match(html, /min-height: 40px/);
  assert.match(html, /width: max-content/);
  assert.match(html, /overflow-y: auto/);
  assert.match(settingsSource, /setIconPickerOpen/);
  assert.match(settingsSource, /event\.key !== 'Escape'/);
  assert.doesNotMatch(html, /id="toolbar-current-key-preview"/);
  assert.doesNotMatch(html, /toolbar-preview-header-action/);
  assert.match(html, /id="toolbar-reset-key-style"/);
  assert.match(html, /id="toolbar-reset-key-style"[^>]*class="toolbar-preview-editor-reset-all"/);
  assert.doesNotMatch(html, /id="toolbar-reset-key-colors"/);
  assert.match(html, /id="toolbar-reset-layout"/);
  assert.match(settingsSource, /classList\.toggle\(\s*'active'/);
  assert.match(settingsSource, /style\.activeBackgroundColor \|\| style\.backgroundColor \|\| 'transparent'/);
  assert.match(sharedCss, /\.toolbar-preview-key:active,\s*\.toolbar-preview-key\.active/);
  assert.match(sharedCss, /var\(\s*--toolbar-key-active-bg-color,\s*transparent\s*\)/);
  assert.match(androidSource, /saveBottomToolbarConfig/);
  assert.match(androidSource, /pickBottomToolbarColor/);
  assert.match(androidSource, /editBottomToolbarIcon/);
  assert.match(androidSource, /editBottomToolbarIcon\(request: String\)/);
  assert.match(androidSource, /"paste" -> pasteToolbarSvg\(itemId, property\)/);
  assert.match(androidSource, /"file" -> chooseToolbarSvgFile\(itemId, property\)/);
  assert.match(androidSource, /pref_toolbar_padding/);
  assert.match(mainSource, /--toolbar-padding/);
  assert.match(preferenceXml, /app:key="pref_toolbar_padding"/);
  assert.match(resetSource, /key == "pref_toolbar_padding" -> 4/);
});

test('popup toolbar actions accept the same persisted styles in web preview and Android settings', async () => {
  const {
    BOTTOM_TOOLBAR_GROUP_ITEM_IDS,
    BOTTOM_TOOLBAR_POPUP_ITEM_IDS,
    BOTTOM_TOOLBAR_STYLE_IDS
  } =
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
  const kotlinGroupsBlock = androidSource.match(
    /TOOLBAR_GROUP_ITEM_IDS = linkedMapOf\(([\s\S]*?)\n\s*\)\s*\n\s*private val TOOLBAR_STYLE_IDS/
  )?.[1];
  assert.ok(kotlinGroupsBlock, 'Android must preserve each popup group layout');
  const kotlinGroups = Object.fromEntries(
    [...kotlinGroupsBlock.matchAll(/"([^"]+)" to listOf\(([\s\S]*?)\)/g)].map(([, group, ids]) => [
      group,
      [...ids.matchAll(/"([^"]+)"/g)].map(([, id]) => id)
    ])
  );
  assert.deepEqual(kotlinGroups, BOTTOM_TOOLBAR_GROUP_ITEM_IDS);
  assert.match(androidSource, /put\("popupGroups", popupGroups\)/);
  assert.match(mainSource, /orderBottomToolbarPopupItems\(\s*groupKey/);
  assert.match(mainSource, /function createRuntimeToolbarItemRegistry\(\)/);
  assert.match(mainSource, /function getRuntimeToolbarGroupItems\(groupId\)/);
  assert.match(mainSource, /if \(bottomToolbarConfig\.popupGroups\[styleId\]\)/);
  assert.match(mainSource, /const configuredItems = bottomToolbarConfig\.popupGroups\[groupKey\]/);
  assert.match(mainSource, /const styleId = item\.styleId \|\| item\.id \|\| item\.command/);
  assert.match(mainSource, /dataset\.toolbarStyleId/);
  assert.match(sharedCss, /--toolbar-key-icon-color, var\(--toolbar-icon-color/);
  assert.match(settingsSource, /PREVIEW_ITEM_DEFINITIONS\.get\(selectedKey\)/);
  assert.match(toolbarConfigSource, /allowedStyleIds/);
  assert.match(toolbarConfigSource, /\.\.\.Object\.keys\(customGroups\)/);
  assert.match(androidSource, /isToolbarStyleAllowed/);
  assert.match(androidSource, /custom-group-\[a-z0-9-\]/);
  assert.match(androidSource, /sanitizeToolbarGroupCycles\(popupGroups, groupIds\)/);
  assert.match(androidSource, /id in validKeyIds && id !in assignedActions/);
  assert.match(androidSource, /input\.optInt\("version", 1\) >= 3/);
  assert.match(androidSource, /\.put\("version", 3\)/);
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
    /\.grouped-key-btn \.toolbar-key-icon svg\s*\{[^}]*color:\s*var\(--toolbar-key-icon-color/
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
  const preferencesViewAdd = androidSource.search(/baseLayout\.addView\(\s*preferencesView/);
  const previewAdd = androidSource.search(/wrapper\.addView\(\s*preview/);
  assert.ok(
    preferencesViewAdd >= 0 &&
      previewAdd > preferencesViewAdd,
    'the content-sized settings list must be placed above a preview that uses the remaining space'
  );
  assert.match(androidSource, /fun setToolbarEditorOverlay\(expanded: Boolean\)/);
  assert.match(androidSource, /if \(toolbarEditorOverlayExpanded\) 0 else preferenceBottom/);
  assert.match(androidSource, /baseLayout\.addView\(\s*android\.view\.View\(context\),\s*android\.widget\.LinearLayout\.LayoutParams\([\s\S]*?0,\s*1f/);
});

test('runtime toolbar consumes the saved bottom toolbar configuration', () => {
  assert.match(mainSource, /normalizeBottomToolbarConfig\(\s*prefs\.pref_toolbar_bottom_config\s*\)/);
  assert.match(mainSource, /renderBottomToolbarKeys\(bar, bottomToolbarConfig, svgIcons/);
});
