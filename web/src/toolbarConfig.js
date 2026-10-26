import { TABLE_ACTIONS } from './tableActions.js';

export const BOTTOM_TOOLBAR_ITEMS = Object.freeze([
  { id: 'undo', title: 'Undo (Hold: Redo)', icon: 'undo', kind: 'action' },
  { id: 'heading', title: 'Paragraph & Headings', icon: 'paragraph', kind: 'group' },
  { id: 'lists', title: 'Lists', icon: 'lists', kind: 'group' },
  { id: 'format', title: 'Format', icon: 'format', kind: 'group' },
  { id: 'table', title: 'Table', icon: 'insertTable', kind: 'group' },
  { id: 'insert', title: 'Insert', icon: 'insert', kind: 'group' },
  { id: 'menu', title: 'Menu', icon: 'menu', kind: 'group' }
]);

export const BOTTOM_TOOLBAR_ITEM_IDS = Object.freeze(
  BOTTOM_TOOLBAR_ITEMS.map(item => item.id)
);

export const BOTTOM_TOOLBAR_GROUP_ITEM_IDS = Object.freeze({
  heading: Object.freeze([
    'paragraph',
    'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
    'wrap', 'line-numbers'
  ]),
  lists: Object.freeze([
    'bulletedList', 'numberedList', 'todoList', 'indent', 'outdent'
  ]),
  format: Object.freeze([
    'bold', 'italic', 'strikethrough', 'underline',
    'yellowMarker', 'greenMarker', 'pinkMarker', 'blueMarker', 'redPen', 'greenPen'
  ]),
  table: Object.freeze(['insertTable', ...TABLE_ACTIONS.map(item => item.id)]),
  insert: Object.freeze([
    'image', 'link', 'callout', 'inlineCode', 'blockQuote', 'codeBlock',
    'horizontalLine', 'footnote'
  ]),
  menu: Object.freeze([
    'newFile', 'openFile', 'saveFile', 'saveAsFile', 'saveAsTextPack',
    'exportHtml', 'search', 'switchView', 'newWindow', 'settings'
  ])
});

export const BOTTOM_TOOLBAR_POPUP_ITEM_IDS = Object.freeze(
  Object.values(BOTTOM_TOOLBAR_GROUP_ITEM_IDS).flat()
);

export const BOTTOM_TOOLBAR_STYLE_IDS = Object.freeze([
  ...BOTTOM_TOOLBAR_ITEM_IDS,
  ...BOTTOM_TOOLBAR_POPUP_ITEM_IDS
]);

export const DEFAULT_BOTTOM_TOOLBAR_CONFIG = Object.freeze({
  version: 1,
  order: BOTTOM_TOOLBAR_ITEM_IDS,
  hidden: [],
  popupGroups: createDefaultPopupGroups(),
  styles: {}
});

function createDefaultPopupGroups() {
  return Object.fromEntries(
    Object.entries(BOTTOM_TOOLBAR_GROUP_ITEM_IDS).map(([groupId, itemIds]) => [
      groupId,
      { order: [...itemIds], hidden: [] }
    ])
  );
}

export function orderBottomToolbarPopupItems(groupId, items, popupGroups = {}) {
  const allowedIds = BOTTOM_TOOLBAR_GROUP_ITEM_IDS[groupId];
  if (!allowedIds) return [...items];
  const groupConfig = popupGroups?.[groupId] || {};
  const hidden = new Set(
    Array.isArray(groupConfig.hidden)
      ? groupConfig.hidden.filter(id => allowedIds.includes(id))
      : []
  );
  const byId = new Map();
  for (const item of items) {
    const id = item.id || item.command;
    if (id && !byId.has(id)) byId.set(id, item);
  }
  const ordered = [];
  const configuredOrder = Array.isArray(groupConfig.order)
    ? groupConfig.order
    : allowedIds;
  for (const id of configuredOrder) {
    const item = byId.get(id);
    if (item && !hidden.has(id) && !ordered.includes(item)) ordered.push(item);
  }
  for (const item of items) {
    const id = item.id || item.command;
    if (!hidden.has(id) && !ordered.includes(item)) ordered.push(item);
  }
  return ordered;
}

/**
 * Normalize the saved toolbar layout so a bad, old, or partial preference can
 * never make a built-in action disappear permanently.
 */
export function normalizeBottomToolbarConfig(rawConfig) {
  let parsed = rawConfig;
  if (typeof rawConfig === 'string') {
    try {
      parsed = JSON.parse(rawConfig);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      version: DEFAULT_BOTTOM_TOOLBAR_CONFIG.version,
      order: [...DEFAULT_BOTTOM_TOOLBAR_CONFIG.order],
      hidden: [],
      popupGroups: createDefaultPopupGroups(),
      styles: {}
    };
  }

  const allowed = new Set(BOTTOM_TOOLBAR_ITEM_IDS);
  const hidden = [];
  if (Array.isArray(parsed.hidden)) {
    for (const id of parsed.hidden) {
      if (allowed.has(id) && !hidden.includes(id)) hidden.push(id);
    }
  }

  const order = [];
  if (Array.isArray(parsed.order)) {
    for (const id of parsed.order) {
      if (allowed.has(id) && !hidden.includes(id) && !order.includes(id)) {
        order.push(id);
      }
    }
  }

  for (const id of BOTTOM_TOOLBAR_ITEM_IDS) {
    if (!order.includes(id) && !hidden.includes(id)) order.push(id);
  }
  if (order.length === 0) {
    hidden.splice(hidden.indexOf('menu'), hidden.includes('menu') ? 1 : 0);
    order.push('menu');
  }

  const popupGroups = createDefaultPopupGroups();
  if (parsed.popupGroups && typeof parsed.popupGroups === 'object' && !Array.isArray(parsed.popupGroups)) {
    for (const [groupId, allowedIds] of Object.entries(BOTTOM_TOOLBAR_GROUP_ITEM_IDS)) {
      const rawGroup = parsed.popupGroups[groupId];
      if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) continue;
      const groupHidden = [];
      if (Array.isArray(rawGroup.hidden)) {
        for (const id of rawGroup.hidden) {
          if (allowedIds.includes(id) && !groupHidden.includes(id)) groupHidden.push(id);
        }
      }
      const groupOrder = [];
      if (Array.isArray(rawGroup.order)) {
        for (const id of rawGroup.order) {
          if (allowedIds.includes(id) && !groupHidden.includes(id) && !groupOrder.includes(id)) {
            groupOrder.push(id);
          }
        }
      }
      for (const id of allowedIds) {
        if (!groupOrder.includes(id) && !groupHidden.includes(id)) groupOrder.push(id);
      }
      popupGroups[groupId] = { order: groupOrder, hidden: groupHidden };
    }
  }

  const styles = {};
  if (parsed.styles && typeof parsed.styles === 'object' && !Array.isArray(parsed.styles)) {
    for (const id of BOTTOM_TOOLBAR_STYLE_IDS) {
      const style = parsed.styles[id];
      if (!style || typeof style !== 'object' || Array.isArray(style)) continue;
      const normalized = {};
      for (const property of ['iconColor', 'backgroundColor', 'activeBackgroundColor']) {
        if (typeof style[property] === 'string' && isSafeCssColor(style[property])) {
          normalized[property] = style[property];
        }
      }
      if (typeof style.customSvg === 'string' && style.customSvg.length <= 65536) {
        normalized.customSvg = style.customSvg;
      }
      if (typeof style.preserveSvgColors === 'boolean') {
        normalized.preserveSvgColors = style.preserveSvgColors;
      }
      if (Object.keys(normalized).length) styles[id] = normalized;
    }
  }

  return { version: 1, order, hidden, popupGroups, styles };
}

function isSafeCssColor(value) {
  const color = value.trim();
  return color.length <= 64 && (
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(color) ||
    /^[a-z]{1,20}$/i.test(color)
  );
}
