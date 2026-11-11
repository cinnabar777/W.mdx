const CALLOUT_FLAVORS = ['wmdx', 'obsidian'];
const AUTHORING_SYNTAXES = new Set(CALLOUT_FLAVORS);

export const DEFAULT_CALLOUT_SYNTAX_SETTINGS = Object.freeze({
  enabled: true,
  wmdx: true,
  obsidian: true,
  authoringSyntax: 'wmdx'
});

export function normalizeCalloutSyntaxSettings(preferences = {}) {
  const settings = {
    enabled: preferences.pref_callout_syntax_enabled !== false,
    wmdx: preferences.pref_callout_syntax_wmdx_enabled !== false,
    obsidian: preferences.pref_callout_syntax_obsidian_enabled !== false
  };
  const enabledFlavors = CALLOUT_FLAVORS.filter(flavor => settings[flavor]);
  const storedAuthoring = String(
    preferences.pref_callout_authoring_syntax ??
      DEFAULT_CALLOUT_SYNTAX_SETTINGS.authoringSyntax
  ).toLowerCase();
  settings.authoringSyntax = enabledFlavors.length === 1
    ? enabledFlavors[0]
    : AUTHORING_SYNTAXES.has(storedAuthoring) &&
        enabledFlavors.includes(storedAuthoring)
      ? storedAuthoring
      : enabledFlavors[0] ?? null;
  return settings;
}

export function isCalloutFlavorEnabled(settings, flavor) {
  return Boolean(
    settings?.enabled !== false &&
    CALLOUT_FLAVORS.includes(flavor) &&
    settings?.[flavor] !== false
  );
}

function splitLines(text) {
  const lines = [];
  let from = 0;
  for (const rawLine of String(text ?? '').split('\n')) {
    const content = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    lines.push({
      from,
      to: from + rawLine.length,
      text: content
    });
    from += rawLine.length + 1;
  }
  return lines;
}

const OBSIDIAN_QUOTE_PREFIX = /^([ \t]*)(?:>[ \t]*)+/;
const OBSIDIAN_CALLOUT_OPENER =
  /^([ \t]*(?:>[ \t]*)+)\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?(?:[ \t]+(.*))?\s*$/i;

export function getObsidianCalloutEnterEdit(
  text,
  selection,
  isExcluded = () => false
) {
  if (!selection?.empty || !Number.isInteger(selection.head)) return null;

  const source = String(text ?? '');
  const lines = splitLines(source);
  const lineIndex = lines.findIndex(
    line => selection.head >= line.from && selection.head <= line.to
  );
  if (lineIndex < 0) return null;

  const line = lines[lineIndex];
  const prefixMatch = OBSIDIAN_QUOTE_PREFIX.exec(line.text);
  if (!prefixMatch) return null;

  const quotePrefix = prefixMatch[0];
  const quoteDepth = (quotePrefix.match(/>/g) || []).length;
  const contentStart = line.from + quotePrefix.length;
  if (
    quoteDepth === 0 ||
    selection.head < contentStart ||
    line.text.slice(quotePrefix.length).trim() ||
    isExcluded(contentStart)
  ) {
    return null;
  }

  const activeCalloutDepths = [];
  for (let index = 0; index <= lineIndex; index++) {
    const candidate = lines[index];
    const candidatePrefix = OBSIDIAN_QUOTE_PREFIX.exec(candidate.text);
    if (!candidatePrefix) {
      activeCalloutDepths.length = 0;
      continue;
    }

    const candidateContentStart =
      candidate.from + candidatePrefix[0].length;
    if (isExcluded(candidateContentStart)) continue;

    const depth = (candidatePrefix[0].match(/>/g) || []).length;
    while (
      activeCalloutDepths.length &&
      activeCalloutDepths[activeCalloutDepths.length - 1] > depth
    ) {
      activeCalloutDepths.pop();
    }

    if (OBSIDIAN_CALLOUT_OPENER.test(candidate.text)) {
      activeCalloutDepths.push(depth);
    }
  }

  const activeCalloutDepth = activeCalloutDepths.at(-1);
  if (activeCalloutDepth == null || activeCalloutDepth > quoteDepth) {
    return null;
  }

  for (let index = lineIndex + 1; index < lines.length; index++) {
    const candidate = lines[index];
    const candidatePrefix = OBSIDIAN_QUOTE_PREFIX.exec(candidate.text);
    if (!candidatePrefix) break;

    const candidateContent = candidate.text.slice(candidatePrefix[0].length);
    if (!candidateContent.trim()) continue;

    const candidateDepth = (candidatePrefix[0].match(/>/g) || []).length;
    if (candidateDepth >= quoteDepth) return null;
    break;
  }

  const remainingDepth = quoteDepth - 1;
  const indent = prefixMatch[1];
  const insert = remainingDepth
    ? `${indent}${Array.from({ length: remainingDepth }, () => '>').join(' ')} `
    : indent;
  return {
    from: line.from,
    to: line.to,
    insert,
    cursor: line.from + insert.length,
    exitsCurrentCallout: activeCalloutDepth > remainingDepth
  };
}

export function buildObsidianCalloutInsertion(
  source,
  selection,
  { type = 'note', fold = '', title = '' } = {}
) {
  const text = String(source ?? '');
  const from = selection?.from;
  const to = selection?.to;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > text.length
  ) {
    return null;
  }

  const lines = splitLines(text);
  const firstLine = lines.find(line => from >= line.from && from <= line.to);
  const lastPosition = to > from ? to - 1 : to;
  const lastLine = lines.find(
    line => lastPosition >= line.from && lastPosition <= line.to
  );
  if (!firstLine || !lastLine) return null;

  const firstIndex = lines.indexOf(firstLine);
  const lastIndex = lines.indexOf(lastLine);
  if (firstIndex < 0 || lastIndex < firstIndex) return null;

  const parentQuotePrefix = /^([ \t]*)(?:>[ \t]*)+/.exec(firstLine.text);
  const indent = parentQuotePrefix?.[1] ??
    (/^[ \t]*/.exec(firstLine.text)?.[0] ?? '');
  const parentPrefix = parentQuotePrefix?.[0] ?? indent;
  const parentQuoteDepth = parentQuotePrefix
    ? (parentQuotePrefix[0].match(/>/g) || []).length
    : 0;
  const calloutPrefix = `${indent}${
    Array.from({ length: parentQuoteDepth + 1 }, () => '>').join(' ')
  } `;
  const safeType = /^[a-z][a-z0-9_-]*$/i.test(type) ? type : 'note';
  const safeFold = fold === '+' || fold === '-' ? fold : '';
  const safeTitle = String(title ?? '').trim();
  const opener =
    `${calloutPrefix}[!${safeType}]${safeFold}${safeTitle ? ` ${safeTitle}` : ''}`;
  const bodyLines = lines
    .slice(firstIndex, lastIndex + 1)
    .map(line => {
      const body = line.text.startsWith(parentPrefix)
        ? line.text.slice(parentPrefix.length)
        : line.text;
      return `${calloutPrefix}${body}`;
    });
  const insert = `${opener}\n${bodyLines.join('\n')}`;

  return {
    from: firstLine.from,
    to: lastLine.to,
    insert,
    cursor: firstLine.from + insert.length
  };
}
