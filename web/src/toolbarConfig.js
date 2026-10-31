import { TABLE_ACTIONS } from './tableActions.js';
import { BUILT_IN_GESTURE_ACTION_IDS, TOOLBAR_GESTURE_IDS } from './toolbarGestures.js';

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
    'autoHeading',
    'wrap', 'line-numbers'
  ]),
  lists: Object.freeze([
    'bulletedList', 'numberedList', 'todoList', 'indent', 'outdent'
  ]),
  format: Object.freeze([
    'bold', 'italic', 'strikethrough',
    'underline', 'underlineSolid', 'underlineDotted', 'underlineDashed',
    'underlineDouble', 'underlineWavy',
    'highlightCycle', 'highlightYellow', 'highlightGreen', 'highlightPink', 'highlightBlue',
    'penCycle', 'penRed', 'penGreen', 'penBlue', 'penPurple'
  ]),
  table: Object.freeze(['insertTable', ...TABLE_ACTIONS.map(item => item.id)]),
  insert: Object.freeze([
    'image', 'audio', 'video', 'link', 'callout', 'inlineCode', 'blockQuote', 'codeBlock',
    'horizontalLine', 'footnote'
  ]),
  menu: Object.freeze([
    'newFile', 'openFile', 'saveFile', 'saveAsFile', 'saveTabs', 'saveAsTextPack',
    'exportHtml', 'search', 'switchView', 'newWindow', 'settings'
  ])
});

export const BOTTOM_TOOLBAR_POPUP_ITEM_IDS = Object.freeze(
  Object.values(BOTTOM_TOOLBAR_GROUP_ITEM_IDS).flat()
);

// The floating show/hide control has editable gestures but is not a
// replaceable key in the toolbar layout.
export const TOOLBAR_TOGGLE_STYLE_ID = 'toolbarToggleControl';
export const NO_GESTURE_ICON = 'none';

export const BUILT_IN_HOLDING_ITEMS = Object.freeze([
  { id: 'cut', title: 'Cut', icon: 'cut', kind: 'action' },
  { id: 'copy', title: 'Copy', icon: 'copy', kind: 'action' },
  { id: 'paste', title: 'Paste', icon: 'paste', kind: 'action' },
  { id: 'selectAll', title: 'Select All', icon: 'selectAll', kind: 'action' }
]);

export const BUILT_IN_HOLDING_ITEM_IDS = Object.freeze(
  BUILT_IN_HOLDING_ITEMS.map(item => item.id)
);

export const OPEN_GROUP_ACTION_ID = 'openGroup';
const LEGACY_OPEN_GROUP_ACTION_PREFIX = 'openToolbarGroup:';

function normalizeToolbarActionId(actionId, allowOpenGroup = false) {
  if (typeof actionId !== 'string') return '';
  if (actionId === OPEN_GROUP_ACTION_ID ||
      actionId.startsWith(LEGACY_OPEN_GROUP_ACTION_PREFIX)) {
    return allowOpenGroup ? OPEN_GROUP_ACTION_ID : '';
  }
  return actionId;
}

export const BOTTOM_TOOLBAR_STYLE_IDS = Object.freeze([
  ...BOTTOM_TOOLBAR_ITEM_IDS,
  ...BOTTOM_TOOLBAR_POPUP_ITEM_IDS,
  ...BUILT_IN_HOLDING_ITEM_IDS
]);

export const DEFAULT_BOTTOM_TOOLBAR_CONFIG = Object.freeze({
  version: 6,
  order: BOTTOM_TOOLBAR_ITEM_IDS,
  hidden: [],
  popupGroups: createDefaultPopupGroups(),
  holding: BUILT_IN_HOLDING_ITEM_IDS,
  customGroups: {},
  customKeys: {},
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

const LEGACY_COLOR_ACTION_IDS = Object.freeze({
  yellowMarker: 'highlightYellow',
  greenMarker: 'highlightGreen',
  pinkMarker: 'highlightPink',
  blueMarker: 'highlightBlue',
  redPen: 'penRed',
  greenPen: 'penGreen'
});

function migrateToolbarActionId(id, version) {
  return version > 0 && version < DEFAULT_BOTTOM_TOOLBAR_CONFIG.version
    ? (LEGACY_COLOR_ACTION_IDS[id] || id)
    : id;
}

function migrateToolbarActionIds(ids, version) {
  return Array.isArray(ids)
    ? ids.map(id => migrateToolbarActionId(id, version))
    : ids;
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
      holding: [...BUILT_IN_HOLDING_ITEM_IDS],
      customGroups: {},
      customKeys: {},
      styles: {}
    };
  }
  const parsedVersion = Number.isFinite(Number(parsed.version))
    ? Number(parsed.version)
    : 0;

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

  const customKeys = {};
  const customKeyActions = {};
  if (parsed.customKeys && typeof parsed.customKeys === 'object' &&
      !Array.isArray(parsed.customKeys)) {
    for (const [id, rawKey] of Object.entries(parsed.customKeys)) {
      if (!/^custom-key-[a-z0-9-]{1,48}$/i.test(id) ||
          !rawKey || typeof rawKey !== 'object' || Array.isArray(rawKey)) continue;
      const title = typeof rawKey.title === 'string'
        ? rawKey.title.trim().slice(0, 48)
        : '';
      if (!title) continue;
      const icon = typeof rawKey.icon === 'string' &&
        /^[a-z0-9_-]{1,48}$/i.test(rawKey.icon)
        ? rawKey.icon
        : 'newFile';
      customKeys[id] = { title, icon };
      if (typeof rawKey.actionId === 'string') {
        customKeyActions[id] = normalizeToolbarActionId(
          migrateToolbarActionId(rawKey.actionId, parsedVersion)
        );
      }
    }
  }

  const rootIds = [
    ...BOTTOM_TOOLBAR_ITEM_IDS,
    ...BUILT_IN_HOLDING_ITEM_IDS,
    ...Object.keys(customGroups),
    ...Object.keys(customKeys)
  ];
  const groupIds = new Set([
    ...Object.keys(BOTTOM_TOOLBAR_GROUP_ITEM_IDS),
    ...Object.keys(customGroups)
  ]);
  const keyIds = new Set([...rootIds, ...BOTTOM_TOOLBAR_POPUP_ITEM_IDS]);
  const gestureActionIds = new Set([
    ...keyIds,
    ...BUILT_IN_GESTURE_ACTION_IDS
  ]);
  for (const [id, actionId] of Object.entries(customKeyActions)) {
    if (actionId !== id && gestureActionIds.has(actionId)) {
      customKeys[id].actionId = actionId;
    }
  }
  const legacyHidden = normalizeUniqueIds(
    migrateToolbarActionIds(parsed.hidden, parsedVersion),
    keyIds
  );
  let order = normalizeUniqueIds(
    migrateToolbarActionIds(parsed.order, parsedVersion),
    keyIds
  )
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
      for (const rawId of rawGroup.order) {
        const id = migrateToolbarActionId(rawId, parsedVersion);
        if (keyIds.has(id) && id !== groupId &&
            !Object.values(popupGroups).some(group => group.order.includes(id)) &&
            !groupOrder.includes(id)) {
          groupOrder.push(id);
        }
      }
    }
    if (Array.isArray(rawGroup.hidden)) {
      for (const rawId of rawGroup.hidden) {
        const id = migrateToolbarActionId(rawId, parsedVersion);
        if (keyIds.has(id) && !legacyHeldKeys.includes(id)) {
          legacyHeldKeys.push(id);
        }
      }
    }
    popupGroups[groupId] = { order: groupOrder, hidden: [] };
  }

  if (
    parsedVersion > 0 &&
    parsedVersion < DEFAULT_BOTTOM_TOOLBAR_CONFIG.version &&
    Array.isArray(rawPopupGroups.format?.order)
  ) {
    const formatOrder = popupGroups.format.order;
    const assignedActions = new Set(Object.values(popupGroups).flatMap(group => group.order));
    for (const id of ['highlightCycle', 'penCycle', 'penBlue', 'penPurple']) {
      if (!assignedActions.has(id) && !legacyHeldKeys.includes(id) && !legacyHidden.includes(id)) {
        formatOrder.push(id);
        assignedActions.add(id);
      }
    }
  }

  if (
    parsedVersion > 0 &&
    parsedVersion < DEFAULT_BOTTOM_TOOLBAR_CONFIG.version &&
    Array.isArray(rawPopupGroups.heading?.order) &&
    popupGroups.heading.order.length > 0
  ) {
    const assignedActions = new Set(Object.values(popupGroups).flatMap(group => group.order));
    if (
      !assignedActions.has('autoHeading') &&
      !legacyHeldKeys.includes('autoHeading') &&
      !legacyHidden.includes('autoHeading')
    ) {
      popupGroups.heading.order.push('autoHeading');
    }
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

  let holding = normalizeUniqueIds(
    migrateToolbarActionIds(parsed.holding, parsedVersion),
    keyIds
  );
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
    if (BUILT_IN_HOLDING_ITEM_IDS.includes(id)) {
      holding.push(id);
    } else if (groupIds.has(id) && popupGroups[id]?.order.length === 0) {
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
      TOOLBAR_TOGGLE_STYLE_ID,
      ...Object.keys(customGroups),
      ...Object.keys(customKeys)
    ]);
    for (const [legacyId, style] of Object.entries(parsed.styles)) {
      const id = migrateToolbarActionId(legacyId, parsedVersion);
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
      if (typeof style.forceShowLabel === 'boolean') {
        normalized.forceShowLabel = style.forceShowLabel;
      }
      if (typeof style.title === 'string') {
        const title = style.title.trim().slice(0, 48);
        if (title) normalized.title = title;
      }
      const gestureActions = {};
      if (style.gestureActions && typeof style.gestureActions === 'object' &&
          !Array.isArray(style.gestureActions)) {
        for (const [gestureId, rawActionId] of Object.entries(style.gestureActions)) {
          const actionId = normalizeToolbarActionId(rawActionId, groupIds.has(id));
          if (TOOLBAR_GESTURE_IDS.includes(gestureId) &&
              typeof actionId === 'string' && gestureActionIds.has(actionId)) {
            gestureActions[gestureId] = actionId;
          }
        }
      }
      if (!gestureActions.swipeUp &&
          typeof style.gestureAction === 'string' &&
          gestureActionIds.has(
            normalizeToolbarActionId(style.gestureAction, groupIds.has(id))
          )) {
        gestureActions.swipeUp = normalizeToolbarActionId(
          style.gestureAction,
          groupIds.has(id)
        );
      }
      if (Object.keys(gestureActions).length) {
        normalized.gestureActions = gestureActions;
      }

      const gestureActionIcons = {};
      if (style.gestureActionIcons && typeof style.gestureActionIcons === 'object' &&
          !Array.isArray(style.gestureActionIcons)) {
        for (const [gestureId, svg] of Object.entries(style.gestureActionIcons)) {
          if (TOOLBAR_GESTURE_IDS.includes(gestureId) &&
              (svg === NO_GESTURE_ICON ||
                (typeof svg === 'string' && svg.length <= 65536)) &&
              gestureActions[gestureId]) {
            gestureActionIcons[gestureId] = svg;
          }
        }
      }
      if (!gestureActionIcons.swipeUp && gestureActions.swipeUp &&
          typeof style.gestureActionIconSvg === 'string' &&
          style.gestureActionIconSvg.length <= 65536) {
        gestureActionIcons.swipeUp = style.gestureActionIconSvg;
      }
      if (Object.keys(gestureActionIcons).length) {
        normalized.gestureActionIcons = gestureActionIcons;
      }
      if (Object.keys(normalized).length) styles[id] = normalized;
    }
  }

  return { version: 4, order, hidden, popupGroups, holding, customGroups, customKeys, styles };
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
