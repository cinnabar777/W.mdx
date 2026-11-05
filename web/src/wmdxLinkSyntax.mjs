import {
  formatWmdxResourceSyntax,
  getWmdxResourceFallbackTitle
} from './wmdxResources.js';

export const DEFAULT_LINK_SYNTAX_SETTINGS = Object.freeze({
  enabled: true,
  commonmark: true,
  reference: true,
  obsidian: true,
  wmdx: true,
  authoringSyntax: 'wmdx'
});

const AUTHORING_SYNTAXES = new Set(['wmdx', 'commonmark', 'obsidian']);

export function normalizeLinkSyntaxSettings(preferences = {}) {
  const authoringSyntax = String(
    preferences.pref_links_authoring_syntax ??
      DEFAULT_LINK_SYNTAX_SETTINGS.authoringSyntax
  ).toLowerCase();
  return {
    enabled: preferences.pref_links_enabled !== false,
    commonmark: preferences.pref_links_commonmark_enabled !== false,
    reference: preferences.pref_links_reference_enabled !== false,
    obsidian: preferences.pref_links_obsidian_enabled !== false,
    wmdx: preferences.pref_links_wmdx_enabled !== false,
    authoringSyntax: AUTHORING_SYNTAXES.has(authoringSyntax)
      ? authoringSyntax
      : DEFAULT_LINK_SYNTAX_SETTINGS.authoringSyntax
  };
}

export function isLinkFlavorEnabled(settings, flavor) {
  return Boolean(settings?.enabled !== false && settings?.[flavor] !== false);
}

function findLabelEnd(raw) {
  if (raw[0] !== '[') return -1;
  let depth = 1;
  for (let index = 1; index < raw.length; index += 1) {
    if (raw[index] === '\\') {
      index += 1;
      continue;
    }
    if (raw[index] === '[') depth += 1;
    else if (raw[index] === ']' && --depth === 0) return index;
  }
  return -1;
}

export function getMarkdownLinkFlavor(node, doc) {
  if (!node) return null;
  if (node.name === 'LinkReference') return 'reference';
  if (node.name === 'Autolink' || node.name === 'URL') return 'commonmark';
  if (node.name !== 'Link' || !doc) return null;

  const raw = doc.sliceString(node.from, node.to);
  const labelEnd = findLabelEnd(raw);
  if (labelEnd < 1) return null;
  return raw.slice(labelEnd + 1).trimStart().startsWith('(')
    ? 'commonmark'
    : 'reference';
}

export function linkActionAvailability(settings) {
  const enabled = settings?.enabled !== false;
  return {
    external: enabled &&
      (settings?.commonmark !== false || settings?.wmdx !== false),
    internal: enabled &&
      (settings?.commonmark !== false ||
        settings?.obsidian !== false ||
        settings?.wmdx !== false),
    reference: enabled && settings?.reference !== false
  };
}

function enabledAuthoringSyntax(settings, kind) {
  const preferred = settings?.authoringSyntax || 'wmdx';
  const available = linkActionAvailability(settings);

  if (kind === 'internal' && preferred === 'obsidian' && available.internal) {
    return settings?.obsidian !== false ? 'obsidian' : 'commonmark';
  }
  if (preferred === 'wmdx' && settings?.wmdx !== false) return 'wmdx';
  if (settings?.commonmark !== false) return 'commonmark';
  if (kind === 'internal' && settings?.obsidian !== false) return 'obsidian';
  if (settings?.wmdx !== false) return 'wmdx';
  return null;
}

function escapeMarkdownLabel(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([[\]])/g, '\\$1');
}

function encodeMarkdownDestination(value) {
  return encodeURI(String(value ?? '').trim()).replace(/[()]/g, character =>
    character === '(' ? '%28' : '%29'
  );
}

function normalizeBareWebDestination(value) {
  const target = String(value ?? '').trim();
  if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) {
    return target;
  }
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(target)) {
    return `mailto:${target}`;
  }
  if (/^(?:www\.)?(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(target)) {
    return `https://${target}`;
  }
  return target;
}

export function createMarkdownReferenceInsertion({
  label,
  target,
  existingTargets = new Map()
} = {}) {
  const cleanTarget = String(target ?? '').trim();
  const destination = normalizeBareWebDestination(cleanTarget);
  const cleanLabel = String(label ?? '').trim() ||
    getWmdxResourceFallbackTitle(cleanTarget);
  const escapedLabel = escapeMarkdownLabel(cleanLabel);
  const encodedTarget = encodeMarkdownDestination(destination);
  const normalizedTarget = destination.toLocaleLowerCase('en-US');

  for (const [reference, existingTarget] of existingTargets) {
    if (
      normalizeBareWebDestination(existingTarget)
        .toLocaleLowerCase('en-US') === normalizedTarget
    ) {
      return {
        markdown: `[${escapedLabel}][${reference}]`,
        definition: null,
        reference
      };
    }
  }

  const base = cleanLabel
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'link';
  const used = new Set(existingTargets.keys());
  let reference = base;
  for (let suffix = 2; used.has(reference); suffix += 1) {
    reference = `${base}-${suffix}`;
  }

  return {
    markdown: `[${escapedLabel}][${reference}]`,
    definition: `[${reference}]: ${encodedTarget}`,
    reference
  };
}

export function formatMarkdownLinkInsertion({
  kind = 'external',
  target,
  title = '',
  alignment = '',
  settings = DEFAULT_LINK_SYNTAX_SETTINGS,
  existingTargets
} = {}) {
  const cleanTarget = String(target ?? '').trim();
  if (!cleanTarget) throw new TypeError('A link needs a destination.');
  if (!linkActionAvailability(settings)[kind]) {
    throw new TypeError(`The ${kind} link syntax is disabled.`);
  }

  const cleanTitle = String(title ?? '').trim() ||
    getWmdxResourceFallbackTitle(cleanTarget);
  if (kind === 'reference') {
    return createMarkdownReferenceInsertion({
      label: cleanTitle,
      target: cleanTarget,
      existingTargets
    });
  }

  const syntax = enabledAuthoringSyntax(settings, kind);
  if (syntax === 'wmdx') {
    return {
      markdown: formatWmdxResourceSyntax({
        source: cleanTarget,
        title,
        alignment
      }),
      definition: null,
      syntax
    };
  }

  const encodedTarget = encodeMarkdownDestination(
    kind === 'external' ? normalizeBareWebDestination(cleanTarget) : cleanTarget
  );
  const escapedTitle = escapeMarkdownLabel(cleanTitle);
  if (syntax === 'obsidian' && kind === 'internal') {
    const escapedTarget = String(cleanTarget).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
    return {
      markdown: cleanTitle === cleanTarget
        ? `[[${escapedTarget}]]`
        : `[[${escapedTarget}|${escapedTitle}]]`,
      definition: null,
      syntax
    };
  }

  return {
    markdown: `[${escapedTitle}](${encodedTarget})`,
    definition: null,
    syntax: 'commonmark'
  };
}
