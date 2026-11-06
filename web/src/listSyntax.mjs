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
  /^(?:[-+*][ \t]+\[[ xX]\][ \t]+|\d+[.)][ \t]+\[[ xX]\][ \t]+|\[[ xX]\][ \t]+|[-+*][ \t]+|\d+[.)][ \t]+|[aAiI][.)][ \t]+)/;

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

export function parseWmdxOrderedListMarker(lineText) {
  const match = /^([ \t]*(?:>\s*)*)([aA]|[iI])([.)])(?=[ \t]|$)/.exec(
    String(lineText ?? '')
  );
  if (!match) return null;
  const marker = `${match[2]}${match[3]}`;
  return {
    marker,
    markerFrom: match[1].length,
    markerTo: match[1].length + marker.length,
    textFrom: match[1].length + marker.length,
    indent: (/^[ \t]*/.exec(match[1])?.[0] ?? '').length,
    style: match[2] === 'i'
      ? 'roman_lower'
      : match[2] === 'I'
        ? 'roman_upper'
        : match[2] === 'A'
          ? 'alpha_upper'
          : 'alpha_lower',
    delimiter: match[3]
  };
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
  const removeTarget = Boolean(
    prefix &&
    entries.length > 0 &&
    entries.every(entry => entry.existingPrefix === prefix)
  );

  return entries.flatMap(entry => {
    if (removeTarget) {
      return [{
        from: entry.from,
        to: entry.from + entry.existingPrefix.length,
        insert: ''
      }];
    }
    if (!prefix && !entry.existingPrefix) return [];
    return [{
      from: entry.from,
      to: entry.from + entry.existingPrefix.length,
      insert: prefix
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
