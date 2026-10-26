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
  version: 3,
  order: BOTTOM_TOOLBAR_ITEM_IDS,
  hidden: [],
  popupGroups: createDefaultPopupGroups(),
  holding: [],
  customGroups: {},
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
  const groupConfig = popupGroups?.[groupId] || {};
  const hidden = new Set(
    Array.isArray(groupConfig.hidden)
      ? groupConfig.hidden
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
    : items.map(item => item.id || item.command);
  for (const id of configuredOrder) {
    const item = byId.get(id);
    if (item && !hidden.has(id) && !ordered.includes(item)) ordered.push(item);
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
      holding: [],
      customGroups: {},
      styles: {}
    };
  }

  const customGroups = {};
  if (parsed.customGroups && typeof parsed.customGroups === 'object' &&
      !Array.isArray(parsed.customGroups)) {
    for (const [id, rawGroup] of Object.entries(parsed.customGroups)) {
      if (!/^custom-group-[a-z0-9-]{1,48}$/i.test(id) ||
          !rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) continue;
      const title = typeof rawGroup.title === 'string'
        ? rawGroup.title.trim().slice(0, 48)
        : '';
      if (!title) continue;
      const icon = typeof rawGroup.icon === 'string' &&
        /^[a-z0-9_-]{1,48}$/i.test(rawGroup.icon)
        ? rawGroup.icon
        : 'folder';
      customGroups[id] = { title, icon };
    }
  }

  const rootIds = [...BOTTOM_TOOLBAR_ITEM_IDS, ...Object.keys(customGroups)];
  const groupIds = new Set([
    ...Object.keys(BOTTOM_TOOLBAR_GROUP_ITEM_IDS),
    ...Object.keys(customGroups)
  ]);
  const keyIds = new Set([...rootIds, ...BOTTOM_TOOLBAR_POPUP_ITEM_IDS]);
  const legacyHidden = normalizeUniqueIds(parsed.hidden, keyIds);
  let order = normalizeUniqueIds(parsed.order, keyIds)
    .filter(id => !legacyHidden.includes(id));
  const popupGroups = {};
  for (const id of new Set([
    ...Object.keys(BOTTOM_TOOLBAR_GROUP_ITEM_IDS),
    ...Object.keys(customGroups)
  ])) {
    popupGroups[id] = { order: [], hidden: [] };
  }

  const rawPopupGroups = parsed.popupGroups && typeof parsed.popupGroups === 'object' &&
    !Array.isArray(parsed.popupGroups)
    ? parsed.popupGroups
    : {};
  const legacyHeldKeys = [];
  for (const groupId of Object.keys(popupGroups)) {
    const rawGroup = rawPopupGroups[groupId];
    if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) {
      if (groupId in BOTTOM_TOOLBAR_GROUP_ITEM_IDS) {
        popupGroups[groupId].order = [...BOTTOM_TOOLBAR_GROUP_ITEM_IDS[groupId]];
      }
      continue;
    }
    const groupOrder = [];
    if (Array.isArray(rawGroup.order)) {
      for (const id of rawGroup.order) {
        if (keyIds.has(id) && id !== groupId &&
            !Object.values(popupGroups).some(group => group.order.includes(id)) &&
            !groupOrder.includes(id)) {
          groupOrder.push(id);
        }
      }
    }
    if (Array.isArray(rawGroup.hidden)) {
      for (const id of rawGroup.hidden) {
        if (keyIds.has(id) && !legacyHeldKeys.includes(id)) {
          legacyHeldKeys.push(id);
        }
      }
    }
    popupGroups[groupId] = { order: groupOrder, hidden: [] };
  }

  // A folder may contain another folder, but never itself or an ancestor.
  // Remove only the edge that would close a cycle; all other keys stay saved.
  const acceptedChildren = new Map();
  for (const groupId of Object.keys(popupGroups)) {
    const accepted = [];
    for (const childId of popupGroups[groupId].order) {
      if (groupIds.has(childId) &&
          hasGroupPath(acceptedChildren, childId, groupId)) {
        continue;
      }
      accepted.push(childId);
      if (groupIds.has(childId)) {
        const children = acceptedChildren.get(groupId) || [];
        children.push(childId);
        acceptedChildren.set(groupId, children);
      }
    }
    popupGroups[groupId].order = accepted;
  }
  const assignedKeys = new Set(
    Object.values(popupGroups).flatMap(group => group.order)
  );

  let holding = normalizeUniqueIds(parsed.holding, keyIds);
  for (const id of legacyHidden) {
    if (!holding.includes(id)) holding.push(id);
  }
  for (const id of legacyHeldKeys) {
    if (!holding.includes(id)) holding.push(id);
  }
  holding = holding.filter(id => !assignedKeys.has(id));

  // A hidden folder is still a key in the shared tray. Its direct members are
  // released there too, while nested folders retain their own contents.
  for (const groupId of groupIds) {
    if (Number(parsed.version) >= 3 || !legacyHidden.includes(groupId)) continue;
    const members = popupGroups[groupId]?.order || [];
    for (const id of members) {
      if (!holding.includes(id)) holding.push(id);
      assignedKeys.delete(id);
    }
    popupGroups[groupId].order = [];
  }

  order = order.filter(id => {
    return !holding.includes(id) && !assignedKeys.has(id);
  });
  for (const id of rootIds) {
    if (order.includes(id) || holding.includes(id) || assignedKeys.has(id)) continue;
    if (groupIds.has(id) && popupGroups[id]?.order.length === 0) {
      holding.push(id);
    } else {
      order.push(id);
    }
  }
  for (const id of BOTTOM_TOOLBAR_POPUP_ITEM_IDS) {
    if (!order.includes(id) && !assignedKeys.has(id) && !holding.includes(id)) {
      holding.push(id);
    }
  }
  order = order.filter(id => !holding.includes(id) && !assignedKeys.has(id));
  if (order.length === 0) {
    for (const group of Object.values(popupGroups)) {
      group.order = group.order.filter(id => id !== 'menu');
    }
    assignedKeys.delete('menu');
    holding = holding.filter(id => id !== 'menu');
    order.push('menu');
  }
  const hidden = holding.filter(id => rootIds.includes(id));

  const styles = {};
  if (parsed.styles && typeof parsed.styles === 'object' && !Array.isArray(parsed.styles)) {
    const allowedStyleIds = new Set([
      ...BOTTOM_TOOLBAR_STYLE_IDS,
      ...Object.keys(customGroups)
    ]);
    for (const [id, style] of Object.entries(parsed.styles)) {
      if (!allowedStyleIds.has(id)) continue;
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

  return { version: 3, order, hidden, popupGroups, holding, customGroups, styles };
}

function hasGroupPath(groupChildren, start, target, visited = new Set()) {
  if (start === target) return true;
  if (visited.has(start)) return false;
  visited.add(start);
  for (const child of groupChildren.get(start) || []) {
    if (hasGroupPath(groupChildren, child, target, visited)) return true;
  }
  return false;
}

function normalizeUniqueIds(rawIds, allowedIds) {
  if (!Array.isArray(rawIds)) return [];
  const result = [];
  for (const id of rawIds) {
    if (typeof id === 'string' && allowedIds.has(id) && !result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

function isSafeCssColor(value) {
  const color = value.trim();
  return color.length <= 64 && (
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(color) ||
    /^[a-z]{1,20}$/i.test(color)
  );
}
