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
    root.setAttribute('fill', 'currentColor');
    for (const element of [root, ...root.querySelectorAll('*')]) {
      for (const attributeName of ['fill', 'stroke', 'stop-color']) {
        const value = element.getAttribute(attributeName);
        if (value && value.toLowerCase() !== 'none') {
          element.setAttribute(attributeName, 'currentColor');
        }
      }
      const style = element.getAttribute('style');
      if (style) {
        const safeDeclarations = style
          .split(';')
          .filter(declaration => !/^\s*(?:fill|stroke|stop-color|color)\s*:/i.test(declaration))
          .join(';');
        if (safeDeclarations) element.setAttribute('style', safeDeclarations);
        else element.removeAttribute('style');
      }
    }
  }

  const Serializer = documentRef.defaultView?.XMLSerializer || globalThis.XMLSerializer;
  return Serializer ? new Serializer().serializeToString(root) : '';
}

export function renderBottomToolbarKeys(container, rawConfig, icons, options = {}) {
  if (!container || !container.ownerDocument) return [];

  const config = normalizeBottomToolbarConfig(rawConfig);
  const definitions = new Map(BOTTOM_TOOLBAR_ITEMS.map(item => [item.id, item]));
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
    const iconMarkup = customIcon || icons[definition.icon] || '';
    const sanitizedIcon = customIcon
      ? sanitizeToolbarSvg(iconMarkup, style.preserveSvgColors === true, doc)
      : iconMarkup;
    button.innerHTML = sanitizedIcon || (customIcon ? '' : iconMarkup);
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
