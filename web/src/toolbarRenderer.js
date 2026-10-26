import { BOTTOM_TOOLBAR_ITEMS, normalizeBottomToolbarConfig } from './toolbarConfig.js';

export function toToolbarCssColor(value) {
  if (typeof value !== 'string') return value;
  const match = /^#([0-9a-f]{8})$/i.exec(value.trim());
  if (!match) return value;
  const [alpha, red, green, blue] = match[1].match(/.{2}/g).map(channel => parseInt(channel, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

export function sanitizeToolbarSvg(rawSvg, preserveColors = false, documentRef = globalThis.document) {
  if (typeof rawSvg !== 'string' || rawSvg.length > 65536 || !documentRef) return '';
  const Parser = documentRef.defaultView?.DOMParser || globalThis.DOMParser;
  if (!Parser) return '';

  const parsed = new Parser().parseFromString(rawSvg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (
    !root ||
    root.localName?.toLowerCase() !== 'svg' ||
    parsed.querySelector('parsererror')
  ) {
    return '';
  }

  const forbiddenElements = new Set([
    'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video',
    'image', 'animate', 'animatemotion', 'animatetransform', 'set', 'style'
  ]);
  for (const element of [...root.querySelectorAll('*')].reverse()) {
    if (forbiddenElements.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith('on') ||
        name === 'src' ||
        ((name === 'href' || name.endsWith(':href')) && value && !value.startsWith('#')) ||
        /(?:javascript:|data:|url\s*\(|expression\s*\()/i.test(value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const attribute of [...root.attributes]) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim();
    if (
      name.startsWith('on') ||
      name === 'src' ||
      ((name === 'href' || name.endsWith(':href')) && value && !value.startsWith('#')) ||
      /(?:javascript:|data:|url\s*\(|expression\s*\()/i.test(value)
    ) {
      root.removeAttribute(attribute.name);
    }
  }

  if (!preserveColors) {
    const elements = [root, ...root.querySelectorAll('*')];
    const styleValue = (element, property) => {
      const declaration = element
        .getAttribute('style')
        ?.split(';')
        .find(part => part.slice(0, part.indexOf(':')).trim().toLowerCase() === property);
      return declaration?.slice(declaration.indexOf(':') + 1)
        .trim()
        .replace(/\s*!important\s*$/i, '')
        .toLowerCase();
    };
    const hasExplicitFill = elements.some(element => {
      const fill = element.getAttribute('fill')?.trim().toLowerCase() || styleValue(element, 'fill');
      return Boolean(fill && fill !== 'none');
    });
    const hasVisibleStroke = elements.some(element => {
      const stroke = element.getAttribute('stroke')?.trim().toLowerCase() || styleValue(element, 'stroke');
      return Boolean(stroke && stroke !== 'none');
    });

    for (const element of elements) {
      for (const attributeName of ['fill', 'stroke', 'stop-color']) {
        const value = element.getAttribute(attributeName);
        if (value && value.toLowerCase() !== 'none') {
          element.setAttribute(attributeName, 'currentColor');
        }
      }
      const style = element.getAttribute('style');
      if (style) {
        const safeDeclarations = [];
        for (const declaration of style.split(';')) {
          const separator = declaration.indexOf(':');
          if (separator < 0) continue;
          const property = declaration.slice(0, separator).trim().toLowerCase();
          const value = declaration
            .slice(separator + 1)
            .trim()
            .replace(/\s*!important\s*$/i, '');
          if (property === 'color') continue;
          if (property === 'fill' || property === 'stroke' || property === 'stop-color') {
            element.setAttribute(
              property,
              value.toLowerCase() === 'none' ? 'none' : 'currentColor'
            );
            continue;
          }
          safeDeclarations.push(declaration);
        }
        if (safeDeclarations.length) element.setAttribute('style', safeDeclarations.join(';'));
        else element.removeAttribute('style');
      }
    }
    if (!root.hasAttribute('fill')) {
      root.setAttribute('fill', hasVisibleStroke && !hasExplicitFill ? 'none' : 'currentColor');
    }
  }

  const Serializer = documentRef.defaultView?.XMLSerializer || globalThis.XMLSerializer;
  return Serializer ? new Serializer().serializeToString(root) : '';
}

export function renderBottomToolbarKeys(container, rawConfig, icons, options = {}) {
  if (!container || !container.ownerDocument) return [];

  const config = normalizeBottomToolbarConfig(rawConfig);
  if (options.includeEmptyGroups && Array.isArray(rawConfig?.order)) {
    for (const id of rawConfig.order) {
      if (config.popupGroups[id]?.order.length === 0 && !config.order.includes(id)) {
        config.order.push(id);
      }
    }
    config.hidden = config.hidden.filter(id => !config.order.includes(id));
  }
  const definitions = new Map(BOTTOM_TOOLBAR_ITEMS.map(item => [item.id, item]));
  for (const [id, definition] of Object.entries(options.definitions || {})) {
    definitions.set(id, definition);
  }
  for (const [id, definition] of Object.entries(config.customGroups || {})) {
    definitions.set(id, {
      id,
      title: definition.title,
      icon: definition.icon,
      kind: 'group'
    });
  }
  const doc = container.ownerDocument;
  const buttons = [];

  container.replaceChildren();
  for (const id of config.order) {
    const definition = definitions.get(id);
    if (!definition) continue;

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = options.buttonClass || 'grouped-key-btn';
    button.id = `grp-btn-${id}`;
    button.dataset.toolbarKey = id;
    button.title = definition.title;
    button.setAttribute('aria-label', definition.title);
    button.setAttribute('data-toolbar-kind', definition.kind);

    const style = config.styles[id] || {};
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

    const customIcon = typeof options.resolveCustomIcon === 'function'
      ? options.resolveCustomIcon(style, id)
      : '';
    const iconMarkup = customIcon ||
      (typeof definition.icon === 'string' && definition.icon.includes('<svg')
        ? definition.icon
        : icons[definition.icon]) ||
      '';
    const sanitizedIcon = customIcon
      ? sanitizeToolbarSvg(iconMarkup, style.preserveSvgColors === true, doc)
      : iconMarkup;
    button.innerHTML = sanitizedIcon || (customIcon ? '' : iconMarkup);
    if (!sanitizedIcon && !customIcon && !iconMarkup && typeof definition.icon === 'string') {
      button.textContent = definition.icon;
    }
    if (typeof options.onKeyClick === 'function') {
      button.addEventListener('click', event => options.onKeyClick(id, event));
    }
    button.addEventListener('pointerdown', event => {
      // Keep the editor's text selection and IME focus when toolbar keys are
      // pressed. The subsequent click still runs the toolbar action.
      event.preventDefault();
    });
    container.appendChild(button);
    buttons.push(button);
  }

  return buttons;
}
