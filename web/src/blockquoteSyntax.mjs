export const DEFAULT_BLOCKQUOTE_SYNTAX_SETTINGS = Object.freeze({
  enabled: true
});

export function normalizeBlockquoteSyntaxSettings(preferences = {}) {
  return {
    enabled: preferences.pref_blockquote_syntax_enabled !== false
  };
}

function getSelectedLineRange(doc, selection) {
  if (!doc || !selection) return null;

  const first = doc.lineAt(selection.from).number;
  let last = doc.lineAt(selection.to).number;
  if (
    selection.to > selection.from &&
    doc.line(last).from === selection.to
  ) {
    last -= 1;
  }
  return { first, last: Math.max(first, last) };
}

function getTargetLineRange(doc, selection, paragraphLineRange) {
  if (
    selection.from === selection.to &&
    Number.isInteger(paragraphLineRange?.first) &&
    Number.isInteger(paragraphLineRange?.last)
  ) {
    return {
      first: Math.max(1, paragraphLineRange.first),
      last: Math.min(doc.lines, Math.max(
        paragraphLineRange.first,
        paragraphLineRange.last
      ))
    };
  }
  return getSelectedLineRange(doc, selection);
}

export function getBlockquoteNestingChanges(doc, selection, paragraphLineRange = null) {
  const range = getTargetLineRange(doc, selection, paragraphLineRange);
  if (!range) return [];

  const changes = [];
  for (let number = range.first; number <= range.last; number += 1) {
    const line = doc.line(number);
    changes.push({ from: line.from, to: line.from, insert: '> ' });
  }
  return changes;
}

export function getBlockquoteOutdentChanges(doc, selection, paragraphLineRange = null) {
  const range = getTargetLineRange(doc, selection, paragraphLineRange);
  if (!range) return [];

  const lines = [];
  for (let number = range.first; number <= range.last; number += 1) {
    lines.push(doc.line(number));
  }
  const nonBlankLines = lines.filter(line => line.text.trim());
  const quotePrefix = /^[ \t]*>[ \t]*/;
  if (
    nonBlankLines.length === 0 ||
    nonBlankLines.some(line => !quotePrefix.test(line.text))
  ) {
    return [];
  }

  return lines.flatMap(line => {
    const match = /^([ \t]*>)[ \t]*/.exec(line.text);
    return match
      ? [{
          from: line.from,
          to: line.from + match[0].length,
          insert: match[1].slice(0, -1)
        }]
      : [];
  });
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
