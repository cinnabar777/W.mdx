import {
  BOTTOM_TOOLBAR_ITEM_IDS,
  BOTTOM_TOOLBAR_ITEMS,
  DEFAULT_BOTTOM_TOOLBAR_CONFIG,
  normalizeBottomToolbarConfig
} from './toolbarConfig.js';
import { svgIcons } from './toolbarIcons.js';
import { renderBottomToolbarKeys, toToolbarCssColor } from './toolbarRenderer.js';

const toolbar = document.querySelector('#toolbar-preview');
const tray = document.querySelector('#toolbar-holding-tray');
const editor = document.querySelector('#toolbar-preview-editor');
const status = document.querySelector('#toolbar-preview-status');
const selectedTitle = document.querySelector('#toolbar-preview-selected-title');
let config = normalizeBottomToolbarConfig(null);
let selectedKey = null;
let dragState = null;
let dragTimer = null;
let previousTap = { id: null, time: 0 };

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

  for (const button of document.querySelectorAll('.toolbar-preview-key')) {
    button.classList.toggle('is-selected', button.dataset.toolbarKey === selectedKey);
    button.addEventListener('pointerdown', event => beginPossibleDrag(event, button), {
      passive: false
    });
  }
  refreshSelectedKeyEditor();
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
  setCssVariable('--toolbar-active-icon-color', prefs.pref_toolbar_active_icon_color, '#00e5ff');
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
  const isHiddenKey = config.hidden.includes(id);
  const now = Date.now();
  if (isHiddenKey && previousTap.id === id && now - previousTap.time <= 400) {
    previousTap = { id: null, time: 0 };
    window.ToolbarSettings?.editBottomToolbarIcon?.(id);
    return;
  }
  previousTap = { id, time: now };
  selectedKey = id;
  render();
}

function refreshSelectedKeyEditor() {
  if (!editor) return;
  const definition = BOTTOM_TOOLBAR_ITEMS.find(item => item.id === selectedKey);
  editor.classList.toggle('visible', Boolean(definition));
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
document.querySelector('#toolbar-reset-key-style')?.addEventListener('click', () => {
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
  render();
  saveConfig();
});

window.applyToolbarSettings = applySettings;

try {
  applySettings(window.ToolbarSettings?.getBottomToolbarSettings?.() || {});
} catch (error) {
  setStatus('Toolbar preview could not load the saved settings.');
  applySettings({});
}
