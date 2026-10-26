import {
  BOTTOM_TOOLBAR_ITEM_IDS,
  BOTTOM_TOOLBAR_ITEMS,
  DEFAULT_BOTTOM_TOOLBAR_CONFIG,
  normalizeBottomToolbarConfig
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

function render() {
  if (!toolbar || !tray) return;
  renderBottomToolbarKeys(toolbar, config, svgIcons, {
    buttonClass: 'grouped-key-btn toolbar-preview-key',
    resolveCustomIcon: style => style.customSvg || '',
    onKeyClick: onToolbarKeyClick
  });
  for (const button of toolbar.querySelectorAll('.toolbar-preview-key')) {
    const id = button.dataset.toolbarKey;
    button.classList.toggle(
      'active',
      id === selectedKey || id === openPopupGroup
    );
  }

  if (config.hidden.length) {
    const trayConfig = {
      version: 1,
      order: [...config.hidden],
      hidden: BOTTOM_TOOLBAR_ITEM_IDS.filter(id => !config.hidden.includes(id)),
      styles: config.styles
    };
    renderBottomToolbarKeys(tray, trayConfig, svgIcons, {
      buttonClass: 'grouped-key-btn toolbar-preview-key',
      resolveCustomIcon: style => style.customSvg || '',
      onKeyClick: onToolbarKeyClick
    });
  } else {
    // An empty holding area is valid. Passing an empty order through the normal
    // toolbar normalizer would restore the Menu key and show it twice.
    tray.replaceChildren();
  }

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
  if (iconPickerOpen) renderIconCatalog();
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
  if (isHiddenKey && previousTap.id === id && now - previousTap.time <= 400) {
    previousTap = { id: null, time: 0 };
    window.ToolbarSettings?.editBottomToolbarIcon?.(id);
    return;
  }
  previousTap = { id, time: now };
  selectedKey = id;
  iconPickerOpen = false;
  openPopupGroup = isHiddenKey
    ? null
    : PREVIEW_GROUP_ITEMS[id]
      ? (openPopupGroup === id ? null : id)
      : null;
  selectedPopupItem = null;
  setStatus(isHiddenKey
    ? 'Holding-area keys open their settings; drag one back to restore it.'
    : '');
  render();
}

function renderPopupGroup() {
  if (!popup) return;
  popup.replaceChildren();
  const items = openPopupGroup ? PREVIEW_GROUP_ITEMS[openPopupGroup] : null;
  if (!items?.length) {
    popup.classList.add('hidden');
    return;
  }

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'popup-strip-btn toolbar-preview-popup-key';
    button.title = item.title;
    button.setAttribute('aria-label', item.title);
    button.setAttribute('aria-current', item.id === selectedPopupItem ? 'true' : 'false');
    button.classList.toggle('active', item.id === selectedPopupItem);
    button.dataset.previewPopupItem = item.id;
    const style = config.styles[item.id] || {};
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
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      selectedPopupItem = item.id;
      selectedKey = item.id;
      setStatus('');
      render();
    });
    popup.appendChild(button);
  }
  popup.classList.remove('hidden');
}

function refreshSelectedKeyEditor() {
  if (!editor) return;
  const definition = PREVIEW_ITEM_DEFINITIONS.get(selectedKey);
  if (selectedKey !== editorKeyCache) {
    document.querySelector('#toolbar-icon-search').value = '';
    editorKeyCache = selectedKey;
  }
  document.querySelector('#toolbar-add-custom').disabled = !definition;
  editor.classList.toggle('visible', Boolean(definition));
  editor.classList.toggle('above-group', Boolean(definition && openPopupGroup));
  editor.classList.toggle('icon-picker-open', Boolean(definition && iconPickerOpen));
  editor.setAttribute('aria-hidden', String(!definition));
  document.querySelector('#toolbar-icon-picker-back').hidden = !iconPickerOpen;
  if (!definition) return;
  selectedTitle.textContent = iconPickerOpen ? 'Choose icon' : definition.title;

  const style = config.styles[selectedKey] || {};
  const currentIcon = document.querySelector('#toolbar-current-icon');
  const iconMarkup = style.customSvg ||
    (typeof definition.icon === 'string' && svgIcons[definition.icon]
      ? svgIcons[definition.icon]
      : typeof definition.icon === 'string' && definition.icon.includes('<svg')
        ? definition.icon
        : '');
  currentIcon.style.color = style.iconColor
    ? toToolbarCssColor(style.iconColor)
    : 'var(--toolbar-icon-color)';
  if (iconMarkup) {
    currentIcon.innerHTML = sanitizeToolbarSvg(
      iconMarkup,
      style.preserveSvgColors === true,
      document
    );
  } else {
    currentIcon.textContent = definition.icon || '';
  }
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
  const hasAnyColor = ['iconColor', 'backgroundColor', 'activeBackgroundColor']
    .some(property => Boolean(style[property]));
  document.querySelector('#toolbar-reset-key-colors').disabled = !hasAnyColor;
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
  const id = button.dataset.toolbarKey;
  const source = tray.contains(button) ? 'hidden' : 'visible';
  const startX = event.clientX;
  const startY = event.clientY;
  clearTimeout(dragTimer);
  dragTimer = setTimeout(() => {
    dragState = { id, source, target: null, startX, startY, started: false };
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
    document.querySelector(
      `.toolbar-preview-key[data-toolbar-key="${CSS.escape(dragState.id)}"]`
    )?.classList.add('is-dragging');
    setStatus('Drag to another position or to the holding tray.');
  }
  event.preventDefault();
  document.querySelectorAll('.drop-target').forEach(element => {
    element.classList.remove('drop-target');
  });
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const keyButton = target?.closest?.('.toolbar-preview-key');
  if (keyButton?.dataset.toolbarKey !== dragState.id) {
    dragState.target = keyButton
      ? { type: tray.contains(keyButton) ? 'hidden-key' : 'visible-key', id: keyButton.dataset.toolbarKey }
      : null;
    keyButton?.classList.add('drop-target');
  } else if (tray.contains(target)) {
    dragState.target = { type: 'tray' };
    tray.classList.add('drop-target');
  } else {
    const stage = target?.closest?.('.toolbar-preview-stage');
    if (stage) dragState.target = { type: 'stage' };
    else if (tray === target || tray.contains(target)) {
      dragState.target = { type: 'tray' };
      tray.classList.add('drop-target');
    } else {
      dragState.target = null;
    }
  }
}

function onDocumentPointerUp(event) {
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointercancel', cancelDrag);
  document.querySelectorAll('.drop-target, .is-dragging').forEach(element => {
    element.classList.remove('drop-target', 'is-dragging');
  });
  if (!dragState?.started) {
    dragState = null;
    return;
  }
  if (!dragState.target) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const keyButton = target?.closest?.('.toolbar-preview-key');
    if (keyButton && keyButton.dataset.toolbarKey !== dragState.id) {
      dragState.target = {
        type: tray.contains(keyButton) ? 'hidden-key' : 'visible-key',
        id: keyButton.dataset.toolbarKey
      };
    } else if (target?.closest?.('.toolbar-preview-stage')) {
      dragState.target = { type: 'stage' };
    } else if (tray === target || tray.contains(target)) {
      dragState.target = { type: 'tray' };
    }
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

function applyDrop({ id, source, target }) {
  const wasVisible = source === 'visible';
  config.order = config.order.filter(item => item !== id);
  config.hidden = config.hidden.filter(item => item !== id);

  if (!target) {
    if (wasVisible) config.order.push(id);
    else config.hidden.push(id);
    return;
  }
  if (target.type === 'tray') {
    config.hidden.push(id);
    return;
  }

  if (target.type === 'visible-key') {
    const beforeIndex = config.order.indexOf(target.id);
    const targetButton = document.querySelector(
      `.toolbar-preview-key[data-toolbar-key="${CSS.escape(target.id)}"]`
    );
    const dropAfter = targetButton &&
      eventDropAfter(targetButton, dragState.lastClientX);
    const insertAt = beforeIndex < 0
      ? config.order.length
      : beforeIndex + (dropAfter ? 1 : 0);
    config.order.splice(insertAt, 0, id);
    return;
  }

  if (target.type === 'hidden-key') {
    if (wasVisible) {
      config.hidden.push(id);
    } else {
      const beforeIndex = config.hidden.indexOf(target.id);
      const targetButton = document.querySelector(
        `.toolbar-preview-key[data-toolbar-key="${CSS.escape(target.id)}"]`
      );
      const dropAfter = targetButton &&
        eventDropAfter(targetButton, dragState.lastClientX);
      const insertAt = beforeIndex < 0
        ? config.hidden.length
        : beforeIndex + (dropAfter ? 1 : 0);
      config.hidden.splice(insertAt, 0, id);
    }
    return;
  }

  config.order.push(id);
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
document.querySelector('#toolbar-open-icon-picker')?.addEventListener('click', () => {
  iconPickerOpen = true;
  document.querySelector('#toolbar-icon-search').value = '';
  render();
  renderIconCatalog();
});
document.querySelector('#toolbar-icon-picker-back')?.addEventListener('click', () => {
  iconPickerOpen = false;
  render();
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
document.querySelector('#toolbar-reset-key-colors')?.addEventListener('click', () => {
  if (!selectedKey) return;
  const style = config.styles[selectedKey];
  if (style) {
    delete style.iconColor;
    delete style.backgroundColor;
    delete style.activeBackgroundColor;
    if (Object.keys(style).length === 0) delete config.styles[selectedKey];
  }
  render();
  saveConfig();
});
document.querySelector('#toolbar-reset-key-style')?.addEventListener('click', () => {
  if (!selectedKey) return;
  delete config.styles[selectedKey];
  render();
  saveConfig();
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
  config = {
    version: DEFAULT_BOTTOM_TOOLBAR_CONFIG.version,
    order: [...DEFAULT_BOTTOM_TOOLBAR_CONFIG.order],
    hidden: [],
    styles: {}
  };
  selectedKey = null;
  iconPickerOpen = false;
  openPopupGroup = null;
  selectedPopupItem = null;
  render();
  saveConfig();
});

document.querySelector('#toolbar-preview-close-editor')?.addEventListener('click', () => {
  selectedKey = null;
  iconPickerOpen = false;
  render();
});

document.addEventListener('click', event => {
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
  iconPickerOpen = false;
  render();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !editor?.classList.contains('visible')) return;
  selectedKey = null;
  iconPickerOpen = false;
  render();
});

window.applyToolbarSettings = applySettings;

try {
  applySettings(window.ToolbarSettings?.getBottomToolbarSettings?.() || {});
} catch (error) {
  setStatus('Toolbar preview could not load the saved settings.');
  applySettings({});
}
