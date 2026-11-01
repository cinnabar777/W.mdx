const ROOT_LIST_MARKER = /^([-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;
const LIST_MARKER_PREFIX = /^([-+*]|\d+[.)])[ \t]+/;

function leadingWhitespace(lineText) {
  return /^[ \t]*/.exec(lineText)[0];
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

export function applyMarkdownIndent(view, direction, spaces = '  ') {
  if (!view?.state) return false;

  const changes = getMarkdownIndentChanges(
    view.state.doc,
    view.state.selection.main,
    direction,
    spaces
  );
  if (changes.length) {
    const changeSet = view.state.changes(changes);
    view.dispatch({
      changes: changeSet,
      selection: view.state.selection.map(changeSet, 1)
    });
  }
  view.focus();
  return true;
}
