import { escapeMarkdownField } from './markdownEscaping.js';

const ALIGNMENT_NAMES = new Map([
  ['<', 'left'],
  ['><', 'center'],
  ['>', 'right'],
  ['<>', 'justify']
]);

const LEGACY_ALIGNMENT_NAMES = new Map([
  ['->', 'right']
]);

const ALIGNMENT_MARKERS = new Map(
  [...ALIGNMENT_NAMES].map(([marker, name]) => [name, marker])
);

function splitResourceFields(source) {
  const fields = [''];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && ['\\', '|'].includes(source[index + 1])) {
      fields[fields.length - 1] += source[index + 1];
      index += 1;
      continue;
    }
    if (character === '|') {
      fields.push('');
      if (fields.length > 4) return null;
      continue;
    }
    fields[fields.length - 1] += character;
  }
  return fields.length === 4 ? fields : null;
}

function parseSize(value) {
  if (!value) return { width: null, height: null, unit: null };

  const percent = /^([1-9]\d{0,2})%$/.exec(value);
  if (percent) {
    const width = Number(percent[1]);
    return width <= 100
      ? { width, height: null, unit: '%' }
      : null;
  }

  const pixels = /^([1-9]\d{0,4})(?:x([1-9]\d{0,4}))?$/.exec(value);
  if (!pixels) return null;
  const width = Number(pixels[1]);
  const height = pixels[2] ? Number(pixels[2]) : null;
  if (width > 10000 || (height !== null && height > 10000)) return null;
  return { width, height, unit: 'px' };
}

function normalizeAlignment(value) {
  const alignment = String(value ?? '').trim();
  if (!alignment) return { marker: '', name: null };
  if (ALIGNMENT_NAMES.has(alignment)) {
    return { marker: alignment, name: ALIGNMENT_NAMES.get(alignment) };
  }
  if (ALIGNMENT_MARKERS.has(alignment)) {
    return { marker: ALIGNMENT_MARKERS.get(alignment), name: alignment };
  }
  return null;
}

export function getWmdxResourceFallbackTitle(source) {
  const rawSource = String(source ?? '').trim();
  let path = rawSource.split(/[?#]/, 1)[0];
  let host = '';
  try {
    const url = new URL(rawSource);
    path = url.pathname;
    host = url.hostname;
  } catch {
    // Local document paths do not require URL parsing.
  }

  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep malformed percent escapes as literal filename characters.
  }
  const basename = path.replace(/\/+$/, '').split('/').at(-1) || '';
  return basename || host || rawSource;
}

export function resolveWmdxResourceTarget(value) {
  const source = String(value ?? '').trim();
  if (!source) return source;

  try {
    new URL(source);
    return source;
  } catch {
    // Bare web domains need a scheme when assigned to an HTML link.
  }

  if (/^(?:\/|\.\/|\.\.\/|#|\?)/.test(source)) return source;

  try {
    const url = new URL(`https://${source}`);
    if (url.hostname.includes('.') || url.hostname === 'localhost') {
      return url.href;
    }
  } catch {
    // Keep document-relative paths and other non-URL resource names unchanged.
  }
  return source;
}

export function parseWmdxResourceSyntax(value) {
  const text = String(value ?? '');
  const match = /^(!?)\[([^\r\n]*)\]$/.exec(text);
  if (!match) return null;

  const fields = splitResourceFields(match[2]);
  if (!fields) return null;
  const [rawSource, rawTitle, rawSize, rawAlignment] = fields;
  const source = rawSource.trim();
  if (!source) return null;

  const sizeText = rawSize.trim();
  const size = parseSize(sizeText);
  if (!size || (!match[1] && sizeText)) return null;

  const alignmentMarker = rawAlignment.trim();
  const alignmentName =
    ALIGNMENT_NAMES.get(alignmentMarker) ??
    LEGACY_ALIGNMENT_NAMES.get(alignmentMarker);
  if (alignmentMarker && !alignmentName) return null;

  const title = rawTitle.trim();
  return {
    embed: Boolean(match[1]),
    source,
    title,
    displayTitle: title || getWmdxResourceFallbackTitle(source),
    sizeText,
    size,
    alignment: alignmentName ?? null,
    alignmentMarker
  };
}

function resourceFieldSeparators(value, embed) {
  const text = String(value ?? '');
  const separators = [];
  const fieldStart = embed ? 2 : 1;
  for (let index = fieldStart; index < text.length - 1; index += 1) {
    if (
      text[index] === '\\' &&
      ['\\', '|'].includes(text[index + 1])
    ) {
      index += 1;
    } else if (text[index] === '|') {
      separators.push(index);
    }
  }
  return separators;
}

export function getWmdxResourceTitleRange(value) {
  const resource = parseWmdxResourceSyntax(value);
  if (!resource) return null;
  const separators = resourceFieldSeparators(value, resource.embed);
  return separators.length === 3
    ? { from: separators[0] + 1, to: separators[1] }
    : null;
}

export function getWmdxResourceTitleEscapeRanges(value) {
  const titleRange = getWmdxResourceTitleRange(value);
  if (!titleRange) return [];
  const text = String(value ?? '');
  const ranges = [];
  for (let index = titleRange.from; index < titleRange.to - 1; index += 1) {
    if (
      text[index] === '\\' &&
      ['\\', '|'].includes(text[index + 1])
    ) {
      ranges.push({ from: index, to: index + 1 });
      index += 1;
    }
  }
  return ranges;
}

function serializeSize(value) {
  if (value == null || value === '') return '';
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  if (!parseSize(text)) {
    throw new RangeError('Resource size must be a positive pixel width, width x height, or 1% to 100%.');
  }
  return text;
}

function escapeField(value) {
  return escapeMarkdownField(value, {
    escapeCharacters: '|',
    backslashSpecialCharacters: '|'
  });
}

export function formatWmdxResourceSyntax({
  embed = false,
  source,
  title = '',
  size = '',
  alignment = ''
} = {}) {
  const normalizedSource = String(source ?? '').trim();
  if (!normalizedSource) {
    throw new TypeError('A resource needs a source path or URL.');
  }

  const sizeText = serializeSize(size);
  if (!embed && sizeText) {
    throw new TypeError('Text links cannot have a size.');
  }

  const normalizedAlignment = normalizeAlignment(alignment);
  if (!normalizedAlignment) {
    throw new TypeError('Resource alignment must be left, center, right, or justified.');
  }

  const fields = [
    escapeField(normalizedSource),
    escapeField(title),
    sizeText,
    normalizedAlignment.marker
  ];
  return `${embed ? '!' : ''}[${fields.join('|')}]`;
}
