export const DEFAULT_LIST_SYNTAX_SETTINGS = Object.freeze({
  enabled: true,
  markdown: true,
  gfmTasks: true,
  wmdx: true,
  authoringSyntax: 'wmdx',
  bulletMarker: '-',
  orderedStyle: 'decimal'
});

const LIST_FLAVORS = ['markdown', 'wmdx'];
const AUTHORING_SYNTAXES = new Set(LIST_FLAVORS);
const BULLET_MARKERS = new Set(['-', '+', '*']);
const ORDERED_STYLES = new Set([
  'decimal',
  'alpha_lower',
  'alpha_upper',
  'roman_lower',
  'roman_upper'
]);
const LIST_ITEM_PREFIX =
  /^(?:[-+*][ \t]+\[[ xX]\][ \t]+|\d+[.)][ \t]+\[[ xX]\][ \t]+|\[[ xX]\][ \t]+|[-+*][ \t]+|\d+[.)][ \t]+|[A-Za-z]+[.)][ \t]+)/;

export function normalizeListSyntaxSettings(preferences = {}) {
  const settings = {
    enabled: preferences.pref_list_syntax_enabled !== false,
    markdown: preferences.pref_list_syntax_markdown_enabled !== false,
    gfmTasks: preferences.pref_list_syntax_gfm_tasks_enabled !== false,
    wmdx: preferences.pref_list_syntax_wmdx_enabled !== false,
    bulletMarker: BULLET_MARKERS.has(preferences.pref_list_default_bullet_marker)
      ? preferences.pref_list_default_bullet_marker
      : DEFAULT_LIST_SYNTAX_SETTINGS.bulletMarker,
    orderedStyle: ORDERED_STYLES.has(preferences.pref_list_default_ordered_style)
      ? preferences.pref_list_default_ordered_style
      : DEFAULT_LIST_SYNTAX_SETTINGS.orderedStyle
  };
  const enabledFlavors = LIST_FLAVORS.filter(flavor => settings[flavor]);
  const storedAuthoring = String(
    preferences.pref_list_authoring_syntax ??
      DEFAULT_LIST_SYNTAX_SETTINGS.authoringSyntax
  ).toLowerCase();
  settings.authoringSyntax = !settings.enabled
    ? null
    : enabledFlavors.length === 1
      ? enabledFlavors[0]
      : AUTHORING_SYNTAXES.has(storedAuthoring) &&
          enabledFlavors.includes(storedAuthoring)
        ? storedAuthoring
        : enabledFlavors[0] ?? null;
  return settings;
}

export function isListFlavorEnabled(settings, flavor) {
  return Boolean(
    settings?.enabled !== false &&
    LIST_FLAVORS.includes(flavor) &&
    settings?.[flavor] !== false
  );
}

export function isListAuthoringAvailable(settings) {
  return Boolean(
    settings?.enabled &&
    settings?.authoringSyntax &&
    isListFlavorEnabled(settings, settings.authoringSyntax)
  );
}

export function getDefaultBulletPrefix(settings) {
  return isListAuthoringAvailable(settings)
    ? `${settings.bulletMarker || '-'} `
    : null;
}

export function getDefaultOrderedStyle(settings) {
  if (!isListAuthoringAvailable(settings)) return null;
  return settings.authoringSyntax === 'markdown'
    ? 'decimal'
    : settings.orderedStyle || 'decimal';
}

export function getDefaultOrderedPrefix(settings) {
  const style = getDefaultOrderedStyle(settings);
  return style ? `${getOrderedMarkerLabel(style, 1)} ` : null;
}

export function getDefaultTaskPrefix(settings) {
  if (!isListAuthoringAvailable(settings)) return null;
  if (
    settings.authoringSyntax === 'markdown' &&
    settings.markdown &&
    settings.gfmTasks !== false
  ) {
    return '- [ ] ';
  }
  return settings.authoringSyntax === 'wmdx' ? '[ ] ' : null;
}

export function getSelectedListLineNumbers(doc, selection) {
  if (!doc || !selection) return [];
  const lineNumbers = new Set();
  for (const range of selection.ranges || [selection.main]) {
    const firstLine = doc.lineAt(range.from).number;
    let lastLine = doc.lineAt(range.to).number;
    if (
      !range.empty &&
      lastLine > firstLine &&
      doc.line(lastLine).from === range.to
    ) {
      lastLine--;
    }
    for (let number = firstLine; number <= lastLine; number++) {
      lineNumbers.add(number);
    }
  }
  return [...lineNumbers].sort((a, b) => a - b);
}

export function getOrderedMarkerLabel(style, ordinal, delimiter = '.') {
  const index = Math.max(1, Math.floor(Number(ordinal) || 1));
  if (style === 'alpha_lower') return `${toAlphabetic(index, false)}${delimiter}`;
  if (style === 'alpha_upper') return `${toAlphabetic(index, true)}${delimiter}`;
  if (style === 'roman_lower') return `${toRoman(index).toLowerCase()}${delimiter}`;
  if (style === 'roman_upper') return `${toRoman(index)}${delimiter}`;
  return `${index}${delimiter}`;
}

export function parseWmdxOrderedListMarker(lineText, preferredStyle = null) {
  const match = /^([ \t]*(?:>\s*)*)([A-Za-z]+)([.)])(?=[ \t]|$)/.exec(
    String(lineText ?? '')
  );
  if (!match) return null;
  const marker = `${match[2]}${match[3]}`;
  const token = match[2];
  const parsedStyle = getOrderedTokenStyle(token, preferredStyle);
  if (!parsedStyle) return null;
  return {
    marker,
    markerFrom: match[1].length,
    markerTo: match[1].length + marker.length,
    textFrom: match[1].length + marker.length,
    indent: (/^[ \t]*/.exec(match[1])?.[0] ?? '').length,
    style: parsedStyle.style,
    ordinal: parsedStyle.ordinal,
    delimiter: match[3]
  };
}

export function getWmdxOrderedListEnterEdit(
  text,
  selection,
  isExcluded = () => false
) {
  const source = String(text ?? '');
  const position = selection?.head ?? selection?.to;
  const from = selection?.from ?? position;
  const to = selection?.to ?? position;
  if (
    !Number.isInteger(position) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to)
  ) {
    return null;
  }

  const lineFrom = source.lastIndexOf('\n', position - 1) + 1;
  const nextBreak = source.indexOf('\n', position);
  const lineTo = nextBreak < 0 ? source.length : nextBreak;
  if (from < lineFrom || to > lineTo) return null;

  const lineText = source.slice(lineFrom, lineTo);
  const listPosition = getWmdxOrderedListPosition(
    source,
    lineFrom,
    lineText
  );
  const parsed = parseWmdxOrderedListMarker(
    lineText,
    listPosition?.style ?? null
  );
  if (!parsed || isExcluded(lineFrom + parsed.markerFrom)) return null;

  if (selection?.empty && !lineText.slice(parsed.markerTo).trim()) {
    const exitFrom = lineFrom + parsed.markerFrom;
    return {
      from: exitFrom,
      to: lineTo,
      insert: '',
      cursor: exitFrom,
      exitsList: true
    };
  }

  const nextMarker = getOrderedMarkerLabel(
    parsed.style,
    (listPosition?.ordinal ?? parsed.ordinal) + 1,
    parsed.delimiter
  );
  const insert =
    `\n${lineText.slice(0, parsed.markerFrom)}${nextMarker} `;
  return {
    from,
    to,
    insert,
    cursor: from + insert.length,
    exitsList: false
  };
}

function getWmdxOrderedListPosition(source, lineFrom, lineText) {
  const current = parseWmdxOrderedListMarker(lineText);
  if (!current) return null;
  const targetPrefix = lineText.slice(0, current.markerFrom);
  const listLines = [{
    text: lineText,
    defaultParsed: current,
    gapBefore: false
  }];
  let previousLineFrom = lineFrom;
  let crossedBlankLine = false;

  while (previousLineFrom > 0) {
    const previousEnd = previousLineFrom - 1;
    const previousStart = source.lastIndexOf('\n', previousEnd - 1) + 1;
    const previousText = source.slice(previousStart, previousEnd);
    if (!previousText.trim()) {
      if (crossedBlankLine) break;
      crossedBlankLine = true;
      previousLineFrom = previousStart;
      continue;
    }
    const parsed = parseWmdxOrderedListMarker(previousText);
    if (
      !parsed ||
      parsed.indent !== current.indent ||
      previousText.slice(0, parsed.markerFrom) !== targetPrefix
    ) {
      break;
    }
    listLines[0].gapBefore = crossedBlankLine;
    listLines.unshift({
      text: previousText,
      defaultParsed: parsed,
      gapBefore: false
    });
    crossedBlankLine = false;
    previousLineFrom = previousStart;
  }

  let active = null;
  for (const entry of listLines) {
    let parsed = entry.defaultParsed;
    if (active) {
      const candidate = parseWmdxOrderedListMarker(entry.text, active.style);
      const ambiguousRomanOne =
        entry.defaultParsed.marker.slice(0, -1).toUpperCase() === 'I';
      if (
        candidate?.style === active.style &&
        (
          parsed.style === active.style ||
          (
            !entry.gapBefore &&
            (
              candidate.ordinal === active.ordinal + 1 ||
              candidate.ordinal === 1
            )
          ) ||
          (
            entry.gapBefore &&
            !ambiguousRomanOne &&
            candidate.ordinal === active.ordinal + 1
          )
        )
      ) {
        parsed = candidate;
      }
    }
    if (
      !active ||
      active.style !== parsed.style ||
      active.delimiter !== parsed.delimiter
    ) {
      active = {
        style: parsed.style,
        delimiter: parsed.delimiter,
        ordinal: 0
      };
    }
    active.ordinal = Math.max(active.ordinal + 1, parsed.ordinal);
  }
  return active;
}

export function getSelectedListPrefixChanges(lines, prefix) {
  const entries = lines.map(line => {
    const indent = (/^[ \t]*/.exec(line.text)?.[0] ?? '').length;
    const afterIndent = line.text.slice(indent);
    const quotePrefix = /^(?:>[ \t]*)+/.exec(afterIndent)?.[0] ?? '';
    const contentFrom = line.from + indent + quotePrefix.length;
    const content = afterIndent.slice(quotePrefix.length);
    const existingPrefix = LIST_ITEM_PREFIX.exec(content)?.[0] ?? '';
    return { from: contentFrom, existingPrefix };
  });
  const targetPrefixes = lines.map((line, index) =>
    typeof prefix === 'function' ? prefix(index, line) : (prefix ?? '')
  );
  const removeTarget = Boolean(
    targetPrefixes.length > 0 &&
    targetPrefixes.every(Boolean) &&
    entries.every((entry, index) =>
      entry.existingPrefix === targetPrefixes[index]
    )
  );

  return entries.flatMap((entry, index) => {
    if (removeTarget) {
      return [{
        from: entry.from,
        to: entry.from + entry.existingPrefix.length,
        insert: ''
      }];
    }
    const targetPrefix = targetPrefixes[index];
    if (!targetPrefix && !entry.existingPrefix) return [];
    return [{
      from: entry.from,
      to: entry.from + entry.existingPrefix.length,
      insert: targetPrefix
    }];
  });
}

function toAlphabetic(value, uppercase) {
  let number = value;
  let result = '';
  while (number > 0) {
    number--;
    result = String.fromCharCode((uppercase ? 65 : 97) + number % 26) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

function toRoman(value) {
  let number = value;
  let result = '';
  for (const [amount, numeral] of [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ]) {
    while (number >= amount) {
      result += numeral;
      number -= amount;
    }
  }
  return result;
}

function getOrderedTokenStyle(token, preferredStyle) {
  const isUppercase = token === token.toUpperCase();
  const alphaStyle = isUppercase ? 'alpha_upper' : 'alpha_lower';
  const romanStyle = isUppercase ? 'roman_upper' : 'roman_lower';

  if (preferredStyle === alphaStyle && /^[A-Za-z]+$/.test(token)) {
    return { style: alphaStyle, ordinal: fromAlphabetic(token) };
  }
  if (preferredStyle === romanStyle) {
    const ordinal = fromRoman(token);
    if (ordinal !== null) return { style: romanStyle, ordinal };
  }

  const romanOrdinal = fromRoman(token);
  if (
    romanOrdinal !== null &&
    (token.length > 1 || token.toUpperCase() === 'I')
  ) {
    return { style: romanStyle, ordinal: romanOrdinal };
  }
  return { style: alphaStyle, ordinal: fromAlphabetic(token) };
}

function fromAlphabetic(value) {
  let ordinal = 0;
  for (const character of value.toLowerCase()) {
    ordinal = ordinal * 26 + character.charCodeAt(0) - 96;
  }
  return ordinal;
}

function fromRoman(value) {
  const normalized = value.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(normalized)) return null;
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let ordinal = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const current = values[normalized[index]];
    const next = values[normalized[index + 1]] ?? 0;
    ordinal += current < next ? -current : current;
  }
  return toRoman(ordinal) === normalized ? ordinal : null;
}
