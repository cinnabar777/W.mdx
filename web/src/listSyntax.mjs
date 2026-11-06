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

export function getOrderedListPrefixGenerator(style, delimiter = '.') {
  const ordinalByDepth = new Map();
  let previousLineNumber = null;
  return (_index, line) => {
    if (
      Number.isInteger(line.number) &&
      previousLineNumber !== null &&
      line.number > previousLineNumber + 1
    ) {
      ordinalByDepth.clear();
    }
    if (Number.isInteger(line.number)) previousLineNumber = line.number;

    const indent = (/^[ \t]*/.exec(line.text)?.[0] ?? '');
    let columns = 0;
    for (const character of indent) {
      columns = character === '\t'
        ? columns + (4 - (columns % 4))
        : columns + 1;
    }
    const afterIndent = line.text.slice(indent.length);
    const quotePrefix = /^(?:>[ \t]*)+/.exec(afterIndent)?.[0] ?? '';
    const quoteDepth = (quotePrefix.match(/>/g) || []).length;
    const depth = `${columns}:${quoteDepth}`;
    const ordinal = (ordinalByDepth.get(depth) ?? 0) + 1;
    ordinalByDepth.set(depth, ordinal);
    return `${getOrderedMarkerLabel(style, ordinal, delimiter)} `;
  };
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

export function getWmdxOrderedListSequence(
  lines,
  isExcluded = () => false
) {
  const items = [];
  const activeLists = new Map();
  for (const line of lines) {
    let parsed = parseWmdxOrderedListMarker(line.text);
    if (!parsed) {
      if (line.text.trim()) {
        const indent = (/^[ \t]*/.exec(line.text)?.[0] ?? '').length;
        for (const depth of activeLists.keys()) {
          if (depth >= indent) activeLists.delete(depth);
        }
      } else {
        for (const active of activeLists.values()) active.gap = true;
      }
      continue;
    }
    if (isExcluded(line.from + parsed.markerFrom)) continue;

    for (const depth of activeLists.keys()) {
      if (depth > parsed.indent) activeLists.delete(depth);
    }
    let active = activeLists.get(parsed.indent);
    if (active) {
      const candidate = parseWmdxOrderedListMarker(line.text, active.style);
      const ambiguousRomanOne =
        parsed.marker.slice(0, -1).toUpperCase() === 'I';
      if (
        candidate?.style === active.style &&
        (
          parsed.style === active.style ||
          (
            !active.gap &&
            (
              candidate.ordinal === active.ordinal + 1 ||
              candidate.ordinal === 1
            )
          ) ||
          (
            active.gap &&
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
      const hasParentList = [...activeLists.keys()].some(
        depth => depth < parsed.indent
      );
      active = {
        style: parsed.style,
        delimiter: parsed.delimiter,
        ordinal: hasParentList ? 0 : parsed.ordinal - 1,
        gap: false
      };
      activeLists.set(parsed.indent, active);
    }
    active.ordinal++;
    active.gap = false;
    items.push({
      ...parsed,
      line,
      from: line.from + parsed.markerFrom,
      to: line.from + parsed.markerTo,
      textTo: line.to,
      ordinal: active.ordinal,
      displayText: getOrderedMarkerLabel(
        parsed.style,
        active.ordinal,
        parsed.delimiter
      )
    });
  }
  return items;
}

export function getWmdxOrderedListMarkerChanges(
  lines,
  isExcluded = () => false
) {
  return getWmdxOrderedListSequence(lines, isExcluded).flatMap(item => {
    const marker = getOrderedMarkerLabel(
      item.style,
      item.ordinal,
      item.delimiter
    );
    return item.marker === marker
      ? []
      : [{ from: item.from, to: item.to, insert: marker }];
  });
}

export function parseMarkdownOrderedListMarker(lineText) {
  const match = /^([ \t]*)((?:>[ \t]*)*)(\d+)([.)])(?=[ \t]|$)/.exec(
    String(lineText ?? '')
  );
  if (!match) return null;
  const indent = match[1];
  let indentWidth = 0;
  for (const character of indent) {
    indentWidth = character === '\t'
      ? indentWidth + (4 - (indentWidth % 4))
      : indentWidth + 1;
  }
  const marker = `${match[3]}${match[4]}`;
  const markerFrom = match[1].length + match[2].length;
  return {
    marker,
    markerFrom,
    markerTo: markerFrom + marker.length,
    textFrom: markerFrom + marker.length,
    indent: indentWidth,
    quoteDepth: (match[2].match(/>/g) || []).length,
    ordinal: Number.parseInt(match[3], 10),
    delimiter: match[4]
  };
}

export function getMarkdownOrderedListSequence(
  lines,
  isExcluded = () => false
) {
  const items = [];
  const activeLists = new Map();
  for (const line of lines) {
    const parsed = parseMarkdownOrderedListMarker(line.text);
    if (!parsed) {
      if (line.text.trim()) {
        const prefix = /^([ \t]*)((?:>[ \t]*)*)/.exec(line.text);
        let indent = 0;
        for (const character of prefix?.[1] ?? '') {
          indent = character === '\t'
            ? indent + (4 - (indent % 4))
            : indent + 1;
        }
        const quoteDepth = (prefix?.[2]?.match(/>/g) || []).length;
        for (const [key, active] of activeLists) {
          if (
            active.quoteDepth === quoteDepth &&
            active.indent >= indent
          ) {
            activeLists.delete(key);
          }
        }
      } else {
        continue;
      }
      continue;
    }
    const markerFrom = line.from + parsed.markerFrom;
    if (isExcluded(markerFrom)) continue;

    for (const [key, active] of activeLists) {
      if (
        active.quoteDepth === parsed.quoteDepth &&
        active.indent > parsed.indent
      ) {
        activeLists.delete(key);
      }
    }
    const key = `${parsed.quoteDepth}:${parsed.indent}`;
    let active = activeLists.get(key);
    if (active && active.delimiter !== parsed.delimiter) {
      active = null;
    }
    if (!active) {
      const hasParentList = [...activeLists.values()].some(
        previous =>
          previous.quoteDepth === parsed.quoteDepth &&
          previous.indent < parsed.indent
      );
      active = {
        quoteDepth: parsed.quoteDepth,
        indent: parsed.indent,
        delimiter: parsed.delimiter,
        ordinal: hasParentList ? 0 : parsed.ordinal - 1
      };
      activeLists.set(key, active);
    }
    active.ordinal++;
    items.push({
      ...parsed,
      line,
      from: markerFrom,
      to: line.from + parsed.markerTo,
      textTo: line.to,
      ordinal: active.ordinal,
      displayText: `${active.ordinal}${parsed.delimiter}`
    });
  }
  return items;
}

export function getMarkdownOrderedListMarkerChanges(
  lines,
  isExcluded = () => false
) {
  return getMarkdownOrderedListSequence(lines, isExcluded).flatMap(item =>
    item.marker === item.displayText
      ? []
      : [{ from: item.from, to: item.to, insert: item.displayText }]
  );
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
  let sourceLineFrom = 0;
  const lines = [];
  let lineNumber = 1;
  while (sourceLineFrom <= lineFrom) {
    const newline = source.indexOf('\n', sourceLineFrom);
    const text = source.slice(
      sourceLineFrom,
      newline < 0 ? source.length : newline
    );
    const from = sourceLineFrom;
    const to = from + text.length;
    lines.push({ from, to, number: lineNumber, text });
    if (from === lineFrom || newline < 0) break;
    sourceLineFrom = to + 1;
    lineNumber += 1;
  }
  const orderedItems = getWmdxOrderedListSequence(lines, isExcluded);
  const itemIndex = orderedItems.findIndex(item => item.line.from === lineFrom);
  if (itemIndex < 0) return null;
  const item = orderedItems[itemIndex];

  if (selection?.empty && !lineText.slice(item.markerTo).trim()) {
    const parent = orderedItems
      .slice(0, itemIndex)
      .reverse()
      .find(previous => previous.indent < item.indent);
    const parentIndent = parent?.indent ?? 0;
    const leadingIndent = (/^[ \t]*/.exec(lineText)?.[0] ?? '');
    let columns = 0;
    let keepLength = 0;
    for (const character of leadingIndent) {
      const nextColumns = character === '\t'
        ? columns + (4 - (columns % 4))
        : columns + 1;
      if (nextColumns > parentIndent) break;
      columns = nextColumns;
      keepLength++;
    }
    const quotePrefix = /^(?:>[ \t]*)+/.exec(
      lineText.slice(leadingIndent.length)
    )?.[0] ?? '';
    const retainedPrefix = leadingIndent.slice(0, keepLength) + quotePrefix;
    return {
      from: lineFrom,
      to: lineTo,
      insert: retainedPrefix,
      cursor: lineFrom + retainedPrefix.length,
      exitsList: true
    };
  }

  const nextMarker = getOrderedMarkerLabel(
    item.style,
    item.ordinal + 1,
    item.delimiter
  );
  const insert =
    `\n${lineText.slice(0, item.markerFrom)}${nextMarker} `;
  return {
    from,
    to,
    insert,
    cursor: from + insert.length,
    exitsList: false
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
