export const DEFAULT_BLOCKQUOTE_SYNTAX_SETTINGS = Object.freeze({
  enabled: true
});

export function normalizeBlockquoteSyntaxSettings(preferences = {}) {
  return {
    enabled: preferences.pref_blockquote_syntax_enabled !== false
  };
}

export function getBlockquoteEnterEdit(
  text,
  selection,
  isExcluded = () => false
) {
  if (!selection?.empty || !Number.isInteger(selection.head)) return null;

  const source = String(text ?? '');
  const position = Math.max(0, Math.min(selection.head, source.length));
  const lineFrom = source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const newlineAt = source.indexOf('\n', position);
  const lineTo = newlineAt < 0 ? source.length : newlineAt;
  const rawLine = source.slice(lineFrom, lineTo);
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  const quotePrefix = /^([ \t]*(?:>[ \t]*)+)/.exec(line)?.[0];
  if (!quotePrefix) return null;

  const quotePrefixEnd = lineFrom + quotePrefix.length;
  if (position < quotePrefixEnd || isExcluded(quotePrefixEnd)) return null;

  const depth = (quotePrefix.match(/>/g) || []).length;
  if (depth === 0) return null;

  if (!line.slice(quotePrefix.length).trim()) {
    const indentation = /^[ \t]*/.exec(quotePrefix)[0];
    const nextPrefix = depth > 1
      ? `${indentation}${'> '.repeat(depth - 1)}`
      : '';
    return {
      from: lineFrom,
      to: lineTo,
      insert: nextPrefix,
      cursor: lineFrom + nextPrefix.length,
      exitsQuote: true
    };
  }

  return {
    from: position,
    to: position,
    insert: `\n${quotePrefix}`,
    cursor: position + 1 + quotePrefix.length,
    exitsQuote: false
  };
}
