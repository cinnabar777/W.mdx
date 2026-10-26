import {
  BOTTOM_TOOLBAR_GROUP_ITEM_IDS,
  BOTTOM_TOOLBAR_ITEMS,
  BOTTOM_TOOLBAR_ITEM_IDS,
  normalizeBottomToolbarConfig,
  orderBottomToolbarPopupItems
} from './toolbarConfig.js';
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
const PREVIEW_ICON_TITLES = new Map();
for (const item of [
  ...BOTTOM_TOOLBAR_ITEMS,
  ...Object.values(PREVIEW_GROUP_ITEMS).flat()
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

function setIconPickerOpen(open, clearSearch = false) {
  iconPickerOpen = Boolean(open && selectedKey);
  const search = document.querySelector('#toolbar-icon-search');
  if (clearSearch && search) search.value = '';
  if (!iconPicker) return;
  iconPicker.hidden = !iconPickerOpen;
  iconPicker.setAttribute('aria-hidden', String(!iconPickerOpen));
  if (iconPickerOpen) renderIconCatalog();
}

function render() {
  if (!toolbar || !tray) return;
  const emptyGroupIds = getEmptyPopupGroupIds();
  const toolbarConfig = {
    ...config,
    order: config.order.filter(id => !emptyGroupIds.has(id)),
    hidden: [...new Set([...config.hidden, ...emptyGroupIds])]
  };
  renderBottomToolbarKeys(toolbar, toolbarConfig, svgIcons, {
    buttonClass: 'grouped-key-btn toolbar-preview-key',
    resolveCustomIcon: style => style.customSvg || '',
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

  const hasHeldPopupActions = Object.values(config.popupGroups)
    .some(group => group.hidden.length > 0);
  if (config.hidden.length || hasHeldPopupActions || emptyGroupIds.size > 0) {
    const heldToolbarKeys = [...new Set([...config.hidden, ...emptyGroupIds])];
    if (heldToolbarKeys.length === 0) {
      tray.replaceChildren();
    } else {
      const trayConfig = {
        version: 1,
        order: heldToolbarKeys,
        hidden: BOTTOM_TOOLBAR_ITEM_IDS.filter(
          id => !heldToolbarKeys.includes(id)
        ),
        popupGroups: config.popupGroups,
        styles: config.styles
      };
      renderBottomToolbarKeys(tray, trayConfig, svgIcons, {
        buttonClass: 'grouped-key-btn toolbar-preview-key',
        resolveCustomIcon: style => style.customSvg || '',
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
    if (PREVIEW_GROUP_ITEMS[button.dataset.toolbarKey]) {
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
  if (iconPicker) {
    iconPicker.hidden = !iconPickerOpen;
    iconPicker.setAttribute('aria-hidden', String(!iconPickerOpen));
  }
  renderPopupGroup();
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

  config = normalizeBottomToolbarConfig(prefs.pref_toolbar_bottom_config);
  releaseActionsFromHiddenFolders();
  const isLightTheme = prefs.pref_app_theme === 'light';
  document.body.classList.toggle('light-theme', isLightTheme);
  setCssVariable('--toolbar-bg', prefs.pref_toolbar_bg_color, isLightTheme ? '#f8f9fa' : '#121212');
  setCssVariable('--toolbar-icon-color', prefs.pref_toolbar_icon_color, isLightTheme ? '#111111' : '#ffffff');
  setCssVariable('--toolbar-preview-text', null, isLightTheme ? '#111111' : '#ffffff');
  setCssVariable('--toolbar-preview-surface', null, isLightTheme ? '#ffffff' : '#000000');
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
}

function onToolbarKeyClick(id) {
  window.ToolbarSettings?.collapseToolbarAppearance?.();
  const isHiddenKey = config.hidden.includes(id);
  const now = Date.now();
  if (
    isHiddenKey &&
    !PREVIEW_GROUP_ITEMS[id] &&
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
  openPopupGroup = PREVIEW_GROUP_ITEMS[id]
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
  const items = openPopupGroup
    ? orderBottomToolbarPopupItems(
      openPopupGroup,
      PREVIEW_GROUP_ITEMS[openPopupGroup] || [],
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

function releaseActionsFromHiddenFolders() {
  for (const [groupId, groupConfig] of Object.entries(config.popupGroups)) {
    if (!config.hidden.includes(groupId) || groupConfig.order.length === 0) continue;
    groupConfig.hidden = [...new Set([...groupConfig.order, ...groupConfig.hidden])];
    groupConfig.order = [];
  }
}

function createPreviewPopupKey(item, groupId, location, isIndividuallyHidden = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-strip-btn toolbar-preview-popup-key';
  button.title = item.title;
  button.setAttribute('aria-label', item.title);
  button.setAttribute('aria-current', item.id === selectedPopupItem ? 'true' : 'false');
  button.classList.toggle('active', item.id === selectedPopupItem);
  button.dataset.previewPopupItem = item.id;
  button.dataset.previewGroup = groupId;
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
  button.innerHTML = customIcon || item.icon || item.title;
  button.addEventListener('pointerdown', event => beginPossibleDrag(event, button), {
    passive: false
  });
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    selectedPopupItem = item.id;
    selectedKey = item.id;
    if (location === 'popup') openPopupGroup = groupId;
    else if (openPopupGroup !== groupId) openPopupGroup = null;
    setStatus('');
    render();
  });
  return button;
}

function renderHeldPopupKeys() {
  if (!tray) return;
  for (const [groupId, items] of Object.entries(PREVIEW_GROUP_ITEMS)) {
    const groupConfig = config.popupGroups[groupId];
    for (const actionId of groupConfig.hidden) {
      const item = items.find(candidate => candidate.id === actionId);
      if (item) tray.appendChild(createPreviewPopupKey(item, groupId, 'tray', true));
    }
  }
}

function refreshSelectedKeyEditor() {
  if (!editor) return;
  const definition = PREVIEW_ITEM_DEFINITIONS.get(selectedKey);
  if (selectedKey !== editorKeyCache) {
    const search = document.querySelector('#toolbar-icon-search');
    if (search) search.value = '';
    editorKeyCache = selectedKey;
  }
  document.querySelector('#toolbar-add-custom').disabled = !definition;
  editor.classList.toggle('visible', Boolean(definition));
  editor.classList.toggle('above-group', Boolean(definition && openPopupGroup));
  editor.setAttribute('aria-hidden', String(!definition));
  if (!definition) return;
  selectedTitle.textContent = definition.title;

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
  const selectedSvg = config.styles[selectedKey]?.customSvg;
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
      style.customSvg = markup;
      style.preserveSvgColors = false;
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

function beginPossibleDrag(event, button) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  const popupItemId = button.dataset.previewPopupItem;
  const groupId = button.dataset.previewGroup;
  const isPopupItem = Boolean(popupItemId && groupId);
  const id = isPopupItem ? popupItemId : button.dataset.toolbarKey;
  const isPopupItemHidden = isPopupItem &&
    config.popupGroups[groupId]?.hidden.includes(id);
  const source = isPopupItem
    ? button.dataset.previewLocation === 'popup'
      ? 'popup'
      : isPopupItemHidden
        ? 'popup-hidden'
        : 'popup-member'
    : tray.contains(button)
      ? 'hidden'
      : 'visible';
  const startX = event.clientX;
  const startY = event.clientY;
  clearTimeout(dragTimer);
  dragTimer = setTimeout(() => {
    dragState = { id, source, groupId, target: null, startX, startY, started: false };
    document.addEventListener('pointermove', onDocumentPointerMove, { passive: false });
    document.addEventListener('pointerup', onDocumentPointerUp, { once: true });
    document.addEventListener('pointercancel', cancelDrag, { once: true });
  }, 260);

  const cancelPendingHold = () => {
    clearTimeout(dragTimer);
    button.removeEventListener('pointerup', cancelPendingHold);
    button.removeEventListener('pointerleave', cancelPendingHold);
  };
  button.addEventListener('pointerup', cancelPendingHold, { once: true });
  button.addEventListener('pointerleave', cancelPendingHold, { once: true });
}

function onDocumentPointerMove(event) {
  if (!dragState) return;
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
  document.querySelectorAll('.drop-target').forEach(element => {
    element.classList.remove('drop-target');
  });
  dragState.target = resolveDragTarget(event.clientX, event.clientY);
  if (dragState.target?.button) dragState.target.button.classList.add('drop-target');
  if (dragState.target?.type === 'tray') tray.classList.add('drop-target');
}

function onDocumentPointerUp(event) {
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointercancel', cancelDrag);
  if (dragState) {
    dragState.lastClientX = event.clientX;
    dragState.lastClientY = event.clientY;
  }
  document.querySelectorAll('.drop-target, .is-dragging').forEach(element => {
    element.classList.remove('drop-target', 'is-dragging');
  });
  if (!dragState?.started) {
    dragState = null;
    return;
  }
  if (!dragState.target) {
    dragState.target = resolveDragTarget(event.clientX, event.clientY);
  }
  applyDrop(dragState);
  dragState = null;
  render();
  saveConfig();
}

function cancelDrag() {
  clearTimeout(dragTimer);
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.querySelectorAll('.drop-target, .is-dragging').forEach(element => {
    element.classList.remove('drop-target', 'is-dragging');
  });
  dragState = null;
  render();
}

function resolveDragTarget(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const popupButton = target?.closest?.('.toolbar-preview-popup-key');
  if (popupButton) {
    const sameKey =
      popupButton.dataset.previewPopupItem === dragState.id &&
      popupButton.dataset.previewGroup === dragState.groupId;
    if (sameKey) return null;
    if (!dragState.groupId || popupButton.dataset.previewGroup !== dragState.groupId) {
      return { type: 'ignored' };
    }
    return {
      type: 'popup-key',
      id: popupButton.dataset.previewPopupItem,
      groupId: popupButton.dataset.previewGroup,
      location: popupButton.dataset.previewLocation,
      hidden: popupButton.dataset.previewPopupHidden === 'true',
      button: popupButton
    };
  }

  const keyButton = target?.closest?.('.toolbar-preview-key');
  if (keyButton && keyButton.dataset.toolbarKey !== dragState.id) {
    if (dragState.groupId) {
      return {
        type: 'visible-key',
        id: keyButton.dataset.toolbarKey,
        button: keyButton
      };
    }
    return {
      type: tray.contains(keyButton) ? 'hidden-key' : 'visible-key',
      id: keyButton.dataset.toolbarKey,
      button: keyButton
    };
  }
  if (tray === target || tray.contains(target)) return { type: 'tray' };
  if (target?.closest?.('.toolbar-preview-stage')) return { type: 'stage' };
  return null;
}

function findToolbarKeyButton(id) {
  return [...document.querySelectorAll('.toolbar-preview-key')]
    .find(button => button.dataset.toolbarKey === id);
}

function findPopupKeyButton(groupId, id, location) {
  return [...document.querySelectorAll('.toolbar-preview-popup-key')]
    .find(button =>
      button.dataset.previewGroup === groupId &&
      button.dataset.previewPopupItem === id &&
      (!location || button.dataset.previewLocation === location)
    );
}

function applyDrop({ id, source, groupId, target, lastClientX }) {
  if (source.startsWith('popup')) {
    applyPopupDrop({ id, source, groupId, target, lastClientX });
    return;
  }
  if (target?.type === 'popup-key' || target?.type === 'ignored') return;
  const wasVisible = source === 'visible';
  config.order = config.order.filter(item => item !== id);
  config.hidden = config.hidden.filter(item => item !== id);

  if (!target) {
    if (wasVisible) config.order.push(id);
    else config.hidden.push(id);
    return;
  }
  if (target.type === 'tray') {
    hideToolbarKey(id);
    return;
  }

  if (target.type === 'visible-key') {
    const beforeIndex = config.order.indexOf(target.id);
    const targetButton = document.querySelector(
      `.toolbar-preview-key[data-toolbar-key="${CSS.escape(target.id)}"]`
    );
    const dropAfter = targetButton &&
      eventDropAfter(targetButton, lastClientX);
    const insertAt = beforeIndex < 0
      ? config.order.length
      : beforeIndex + (dropAfter ? 1 : 0);
    config.order.splice(insertAt, 0, id);
    return;
  }

  if (target.type === 'hidden-key') {
    if (wasVisible) {
      hideToolbarKey(id);
    } else {
      const beforeIndex = config.hidden.indexOf(target.id);
      const targetButton = document.querySelector(
        `.toolbar-preview-key[data-toolbar-key="${CSS.escape(target.id)}"]`
      );
      const dropAfter = targetButton &&
        eventDropAfter(targetButton, lastClientX);
      const insertAt = beforeIndex < 0
        ? config.hidden.length
        : beforeIndex + (dropAfter ? 1 : 0);
      config.hidden.splice(insertAt, 0, id);
    }
    return;
  }

  config.order.push(id);
}

function applyPopupDrop({ id, source, groupId, target, lastClientX }) {
  const groupConfig = config.popupGroups[groupId];
  if (!groupConfig) return;
  if (target?.type === 'ignored' || target?.type === 'hidden-key') return;
  if (target?.type === 'popup-key' && target.groupId !== groupId) return;

  const wasHidden = groupConfig.hidden.includes(id);
  const sourceList = wasHidden ? groupConfig.hidden : groupConfig.order;
  const originalIndex = sourceList.indexOf(id);
  const nextOrder = groupConfig.order.filter(item => item !== id);
  const nextHidden = groupConfig.hidden.filter(item => item !== id);

  if (target?.type === 'popup-key') {
    const targetList = target.location === 'tray' && target.hidden
      ? nextHidden
      : nextOrder;
    const targetIndex = targetList.indexOf(target.id);
    const targetButton = findPopupKeyButton(groupId, target.id, target.location);
    const dropAfter = targetButton && eventDropAfter(targetButton, lastClientX);
    const insertAt = targetIndex < 0
      ? targetList.length
      : targetIndex + (dropAfter ? 1 : 0);
    targetList.splice(insertAt, 0, id);
    groupConfig.order = nextOrder;
    groupConfig.hidden = nextHidden;
    return;
  }

  if (target?.type === 'tray') {
    nextHidden.push(id);
    groupConfig.order = nextOrder;
    groupConfig.hidden = nextHidden;
    if (nextOrder.length === 0) openPopupGroup = null;
    return;
  }

  if (target?.type === 'visible-key' || target?.type === 'stage') {
    if (wasHidden) {
      nextOrder.push(id);
      groupConfig.order = nextOrder;
      groupConfig.hidden = nextHidden;
      restorePopupGroupKey(groupId);
    }
    return;
  }

  // Dropping over empty space does not change a popup action's folder.
  const restoreList = wasHidden ? nextHidden : nextOrder;
  restoreList.splice(Math.max(0, originalIndex), 0, id);
  groupConfig.order = nextOrder;
  groupConfig.hidden = nextHidden;
}

function hideToolbarKey(id) {
  config.hidden.push(id);
  if (PREVIEW_GROUP_ITEMS[id]) releasePopupGroupToHoldingArea(id);
  if (openPopupGroup === id) openPopupGroup = null;
}

function releasePopupGroupToHoldingArea(groupId) {
  const groupConfig = config.popupGroups[groupId];
  if (!groupConfig) return;
  groupConfig.hidden = [...new Set([...groupConfig.order, ...groupConfig.hidden])];
  groupConfig.order = [];
}

function restorePopupGroupKey(groupId) {
  config.hidden = config.hidden.filter(id => id !== groupId);
  if (!config.order.includes(groupId)) config.order.push(groupId);
}

function eventDropAfter(targetButton, clientX) {
  if (!Number.isFinite(clientX)) return false;
  const bounds = targetButton.getBoundingClientRect();
  return clientX >= bounds.left + bounds.width / 2;
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
  setIconPickerOpen(true, true);
});
iconPicker?.addEventListener('click', event => {
  event.stopPropagation();
  if (event.target === iconPicker) setIconPickerOpen(false);
});
document.querySelector('#toolbar-icon-picker-close')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  setIconPickerOpen(false);
  document.querySelector('#toolbar-open-icon-picker')?.focus();
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
      bridge.editBottomToolbarIcon(JSON.stringify({ itemId: selectedKey, action }));
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
  if (!selectedKey) return;
  window.ToolbarSettings?.editBottomToolbarIcon?.(selectedKey);
});
document.querySelector('#toolbar-icon-search')?.addEventListener('input', renderIconCatalog);
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
  if (iconPickerOpen) return;
  if (!editor?.classList.contains('visible')) return;
  const target = event.target;
  if (
    editor.contains(target) ||
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
  if (iconPickerOpen) {
    event.preventDefault();
    setIconPickerOpen(false);
    document.querySelector('#toolbar-open-icon-picker')?.focus();
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
