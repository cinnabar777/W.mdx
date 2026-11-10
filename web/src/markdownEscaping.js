const COMMONMARK_ESCAPABLE_PUNCTUATION = new Set(
  Array.from('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')
);

function toCharacterSet(value) {
  return new Set(Array.from(value ?? ''));
}

/**
 * Serialize literal text for a Markdown syntax field. Existing backslashes are
 * doubled only when the following character would consume them as an escape,
 * or when a line ending would change into a hard break. A custom field parser
 * can provide its own `backslashSpecialCharacters` set.
 */
export function escapeMarkdownField(
  value,
  {
    escapeCharacters = '',
    backslashSpecialCharacters
  } = {}
) {
  const source = String(value ?? '');
  const charactersToEscape = toCharacterSet(escapeCharacters);
  const backslashSpecials = backslashSpecialCharacters === undefined
    ? COMMONMARK_ESCAPABLE_PUNCTUATION
    : toCharacterSet(backslashSpecialCharacters);
  let result = '';

  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\') {
      let runEnd = index + 1;
      while (source[runEnd] === '\\') runEnd++;
      const runLength = runEnd - index;
      const next = source[runEnd] ?? '';
      const mustDouble = !next ||
        next === '\n' ||
        next === '\r' ||
        backslashSpecials.has(next) ||
        charactersToEscape.has(next);
      const outputSlashCount = mustDouble
        ? runLength * 2
        : runLength === 1
          ? 1
          : runLength * 2 - 1;
      result += '\\'.repeat(outputSlashCount);
      index = runEnd - 1;
    } else {
      if (charactersToEscape.has(source[index])) result += '\\';
      result += source[index];
    }
  }

  return result;
}
