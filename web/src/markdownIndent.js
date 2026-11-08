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

const ORDERED_ITEM_REGEX = /^(\s*)(\d+)([.)])(\s+(?:\[[ xX]\]\s+)?)(.*)$/;

export function renumberOrderedListLines(lines) {
  const stack = [];
  const result = [];

  for (const line of lines) {
    const match = line.match(ORDERED_ITEM_REGEX);
    if (!match) {
      if (!line.trim()) {
        result.push(line);
        continue;
      }
      const indentMatch = line.match(/^(\s*)/);
      const indentLen = indentMatch ? indentMatch[1].length : 0;
      while (stack.length > 0 && stack[stack.length - 1].indent >= indentLen) {
        stack.pop();
      }
      result.push(line);
      continue;
    }

    const [_, leadingSpace, numStr, delim, postMarker, content] = match;
    const indentLen = leadingSpace.length;

    while (stack.length > 0 && stack[stack.length - 1].indent > indentLen) {
      stack.pop();
    }

    if (stack.length === 0 || stack[stack.length - 1].indent < indentLen) {
      const isSublist = stack.length > 0;
      const initialNum = isSublist ? 1 : parseInt(numStr, 10);
      stack.push({ indent: indentLen, currentNum: initialNum });
      result.push(`${leadingSpace}${initialNum}${delim}${postMarker}${content}`);
      stack[stack.length - 1].currentNum++;
    } else {
      const currentLevel = stack[stack.length - 1];
      result.push(`${leadingSpace}${currentLevel.currentNum}${delim}${postMarker}${content}`);
      currentLevel.currentNum++;
    }
  }

  return result;
}

function isListOrContinuationLine(lineText) {
  if (!lineText.trim()) return false;
  return ROOT_LIST_MARKER.test(lineText.trimStart()) || /^\s+/.test(lineText);
}

export function getMarkdownIndentChanges(doc, selection, direction, spaces = '  ') {
  if (!doc || !selection || !['indent', 'outdent'].includes(direction)) return [];

  const initialChanges = [];
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
    if (!parent) return initialChanges;

    const indentBy = parent.markerWidth;
    for (const { line } of selectedLines) {
      initialChanges.push({ from: line.from, to: line.from, insert: ' '.repeat(indentBy) });
    }
  } else {
    for (const { number, line } of selectedLines) {
      if (direction === 'indent') {
        initialChanges.push({ from: line.from, to: line.from, insert: spaces });
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
        initialChanges.push({
          from: line.from,
          to: line.from + removeLength,
          insert: ''
        });
        continue;
      }

      const listMarker = ROOT_LIST_MARKER.exec(line.text);
      if (listMarker) {
        initialChanges.push({
          from: line.from,
          to: line.from + listMarker[0].length,
          insert: ''
        });
      }
    }
  }

  if (initialChanges.length === 0) return initialChanges;

  const totalLines = doc.lines || (doc.lineAt(doc.length).number);
  let blockStart = first;
  while (blockStart > 1 && isListOrContinuationLine(doc.line(blockStart - 1).text)) {
    blockStart--;
  }
  let blockEnd = last;
  while (blockEnd < totalLines && isListOrContinuationLine(doc.line(blockEnd + 1).text)) {
    blockEnd++;
  }

  const blockLines = [];
  for (let num = blockStart; num <= blockEnd; num++) {
    const line = doc.line(num);
    const lineChange = initialChanges.find(c => c.from >= line.from && c.to <= line.to);
    let lineText = line.text;
    if (lineChange) {
      const relFrom = lineChange.from - line.from;
      const relTo = lineChange.to - line.from;
      lineText = lineText.slice(0, relFrom) + lineChange.insert + lineText.slice(relTo);
    }
    blockLines.push(lineText);
  }

  const hasOrdered = blockLines.some(l => ORDERED_ITEM_REGEX.test(l));
  if (!hasOrdered) {
    return initialChanges;
  }

  const renumbered = renumberOrderedListLines(blockLines);

  const finalChanges = [];
  for (let i = 0; i < blockLines.length; i++) {
    const lineNum = blockStart + i;
    const origLine = doc.line(lineNum);
    const nextText = renumbered[i];
    if (origLine.text !== nextText) {
      finalChanges.push({
        from: origLine.from,
        to: origLine.to,
        insert: nextText
      });
    }
  }

  return finalChanges;
}

export function applyMarkdownIndent(view, direction, spaces = '  ', options = {}) {
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
  if (options.preserveKeyboard !== true) view.focus();
  return true;
}
