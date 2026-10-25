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

export const DEFAULT_BOTTOM_TOOLBAR_CONFIG = Object.freeze({
  version: 1,
  order: BOTTOM_TOOLBAR_ITEM_IDS,
  hidden: [],
  styles: {}
});

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

  const styles = {};
  if (parsed.styles && typeof parsed.styles === 'object' && !Array.isArray(parsed.styles)) {
    for (const id of BOTTOM_TOOLBAR_ITEM_IDS) {
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

  return { version: 1, order, hidden, styles };
}

function isSafeCssColor(value) {
  const color = value.trim();
  return color.length <= 64 && (
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ||
    /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(color) ||
    /^[a-z]{1,20}$/i.test(color)
  );
}
