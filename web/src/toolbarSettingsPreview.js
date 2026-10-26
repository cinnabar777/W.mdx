import {
  BOTTOM_TOOLBAR_GROUP_ITEM_IDS,
  BOTTOM_TOOLBAR_ITEMS,
  BOTTOM_TOOLBAR_ITEM_IDS,
  normalizeBottomToolbarConfig,
  orderBottomToolbarPopupItems
} from './toolbarConfig.js';
import {
  BUILT_IN_GESTURE_ACTION_IDS,
  TOOLBAR_GESTURE_GROUPS
} from './toolbarGestures.js';
import { svgIcons } from './toolbarIcons.js';
import {
  renderBottomToolbarKeys,
  sanitizeToolbarSvg,
  toToolbarCssColor
} from './toolbarRenderer.js';
import { TABLE_ACTIONS } from './tableActions.js';

const toolbar = document.querySelector('#toolbar-preview');
const tray = document.querySelector('#toolbar-holding-tray');
const popup = document.querySelector('#toolbar-preview-popup');
const editor = document.querySelector('#toolbar-preview-editor');
const iconPicker = document.querySelector('#toolbar-icon-picker-modal');
const actionPicker = document.querySelector('#toolbar-action-picker-modal');
const dropMarker = document.querySelector('#toolbar-preview-drop-marker');
if (dropMarker && document.body) document.body.appendChild(dropMarker);
const status = document.querySelector('#toolbar-preview-status');
const selectedTitle = document.querySelector('#toolbar-preview-selected-title');
let config = normalizeBottomToolbarConfig(null);
let selectedKey = null;
let openPopupGroup = null;
let selectedPopupItem = null;
let dragState = null;
let dragTimer = null;
let previousTap = { id: null, time: 0 };
let editorKeyCache = null;
let iconPickerOpen = false;
let actionPickerOpen = false;
let iconPickerTarget = 'key';
let actionPickerTarget = 'gesture';
let selectedGestureId = null;
let editingKeyName = false;
let toolbarEditorOverlayOpen = false;
let nextCustomGroupNumber = 1;
let locallySavedToolbarLayout = null;
let hasAppliedToolbarConfig = false;
let pendingDragCleanup = null;

const calloutIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
const PREVIEW_GROUP_ITEMS = {
  heading: [
    { id: 'paragraph', title: 'Paragraph', icon: 'P' },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `heading${index + 1}`,
      title: `Heading ${index + 1}`,
      icon: `H${index + 1}`
    })),
    { id: 'wrap', title: 'Toggle Line Wrap', icon: svgIcons.wrap },
    { id: 'line-numbers', title: 'Toggle Line Numbers', icon: '#' }
  ],
  lists: [
    { id: 'bulletedList', title: 'Bulleted List', icon: svgIcons.bulletedList },
    { id: 'numberedList', title: 'Numbered List', icon: svgIcons.numberedList },
    { id: 'todoList', title: 'Todo List', icon: svgIcons.todoList },
    { id: 'indent', title: 'Indent', icon: svgIcons.indent },
    { id: 'outdent', title: 'Outdent', icon: svgIcons.outdent }
  ],
  format: [
    { id: 'bold', title: 'Bold', icon: svgIcons.bold },
    { id: 'italic', title: 'Italic', icon: svgIcons.italic },
    { id: 'strikethrough', title: 'Strikethrough', icon: svgIcons.strikethrough },
    { id: 'underline', title: 'Underline', icon: svgIcons.underline },
    { id: 'yellowMarker', title: 'Yellow Marker', icon: svgIcons.squareMarker('#ffe066') },
    { id: 'greenMarker', title: 'Green Marker', icon: svgIcons.squareMarker('#a8f087') },
    { id: 'pinkMarker', title: 'Pink Marker', icon: svgIcons.squareMarker('#ff99c8') },
    { id: 'blueMarker', title: 'Blue Marker', icon: svgIcons.squareMarker('#9bf6ff') },
    { id: 'redPen', title: 'Red Pen', icon: svgIcons.circlePen('#ff595e') },
    { id: 'greenPen', title: 'Green Pen', icon: svgIcons.circlePen('#2ec4b6') }
  ],
  table: [
    { id: 'insertTable', title: 'Insert Table', icon: svgIcons.insertTable },
    ...TABLE_ACTIONS
  ],
  insert: [
    { id: 'image', title: 'Insert Image', icon: svgIcons.image },
    { id: 'link', title: 'Insert Link', icon: svgIcons.link },
    { id: 'callout', title: 'Insert Callout', icon: calloutIcon },
    { id: 'inlineCode', title: 'Inline Code', icon: svgIcons.inlineCode },
    { id: 'blockQuote', title: 'Insert Quote', icon: svgIcons.blockQuote },
    { id: 'codeBlock', title: 'Code Block', icon: svgIcons.codeBlock },
    { id: 'horizontalLine', title: 'Insert Line', icon: svgIcons.horizontalLine },
    { id: 'footnote', title: 'Insert Footnote', icon: svgIcons.footnote }
  ],
  menu: [
    { id: 'newFile', title: 'New File', icon: svgIcons.newFile },
    { id: 'openFile', title: 'Open File', icon: svgIcons.openFile },
    { id: 'saveFile', title: 'Save File', icon: svgIcons.saveFile },
    { id: 'saveAsFile', title: 'Save As', icon: svgIcons.saveAsFile },
    { id: 'saveAsTextPack', title: 'Save as Text Pack', icon: svgIcons.saveAsTextPack },
    { id: 'exportHtml', title: 'Export HTML / MHTML', icon: svgIcons.exportHtml },
    { id: 'search', title: 'Find & Replace', icon: svgIcons.search },
    { id: 'switchView', title: 'Switch View Mode', icon: svgIcons.switchView },
    { id: 'newWindow', title: 'New Window', icon: svgIcons.newWindow },
    { id: 'settings', title: 'Settings', icon: svgIcons.settings }
  ]
};
const PREVIEW_ITEM_DEFINITIONS = new Map([
  ...BOTTOM_TOOLBAR_ITEMS.map(item => [item.id, item]),
  ...Object.values(PREVIEW_GROUP_ITEMS).flat().map(item => [item.id, item])
]);
const PREVIEW_SHORTCUT_ITEMS = [
  { id: 'historyBack', title: 'Back in Navigation History', icon: svgIcons.undo },
  { id: 'historyForward', title: 'Forward in Navigation History', icon: svgIcons.redo },
  { id: 'toggleToolbar', title: 'Show or Hide Toolbar', icon: svgIcons.menu },
  { id: 'removeHighlight', title: 'Remove Highlight', icon: svgIcons.strikethrough }
];
for (const item of PREVIEW_SHORTCUT_ITEMS) {
  PREVIEW_ITEM_DEFINITIONS.set(item.id, item);
}
const PREVIEW_ICON_TITLES = new Map();
for (const item of [
  ...BOTTOM_TOOLBAR_ITEMS,
  ...Object.values(PREVIEW_GROUP_ITEMS).flat(),
  ...PREVIEW_SHORTCUT_ITEMS
]) {
  PREVIEW_ICON_TITLES.set(item.id, item.title);
  if (typeof item.icon === 'string' && svgIcons[item.icon]) {
    PREVIEW_ICON_TITLES.set(item.icon, item.title);
  }
}

function setStatus(message) {
  if (status) status.textContent = message;
}

function toCssColor(value) {
  if (typeof value !== 'string') return value;
  const match = /^#([0-9a-f]{8})$/i.exec(value.trim());
  if (!match) return value;
  const [alpha, red, green, blue] = match[1].match(/.{2}/g).map(part => parseInt(part, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function setCssVariable(name, value, fallback) {
  if (value === undefined || value === null || value === '' || value === 'default') {
    document.documentElement.style.setProperty(name, fallback);
    return;
  }
  document.documentElement.style.setProperty(name, toCssColor(String(value)));
}

function setIconPickerOpen(open, clearSearch = false, target = 'key') {
  iconPickerOpen = Boolean(open && selectedKey);
  if (open) iconPickerTarget = target;
  const search = document.querySelector('#toolbar-icon-search');
  if (clearSearch && search) search.value = '';
  if (!iconPicker) return;
  iconPicker.hidden = !iconPickerOpen;
  iconPicker.setAttribute('aria-hidden', String(!iconPickerOpen));
  if (iconPickerOpen) renderIconCatalog();
}

function setActionPickerOpen(open, clearSearch = false, target = 'gesture') {
  actionPickerOpen = Boolean(open && selectedKey);
  if (open) actionPickerTarget = target;
  const search = document.querySelector('#toolbar-action-search');
  if (clearSearch && search) search.value = '';
  if (!actionPicker) return;
  actionPicker.hidden = !actionPickerOpen;
  actionPicker.setAttribute('aria-hidden', String(!actionPickerOpen));
  if (actionPickerOpen) renderActionCatalog();
}

function actionDefinitions() {
  const definitions = new Map(PREVIEW_ITEM_DEFINITIONS);
  for (const [id, group] of Object.entries(config.customGroups)) {
    definitions.set(id, { id, title: group.title, icon: group.icon, kind: 'group' });
  }
  for (const [id, key] of Object.entries(config.customKeys || {})) {
    definitions.set(id, { id, title: key.title, icon: key.icon, kind: 'action' });
  }
  return definitions;
}

function getActionDefinition(id) {
  const definition = actionDefinitions().get(id);
  if (!definition) return null;
  return {
    ...definition,
    title: config.styles[id]?.title || definition.title
  };
}

function getActionIconMarkup(item) {
  if (!item) return '';
  if (typeof item.icon === 'string' && item.icon.includes('<svg')) return item.icon;
  if (typeof item.icon === 'string' && svgIcons[item.icon]) return svgIcons[item.icon];
  return typeof item.icon === 'string' ? item.icon : '';
}

function getAssignedSwipeIconMarkup(style) {
  return getAssignedGestureIconMarkup(style, 'swipeUp');
}

function getAssignedGestureIconMarkup(style, gestureId) {
  const svg = style?.gestureActionIcons?.[gestureId] ||
    (gestureId === 'swipeUp' ? style?.gestureActionIconSvg : '');
  if (svg) return sanitizeToolbarSvg(svg, false, document);
  return getActionIconMarkup(getActionDefinition(
    style?.gestureActions?.[gestureId] ||
    (gestureId === 'swipeUp' ? style?.gestureAction : '')
  ));
}

function syncToolbarEditorOverlay(open) {
  const next = Boolean(open);
  if (next === toolbarEditorOverlayOpen) return;
  toolbarEditorOverlayOpen = next;
  window.ToolbarSettings?.setToolbarEditorOverlay?.(next);
}

function render() {
  if (!toolbar || !tray) return;
  const definitions = new Map(PREVIEW_ITEM_DEFINITIONS);
  for (const item of BOTTOM_TOOLBAR_ITEMS) {
    definitions.set(item.id, {
      ...item,
      kind: config.popupGroups[item.id] ? 'group' : 'key'
    });
  }
  for (const [id, group] of Object.entries(config.customGroups)) {
    definitions.set(id, { id, title: group.title, icon: group.icon, kind: 'group' });
  }
  for (const [id, key] of Object.entries(config.customKeys || {})) {
    definitions.set(id, { id, title: key.title, icon: key.icon, kind: 'action' });
  }
  const emptyGroupIds = getEmptyPopupGroupIds();
  const toolbarConfig = {
    ...config,
    order: config.order.filter(id => !emptyGroupIds.has(id)),
    hidden: [...new Set([...config.hidden, ...emptyGroupIds])]
  };
  renderBottomToolbarKeys(toolbar, toolbarConfig, svgIcons, {
    definitions: Object.fromEntries(definitions),
    buttonClass: 'grouped-key-btn toolbar-preview-key',
    resolveCustomIcon: style => style.customSvg || '',
    resolveGestureActionIcon: (actionId, customSvg, keyId) =>
      getAssignedSwipeIconMarkup({
        ...(config.styles[keyId] || {}),
        gestureActions: { swipeUp: actionId },
        gestureActionIcons: { swipeUp: customSvg }
      }),
    onKeyClick: onToolbarKeyClick
  });
  for (const button of toolbar.querySelectorAll('.toolbar-preview-key')) {
    const id = button.dataset.toolbarKey;
    const style = config.styles[id] || {};
    button.style.setProperty(
      '--toolbar-key-active-bg-color',
      toToolbarCssColor(style.activeBackgroundColor || style.backgroundColor || 'transparent')
    );
    button.classList.toggle(
      'active',
      id === selectedKey || id === openPopupGroup
    );
  }

  if (config.hidden.length || config.holding.length || emptyGroupIds.size > 0) {
    const heldToolbarKeys = [...new Set([...config.holding, ...config.hidden, ...emptyGroupIds])]
          .filter(id =>
            BOTTOM_TOOLBAR_ITEMS.some(item => item.id === id) ||
            config.customGroups[id] ||
            config.customKeys?.[id]
          );
    if (heldToolbarKeys.length === 0) {
      tray.replaceChildren();
    } else {
      const trayConfig = {
        version: 3,
        order: heldToolbarKeys,
        hidden: [
          ...BOTTOM_TOOLBAR_ITEM_IDS,
          ...Object.keys(config.customGroups),
          ...Object.keys(config.customKeys || {})
        ].filter(
          id => !heldToolbarKeys.includes(id)
        ),
        popupGroups: config.popupGroups,
        holding: [],
        customGroups: config.customGroups,
        customKeys: config.customKeys,
        styles: config.styles
      };
      renderBottomToolbarKeys(tray, trayConfig, svgIcons, {
        definitions: Object.fromEntries(definitions),
        includeEmptyGroups: true,
        buttonClass: 'grouped-key-btn toolbar-preview-key',
        resolveCustomIcon: style => style.customSvg || '',
        resolveGestureActionIcon: (actionId, customSvg, keyId) =>
          getAssignedSwipeIconMarkup({
            ...(config.styles[keyId] || {}),
            gestureActions: { swipeUp: actionId },
            gestureActionIcons: { swipeUp: customSvg }
          }),
        onKeyClick: onToolbarKeyClick
      });
    }
  } else {
    // An empty holding area is valid. Passing an empty order through the normal
    // toolbar normalizer would restore the Menu key and show it twice.
    tray.replaceChildren();
  }
  renderHeldPopupKeys();

  for (const button of document.querySelectorAll('.toolbar-preview-key')) {
    if (config.popupGroups[button.dataset.toolbarKey]) {
      button.setAttribute(
        'aria-expanded',
        String(button.dataset.toolbarKey === openPopupGroup)
      );
    }
    button.addEventListener('pointerdown', event => beginPossibleDrag(event, button), {
      passive: false
    });
  }
  refreshSelectedKeyEditor();
  renderIconCatalog();
  renderActionCatalog();
  if (iconPicker) {
    iconPicker.hidden = !iconPickerOpen;
    iconPicker.setAttribute('aria-hidden', String(!iconPickerOpen));
  }
  if (actionPicker) {
    actionPicker.hidden = !actionPickerOpen;
    actionPicker.setAttribute('aria-hidden', String(!actionPickerOpen));
  }
  renderPopupGroup();
  editor?.classList.toggle(
    'popup-open',
    Boolean(popup && !popup.classList.contains('hidden'))
  );
}

function applySettings(payload) {
  let prefs = payload;
  if (typeof payload === 'string') {
    try {
      prefs = JSON.parse(payload);
    } catch {
      prefs = {};
    }
  }
  if (!prefs || typeof prefs !== 'object') prefs = {};

  if (Object.prototype.hasOwnProperty.call(prefs, 'pref_toolbar_bottom_config')) {
    const incomingConfig = normalizeBottomToolbarConfig(prefs.pref_toolbar_bottom_config);
    const incomingLayout = layoutSignature(incomingConfig);
    if (
      !hasAppliedToolbarConfig ||
      !locallySavedToolbarLayout ||
      incomingLayout === locallySavedToolbarLayout
    ) {
      config = incomingConfig;
    } else {
      // Native style/color updates may echo a canonicalized config. Accept the
      // style changes, but never let that echo replace the layout being edited.
      config = {
        ...incomingConfig,
        order: config.order,
        hidden: config.hidden,
        popupGroups: config.popupGroups,
        holding: config.holding,
        customGroups: config.customGroups,
        customKeys: config.customKeys
      };
    }
    hasAppliedToolbarConfig = true;
  }
  const isLightTheme = prefs.pref_app_theme === 'light';
  document.body.classList.toggle('light-theme', isLightTheme);
  setCssVariable('--toolbar-bg', prefs.pref_toolbar_bg_color, isLightTheme ? '#f8f9fa' : '#121212');
  setCssVariable('--toolbar-icon-color', prefs.pref_toolbar_icon_color, isLightTheme ? '#111111' : '#ffffff');
  setCssVariable('--toolbar-preview-text', null, isLightTheme ? '#111111' : '#ffffff');
  setCssVariable('--toolbar-preview-surface', null, isLightTheme ? '#ffffff' : '#000000');
  document.documentElement.style.setProperty(
    '--toolbar-label-display',
    prefs.pref_toolbar_show_labels === true ? 'flex' : 'none'
  );
  const labelSize = Number(prefs.pref_toolbar_label_size);
  document.documentElement.style.setProperty(
    '--toolbar-label-size',
    `${Number.isFinite(labelSize) && labelSize >= 4 && labelSize <= 16 ? labelSize : 8}px`
  );
  setCssVariable(
    '--toolbar-label-color',
    prefs.pref_toolbar_label_color,
    isLightTheme ? '#111111' : '#ffffff'
  );
  const height = Number(prefs.pref_toolbar_height);
  document.documentElement.style.setProperty(
    '--toolbar-height',
    `${Number.isFinite(height) && height >= 24 && height <= 96 ? height : 48}px`
  );
  const padding = Number(prefs.pref_toolbar_padding);
  document.documentElement.style.setProperty(
    '--toolbar-padding',
    `${Number.isFinite(padding) && padding >= 0 && padding <= 16 ? padding : 4}px`
  );
  render();
}

function saveConfig() {
  config = normalizeBottomToolbarConfig(config);
  const save = window.ToolbarSettings?.saveBottomToolbarConfig;
  if (typeof save !== 'function') {
    setStatus('Preview only; settings are not saved in this browser.');
    return;
  }
  const success = save(JSON.stringify(config));
  setStatus(success === false ? 'Could not save toolbar changes.' : 'Toolbar changes saved.');
  if (success !== false) {
    locallySavedToolbarLayout = layoutSignature(config);
    hasAppliedToolbarConfig = true;
  }
}

function layoutSignature(value) {
  return JSON.stringify({
    order: value.order,
    hidden: value.hidden,
    popupGroups: value.popupGroups,
    holding: value.holding,
    customGroups: value.customGroups,
    customKeys: value.customKeys
  });
}

function onToolbarKeyClick(id) {
  window.ToolbarSettings?.collapseToolbarAppearance?.();
  const isHiddenKey = config.hidden.includes(id);
  const now = Date.now();
  if (
    isHiddenKey &&
    !config.popupGroups[id] &&
    previousTap.id === id &&
    now - previousTap.time <= 400
  ) {
    previousTap = { id: null, time: 0 };
    window.ToolbarSettings?.editBottomToolbarIcon?.(id);
    return;
  }
  previousTap = { id, time: now };
  setIconPickerOpen(false);
  selectedKey = id;
  openPopupGroup = config.popupGroups[id]
    ? (openPopupGroup === id ? null : id)
    : null;
  selectedPopupItem = null;
  setStatus(isHiddenKey
    ? 'Holding-area keys are available to place on the toolbar.'
    : '');
  render();
}

function renderPopupGroup() {
  if (!popup) return;
  popup.replaceChildren();
  const availableItems = new Map(PREVIEW_ITEM_DEFINITIONS);
  for (const item of BOTTOM_TOOLBAR_ITEMS) {
    availableItems.set(item.id, {
      ...item,
      kind: config.popupGroups[item.id] ? 'group' : 'key'
    });
  }
  for (const [id, group] of Object.entries(config.customGroups)) {
    availableItems.set(id, { id, title: group.title, icon: group.icon, kind: 'group' });
  }
  for (const [id, key] of Object.entries(config.customKeys || {})) {
    availableItems.set(id, { id, title: key.title, icon: key.icon, kind: 'action' });
  }
  const groupOrder = openPopupGroup
    ? config.popupGroups[openPopupGroup]?.order || []
    : [];
  const items = openPopupGroup
    ? orderBottomToolbarPopupItems(
      openPopupGroup,
      groupOrder.map(id => availableItems.get(id)).filter(Boolean),
      config.popupGroups
    )
    : null;
  if (!items?.length) {
    popup.classList.add('hidden');
    return;
  }

  for (const item of items) {
    popup.appendChild(createPreviewPopupKey(item, openPopupGroup, 'popup'));
  }
  popup.classList.remove('hidden');
}

function getEmptyPopupGroupIds() {
  return new Set(
    Object.entries(config.popupGroups)
      .filter(([, group]) => group.order.length === 0)
      .map(([groupId]) => groupId)
  );
}

function createPreviewPopupKey(item, groupId, location, isIndividuallyHidden = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-strip-btn toolbar-preview-popup-key';
  const title = config.styles[item.id]?.title || item.title;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.setAttribute('aria-current', item.id === selectedPopupItem ? 'true' : 'false');
  button.classList.toggle('active', item.id === selectedPopupItem);
  button.dataset.previewPopupItem = item.id;
  if (groupId) button.dataset.previewGroup = groupId;
  else delete button.dataset.previewGroup;
  button.dataset.previewLocation = location;
  button.dataset.previewPopupHidden = String(isIndividuallyHidden);
  const style = config.styles[item.id] || {};
  button.style.setProperty(
    '--toolbar-key-active-bg-color',
    toToolbarCssColor(style.activeBackgroundColor || style.backgroundColor || 'transparent')
  );
  if (style.iconColor) {
    button.style.setProperty('--toolbar-key-icon-color', toToolbarCssColor(style.iconColor));
  }
  if (style.backgroundColor) {
    button.style.setProperty('--toolbar-key-bg-color', toToolbarCssColor(style.backgroundColor));
  }
  if (style.activeBackgroundColor) {
    button.style.setProperty(
      '--toolbar-key-active-bg-color',
      toToolbarCssColor(style.activeBackgroundColor)
    );
  }
  const customIcon = style.customSvg
    ? sanitizeToolbarSvg(style.customSvg, style.preserveSvgColors === true, document)
    : '';
  const iconElement = document.createElement('span');
  iconElement.className = 'toolbar-key-icon';
  const iconMarkup = customIcon || item.icon || '';
  if (typeof iconMarkup === 'string' && iconMarkup.includes('<svg')) {
    iconElement.innerHTML = iconMarkup;
  } else {
    iconElement.textContent = iconMarkup || item.title;
  }
  button.appendChild(iconElement);
  const labelElement = document.createElement('span');
  labelElement.className = 'toolbar-key-label';
  labelElement.textContent = title;
  button.appendChild(labelElement);
  const assignedGestureId = TOOLBAR_GESTURE_GROUPS
    .flatMap(group => group.gestures)
    .find(gesture => getGestureActionId(style, gesture.id))?.id;
  if (assignedGestureId) {
    const gestureIcon = getAssignedGestureIconMarkup(style, assignedGestureId);
    if (gestureIcon) {
      const marker = document.createElement('span');
      marker.className = 'toolbar-key-gesture-indicator';
      marker.setAttribute('aria-hidden', 'true');
      marker.title = `${assignedGestureId} action`;
      marker.innerHTML = gestureIcon;
      button.appendChild(marker);
    }
  }
  button.addEventListener('pointerdown', event => beginPossibleDrag(event, button), {
    passive: false
  });
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    selectedPopupItem = item.id;
    selectedKey = item.id;
    if (config.popupGroups[item.id]) openPopupGroup = item.id;
    else if (location === 'popup') openPopupGroup = groupId;
    else if (openPopupGroup !== groupId) openPopupGroup = null;
    setStatus('');
    render();
  });
  return button;
}

function renderHeldPopupKeys() {
  if (!tray) return;
  const availableItems = new Map(
    Object.values(PREVIEW_GROUP_ITEMS).flat().map(item => [item.id, item])
  );
  const rootIds = new Set([
    ...BOTTOM_TOOLBAR_ITEM_IDS,
    ...Object.keys(config.customGroups),
    ...Object.keys(config.customKeys || {})
  ]);
  for (const actionId of config.holding) {
    if (rootIds.has(actionId)) continue;
    const item = availableItems.get(actionId);
    if (item) tray.appendChild(createPreviewPopupKey(item, null, 'tray', true));
  }
}

function refreshSelectedKeyEditor() {
  if (!editor) return;
  const definition = PREVIEW_ITEM_DEFINITIONS.get(selectedKey) ||
    BOTTOM_TOOLBAR_ITEMS.find(item => item.id === selectedKey) ||
    (config.customGroups[selectedKey]
      ? { id: selectedKey, title: config.customGroups[selectedKey].title, kind: 'group' }
      : config.customKeys?.[selectedKey]
        ? { id: selectedKey, title: config.customKeys[selectedKey].title, kind: 'action' }
      : null);
  if (selectedKey !== editorKeyCache) {
    const search = document.querySelector('#toolbar-icon-search');
    if (search) search.value = '';
    editingKeyName = false;
    selectedGestureId = null;
    setActionPickerOpen(false);
    document.querySelectorAll('[data-toolbar-section]').forEach(section => {
      section.open = false;
    });
    editorKeyCache = selectedKey;
  }
  const deleteGroupButton = document.querySelector('#toolbar-delete-custom-group');
  if (deleteGroupButton) {
    const isCustomGroup = Boolean(config.customGroups[selectedKey]);
    const isCustomKey = Boolean(config.customKeys?.[selectedKey]);
    deleteGroupButton.hidden = !isCustomGroup && !isCustomKey;
    deleteGroupButton.setAttribute(
      'aria-label',
      isCustomGroup ? 'Delete custom group' : 'Delete custom key'
    );
    deleteGroupButton.title = isCustomGroup ? 'Delete custom group' : 'Delete custom key';
  }
  const addCustomButton = document.querySelector('#toolbar-add-custom');
  if (addCustomButton) addCustomButton.disabled = false;
  editor.classList.toggle('visible', Boolean(definition));
  editor.setAttribute('aria-hidden', String(!definition));
  syncToolbarEditorOverlay(Boolean(definition));
  if (!definition) return;

  const title = config.customGroups[selectedKey]?.title ||
    config.customKeys?.[selectedKey]?.title ||
    config.styles[selectedKey]?.title ||
    definition.title;
  selectedTitle.textContent = title;
  selectedTitle.hidden = editingKeyName;
  const nameInput = document.querySelector('#toolbar-preview-title-input');
  const editNameButton = document.querySelector('#toolbar-edit-key-name');
  const saveNameButton = document.querySelector('#toolbar-save-key-name');
  if (nameInput) {
    nameInput.hidden = !editingKeyName;
    if (!editingKeyName) nameInput.value = title;
  }
  if (editNameButton) editNameButton.hidden = editingKeyName;
  if (saveNameButton) saveNameButton.hidden = !editingKeyName;

  const style = config.styles[selectedKey] || {};
  const iconButton = document.querySelector('#toolbar-icon-color');
  const backgroundButton = document.querySelector('#toolbar-background-color');
  const activeButton = document.querySelector('#toolbar-active-background-color');
  iconButton.style.background = style.iconColor
    ? toToolbarCssColor(style.iconColor)
    : 'var(--toolbar-icon-color)';
  backgroundButton.style.background = style.backgroundColor
    ? toToolbarCssColor(style.backgroundColor)
    : 'transparent';
  activeButton.style.background = style.activeBackgroundColor
    ? toToolbarCssColor(style.activeBackgroundColor)
    : 'transparent';
  const preserveColorControl = document.querySelector('#toolbar-preserve-svg-colors');
  preserveColorControl.checked = style.preserveSvgColors === true;
  preserveColorControl.disabled = !style.customSvg;
  document.querySelectorAll('.toolbar-preview-reset-color').forEach(button => {
    button.disabled = !style[button.dataset.resetProperty];
  });
  document.querySelector('#toolbar-reset-key-style').disabled = Object.keys(style).length === 0;
  const customActionRow = document.querySelector('#toolbar-custom-key-action-row');
  const customActionButton = document.querySelector('#toolbar-custom-key-action');
  const customKeyAction = getActionDefinition(config.customKeys?.[selectedKey]?.actionId);
  if (customActionRow) customActionRow.hidden = !config.customKeys?.[selectedKey];
  if (customActionButton) {
    customActionButton.textContent = `Key action → ${customKeyAction?.title || 'Choose action'}`;
    customActionButton.title = customKeyAction
      ? `This key runs ${customKeyAction.title}`
      : 'Choose the action this custom key runs';
  }
  renderGestureSections(style);
}

function getGestureActionId(style, gestureId) {
  return style.gestureActions?.[gestureId] ||
    (gestureId === 'swipeUp' ? style.gestureAction : '') ||
    '';
}

function renderGestureSections(style) {
  for (const group of TOOLBAR_GESTURE_GROUPS) {
    const list = document.querySelector(`[data-gesture-list="${group.id}"]`);
    const summary = document.querySelector(`#toolbar-gesture-summary-${group.id}`);
    if (!list) continue;
    list.replaceChildren();
    const assigned = [];
    for (const gesture of group.gestures) {
      const actionId = getGestureActionId(style, gesture.id);
      const action = getActionDefinition(actionId);
      if (action) assigned.push(`${gesture.title} → ${action.title}`);

      const row = document.createElement('div');
      row.className = 'toolbar-preview-gesture-row';
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'toolbar-preview-gesture-action';
      actionButton.dataset.gestureId = gesture.id;
      actionButton.textContent = `${gesture.title} → ${action?.title || 'Choose action'}`;
      actionButton.title = action
        ? `${gesture.title} performs ${action.title}`
        : `Choose an action for ${gesture.title}`;
      actionButton.setAttribute(
        'aria-label',
        action
          ? `${gesture.title}: ${action.title}. Change action`
          : `Choose action for ${gesture.title}`
      );
      actionButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        selectedGestureId = gesture.id;
        setActionPickerOpen(true, true);
      });

      const iconButton = document.createElement('button');
      iconButton.type = 'button';
      iconButton.className = 'toolbar-preview-gesture-icon';
      iconButton.dataset.gestureId = gesture.id;
      iconButton.disabled = !action;
      iconButton.setAttribute(
        'aria-label',
        action
          ? `Choose icon for ${gesture.title}: ${action.title}`
          : `Choose an action for ${gesture.title} first`
      );
      iconButton.innerHTML = getAssignedGestureIconMarkup(style, gesture.id) || '◇';
      iconButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!getGestureActionId(config.styles[selectedKey] || {}, gesture.id)) return;
        selectedGestureId = gesture.id;
        setIconPickerOpen(true, true, 'gesture-action');
      });
      row.append(actionButton, iconButton);
      list.appendChild(row);
    }
    if (summary) {
      summary.textContent = assigned.length
        ? assigned.join(' · ')
        : 'No actions assigned';
    }
  }
}

function iconTitle(name) {
  if (PREVIEW_ICON_TITLES.has(name)) return PREVIEW_ICON_TITLES.get(name);
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function renderIconCatalog() {
  const list = document.querySelector('#toolbar-icon-list');
  const search = document.querySelector('#toolbar-icon-search');
  if (!list || !search) return;
  const query = search.value.trim().toLowerCase();
  const style = config.styles[selectedKey] || {};
  const selectedSvg = iconPickerTarget === 'gesture-action'
    ? getAssignedGestureIconMarkup(style, selectedGestureId)
    : style.customSvg;
  list.replaceChildren();
  const icons = Object.entries(svgIcons)
    .map(([name, value]) => [
      name,
      typeof value === 'function' ? value('#00e5ff') : value,
      iconTitle(name)
    ])
    .filter(([name, , title]) => `${name} ${title}`.toLowerCase().includes(query));

  for (const [name, markup, title] of icons) {
    if (typeof markup !== 'string' || !markup.includes('<svg')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-preview-icon-choice';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-pressed', String(selectedSvg === markup));
    button.title = title;
    button.innerHTML = `${sanitizeToolbarSvg(markup, false, document)}<span>${title}</span>`;
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedKey) return;
      const style = config.styles[selectedKey] || {};
      if (iconPickerTarget === 'gesture-action') {
        style.gestureActionIcons = style.gestureActionIcons || {};
        style.gestureActionIcons[selectedGestureId] = markup;
      } else {
        style.customSvg = markup;
        style.preserveSvgColors = false;
      }
      config.styles[selectedKey] = style;
      setIconPickerOpen(false);
      render();
      saveConfig();
    });
    list.appendChild(button);
  }
  if (!list.children.length) {
    const empty = document.createElement('span');
    empty.className = 'toolbar-preview-icon-empty';
    empty.textContent = 'No matching icons';
    list.appendChild(empty);
  }
}

function renderActionCatalog() {
  const list = document.querySelector('#toolbar-action-list');
  const search = document.querySelector('#toolbar-action-search');
  if (!list || !search) return;
  const query = search.value.trim().toLowerCase();
  const selectedAction = actionPickerTarget === 'custom-key'
    ? config.customKeys?.[selectedKey]?.actionId
    : getGestureActionId(config.styles[selectedKey] || {}, selectedGestureId);
  const items = [...actionDefinitions().values()]
    .map(item => ({
      ...item,
      title: config.styles[item.id]?.title || item.title
    }))
    .filter(item =>
      `${item.id} ${item.title}`.toLowerCase().includes(query) &&
      (actionPickerTarget !== 'custom-key' ||
        (item.id !== selectedKey && !customKeyActionWouldCycle(selectedKey, item.id)))
    );
  list.replaceChildren();

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-preview-action-choice';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', item.title);
    button.setAttribute('aria-pressed', String(item.id === selectedAction));
    const icon = document.createElement('span');
    const iconMarkup = getActionIconMarkup(item);
    if (iconMarkup.includes('<svg')) {
      icon.innerHTML = iconMarkup;
    } else {
      icon.textContent = iconMarkup;
    }
    const title = document.createElement('span');
    title.textContent = item.title;
    button.append(icon, title);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedKey) return;
      if (actionPickerTarget === 'custom-key') {
        if (config.customKeys?.[selectedKey]) {
          config.customKeys[selectedKey].actionId = item.id;
        }
      } else {
        const style = config.styles[selectedKey] || {};
        style.gestureActions = style.gestureActions || {};
        style.gestureActions[selectedGestureId] = item.id;
        if (selectedGestureId === 'swipeUp') delete style.gestureAction;
        if (style.gestureActionIcons) {
          delete style.gestureActionIcons[selectedGestureId];
          if (Object.keys(style.gestureActionIcons).length === 0) {
            delete style.gestureActionIcons;
          }
        }
        config.styles[selectedKey] = style;
      }
      setActionPickerOpen(false);
      render();
      saveConfig();
    });
    list.appendChild(button);
  }

  if (!list.children.length) {
    const empty = document.createElement('span');
    empty.className = 'toolbar-preview-icon-empty';
    empty.textContent = 'No matching actions';
    list.appendChild(empty);
  }
}

function customKeyActionWouldCycle(sourceId, candidateId) {
  let currentId = candidateId;
  const visited = new Set();
  while (config.customKeys?.[currentId]) {
    if (currentId === sourceId || visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = config.customKeys[currentId].actionId;
    if (!currentId) return false;
  }
  return currentId === sourceId;
}

function beginPossibleDrag(event, button) {
  if (event.button !== undefined && event.button !== 0) return;
  pendingDragCleanup?.();
  const popupItemId = button.dataset.previewPopupItem;
  const groupId = button.dataset.previewGroup || null;
  const isPopupItem = Boolean(popupItemId);
  const id = isPopupItem ? popupItemId : button.dataset.toolbarKey;
  const source = isPopupItem
    ? button.dataset.previewLocation === 'tray'
      ? 'popup-hidden'
      : 'popup'
    : tray.contains(button)
      ? 'hidden'
      : 'visible';
  const startX = event.clientX;
  const startY = event.clientY;
  const pointerId = event.pointerId;
  const scrollStrip = source === 'popup' ? button.closest('#toolbar-preview-popup') : null;
  let lastX = startX;
  let lastY = startY;
  let scrolling = false;
  const matchesPointer = pointerEvent =>
    pointerId === undefined ||
    pointerEvent.pointerId === undefined ||
    pointerEvent.pointerId === pointerId;
  const cleanup = () => {
    clearTimeout(dragTimer);
    document.removeEventListener('pointermove', onPendingPointerMove);
    document.removeEventListener('pointerup', onPendingPointerEnd);
    document.removeEventListener('pointercancel', onPendingPointerEnd);
    if (pendingDragCleanup === cleanup) pendingDragCleanup = null;
  };
  const onPendingPointerEnd = pointerEvent => {
    if (!matchesPointer(pointerEvent)) return;
    cleanup();
  };
  const onPendingPointerMove = pointerEvent => {
    if (!matchesPointer(pointerEvent)) return;
    const deltaX = pointerEvent.clientX - startX;
    const deltaY = pointerEvent.clientY - startY;
    if (scrolling) {
      if (scrollStrip) {
        scrollStrip.scrollLeft += lastX - pointerEvent.clientX;
        pointerEvent.preventDefault();
      }
      lastX = pointerEvent.clientX;
      lastY = pointerEvent.clientY;
      return;
    }
    if (Math.hypot(deltaX, deltaY) < 8) return;
    if (scrollStrip && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
      clearTimeout(dragTimer);
      scrolling = true;
      suppressButtonClick(button);
      scrollStrip.scrollLeft += lastX - pointerEvent.clientX;
      lastX = pointerEvent.clientX;
      lastY = pointerEvent.clientY;
      pointerEvent.preventDefault();
      return;
    }
    // Movement before the long-press is a scroll/touch, not a drag.
    cleanup();
  };
  document.addEventListener('pointermove', onPendingPointerMove, { passive: false });
  document.addEventListener('pointerup', onPendingPointerEnd);
  document.addEventListener('pointercancel', onPendingPointerEnd);
  pendingDragCleanup = cleanup;
  dragTimer = setTimeout(() => {
    cleanup();
    dragState = { id, source, groupId, target: null, startX, startY, pointerId, started: false };
    document.addEventListener('pointermove', onDocumentPointerMove, { passive: false });
    document.addEventListener('pointerup', onDocumentPointerUp);
    document.addEventListener('pointercancel', cancelDrag);
  }, 380);
}

function suppressButtonClick(button) {
  const suppress = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  button.addEventListener('click', suppress, true);
  setTimeout(() => button.removeEventListener('click', suppress, true), 700);
}

function onDocumentPointerMove(event) {
  if (!dragState) return;
  if (
    dragState.pointerId !== undefined &&
    event.pointerId !== undefined &&
    event.pointerId !== dragState.pointerId
  ) return;
  dragState.lastClientX = event.clientX;
  dragState.lastClientY = event.clientY;
  const moved = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (!dragState.started && moved < 8) return;
  if (!dragState.started) {
    dragState.started = true;
    const sourceButton = dragState.groupId
      ? findPopupKeyButton(dragState.groupId, dragState.id)
      : findToolbarKeyButton(dragState.id);
    sourceButton?.classList.add('is-dragging');
    setStatus('Drag to another position or to the holding tray.');
  }
  event.preventDefault();
  document.querySelectorAll('.drop-target, .drop-target-group').forEach(element => {
    element.classList.remove('drop-target', 'drop-target-group');
  });
  dragState.target = resolveDragTarget(event.clientX, event.clientY);
  if (
    dragState.target?.button &&
    (dragState.target.groupDrop || dragState.target.type === 'group-key')
  ) {
    dragState.target.button.classList.add('drop-target-group');
  }
  if (dragState.target?.type === 'tray') tray.classList.add('drop-target');
  setDropMarker(dragState.target);
}

function onDocumentPointerUp(event) {
  if (
    dragState?.pointerId !== undefined &&
    event.pointerId !== undefined &&
    event.pointerId !== dragState.pointerId
  ) return;
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointercancel', cancelDrag);
  document.removeEventListener('pointerup', onDocumentPointerUp);
  if (dragState) {
    dragState.lastClientX = event.clientX;
    dragState.lastClientY = event.clientY;
  }
  document.querySelectorAll('.drop-target, .drop-target-group, .is-dragging').forEach(element => {
    element.classList.remove('drop-target', 'drop-target-group', 'is-dragging');
  });
  setDropMarker(null);
  if (!dragState?.started) {
    dragState = null;
    return;
  }
  if (dragState.started) {
    dragState.target = resolveDragTarget(event.clientX, event.clientY);
  }
  applyDrop(dragState);
  dragState = null;
  render();
  saveConfig();
}

function cancelDrag(event) {
  if (
    event &&
    dragState?.pointerId !== undefined &&
    event.pointerId !== undefined &&
    event.pointerId !== dragState.pointerId
  ) return;
  clearTimeout(dragTimer);
  pendingDragCleanup?.();
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointerup', onDocumentPointerUp);
  document.removeEventListener('pointercancel', cancelDrag);
  document.querySelectorAll('.drop-target, .drop-target-group, .is-dragging').forEach(element => {
    element.classList.remove('drop-target', 'drop-target-group', 'is-dragging');
  });
  setDropMarker(null);
  dragState = null;
  render();
}

function setDropMarker(target) {
  if (!dropMarker || !target || !Number.isFinite(target.markerX) ||
      !Number.isFinite(target.markerY)) {
    if (dropMarker) dropMarker.hidden = true;
    return;
  }
  dropMarker.hidden = false;
  dropMarker.dataset.kind = target.groupDrop || target.type === 'group-key' ? 'group' : 'insert';
  dropMarker.style.left = `${target.markerX}px`;
  dropMarker.style.top = `${target.markerY}px`;
}

function resolveDragTarget(clientX, clientY) {
  const pointTarget = document.elementFromPoint(clientX, clientY);
  const popupButton =
    buttonAtPoint('.toolbar-preview-popup-key', clientX, clientY) ||
    pointTarget?.closest?.('.toolbar-preview-popup-key');
  if (popupButton) {
    const popupId = popupButton.dataset.previewPopupItem;
    const sameKey =
      popupId === dragState.id &&
      (popupButton.dataset.previewGroup || null) === dragState.groupId;
    if (sameKey) return null;
    const groupDrop = isCenteredOnKey(popupButton, clientX, clientY);
    if (config.popupGroups[popupId] && groupDrop) {
      const bounds = popupButton.getBoundingClientRect();
      return {
        type: 'group-key',
        id: popupId,
        button: popupButton,
        markerX: bounds.left + bounds.width / 2,
        markerY: bounds.bottom - 9
      };
    }
    return keyPositionTarget(
      'popup-key',
      popupButton,
      clientX,
      clientY,
      groupDrop
    );
  }

  const keyButton =
    buttonAtPoint('.toolbar-preview-key', clientX, clientY) ||
    pointTarget?.closest?.('.toolbar-preview-key');
  if (keyButton) {
    const id = keyButton.dataset.toolbarKey;
    if (id === dragState.id) return null;
    const groupDrop = isCenteredOnKey(keyButton, clientX, clientY);
    const bounds = keyButton.getBoundingClientRect();
    if (config.popupGroups[id] && groupDrop) {
      return {
        type: 'group-key',
        id,
        button: keyButton,
        markerX: bounds.left + bounds.width / 2,
        markerY: bounds.bottom - 9
      };
    }
    return keyPositionTarget(
      tray.contains(keyButton) ? 'hidden-key' : 'visible-key',
      keyButton,
      clientX,
      clientY,
      groupDrop
    );
  }

  if (
    pointTarget === tray ||
    tray.contains(pointTarget) ||
    pointIsInside(tray, clientX, clientY)
  ) {
    const buttons = [
      ...tray.querySelectorAll('.toolbar-preview-key, .toolbar-preview-popup-key')
    ];
    if (!buttons.length) {
      const bounds = tray.getBoundingClientRect();
      return {
        type: 'tray',
        markerX: bounds.left + 12,
        markerY: bounds.top + bounds.height / 2
      };
    }
    return listGapTarget('holding-insert', buttons, clientX, clientY);
  }

  const popupContainer =
    pointTarget?.closest?.('#toolbar-preview-popup') ||
    (popup && !popup.classList.contains('hidden') && pointIsInside(popup, clientX, clientY)
      ? popup
      : null);
  if (popupContainer) {
    const buttons = [...popupContainer.querySelectorAll('.toolbar-preview-popup-key')];
    return listGapTarget('popup-insert', buttons, clientX, clientY, {
      groupId: openPopupGroup
    });
  }

  const stage = document.querySelector('.toolbar-preview-stage');
  if (
    pointTarget?.closest?.('.toolbar-preview-stage') ||
    pointIsInside(stage, clientX, clientY)
  ) {
    return listGapTarget(
      'toolbar-insert',
      [...toolbar.querySelectorAll('.toolbar-preview-key')],
      clientX,
      clientY
    );
  }
  return null;
}

function buttonAtPoint(selector, clientX, clientY) {
  return [...document.querySelectorAll(selector)].find(button =>
    pointIsInside(button, clientX, clientY)
  ) || null;
}

function pointIsInside(element, clientX, clientY) {
  if (!element) return false;
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 &&
    bounds.height > 0 &&
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom;
}

function keyPositionTarget(type, button, clientX, clientY, groupDrop = false) {
  const bounds = button.getBoundingClientRect();
  const after = clientX >= bounds.left + bounds.width / 2;
  const anchorId = button.dataset.previewPopupItem || button.dataset.toolbarKey;
  return {
    type,
    id: anchorId,
    anchorId,
    groupId: button.dataset.previewGroup || null,
    location: button.dataset.previewLocation,
    hidden: button.dataset.previewPopupHidden === 'true',
    button,
    after,
    groupDrop,
    markerX: groupDrop
      ? bounds.left + bounds.width / 2
      : after ? bounds.right : bounds.left,
    markerY: groupDrop
      ? bounds.bottom - 14
      : bounds.top + Math.max(0, (bounds.height - 24) / 2)
  };
}

function listGapTarget(type, buttons, clientX, clientY, extra = {}) {
  const visible = buttons
    .filter(button => {
      const id = button.dataset.previewPopupItem || button.dataset.toolbarKey;
      return id && id !== dragState.id;
    })
    .map(button => ({ button, bounds: button.getBoundingClientRect() }));
  if (!visible.length) {
    return { type, ...extra, anchorId: null, after: false };
  }

  const rows = new Map();
  for (const entry of visible) {
    const rowTop = Math.round(entry.bounds.top);
    if (!rows.has(rowTop)) rows.set(rowTop, []);
    rows.get(rowTop).push(entry);
  }
  const row = [...rows.values()]
    .map(entries => {
      const top = Math.min(...entries.map(entry => entry.bounds.top));
      const bottom = Math.max(...entries.map(entry => entry.bounds.bottom));
      const distance = clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
      return { entries: entries.sort((a, b) => a.bounds.left - b.bounds.left), top, bottom, distance };
    })
    .sort((a, b) => a.distance - b.distance)[0];
  const next = row.entries.find(entry =>
    clientX < entry.bounds.left + entry.bounds.width / 2
  );
  const anchor = next || row.entries[row.entries.length - 1];
  const after = !next;
  const id = anchor.button.dataset.previewPopupItem || anchor.button.dataset.toolbarKey;
  return {
    type,
    ...extra,
    anchorId: id,
    after,
    markerX: after ? anchor.bounds.right : anchor.bounds.left,
    markerY: anchor.bounds.top + Math.max(0, (anchor.bounds.height - 24) / 2)
  };
}

/* Kept separate so folder drops only occur in the clearly marked center zone. */
function findToolbarKeyButton(id) {
  return [...document.querySelectorAll('.toolbar-preview-key')]
    .find(button => button.dataset.toolbarKey === id);
}

function findPopupKeyButton(groupId, id, location) {
  return [...document.querySelectorAll('.toolbar-preview-popup-key')]
    .find(button =>
      (button.dataset.previewGroup || null) === groupId &&
      button.dataset.previewPopupItem === id &&
      (!location || button.dataset.previewLocation === location)
    );
}

function applyDrop({ id, source, groupId, target, lastClientX, lastClientY }) {
  if (target?.type === 'popup-key' || target?.type === 'popup-insert') {
    applyPopupDrop({ id, source, groupId, target, lastClientX, lastClientY });
    return;
  }
  const isPopupAction = Object.values(PREVIEW_GROUP_ITEMS)
    .flat()
    .some(item => item.id === id);
  if (source.startsWith('popup') || isPopupAction) {
    applyPopupDrop({ id, source, groupId, target, lastClientX, lastClientY });
    return;
  }
  if (target?.type === 'ignored') return;
  const wasVisible = source === 'visible';
  const originalIndex = wasVisible
    ? config.order.indexOf(id)
    : config.holding.indexOf(id);
  config.order = config.order.filter(item => item !== id);
  config.hidden = config.hidden.filter(item => item !== id);
  config.holding = config.holding.filter(item => item !== id);
  for (const group of Object.values(config.popupGroups)) {
    group.order = group.order.filter(item => item !== id);
  }

  if (!target) {
    const destination = wasVisible ? config.order : config.holding;
    destination.splice(Math.max(0, originalIndex), 0, id);
    return;
  }
  if (target.type === 'tray') {
    hideToolbarKey(id);
    return;
  }
  if (target.type === 'toolbar-insert') {
    config.order.splice(getDropIndex(config.order, target), 0, id);
    return;
  }
  if (target.type === 'holding-insert') {
    if (config.popupGroups[id]) releasePopupGroupToHoldingArea(id);
    config.holding.splice(getDropIndex(config.holding, target), 0, id);
    return;
  }
  if (target.type === 'group-key') {
    const targetGroup = config.popupGroups[target.id];
    if (targetGroup && !wouldCreateGroupCycle(id, target.id)) targetGroup.order.push(id);
    else config.holding.push(id);
    return;
  }

  if (target.type === 'visible-key') {
    const beforeIndex = config.order.indexOf(target.id);
    if (target.groupDrop) {
      createToolbarGroupFromDrop(target.id, id, {
        location: 'toolbar',
        index: Math.max(0, beforeIndex)
      });
      return;
    }
    config.order.splice(getDropIndex(config.order, target), 0, id);
    return;
  }

  if (target.type === 'hidden-key') {
    const beforeIndex = config.holding.indexOf(target.id);
    if (target.groupDrop) {
      createToolbarGroupFromDrop(target.id, id, {
        location: 'holding',
        index: Math.max(0, beforeIndex)
      });
      return;
    }
    config.holding.splice(getDropIndex(config.holding, target), 0, id);
    return;
  }

  config.order.push(id);
}

function getDropIndex(list, target) {
  const anchorIndex = target?.anchorId ? list.indexOf(target.anchorId) : -1;
  if (anchorIndex < 0) return list.length;
  return anchorIndex + (target.after ? 1 : 0);
}

function applyPopupDrop({ id, source, groupId, target }) {
  if (target?.type === 'ignored') return;
  const sourceGroup = groupId ? config.popupGroups[groupId] : null;
  const originalIndex = (source === 'visible'
    ? config.order
    : sourceGroup?.order || config.holding).indexOf(id);
  config.order = config.order.filter(item => item !== id);
  config.hidden = config.hidden.filter(item => item !== id);
  for (const group of Object.values(config.popupGroups)) {
    group.order = group.order.filter(item => item !== id);
    group.hidden = group.hidden.filter(item => item !== id);
  }
  config.holding = config.holding.filter(item => item !== id);

  const restoreSource = () => {
    const destination = source === 'visible'
      ? config.order
      : sourceGroup?.order || config.holding;
    destination.splice(Math.max(0, Math.min(originalIndex, destination.length)), 0, id);
  };
  const insertIntoHolding = destination => {
    if (config.popupGroups[id]) releasePopupGroupToHoldingArea(id);
    config.holding.splice(getDropIndex(config.holding, destination), 0, id);
    if (groupId && config.popupGroups[groupId]?.order.length === 0) {
      openPopupGroup = null;
    }
  };

  if (target?.type === 'popup-insert') {
    const targetGroup = target.groupId ? config.popupGroups[target.groupId] : null;
    const destination = targetGroup?.order || config.order;
    destination.splice(getDropIndex(destination, target), 0, id);
    if (groupId && config.popupGroups[groupId]?.order.length === 0) openPopupGroup = null;
    return;
  }

  if (target?.type === 'popup-key') {
    if (target.location === 'tray') {
      if (target.groupDrop) {
        createToolbarGroupFromDrop(target.id, id, {
          location: 'holding',
          index: Math.max(0, config.holding.indexOf(target.id))
        });
        return;
      }
      insertIntoHolding(target);
      return;
    }
    const targetGroup = target.groupId ? config.popupGroups[target.groupId] : null;
    if (!targetGroup) {
      restoreSource();
      return;
    }
    if (target.groupDrop) {
      createToolbarGroupFromDrop(target.id, id, {
        location: 'group',
        groupId: target.groupId,
        index: Math.max(0, targetGroup.order.indexOf(target.id))
      });
      return;
    }
    targetGroup.order.splice(getDropIndex(targetGroup.order, target), 0, id);
    return;
  }

  if (target?.type === 'tray') {
    insertIntoHolding({ anchorId: null, after: false });
    return;
  }

  if (target?.type === 'holding-insert') {
    insertIntoHolding(target);
    return;
  }

  if (target?.type === 'group-key') {
    const targetGroup = config.popupGroups[target.id];
    if (targetGroup && !wouldCreateGroupCycle(id, target.id)) targetGroup.order.push(id);
    else config.holding.push(id);
    return;
  }

  if (target?.type === 'visible-key') {
    if (target.groupDrop) {
      createToolbarGroupFromDrop(target.id, id, {
        location: 'toolbar',
        index: Math.max(0, config.order.indexOf(target.id))
      });
      return;
    }
    config.order.splice(getDropIndex(config.order, target), 0, id);
    return;
  }

  if (target?.type === 'hidden-key') {
    if (target.groupDrop) {
      createToolbarGroupFromDrop(target.id, id, {
        location: 'holding',
        index: Math.max(0, config.holding.indexOf(target.id))
      });
      return;
    }
    insertIntoHolding(target);
    return;
  }

  if (target?.type === 'toolbar-insert') {
    config.order.splice(getDropIndex(config.order, target), 0, id);
    return;
  }

  if (target?.type === 'stage') {
    config.order.push(id);
    return;
  }

  restoreSource();
}

function isCenteredOnKey(button, clientX, clientY) {
  if (!button) return false;
  const bounds = button.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return true;
  return clientX >= bounds.left + bounds.width * 0.32 &&
    clientX <= bounds.right - bounds.width * 0.32 &&
    clientY >= bounds.top + bounds.height * 0.34 &&
    clientY <= bounds.bottom - bounds.height * 0.34;
}

function wouldCreateGroupCycle(movedId, targetGroupId) {
  if (!config.popupGroups[movedId]) return false;
  const visit = (groupId, visited = new Set()) => {
    if (groupId === movedId) return true;
    if (visited.has(groupId)) return false;
    visited.add(groupId);
    for (const childId of config.popupGroups[groupId]?.order || []) {
      if (config.popupGroups[childId] && visit(childId, visited)) return true;
    }
    return false;
  };
  return visit(targetGroupId);
}

function generateCustomGroupId(kind = 'group') {
  let id;
  do {
    const prefix = kind === 'key' ? 'custom-key' : 'custom-group';
    id = `${prefix}-${Date.now().toString(36)}-${nextCustomGroupNumber++}`;
  } while (config.customGroups[id] || config.customKeys?.[id]);
  return id;
}

function createToolbarGroupFromDrop(firstId, secondId, placement) {
  const groupId = generateCustomGroupId();
  const firstDefinition = PREVIEW_ITEM_DEFINITIONS.get(firstId) ||
    BOTTOM_TOOLBAR_ITEMS.find(item => item.id === firstId) ||
    Object.values(PREVIEW_GROUP_ITEMS).flat().find(item => item.id === firstId) ||
    (config.customGroups[firstId]
      ? { id: firstId, title: config.customGroups[firstId].title, icon: config.customGroups[firstId].icon }
      : config.customKeys?.[firstId]
        ? { id: firstId, title: config.customKeys[firstId].title, icon: config.customKeys[firstId].icon }
      : null);
  const title = firstDefinition?.title?.trim().slice(0, 48) || 'New group';
  const sourceStyle = config.styles[firstId] || {};
  const sourceIcon = firstDefinition?.icon;
  const iconName = typeof sourceIcon === 'string' && /^[a-z0-9_-]{1,48}$/i.test(sourceIcon)
    ? sourceIcon
    : 'folder';
  config.customGroups[groupId] = { title, icon: iconName };
  config.popupGroups[groupId] = { order: [firstId, secondId], hidden: [] };
  const customSvg = sourceStyle.customSvg ||
    (typeof sourceIcon === 'string' && sourceIcon.includes('<svg') ? sourceIcon : '');
  if (customSvg) {
    config.styles[groupId] = {
      customSvg,
      preserveSvgColors: sourceStyle.preserveSvgColors === true
    };
  }

  const previousIndex = placement.index;
  config.order = config.order.filter(id => id !== firstId && id !== secondId);
  config.hidden = config.hidden.filter(id => id !== firstId && id !== secondId);
  config.holding = config.holding.filter(id => id !== firstId && id !== secondId);
  for (const group of Object.values(config.popupGroups)) {
    if (group !== config.popupGroups[groupId]) {
      group.order = group.order.filter(id => id !== firstId && id !== secondId);
    }
  }
  if (placement.location === 'toolbar') {
    config.order.splice(Math.min(previousIndex, config.order.length), 0, groupId);
  } else if (placement.location === 'holding') {
    config.holding.splice(Math.min(previousIndex, config.holding.length), 0, groupId);
  } else if (placement.location === 'group') {
    const parent = config.popupGroups[placement.groupId];
    if (parent) {
      parent.order.splice(Math.min(previousIndex, parent.order.length), 0, groupId);
    } else {
      config.holding.push(groupId);
    }
  }
  selectedKey = groupId;
  selectedPopupItem = null;
  openPopupGroup = groupId;
}

function hideToolbarKey(id) {
  if (!config.holding.includes(id)) config.holding.push(id);
  if (config.popupGroups[id]) releasePopupGroupToHoldingArea(id);
  if (openPopupGroup === id) openPopupGroup = null;
}

function releasePopupGroupToHoldingArea(groupId) {
  const groupConfig = config.popupGroups[groupId];
  if (!groupConfig) return;
  config.holding = [...new Set([...config.holding, ...groupConfig.order])];
  groupConfig.order = [];
  groupConfig.hidden = [];
}

function openColorPicker(property) {
  if (!selectedKey) return;
  window.ToolbarSettings?.pickBottomToolbarColor?.(selectedKey, property);
}

document.querySelector('#toolbar-icon-color')?.addEventListener('click', () => {
  openColorPicker('iconColor');
});
document.querySelector('#toolbar-background-color')?.addEventListener('click', () => {
  openColorPicker('backgroundColor');
});
document.querySelector('#toolbar-active-background-color')?.addEventListener('click', () => {
  openColorPicker('activeBackgroundColor');
});
document.querySelectorAll('.toolbar-preview-reset-color').forEach(button => {
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/></svg>';
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedKey) return;
    const style = config.styles[selectedKey];
    if (!style) return;
    delete style[button.dataset.resetProperty];
    if (Object.keys(style).length === 0) delete config.styles[selectedKey];
    render();
    saveConfig();
  });
});
document.querySelector('#toolbar-reset-key-style')?.addEventListener('click', () => {
  if (!selectedKey) return;
  delete config.styles[selectedKey];
  render();
  saveConfig();
});

document.querySelector('#toolbar-open-icon-picker')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  setIconPickerOpen(true, true, 'key');
});
iconPicker?.addEventListener('click', event => {
  event.stopPropagation();
  if (event.target === iconPicker) setIconPickerOpen(false);
});
document.querySelector('#toolbar-icon-picker-close')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  const returnTarget = iconPickerTarget === 'gesture-action'
    ? document.querySelector(`.toolbar-preview-gesture-icon[data-gesture-id="${selectedGestureId}"]`)
    : document.querySelector('#toolbar-open-icon-picker');
  setIconPickerOpen(false);
  returnTarget?.focus();
});
actionPicker?.addEventListener('click', event => {
  event.stopPropagation();
  if (event.target === actionPicker) setActionPickerOpen(false);
});
document.querySelector('#toolbar-action-picker-close')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  setActionPickerOpen(false);
  const returnTarget = actionPickerTarget === 'custom-key'
    ? document.querySelector('#toolbar-custom-key-action')
    : document.querySelector(`.toolbar-preview-gesture-action[data-gesture-id="${selectedGestureId}"]`);
  returnTarget?.focus();
});
document.querySelector('#toolbar-custom-key-action')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  if (!config.customKeys?.[selectedKey]) return;
  setActionPickerOpen(true, true, 'custom-key');
});

function invokeSvgAction(action, fallbackMessage) {
  if (!selectedKey) {
    setStatus('Select a toolbar key before editing its icon.');
    return;
  }
  const bridge = window.ToolbarSettings;
  if (typeof bridge?.editBottomToolbarIcon === 'function') {
    setStatus(fallbackMessage);
    try {
      const request = { itemId: selectedKey, action };
      if (iconPickerTarget === 'gesture-action') {
        request.property = `gestureActionIconSvg:${selectedGestureId}`;
      }
      bridge.editBottomToolbarIcon(JSON.stringify(request));
    } catch (error) {
      setStatus(`Could not open the SVG action: ${error.message || 'unknown error'}`);
    }
    return;
  }
  setStatus('SVG editing is unavailable. Close and reopen toolbar settings, then try again.');
}

document.querySelector('#toolbar-paste-svg')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  setIconPickerOpen(false);
  invokeSvgAction('paste', 'Opening SVG paste dialog…');
});
document.querySelector('#toolbar-choose-svg')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  setIconPickerOpen(false);
  invokeSvgAction('file', 'Opening SVG file picker…');
});
document.querySelector('#toolbar-add-custom')?.addEventListener('click', () => {
  const modal = document.querySelector('#toolbar-create-group-modal');
  const input = document.querySelector('#toolbar-create-group-name');
  const type = document.querySelector('#toolbar-create-group-type');
  if (!modal || !input) return;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  input.value = '';
  if (type) type.value = 'key';
  input.placeholder = 'Key name';
  input.focus();
});
document.querySelector('#toolbar-create-group-type')?.addEventListener('change', event => {
  const input = document.querySelector('#toolbar-create-group-name');
  const title = document.querySelector('#toolbar-create-group-title');
  const isGroup = event.target.value === 'group';
  if (input) input.placeholder = isGroup ? 'Group name' : 'Key name';
  if (title) title.textContent = isGroup ? 'Create custom group' : 'Create custom key';
});

document.querySelector('#toolbar-create-group-cancel')?.addEventListener('click', () => {
  const modal = document.querySelector('#toolbar-create-group-modal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
});

document.querySelector('#toolbar-create-group-modal')?.addEventListener('click', event => {
  if (event.target !== event.currentTarget) return;
  event.currentTarget.hidden = true;
  event.currentTarget.setAttribute('aria-hidden', 'true');
});

document.querySelector('#toolbar-create-group-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#toolbar-create-group-name');
  const title = input?.value.trim().slice(0, 48);
  if (!title) {
    input?.focus();
    return;
  }
  const type = document.querySelector('#toolbar-create-group-type')?.value === 'group'
    ? 'group'
    : 'key';
  const id = generateCustomGroupId(type);
  if (type === 'group') {
    config.customGroups[id] = { title, icon: 'folder' };
    config.popupGroups[id] = { order: [], hidden: [] };
  } else {
    config.customKeys[id] = { title, icon: 'newFile' };
  }
  config.holding.push(id);
  selectedKey = id;
  openPopupGroup = null;
  const modal = document.querySelector('#toolbar-create-group-modal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
  render();
  saveConfig();
});

function startKeyNameEdit() {
  if (!selectedKey) return;
  editingKeyName = true;
  refreshSelectedKeyEditor();
  const input = document.querySelector('#toolbar-preview-title-input');
  input?.focus();
  input?.select();
}

function saveKeyNameEdit() {
  if (!selectedKey) return;
  const input = document.querySelector('#toolbar-preview-title-input');
  const title = input?.value.trim().slice(0, 48);
  if (!title) {
    input?.focus();
    setStatus('Enter a name for this toolbar key.');
    return;
  }
  if (config.customGroups[selectedKey]) {
    config.customGroups[selectedKey].title = title;
  } else if (config.customKeys?.[selectedKey]) {
    config.customKeys[selectedKey].title = title;
  } else {
    const definition = PREVIEW_ITEM_DEFINITIONS.get(selectedKey);
    const style = config.styles[selectedKey] || {};
    if (title === definition?.title) delete style.title;
    else style.title = title;
    if (Object.keys(style).length) config.styles[selectedKey] = style;
    else delete config.styles[selectedKey];
  }
  editingKeyName = false;
  setStatus('');
  render();
  saveConfig();
}

function cancelKeyNameEdit() {
  if (!editingKeyName) return;
  editingKeyName = false;
  render();
}

document.querySelector('#toolbar-edit-key-name')?.addEventListener('click', startKeyNameEdit);
document.querySelector('#toolbar-save-key-name')?.addEventListener('click', saveKeyNameEdit);
document.querySelector('#toolbar-preview-title-input')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    saveKeyNameEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    cancelKeyNameEdit();
  }
});

document.querySelector('#toolbar-delete-custom-group')?.addEventListener('click', () => {
  const id = selectedKey;
  if (!id || (!config.customGroups[id] && !config.customKeys?.[id])) return;
  if (config.customGroups[id]) {
    const group = config.popupGroups[id];
    if (group) config.holding = [...new Set([...config.holding, ...group.order])];
    delete config.customGroups[id];
    delete config.popupGroups[id];
  } else {
    for (const popupGroup of Object.values(config.popupGroups)) {
      popupGroup.order = popupGroup.order.filter(key => key !== id);
      popupGroup.hidden = popupGroup.hidden.filter(key => key !== id);
    }
    delete config.customKeys[id];
  }
  delete config.styles[id];
  config.order = config.order.filter(key => key !== id);
  config.hidden = config.hidden.filter(key => key !== id);
  config.holding = config.holding.filter(key => key !== id);
  if (openPopupGroup === id) openPopupGroup = null;
  selectedKey = null;
  render();
  saveConfig();
});
document.querySelector('#toolbar-icon-search')?.addEventListener('input', renderIconCatalog);
document.querySelector('#toolbar-action-search')?.addEventListener('input', renderActionCatalog);
const toolbarEditorSections = [...document.querySelectorAll('[data-toolbar-section]')];
for (const section of toolbarEditorSections) {
  section.addEventListener('toggle', () => {
    if (!section.open) return;
    for (const other of toolbarEditorSections) {
      if (other !== section) other.open = false;
    }
  });
}
document.querySelector('#toolbar-preserve-svg-colors')?.addEventListener('change', event => {
  if (!selectedKey || !config.styles[selectedKey]?.customSvg) return;
  config.styles[selectedKey].preserveSvgColors = event.target.checked;
  render();
  saveConfig();
});
document.querySelector('#toolbar-reset-layout')?.addEventListener('click', () => {
  config = normalizeBottomToolbarConfig(null);
  setIconPickerOpen(false);
  selectedKey = null;
  openPopupGroup = null;
  selectedPopupItem = null;
  render();
  saveConfig();
});

document.querySelector('#toolbar-preview-close-editor')?.addEventListener('click', () => {
  setIconPickerOpen(false);
  selectedKey = null;
  render();
});

document.addEventListener('click', event => {
  if (iconPickerOpen || actionPickerOpen) return;
  if (!editor?.classList.contains('visible')) return;
  const target = event.target;
  if (
    editor.contains(target) ||
    target?.closest?.('#toolbar-create-group-modal') ||
    target?.closest?.('.toolbar-preview-layout-actions') ||
    target?.closest?.('.toolbar-preview-key, .toolbar-preview-popup-key')
  ) {
    return;
  }
  selectedKey = null;
  render();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const createGroupModal = document.querySelector('#toolbar-create-group-modal');
  if (createGroupModal && !createGroupModal.hidden) {
    event.preventDefault();
    createGroupModal.hidden = true;
    createGroupModal.setAttribute('aria-hidden', 'true');
    return;
  }
  if (actionPickerOpen) {
    event.preventDefault();
    setActionPickerOpen(false);
    const target = actionPickerTarget === 'custom-key'
      ? '#toolbar-custom-key-action'
      : `.toolbar-preview-gesture-action[data-gesture-id="${selectedGestureId}"]`;
    document.querySelector(target)?.focus();
    return;
  }
  if (iconPickerOpen) {
    event.preventDefault();
    setIconPickerOpen(false);
    const target = iconPickerTarget === 'gesture-action'
      ? `.toolbar-preview-gesture-icon[data-gesture-id="${selectedGestureId}"]`
      : '#toolbar-open-icon-picker';
    document.querySelector(target)?.focus();
    return;
  }
  if (!editor?.classList.contains('visible')) return;
  setIconPickerOpen(false);
  selectedKey = null;
  render();
});

window.applyToolbarSettings = applySettings;

try {
  applySettings(window.ToolbarSettings?.getBottomToolbarSettings?.() || {});
} catch (error) {
  setStatus('Toolbar preview could not load the saved settings.');
  applySettings({});
}
