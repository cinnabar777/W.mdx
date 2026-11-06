import {
  getMarkdownOrderedListMarkerChanges,
  getWmdxOrderedListMarkerChanges,
  parseMarkdownOrderedListMarker,
  parseWmdxOrderedListMarker
} from './listSyntax.mjs';

const ROOT_LIST_MARKER = /^([-+*]|(?:\d+|[A-Za-z]+)[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;
const LIST_MARKER_PREFIX = /^([-+*]|(?:\d+|[A-Za-z]+)[.)])[ \t]+/;

function leadingWhitespace(lineText) {
  return /^[ \t]*/.exec(lineText)[0];
}

export function getMarkdownSourceIndentColumns(lineText) {
  const leading = leadingWhitespace(String(lineText ?? ''));
  const countColumns = (value, initial = 0) => {
    let columns = initial;
    for (const character of value) {
      columns = character === '\t'
        ? columns + (4 - (columns % 4))
        : columns + 1;
    }
    return columns;
  };
  let columns = countColumns(leading);
  let rest = String(lineText ?? '').slice(leading.length);

  while (rest.startsWith('>')) {
    rest = rest.slice(1);
    const separator = /^[ \t]*/.exec(rest)[0];
    rest = rest.slice(separator.length);
    if (rest.startsWith('>')) continue;
    columns = countColumns(separator.slice(1), columns);
    break;
  }

  if (!leading.length && !String(lineText ?? '').startsWith('>')) {
    columns = countColumns(leadingWhitespace(rest), columns);
  }
  return columns;
}

function indentationWidth(value) {
  let width = 0;
  for (const character of value) {
    width = character === '\t' ? width + (4 - (width % 4)) : width + 1;
  }
  return width;
}

function listItemInfo(lineText) {
  const indent = leadingWhitespace(lineText);
  const marker = LIST_MARKER_PREFIX.exec(lineText.slice(indent.length));
  if (!marker) return null;
  return {
    indent,
    indentWidth: indentationWidth(indent),
    markerWidth: indentationWidth(marker[0])
  };
}

function isContinuationLine(lineText, currentIndentWidth) {
  if (!lineText.trim()) return true;
  const lineIndentWidth = indentationWidth(leadingWhitespace(lineText));
  return lineIndentWidth > currentIndentWidth ||
    (currentIndentWidth > 0 && lineIndentWidth === currentIndentWidth);
}

function findPreviousListSibling(doc, lineNumber, currentInfo) {
  for (let number = lineNumber - 1; number >= 1; number -= 1) {
    const previousLine = doc.line(number);
    if (!previousLine.text.trim()) continue;
    const previousInfo = listItemInfo(previousLine.text);
    if (previousInfo) {
      if (previousInfo.indentWidth === currentInfo.indentWidth) return previousInfo;
      if (previousInfo.indentWidth < currentInfo.indentWidth) return null;
      continue;
    }
    if (!isContinuationLine(previousLine.text, currentInfo.indentWidth)) return null;
  }
  return null;
}

function getOutdentWidth(doc, lineNumber, currentInfo, spaces) {
  for (let number = lineNumber - 1; number >= 1; number -= 1) {
    const previousLine = doc.line(number);
    if (!previousLine.text.trim()) continue;
    const previousInfo = listItemInfo(previousLine.text);
    if (previousInfo) {
      if (previousInfo.indentWidth < currentInfo.indentWidth) {
        return previousInfo.markerWidth;
      }
      continue;
    }
    if (!isContinuationLine(previousLine.text, currentInfo.indentWidth)) break;
  }
  return indentationWidth(spaces);
}

function leadingWhitespaceLengthForWidth(whitespace, width) {
  let columns = 0;
  let length = 0;
  for (const character of whitespace) {
    const nextColumns = character === '\t'
      ? columns + (4 - (columns % 4))
      : columns + 1;
    columns = nextColumns;
    length += 1;
    if (columns >= width) break;
  }
  return length;
}

function selectedLineNumbers(doc, selection) {
  const first = doc.lineAt(selection.from).number;
  let last = doc.lineAt(selection.to).number;

  // A selection ending at the start of a line does not include that line.
  if (selection.to > selection.from && doc.line(last).from === selection.to) {
    last -= 1;
  }

  return { first, last: Math.max(first, last) };
}

export function getMarkdownIndentChanges(doc, selection, direction, spaces = '  ') {
  if (!doc || !selection || !['indent', 'outdent'].includes(direction)) return [];

  const changes = [];
  const { first, last } = selectedLineNumbers(doc, selection);
  const selectedLines = [];
  for (let number = first; number <= last; number += 1) {
    selectedLines.push({ number, line: doc.line(number) });
  }

  const nonBlankLines = selectedLines.filter(({ line }) => line.text.trim());
  const selectedListLines = nonBlankLines.map(({ number, line }) => ({
    number,
    line,
    info: listItemInfo(line.text)
  }));
  const isListBlock =
    selectedListLines.length > 0 &&
    selectedListLines.every(({ info }) => info !== null);

  if (direction === 'indent' && isListBlock) {
    const firstListLine = selectedListLines[0];
    const parent = findPreviousListSibling(doc, firstListLine.number, firstListLine.info);
    if (!parent) return changes;

    const indentBy = parent.markerWidth;
    for (const { line } of selectedLines) {
      changes.push({ from: line.from, to: line.from, insert: ' '.repeat(indentBy) });
    }
    return changes;
  }

  for (const { number, line } of selectedLines) {
    if (direction === 'indent') {
      changes.push({ from: line.from, to: line.from, insert: spaces });
      continue;
    }

    const currentInfo = listItemInfo(line.text);
    const leadingWhitespace = /^[ \t]*/.exec(line.text)[0];
    if (leadingWhitespace) {
      const removeWidth = currentInfo
        ? getOutdentWidth(doc, number, currentInfo, spaces)
        : indentationWidth(spaces);
      const removeLength = leadingWhitespaceLengthForWidth(
        leadingWhitespace,
        removeWidth
      );
      if (removeLength === 0) continue;
      changes.push({
        from: line.from,
        to: line.from + removeLength,
        insert: ''
      });
      continue;
    }

    const listMarker = ROOT_LIST_MARKER.exec(line.text);
    if (listMarker) {
      changes.push({
        from: line.from,
        to: line.from + listMarker[0].length,
        insert: ''
      });
    }
  }

  return changes;
}

function renumberOrderedListsAfterIndent(
  doc,
  indentChanges,
  isExcluded,
  { renumberMarkdown, renumberWmdx }
) {
  if (
    !Number.isInteger(doc?.lines) ||
    !indentChanges.length ||
    (!renumberMarkdown && !renumberWmdx)
  ) {
    return indentChanges;
  }
  const isOrderedListLine = lineText =>
    (renumberWmdx && parseWmdxOrderedListMarker(lineText)) ||
    (renumberMarkdown && parseMarkdownOrderedListMarker(lineText));
  const changesByLine = new Map(
    indentChanges.map(change => [change.from, change])
  );
  const lines = [];
  const affectedListLines = [];
  let updatedFrom = 0;
  for (let number = 1; number <= doc.lines; number += 1) {
    const originalLine = doc.line(number);
    const indentChange = changesByLine.get(originalLine.from);
    let text = originalLine.text;
    let lineDelta = 0;
    if (indentChange) {
      const from = indentChange.from - originalLine.from;
      const to = indentChange.to - originalLine.from;
      text = text.slice(0, from) + indentChange.insert + text.slice(to);
      lineDelta = text.length - originalLine.text.length;
    }
    const line = {
      from: updatedFrom,
      to: updatedFrom + text.length,
      number,
      text,
      originalLine,
      lineDelta
    };
    lines.push(line);
    if (
      indentChange &&
      (isOrderedListLine(originalLine.text) || isOrderedListLine(text))
    ) {
      affectedListLines.push(line);
    }
    updatedFrom = line.to + 1;
  }
  if (!affectedListLines.length) return indentChanges;

  const affectedNumbers = new Set();
  for (const affectedLine of affectedListLines) {
    const parsed =
      isOrderedListLine(affectedLine.text) ||
      isOrderedListLine(affectedLine.originalLine.text);
    const baseIndent = parsed?.indent ?? 0;
    let first = affectedLine.number - 1;
    let last = affectedLine.number - 1;
    const canJoinBlock = line =>
      !line.text.trim() ||
      Boolean(isOrderedListLine(line.text)) ||
      indentationWidth(leadingWhitespace(line.text)) > baseIndent;
    while (first > 0 && canJoinBlock(lines[first - 1])) first -= 1;
    while (last + 1 < lines.length && canJoinBlock(lines[last + 1])) last += 1;
    for (let index = first; index <= last; index += 1) {
      affectedNumbers.add(lines[index].number);
    }
  }

  const lineAtUpdatedPosition = position => {
    let low = 0;
    let high = lines.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const line = lines[middle];
      if (position < line.from) high = middle - 1;
      else if (position > line.to) low = middle + 1;
      else return line;
    }
    return null;
  };
  const mapExcludedPosition = position => {
    const line = lineAtUpdatedPosition(position);
    if (!line) return false;
    const originalPosition =
      line.originalLine.from + position - line.from - line.lineDelta;
    return isExcluded?.(originalPosition) ?? false;
  };

  const markerChanges = [
    ...(renumberWmdx
      ? getWmdxOrderedListMarkerChanges(lines, mapExcludedPosition)
      : []),
    ...(renumberMarkdown
      ? getMarkdownOrderedListMarkerChanges(lines, mapExcludedPosition)
      : [])
  ]
    .filter(change => {
      const line = lineAtUpdatedPosition(change.from);
      return line && affectedNumbers.has(line.number);
    })
    .flatMap(change => {
      const line = lineAtUpdatedPosition(change.from);
      if (!line) return [];
      const from =
        line.originalLine.from + change.from - line.from - line.lineDelta;
      const to =
        line.originalLine.from + change.to - line.from - line.lineDelta;
      return [{ from, to, insert: change.insert, line: line.originalLine }];
    });
  const combinedChanges = indentChanges.map(change => ({ ...change }));
  for (const markerChange of markerChanges) {
    const indentIndex = combinedChanges.findIndex(change =>
      change.from === markerChange.line.from &&
      change.to === markerChange.line.from
    );
    if (indentIndex >= 0 && markerChange.from === markerChange.line.from) {
      const indentChange = combinedChanges[indentIndex];
      combinedChanges[indentIndex] = {
        from: indentChange.from,
        to: markerChange.to,
        insert: indentChange.insert + markerChange.insert
      };
    } else {
      combinedChanges.push({
        from: markerChange.from,
        to: markerChange.to,
        insert: markerChange.insert
      });
    }
  }
  return combinedChanges;
}

export function applyMarkdownIndent(view, direction, spaces = '  ', options = {}) {
  if (!view?.state) return false;

  const indentChanges = getMarkdownIndentChanges(
    view.state.doc,
    view.state.selection.main,
    direction,
    spaces
  );
  const changes =
    options.renumberWmdx === true || options.renumberMarkdown === true
    ? renumberOrderedListsAfterIndent(
        view.state.doc,
        indentChanges,
        options.isExcluded,
        {
          renumberMarkdown: options.renumberMarkdown === true,
          renumberWmdx: options.renumberWmdx === true
        }
      )
    : indentChanges;
  changes.sort((a, b) => a.from - b.from || a.to - b.to);
  if (changes.length) {
    const changeSet = view.state.changes(changes);
    view.dispatch({
      changes: changeSet,
      selection: view.state.selection.map(changeSet, 1)
    });
  }
  if (options.preserveKeyboard !== true) view.focus();
  return true;
}
