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
