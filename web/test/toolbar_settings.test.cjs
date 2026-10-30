const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

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
const mainActivitySource = fs.readFileSync(
  path.join(root, 'app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'),
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
const toolbarGesturesSource = fs.readFileSync(path.join(root, 'web/src/toolbarGestures.js'), 'utf8');
const toolbarIconsSource = fs.readFileSync(path.join(root, 'web/src/toolbarIcons.js'), 'utf8');
const keyPreferencesDialogSource = fs.readFileSync(
  path.join(root, 'web/src/toolbarKeyPreferencesDialog.js'),
  'utf8'
);
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
  assert.match(
    sharedCss,
    /\.grouped-control-bar\s*\{[^}]*column-gap:\s*var\(--toolbar-padding/s,
    'toolbar padding controls spacing between keys'
  );
  assert.match(
    sharedCss,
    /\.grouped-control-bar\s*\{[^}]*padding:\s*4px[^}]*padding-right:\s*44px/s,
    'toolbar padding does not shift the toolbar or remove its reserved toggle space'
  );
  assert.match(sharedCss, /\.grouped-key-btn\s*\{/);
  assert.match(
    sharedCss,
    /\.grouped-key-btn\s*\{[^}]*touch-action:\s*none\s*!important/s,
    'the main toolbar keys reserve pointer movement for swipe actions'
  );
  assert.match(
    sharedCss,
    /\.popup-strip-btn\.has-toolbar-swipe-action\s*\{[^}]*touch-action:\s*none\s*!important/s,
    'popup keys with swipe actions reserve pointer movement for the action'
  );
});

test('toolbar settings support drag ordering, a hidden-key tray, icon colors, and per-key SVG colors', () => {
  assert.match(settingsSource, /beginPossibleDrag/);
  assert.match(settingsSource, /toolbar-holding-tray/);
  assert.match(settingsSource, /pickBottomToolbarColor/);
  assert.match(settingsSource, /preserveSvgColors/);
  assert.match(settingsSource, /toolbar-create-group-form/);
  assert.match(settingsSource, /config\.customGroups\[id\]/);
  assert.match(settingsSource, /config\.customKeys\[id\]/);
  assert.match(html, /id="toolbar-add-custom"/);
  assert.match(html, /\+ Custom key or group/);
  assert.match(html, /id="toolbar-create-group-form"/);
  assert.match(html, /id="toolbar-delete-custom-group"/);
  assert.match(html, /id="toolbar-open-icon-picker"/);
  assert.match(html, /id="toolbar-icon-picker-modal"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /id="toolbar-icon-search"/);
  assert.match(html, /id="toolbar-icon-list"/);
  assert.match(html, /data-toolbar-section="taps"/);
  assert.match(html, /data-toolbar-section="side-swipes"/);
  assert.match(html, /data-toolbar-section="corner-swipes"/);
  assert.match(html, /id="toolbar-force-show-label"/);
  assert.doesNotMatch(html, /toolbar-gesture-summary-/);
  assert.match(settingsSource, /TOOLBAR_GESTURE_GROUPS/);
  assert.match(settingsSource, /gestureActions/);
  assert.match(settingsSource, /gestureActionIcons/);
  assert.match(settingsSource, /getToolbarGestureIndicatorEntries/);
  assert.match(html, /id="toolbar-action-picker-modal"/);
  assert.match(html, /id="toolbar-action-search"/);
  assert.match(html, /id="toolbar-custom-key-action"/);
  assert.match(html, /id="toolbar-preview-title-input"/);
  assert.match(html, /id="toolbar-edit-key-name"/);
  assert.match(html, /id="toolbar-delete-custom-group"[^>]*aria-label="Delete custom group"/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) 40px 30px/);
  assert.match(html, /border-radius: 50%/);
  assert.match(html, /\.toolbar-preview-editor-layer\s*\{[^}]*z-index:\s*10030/s);
  assert.match(html, /popup-open/);
  assert.match(settingsSource, /layoutSignature/);
  assert.match(sharedCss, /--toolbar-label-display/);
  assert.match(preferenceXml, /pref_toolbar_show_labels/);
  assert.match(preferenceXml, /pref_toolbar_label_size/);
  assert.match(preferenceXml, /pref_toolbar_label_color/);
  assert.match(mainSource, /function runToolbarGestureAction/);
  assert.match(mainSource, /installPopupToolbarSwipeUp/);
  assert.match(
    mainSource,
    /\{ id: OPEN_GROUP_ACTION_ID, title: 'Open group', icon: svgIcons\.folder \}/,
    'the generic Open group action has a live toolbar icon'
  );
  assert.match(mainSource, /getToolbarGestureIndicatorEntries/);
  assert.match(
    mainSource,
    /if \(Object\.prototype\.hasOwnProperty\.call\(prefs, 'pref_toolbar_bottom_config'\)\) \{\s*const nextBottomConfig = normalizeBottomToolbarConfig\(\s*prefs\.pref_toolbar_bottom_config\s*\);\s*if \(JSON\.stringify\(nextBottomConfig\) !== JSON\.stringify\(bottomToolbarConfig\)\) \{\s*bottomToolbarConfig = nextBottomConfig;\s*hidePopupStrip\(\);\s*setupGroupedControlBar\(\);\s*\}\s*\}/
  );
  assert.match(mainSource, /applyBottomToolbarConfig: function\(rawConfig\)/);
  assert.match(mainActivitySource, /private fun refreshBottomToolbarFromPreferences\(\)/);
  assert.match(mainActivitySource, /applyBottomToolbarConfig\?\.\(\$escapedConfig\)/);
  assert.match(
    mainActivitySource,
    /applyThemeAndFullscreenPreferences\(\)\s*refreshBottomToolbarFromPreferences\(\)/
  );
  assert.match(androidSource, /"longPress"/);
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
  assert.match(settingsSource, /if \(style\.activeBackgroundColor\)\s*\{\s*button\.style\.setProperty\(/);
  assert.match(settingsSource, /button\.style\.removeProperty\('--toolbar-key-active-bg-color'\)/);
  assert.match(sharedCss, /\.toolbar-preview-key:active,\s*\.toolbar-preview-key\.active/);
  assert.match(
    sharedCss,
    /var\(\s*--toolbar-key-active-bg-color,\s*var\(--button-hover,\s*transparent\)\s*\)/
  );
  assert.match(androidSource, /saveBottomToolbarConfig/);
  assert.match(androidSource, /flushToDisk: Boolean = true/);
  assert.match(androidSource, /editor\.commit\(\)/);
  assert.doesNotMatch(androidSource, /lastSavedToolbarConfig/);
  assert.match(androidSource, /flushToDisk = true/);
  assert.match(androidSource, /key != TOOLBAR_CONFIG_KEY/);
  assert.match(androidSource, /pickBottomToolbarColor/);
  assert.match(androidSource, /editBottomToolbarIcon/);
  assert.match(androidSource, /editBottomToolbarIcon\(request: String\)/);
  assert.match(androidSource, /"paste" -> pasteToolbarSvg\(itemId, property\)/);
  assert.match(androidSource, /"file" -> chooseToolbarSvgFile\(itemId, property\)/);
  assert.match(androidSource, /pref_toolbar_padding/);
  assert.match(mainSource, /--toolbar-padding/);
  assert.match(preferenceXml, /app:key="pref_toolbar_padding"/);
  assert.match(resetSource, /key == "pref_toolbar_padding" -> 4/);
  assert.match(toolbarConfigSource, /id: 'cut', title: 'Cut', icon: 'cut'/);
  assert.match(toolbarConfigSource, /id: 'copy', title: 'Copy', icon: 'copy'/);
  assert.match(toolbarConfigSource, /id: 'paste', title: 'Paste', icon: 'paste'/);
  assert.match(toolbarConfigSource, /id: 'selectAll', title: 'Select All', icon: 'selectAll'/);
  assert.match(settingsSource, /title: 'Open group'/);
  assert.match(mainSource, /function runToolbarClipboardAction\(actionId\)/);
  assert.match(mainSource, /runToolbarClipboardAction\(item\.id\)/);
  assert.match(mainSource, /actionId === OPEN_GROUP_ACTION_ID/);
  assert.match(mainSource, /sourceButton\?\.dataset\?\.toolbarKey/);
  assert.match(mainActivitySource, /fun writeClipboard\(text: String\?\): Boolean/);
  assert.match(mainActivitySource, /fun readClipboard\(\): String/);
  assert.match(androidSource, /TOOLBAR_HOLDING_ITEM_IDS = listOf\("cut", "copy", "paste", "selectAll"\)/);
  assert.match(androidSource, /TOOLBAR_OPEN_GROUP_ACTION_ID = "openGroup"/);
  assert.match(androidSource, /actionId\.startsWith\(LEGACY_TOOLBAR_OPEN_GROUP_ACTION_PREFIX\)/);
});

test('toolbar gestures can open and save the preferences for their own key', () => {
  assert.match(toolbarGesturesSource, /'editToolbarKeyPreferences'/);
  assert.match(settingsSource, /id: 'editToolbarKeyPreferences'/);
  assert.match(settingsSource, /icon: svgIcons\.wrench/);
  assert.match(mainSource, /icon: svgIcons\.wrench/);
  assert.match(toolbarIconsSource, /wrench: `<svg/);
  assert.match(
    mainSource,
    /actionId === 'editToolbarKeyPreferences'[\s\S]*?openToolbarKeyPreferences\(sourceButton, toolbarConfig\)/
  );
  assert.match(
    mainSource,
    /sourceButton\?\.dataset\?\.toolbarStyleId[\s\S]*?sourceButton\?\.dataset\?\.toolbarKey/
  );
  assert.match(mainSource, /currentEditorMode !== 'wysiwyg'/);
  assert.match(keyPreferencesDialogSource, /toolbar-settings-preview\.html\?embed=key-preferences/);
  assert.match(keyPreferencesDialogSource, /openToolbarKeyPreferencesEditor/);
  assert.match(settingsSource, /window\.openToolbarKeyPreferencesEditor/);
  assert.match(settingsSource, /closeEmbeddedKeyPreferences/);
  assert.match(settingsSource, /postEmbeddedEditorSize/);
  assert.match(html, /toolbar-key-preferences-embedded/);
  assert.match(
    html,
    /html\.toolbar-key-preferences-embedded \.toolbar-preview-editor \{[\s\S]*?max-height: none;[\s\S]*?overflow: visible;/
  );
  assert.match(
    settingsSource,
    /if \(section\.open\) return;[\s\S]*?if \(other !== section\) other\.open = false;/
  );
  assert.match(html, /data-toolbar-section="colors"/);
  assert.match(
    mainSource,
    /save\(targetSurface, rawConfig\)/
  );
  assert.match(mainActivitySource, /fun saveToolbarKeyPreferences\(surface: String, rawConfig: String\)/);
  assert.match(mainActivitySource, /fun pickToolbarKeyColor\(surface: String, itemId: String, property: String\)/);
  assert.match(mainActivitySource, /fun pickToolbarKeySvg\(surface: String, itemId: String, property: String\)/);
  assert.match(androidSource, /"editToolbarKeyPreferences"/);
  assert.match(keyPreferencesDialogSource, /RESIZE_MESSAGE_TYPE/);
  assert.match(sharedCss, /width:\s*min\(100%,\s*520px\)/);
  assert.match(sharedCss, /\.toolbar-key-preferences-overlay\s*\{[\s\S]*?align-items:\s*flex-start/);
  assert.match(sharedCss, /\.toolbar-key-preferences-frame\s*\{/);
  assert.match(html, /\.toolbar-preview-editor-layer\s*\{[\s\S]*?z-index:\s*10030/);
  assert.match(html, /\.toolbar-preview-icon-picker-modal\s*\{[\s\S]*?z-index:\s*10040/);
});

test('marker and pen toolbar actions use numbered slots and the generic tintable icon', () => {
  for (const [id, title] of [
    ['highlightYellow', 'Marker 1'],
    ['highlightGreen', 'Marker 2'],
    ['highlightPink', 'Marker 3'],
    ['highlightBlue', 'Marker 4'],
    ['penRed', 'Pen 1'],
    ['penGreen', 'Pen 2'],
    ['penBlue', 'Pen 3'],
    ['penPurple', 'Pen 4']
  ]) {
    assert.match(
      settingsSource,
      new RegExp(`id: '${id}', title: '${title}', icon: svgIcons\\.(?:highlighter|pen)`)
    );
  }
  assert.doesNotMatch(
    settingsSource,
    /title: '(?:Yellow|Green|Pink|Blue|Red|Purple) (?:Highlighter|Pen)'/
  );
  assert.doesNotMatch(
    mainSource,
    /title: '(?:Yellow|Green|Pink|Blue|Red|Purple) (?:Highlighter|Pen)'/
  );
});

test('toolbar toggle gestures are configurable separately and run on the floating toggle', () => {
  assert.match(
    preferenceXml,
    /app:key="pref_toolbar_toggle_gestures"[\s\S]*?app:title="Tap and swipe actions"/
  );
  assert.match(androidSource, /TOOLBAR_TOGGLE_STYLE_ID = "toolbarToggleControl"/);
  assert.match(androidSource, /window\.openToolbarTogglePreferences\?\.\(\)/);
  assert.match(settingsSource, /window\.openToolbarTogglePreferences = \(\) =>/);
  assert.match(settingsSource, /collapseToolbarAppearance\?\.\(\)/);
  assert.match(toolbarConfigSource, /TOOLBAR_TOGGLE_STYLE_ID = 'toolbarToggleControl'/);
  assert.match(mainActivitySource, /itemId == "toolbarToggleControl"/);
  assert.match(
    mainSource,
    /toggleBtn\.dataset\.toolbarStyleId = TOOLBAR_TOGGLE_STYLE_ID;[\s\S]*?installToolbarTapActions\(document\.body\);[\s\S]*?installPopupToolbarSwipeUp\(toggleBtn, TOOLBAR_TOGGLE_STYLE_ID\)/
  );
  assert.match(
    fs.readFileSync(path.join(root, 'web/index.html'), 'utf8'),
    /\.floating-toggle-btn\s*\{[^}]*touch-action:\s*none/s
  );
});

test('no-icon gesture choices persist while suppressing their parent-key indicator', () => {
  assert.match(toolbarConfigSource, /NO_GESTURE_ICON = 'none'/);
  assert.match(toolbarConfigSource, /svg === NO_GESTURE_ICON/);
  assert.match(settingsSource, /aria-label', 'No icon'/);
  assert.match(settingsSource, /style\.gestureActionIcons\[selectedGestureId\] = NO_GESTURE_ICON/);
  assert.match(mainSource, /customSvg === NO_GESTURE_ICON\) return ''/);
  assert.match(androidSource, /if \(iconSvg == "none"\)/);
});

test('toolbar toggle gestures have a separate editor and remain outside the replaceable preview', async () => {
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  let collapseCalled = false;
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({}),
    setToolbarSurface: () => true,
    collapseToolbarAppearance: () => {
      collapseCalled = true;
    },
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?toolbar-toggle-editor=${Date.now()}`);
    assert.equal(dom.window.openToolbarTogglePreferences(), true);
    assert.equal(collapseCalled, true);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-selected-title').textContent,
      'Toolbar toggle'
    );
    assert.equal(dom.window.document.querySelector('#toolbar-open-icon-picker').hidden, true);
    assert.equal(dom.window.document.querySelector('[data-toolbar-section="colors"]').hidden, true);
    assert.ok(
      dom.window.document.querySelector('[data-toolbar-section="taps"]')
    );
    assert.ok(
      dom.window.document.querySelector('[data-toolbar-section="side-swipes"]')
    );
    assert.ok(
      dom.window.document.querySelector('[data-toolbar-section="corner-swipes"]')
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="toolbarToggleControl"]'),
      null,
      'the toggle is configured separately, not shown as a replaceable toolbar key'
    );

    dom.window.document
      .querySelector('.toolbar-preview-gesture-action[data-gesture-id="tap2"]')
      .click();
    assert.equal(
      dom.window.document.querySelector(
        '#toolbar-action-picker-modal [role="option"][aria-label="Toolbar toggle"]'
      ),
      null,
      'the toggle is not offered as a regular toolbar action'
    );
    dom.window.document
      .querySelector('#toolbar-action-picker-modal [role="option"][aria-label="Bold"]')
      .click();
    assert.equal(
      saves.at(-1).styles.toolbarToggleControl.gestureActions.tap2,
      'bold'
    );
    assert.ok(!saves.at(-1).order.includes('toolbarToggleControl'));
    assert.ok(!saves.at(-1).holding.includes('toolbarToggleControl'));
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('embedded preferences open the existing full key editor for the triggering key', async () => {
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html?embed=key-preferences'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?embedded-key-editor-test=${Date.now()}`);
    const opened = dom.window.openToolbarKeyPreferencesEditor({
      keyId: 'undo',
      surface: 'bottom',
      config: {
        version: 6,
        order: ['undo', 'lists', 'format', 'table', 'insert', 'menu'],
        hidden: [],
        holding: [],
        customGroups: {},
        customKeys: {},
        styles: { undo: { gestureActions: { tap1: 'bold' } } }
      }
    });
    const editor = dom.window.document.querySelector('#toolbar-preview-editor');
    const editorLayer = dom.window.document.querySelector('#toolbar-preview-editor-layer');
    assert.equal(opened, true);
    assert.equal(editor.classList.contains('visible'), true);
    assert.equal(editorLayer.hidden, false);
    assert.equal(dom.window.document.querySelector('#toolbar-open-icon-picker') !== null, true);
    assert.equal(dom.window.document.querySelector('[data-toolbar-section="taps"]') !== null, true);
    assert.equal(dom.window.document.querySelector('[data-toolbar-section="side-swipes"]') !== null, true);
    assert.equal(dom.window.document.querySelector('[data-toolbar-section="corner-swipes"]') !== null, true);
    assert.equal(dom.window.document.querySelector('[data-toolbar-section="colors"]') !== null, true);
    const tapsSection = dom.window.document.querySelector('[data-toolbar-section="taps"]');
    const sideSwipesSection = dom.window.document.querySelector('[data-toolbar-section="side-swipes"]');
    tapsSection.open = true;
    sideSwipesSection.querySelector('summary').click();
    assert.equal(tapsSection.open, false);
    assert.equal(sideSwipesSection.open, true);
    assert.match(
      dom.window.document.querySelector('[data-gesture-list="taps"]').textContent,
      /Bold/
    );
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('toolbar appearance refreshes preserve layout and editor overlays follow the configured theme', () => {
  assert.match(androidSource, /updateToolbarPreview\(includeToolbarConfig = false\)/);
  assert.match(androidSource, /toolbarSettingsJson\(includeToolbarConfig: Boolean = true\)/);
  assert.match(androidSource, /saveToolbarConfig\(raw, updatePreview = false, flushToDisk = true\)/);
  assert.match(settingsSource, /hasOwnProperty\.call\(prefs, 'pref_toolbar_bottom_config'\)/);
  assert.match(settingsSource, /setDropMarker/);
  assert.match(settingsSource, /DROP_MARKER_POINTER_OFFSET_Y = 50/);
  assert.match(settingsSource, /getDragDropPoint/);
  assert.match(settingsSource, /resolveCenteredGroupTarget/);
  assert.match(settingsSource, /resolveToolbarGapTarget/);
  assert.doesNotMatch(settingsSource, /window\.addEventListener\('pagehide'/);
  assert.match(settingsSource, /listGapTarget/);
  assert.match(
    mainSource,
    /hasOwnProperty\.call\(prefs, 'pref_toolbar_bottom_config'\)\)\s*\{\s*const nextBottomConfig = normalizeBottomToolbarConfig\(\s*prefs\.pref_toolbar_bottom_config\s*\);\s*if \(JSON\.stringify\(nextBottomConfig\) !== JSON\.stringify\(bottomToolbarConfig\)\)\s*\{\s*bottomToolbarConfig = nextBottomConfig;\s*hidePopupStrip\(\);\s*setupGroupedControlBar\(\);/
  );
  assert.match(
    settingsSource,
    /scrollStrip\.scrollLeft \+= lastX - pointerEvent\.clientX/
  );
  assert.match(html, /\.toolbar-preview-editor-layer\s*\{[^}]*align-items:\s*flex-start/s);
  assert.match(html, /background: var\(--toolbar-preview-surface, var\(--bg-color, #000\)\)/);
  assert.doesNotMatch(html, /background:\s*#171717/i);
  assert.match(sharedCss, /\.toolbar-preview-holding\s*\{[^}]*margin-block:\s*auto/s);
  assert.match(sharedCss, /\.toolbar-preview-drop-marker\s*\{/);
});

test('popup toolbar actions accept the same persisted styles in web preview and Android settings', async () => {
  const {
    BOTTOM_TOOLBAR_GROUP_ITEM_IDS,
    BOTTOM_TOOLBAR_POPUP_ITEM_IDS,
    BUILT_IN_HOLDING_ITEM_IDS,
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
  assert.deepEqual(
    kotlinPopupIds,
    [...BOTTOM_TOOLBAR_POPUP_ITEM_IDS, ...BUILT_IN_HOLDING_ITEM_IDS].sort()
  );
  assert.equal(BOTTOM_TOOLBAR_STYLE_IDS.length, BOTTOM_TOOLBAR_POPUP_ITEM_IDS.length + 11);
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
  assert.match(androidSource, /\.put\("version", 4\)/);
  assert.match(androidSource, /\.put\("customKeys", customKeys\)/);
});

test('choosing a color in a transparent color picker makes the selected color visible', () => {
  assert.match(colorPickerSource, /makePickedColorVisible\(\)/);
  assert.match(
    colorPickerSource,
    /private fun makePickedColorVisible\(\) \{\s*\/\/ A newly chosen color[\s\S]*?if \(currentAlpha != 255\) \{\s*currentAlpha = 255/
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
  assert.match(preferenceXml, /pref_toolbar_active_key_bg_color/);
  assert.match(settingsSource, /pref_toolbar_active_key_bg_color/);
  assert.match(mainSource, /pref_toolbar_active_key_bg_color/);
  assert.match(
    sharedCss,
    /--toolbar-key-active-bg-color,\s*var\(--button-hover/
  );
  assert.match(
    sharedCss,
    /\.grouped-key-btn \.toolbar-key-icon svg\s*\{[^}]*color:\s*var\(--toolbar-key-icon-color/
  );
});

test('global toolbar settings stay fixed while the key editor fits its content', () => {
  assert.match(
    preferenceXml,
    /ExpandablePreference[\s\S]*?pref_toolbar_global_settings[\s\S]*?preference_expand_chevron/
  );
  assert.match(androidSource, /TOOLBAR_APPEARANCE_PREFERENCE_KEYS/);
  assert.match(androidSource, /toolbarAppearancePreferences\.forEach \{ it\.isVisible = toolbarAppearanceExpanded \}/);
  assert.match(androidSource, /fun collapseToolbarAppearance\(\)/);
  assert.match(androidSource, /activity\?\.runOnUiThread \{ collapseToolbarAppearanceSettings\(\) \}/);
  assert.match(
    preferenceXml,
    /ResetPreferenceCategory[\s\S]*?pref_toolbar_floating_category[\s\S]*?app:title="Floating toolbar"/
  );
  assert.match(
    androidSource,
    /TOOLBAR_APPEARANCE_PREFERENCE_KEYS = listOf\([\s\S]*?"pref_toolbar_floating_category"[\s\S]*?"pref_toolbar_floating_key_width"[\s\S]*?"pref_toolbar_floating_corner_radius"/
  );
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
  assert.match(androidSource, /val top = preferenceBottom\.coerceIn\(0, host\.height\)/);
  assert.doesNotMatch(androidSource, /toolbarEditorOverlayExpanded|fun setToolbarEditorOverlay/);
  assert.match(html, /\.toolbar-preview-editor\s*\{[^}]*height:\s*auto/s);
  assert.match(html, /\.toolbar-preview-editor\s*\{[^}]*max-height:\s*none/s);
  assert.match(html, /\.toolbar-preview-editor\s*\{[^}]*overflow:\s*visible/s);
  assert.match(androidSource, /baseLayout\.addView\(\s*android\.view\.View\(context\),\s*android\.widget\.LinearLayout\.LayoutParams\([\s\S]*?0,\s*1f/);
});

test('runtime toolbar consumes the saved bottom toolbar configuration', () => {
  assert.match(mainSource, /normalizeBottomToolbarConfig\(\s*prefs\.pref_toolbar_bottom_config\s*\)/);
  assert.match(mainSource, /renderBottomToolbarKeys\(bar, bottomToolbarConfig, svgIcons/);
});
