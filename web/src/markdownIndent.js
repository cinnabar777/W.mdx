import {
  getMarkdownOrderedListMarkerChanges,
  getWmdxOrderedListMarkerChanges,
  parseMarkdownOrderedListMarker,
  parseWmdxOrderedListMarker
} from './listSyntax.mjs';
import { syntaxTree } from '@codemirror/language';

const ROOT_LIST_MARKER = /^([-+*]|(?:\d+|[A-Za-z]+)[.)]|\[[ xX]\])[ \t]+(?:\[[ xX]\][ \t]+)?/;
const LIST_MARKER_PREFIX = /^([-+*]|(?:\d+|[A-Za-z]+)[.)]|\[[ xX]\])[ \t]+/;

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

export function getMarkdownSourceIndentRanges(lineText) {
  const source = String(lineText ?? '');
  const ranges = [];
  let index = 0;

  while (source[index] === ' ' || source[index] === '\t') index += 1;
  if (index > 0) ranges.push({ from: 0, to: index });

  while (source[index] === '>') {
    index += 1;
    const separatorStart = index;
    while (source[index] === ' ' || source[index] === '\t') index += 1;
    if (source[index] === '>') continue;

    const hideFrom = separatorStart + Math.min(index - separatorStart, 1);
    if (index > hideFrom) ranges.push({ from: hideFrom, to: index });
    break;
  }

  return ranges;
}

function indentationWidth(value) {
  let width = 0;
  for (const character of value) {
    width = character === '\t' ? width + (4 - (width % 4)) : width + 1;
  }
  return width;
}

export function getMarkdownIndentSpaces(value) {
  return String(value ?? '1').trim() === '2' ? '  ' : ' ';
}

export function getMarkdownSourceLineLayout(lineText) {
  const source = String(lineText ?? '');
  if (!source.trim()) return null;

  const leading = leadingWhitespace(source);
  const leadingWidth = indentationWidth(leading);
  const rest = source.slice(leading.length);
  const quotePrefix = /^(?:>[ \t]*)+/.exec(rest)?.[0] ?? '';
  const afterQuote = rest.slice(quotePrefix.length);
  const listPrefix =
    /^(?:[-+*]|\d+[.)]|[A-Za-z]+[.)]|\[[ xX]\])(?:[ \t]+\[[ xX]\])?[ \t]+/.exec(afterQuote)?.[0] ??
    '';

  if (listPrefix) {
    return {
      kind: 'list',
      contentOffsetColumns: indentationWidth(leading + quotePrefix + listPrefix)
    };
  }
  if (quotePrefix) {
    return {
      kind: 'quote',
      contentOffsetColumns: indentationWidth(leading + quotePrefix)
    };
  }
  if (leadingWidth > 0) {
    return {
      kind: 'paragraph',
      contentOffsetColumns: leadingWidth
    };
  }
  return null;
}

export function getMarkdownSourceLineLayoutForState(state, lineNumber) {
  if (!state?.doc || !Number.isInteger(lineNumber)) return null;
  const line = state.doc.line(lineNumber);
  const directLayout = getMarkdownSourceLineLayout(line.text);
  if (!line.text.trim()) return directLayout;

  const firstTextOffset = line.text.search(/\S/);
  if (firstTextOffset < 0) return null;
  for (
    let node = syntaxTree(state).resolveInner(line.from + firstTextOffset, 1);
    node;
    node = node.parent
  ) {
    if (node.name !== 'ListItem') continue;
    const firstItemLine = state.doc.lineAt(node.from);
    if (line.number <= firstItemLine.number) return null;
    const itemLayout = getMarkdownSourceLineLayout(firstItemLine.text);
    if (itemLayout?.kind !== 'list' || directLayout?.kind === 'list') {
      return directLayout;
    }
    const additionalIndent = directLayout?.kind === 'paragraph'
      ? directLayout.contentOffsetColumns
      : 0;
    return {
      kind: 'list-continuation',
      contentOffsetColumns:
        itemLayout.contentOffsetColumns + additionalIndent
    };
  }
  return directLayout;
}

export function getIndentedCodeBlockRenderLayout(state, blockFrom, blockTo) {
  const doc = state?.doc;
  if (!doc || !Number.isInteger(blockFrom) || !Number.isInteger(blockTo)) {
    return { hiddenRanges: [], commonIndentColumns: 0 };
  }

  let matchingCodeBlock = false;
  const codeTextRanges = [];
  syntaxTree(state).iterate({
    from: blockFrom,
    to: blockTo,
    enter(node) {
      if (
        node.name === 'CodeBlock' &&
        node.from === blockFrom &&
        node.to === blockTo
      ) {
        matchingCodeBlock = true;
      }
      if (node.name === 'CodeText') {
        codeTextRanges.push({ from: node.from, to: node.to });
      }
    }
  });
  if (!matchingCodeBlock) {
    return { hiddenRanges: [], commonIndentColumns: 0 };
  }

  const hiddenRanges = [];
  const textLines = new Map();
  const seenLineStarts = new Set();
  for (const child of codeTextRanges) {
    if (child.to <= child.from) continue;
    const firstLine = doc.lineAt(child.from).number;
    const lastLine = doc.lineAt(child.to - 1).number;
    for (let number = firstLine; number <= lastLine; number += 1) {
      const line = doc.line(number);
      if (seenLineStarts.has(line.from)) continue;
      seenLineStarts.add(line.from);
      const contentFrom = Math.max(line.from, child.from);
      if (contentFrom <= line.from) continue;
      const prefix = doc.sliceString(line.from, contentFrom);
      if (/^[ \t]+$/.test(prefix)) {
        hiddenRanges.push({ from: line.from, to: contentFrom });
      }
      let leadingSpaces = 0;
      while (
        contentFrom + leadingSpaces < line.to &&
        doc.sliceString(
          contentFrom + leadingSpaces,
          contentFrom + leadingSpaces + 1
        ) === ' '
      ) {
        leadingSpaces += 1;
      }
      if (
        leadingSpaces > 0 &&
        doc.sliceString(contentFrom + leadingSpaces, line.to).trim()
      ) {
        textLines.set(line.from, {
          from: contentFrom,
          leadingSpaces
        });
      }
    }
  }

  const commonIndentColumns = textLines.size
    ? Math.min(...[...textLines.values()].map(line => line.leadingSpaces))
    : 0;
  if (commonIndentColumns > 0) {
    for (const line of textLines.values()) {
      hiddenRanges.push({
        from: line.from,
        to: line.from + commonIndentColumns
      });
    }
  }

  hiddenRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  const mergedRanges = [];
  for (const range of hiddenRanges) {
    const previous = mergedRanges[mergedRanges.length - 1];
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      mergedRanges.push({ ...range });
    }
  }
  return { hiddenRanges: mergedRanges, commonIndentColumns };
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

function getSelectedListItemBlock(selectedLines) {
  const nonBlankLines = selectedLines.filter(({ line }) => line.text.trim());
  const root = nonBlankLines[0];
  if (!root?.info) return null;

  const rootIndent = root.info.indentWidth;
  let currentIndent = rootIndent;
  for (const { line, info } of nonBlankLines.slice(1)) {
    if (info) {
      if (info.indentWidth < rootIndent) return null;
      currentIndent = info.indentWidth;
    } else {
      const lineIndent = indentationWidth(leadingWhitespace(line.text));
      if (lineIndent <= currentIndent) return null;
    }
  }

  return root;
}

export function getMarkdownIndentTargetSelection(doc, selection, paragraphRange) {
  if (!doc || !selection || !paragraphRange) return selection;
  const isCollapsed = selection.empty ?? selection.from === selection.to;
  if (!isCollapsed) return selection;

  const firstLine = doc.line(paragraphRange.first);
  const lastLine = doc.line(paragraphRange.last);
  if (!firstLine || !lastLine) return selection;
  return { from: firstLine.from, to: lastLine.to };
}

export function getMarkdownListItemLineRange(state, position) {
  if (!state?.doc || !Number.isFinite(position)) return null;
  for (
    let node = syntaxTree(state).resolveInner(position, 1);
    node;
    node = node.parent
  ) {
    if (node.name !== 'ListItem') continue;
    const lastPosition = Math.max(node.from, node.to - 1);
    return {
      first: state.doc.lineAt(node.from).number,
      last: state.doc.lineAt(lastPosition).number
    };
  }
  return null;
}

export function getWmdxOrderedListItemLineRange(doc, position, items = []) {
  if (!doc || !Number.isFinite(position) || !items.length) return null;
  const itemsByLine = new Map(
    items.map(item => [item.line.number, item])
  );
  const cursorLine = doc.lineAt(position);
  let currentItem = itemsByLine.get(cursorLine.number);

  if (!currentItem) {
    const cursorIndent = indentationWidth(leadingWhitespace(cursorLine.text));
    for (let number = cursorLine.number - 1; number >= 1; number -= 1) {
      const line = doc.line(number);
      if (!line.text.trim()) break;
      const candidate = itemsByLine.get(number);
      if (candidate) {
        if (cursorIndent > candidate.indent) currentItem = candidate;
        break;
      }
      if (indentationWidth(leadingWhitespace(line.text)) <= cursorIndent) {
        break;
      }
    }
  }
  if (!currentItem) return null;

  let last = currentItem.line.number;
  let pendingBlankStart = null;
  for (
    let number = currentItem.line.number + 1;
    number <= doc.lines;
    number += 1
  ) {
    const line = doc.line(number);
    if (!line.text.trim()) {
      pendingBlankStart ??= number;
      continue;
    }

    const nextItem = itemsByLine.get(number);
    if (nextItem) {
      if (nextItem.indent <= currentItem.indent) break;
    } else if (
      indentationWidth(leadingWhitespace(line.text)) <= currentItem.indent
    ) {
      break;
    }

    if (pendingBlankStart !== null) {
      last = number - 1;
      pendingBlankStart = null;
    }
    last = number;
  }

  return {
    first: currentItem.line.number,
    last
  };
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

  if (!isListBlock) {
    const itemBlock = getSelectedListItemBlock(selectedListLines);
    if (itemBlock) {
      if (direction === 'indent') {
        const parent = findPreviousListSibling(
          doc,
          itemBlock.number,
          itemBlock.info
        );
        if (!parent) return changes;

        const indentBy = parent.markerWidth;
        for (const { line } of selectedLines) {
          changes.push({
            from: line.from,
            to: line.from,
            insert: ' '.repeat(indentBy)
          });
        }
        return changes;
      }

      if (itemBlock.info.indentWidth > 0) {
        const removeWidth = getOutdentWidth(
          doc,
          itemBlock.number,
          itemBlock.info,
          spaces
        );
        for (const { line } of selectedLines) {
          const leading = leadingWhitespace(line.text);
          const removeLength = leadingWhitespaceLengthForWidth(
            leading,
            removeWidth
          );
          if (removeLength > 0) {
            changes.push({
              from: line.from,
              to: line.from + removeLength,
              insert: ''
            });
          }
        }
        return changes;
      }
    }
  }

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
    options.selection ?? view.state.selection.main,
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
