import { syntaxTree } from '@codemirror/language';

const MARKDOWN_FORMATS = {
  bold: { node: 'StrongEmphasis', open: '**', close: '**' },
  italic: { node: 'Emphasis', open: '*', close: '*' },
  strikethrough: { node: 'Strikethrough', open: '~~', close: '~~' },
  code: { node: 'InlineCode', open: '`', close: '`' },
  underline: { htmlTag: 'u', open: '<u>', close: '</u>' },
  yellowMarker: { marker: '==', open: '==', close: '==' },
  greenMarker: { marker: '==', open: '==', close: '==' },
  pinkMarker: { marker: '==', open: '==', close: '==' },
  blueMarker: { marker: '==', open: '==', close: '==' },
  redPen: { htmlTag: 'span', htmlColor: 'red', open: '<span style="color:red">', close: '</span>' },
  greenPen: { htmlTag: 'span', htmlColor: 'green', open: '<span style="color:green">', close: '</span>' }
};

function rangeFromSyntaxNode(state, node, format) {
  const raw = state.doc.sliceString(node.from, node.to);
  let open = format.open;
  let close = format.close;
  if (format.node === 'StrongEmphasis') {
    open = raw.startsWith('__') ? '__' : '**';
    close = open;
  } else if (format.node === 'Emphasis') {
    open = raw.startsWith('_') ? '_' : '*';
    close = open;
  } else if (format.node === 'InlineCode') {
    open = /^`+/.exec(raw)?.[0] ?? '`';
    close = open;
  }
  if (!raw.startsWith(open) || !raw.endsWith(close) || raw.length < open.length + close.length) {
    return null;
  }
  return {
    wrapperFrom: node.from,
    wrapperTo: node.to,
    contentFrom: node.from + open.length,
    contentTo: node.to - close.length,
    open,
    close
  };
}

function codeRanges(state, bounds = null) {
  const ranges = [];
  const tree = syntaxTree(state);
  tree.iterate({
    ...(bounds ? { from: bounds.from, to: bounds.to } : {}),
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode') {
        ranges.push({ from: node.from, to: node.to });
      }
    }
  });
  return ranges;
}

function isInsideRanges(position, ranges) {
  return ranges.some(range => position >= range.from && position < range.to);
}

function htmlFormatRanges(state, format, bounds = null) {
  const openings = [];
  const ranges = [];
  syntaxTree(state).iterate({
    ...(bounds ? { from: bounds.from, to: bounds.to } : {}),
    enter(node) {
      if (node.name !== 'HTMLTag') return;
      const source = state.doc.sliceString(node.from, node.to);
      const tag = /^<\s*(\/?)\s*([a-z][\w-]*)\b([^>]*)>/i.exec(source);
      if (!tag || tag[2].toLowerCase() !== format.htmlTag) return;
      if (!tag[1]) {
        let eligible = true;
        if (format.htmlColor) {
          const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(tag[3])?.[2] ?? '';
          const color = /\bcolor\s*:\s*([a-z]+)/i.exec(style)?.[1]?.toLowerCase();
          eligible = color === format.htmlColor;
        }
        openings.push({ from: node.from, to: node.to, eligible });
        return;
      }

      const opening = openings.pop();
      if (!opening?.eligible) return;
      ranges.push({
        wrapperFrom: opening.from,
        wrapperTo: node.to,
        contentFrom: opening.to,
        contentTo: node.from,
        open: state.doc.sliceString(opening.from, opening.to),
        close: source
      });
    }
  });
  return ranges;
}

function markerRanges(state, bounds = null) {
  const scanFrom = bounds?.from ?? 0;
  const scanTo = bounds?.to ?? state.doc.length;
  const source = state.doc.sliceString(scanFrom, scanTo);
  const code = codeRanges(state, bounds);
  const ranges = [];
  const expression = /==(\S(?:[^\n]*?\S)?)==/g;
  let match;
  while ((match = expression.exec(source))) {
    const absoluteFrom = scanFrom + match.index;
    if (isInsideRanges(absoluteFrom, code)) continue;
    const openLength = 2;
    const closeLength = 2;
    ranges.push({
      wrapperFrom: absoluteFrom,
      wrapperTo: absoluteFrom + match[0].length,
      contentFrom: absoluteFrom + openLength,
      contentTo: absoluteFrom + match[0].length - closeLength,
      open: '==',
      close: '=='
    });
  }
  return ranges;
}

function expandedLineBounds(state, from, to) {
  return {
    from: state.doc.lineAt(from).from,
    to: state.doc.lineAt(to).to
  };
}

export function getMarkdownFormatRanges(view, formatName, bounds = null) {
  const state = view?.state;
  const format = MARKDOWN_FORMATS[formatName];
  if (!state || !format) return [];

  const scanBounds = bounds
    ? expandedLineBounds(state, bounds.from, bounds.to)
    : null;
  if (format.node) {
    const ranges = [];
    syntaxTree(state).iterate({
      ...(scanBounds ? { from: scanBounds.from, to: scanBounds.to } : {}),
      enter(node) {
        if (node.name !== format.node) return;
        const range = rangeFromSyntaxNode(state, node, format);
        if (range) ranges.push(range);
      }
    });
    return ranges;
  }
  if (format.htmlTag) return htmlFormatRanges(state, format, scanBounds);
  if (format.marker) return markerRanges(state, scanBounds);
  return [];
}

function selectionIsCovered(selection, ranges) {
  let coveredTo = selection.from;
  const ordered = ranges
    .filter(range => range.wrapperTo > selection.from && range.wrapperFrom < selection.to)
    .sort((a, b) => a.wrapperFrom - b.wrapperFrom);
  for (const range of ordered) {
    if (range.wrapperFrom > coveredTo) return false;
    coveredTo = Math.max(coveredTo, range.wrapperTo);
    if (coveredTo >= selection.to) return true;
  }
  return coveredTo >= selection.to;
}

export function isMarkdownFormatActive(view, formatName) {
  if (!view?.state) return false;
  const selection = view.state.selection.main;
  if (selection.empty) {
    const tree = syntaxTree(view.state);
    const format = MARKDOWN_FORMATS[formatName];
    const ranges = [];
    if (format?.node) {
      for (const bias of [-1, 1]) {
        let node = tree.resolveInner(selection.head, bias);
        while (node) {
          if (node.name === format.node) {
            const range = rangeFromSyntaxNode(view.state, node, format);
            if (range) ranges.push(range);
          }
          node = node.parent;
        }
      }
    }
    ranges.push(...getMarkdownFormatRanges(view, formatName, {
      from: view.state.doc.lineAt(selection.head).from,
      to: view.state.doc.lineAt(selection.head).to
    }));
    return ranges.some(range =>
      selection.head >= range.contentFrom && selection.head < range.contentTo
    );
  }

  const ranges = getMarkdownFormatRanges(view, formatName, {
    from: selection.from,
    to: selection.to
  });
  return selectionIsCovered(selection, ranges);
}

export function getMarkdownFormattingState(view) {
  if (!view?.state) return {};
  const state = Object.fromEntries(
    Object.keys(MARKDOWN_FORMATS).map(formatName => [formatName, false])
  );
  const selection = view.state.selection.main;
  if (!selection.empty) {
    for (const formatName of Object.keys(MARKDOWN_FORMATS)) {
      state[formatName] = isMarkdownFormatActive(view, formatName);
    }
    return state;
  }

  const tree = syntaxTree(view.state);
  for (const bias of [-1, 1]) {
    let node = tree.resolveInner(selection.head, bias);
    while (node) {
      for (const [formatName, format] of Object.entries(MARKDOWN_FORMATS)) {
        if (!format.node || node.name !== format.node) continue;
        const range = rangeFromSyntaxNode(view.state, node, format);
        if (range && selection.head >= range.contentFrom && selection.head < range.contentTo) {
          state[formatName] = true;
        }
      }
      node = node.parent;
    }
  }

  const line = view.state.doc.lineAt(selection.head);
  const bounds = { from: line.from, to: line.to };
  for (const [formatName, format] of Object.entries(MARKDOWN_FORMATS)) {
    if (!format.htmlTag) continue;
    state[formatName] = htmlFormatRanges(view.state, format, bounds).some(range =>
      selection.head >= range.contentFrom && selection.head < range.contentTo
    );
  }
  const hasMarker = markerRanges(view.state, expandedLineBounds(view.state, line.from, line.to))
    .some(range => selection.head >= range.contentFrom && selection.head < range.contentTo);
  if (hasMarker) {
    for (const formatName of ['yellowMarker', 'greenMarker', 'pinkMarker', 'blueMarker']) {
      state[formatName] = true;
    }
  }
  return state;
}

function wrapSegment(text, open, close) {
  let leading = '';
  let trailing = '';
  let core = text;
  while (core && /\s/.test(core[0])) {
    leading += core[0];
    core = core.slice(1);
  }
  while (core && /\s/.test(core[core.length - 1])) {
    trailing = core[core.length - 1] + trailing;
    core = core.slice(0, -1);
  }
  return core ? `${leading}${open}${core}${close}${trailing}` : text;
}

function unwrapFormattedRange(view, range, selection, format) {
  const doc = view.state.doc;
  const selectedInsideContent =
    selection.from >= range.contentFrom &&
    selection.to <= range.contentTo;
  const selectsWholeWrapper =
    selection.from <= range.wrapperFrom &&
    selection.to >= range.wrapperTo;

  if (selectsWholeWrapper) {
    const content = doc.sliceString(range.contentFrom, range.contentTo);
    const insertAt = range.wrapperFrom;
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: content },
      selection: {
        anchor: insertAt,
        head: insertAt + content.length
      }
    });
    view.focus();
    return true;
  }

  if (selectedInsideContent && !selection.empty) {
    const left = doc.sliceString(range.contentFrom, selection.from);
    const selected = doc.sliceString(selection.from, selection.to);
    const right = doc.sliceString(selection.to, range.contentTo);
    const wrappedLeft = wrapSegment(left, range.open || format.open, range.close || format.close);
    const wrappedRight = wrapSegment(right, range.open || format.open, range.close || format.close);
    const insert = `${wrappedLeft}${selected}${wrappedRight}`;
    const selectedFrom = range.wrapperFrom + wrappedLeft.length;
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert },
      selection: {
        anchor: selectedFrom,
        head: selectedFrom + selected.length
      }
    });
    view.focus();
    return true;
  }

  if (selection.empty && selection.head >= range.contentFrom && selection.head <= range.contentTo) {
    const content = doc.sliceString(range.contentFrom, range.contentTo);
    const cursor = range.wrapperFrom + Math.min(selection.head - range.contentFrom, content.length);
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: content },
      selection: { anchor: cursor, head: cursor }
    });
    view.focus();
    return true;
  }

  return false;
}

function applyFormatToSelection(view, selection, ranges, format) {
  const doc = view.state.doc;
  const overlappingRanges = ranges.filter(range =>
    range.wrapperTo > selection.from && range.wrapperFrom < selection.to
  );
  const editFrom = Math.min(selection.from, ...overlappingRanges.map(range => range.wrapperFrom));
  const editTo = Math.max(selection.to, ...overlappingRanges.map(range => range.wrapperTo));
  const removals = [];
  for (const range of overlappingRanges) {
    if (range.contentFrom > range.wrapperFrom) {
      removals.push({ from: range.wrapperFrom, to: range.contentFrom });
    }
    if (range.wrapperTo > range.contentTo) {
      removals.push({ from: range.contentTo, to: range.wrapperTo });
    }
  }
  removals.sort((a, b) => a.from - b.from || a.to - b.to);
  const mergedRemovals = [];
  for (const removal of removals) {
    const previous = mergedRemovals[mergedRemovals.length - 1];
    if (previous && removal.from <= previous.to) {
      previous.to = Math.max(previous.to, removal.to);
    } else {
      mergedRemovals.push({ ...removal });
    }
  }

  const source = doc.sliceString(editFrom, editTo);
  let normalized = '';
  let sourceCursor = editFrom;
  for (const removal of mergedRemovals) {
    normalized += doc.sliceString(sourceCursor, removal.from);
    sourceCursor = removal.to;
  }
  normalized += doc.sliceString(sourceCursor, editTo);

  const mapToNormalized = position => {
    let mapped = position - editFrom;
    for (const removal of mergedRemovals) {
      if (removal.to <= position) {
        mapped -= removal.to - removal.from;
      } else if (removal.from < position) {
        mapped -= position - removal.from;
        break;
      } else {
        break;
      }
    }
    return mapped;
  };

  const desiredRanges = overlappingRanges.map(range => ({
    from: mapToNormalized(range.contentFrom),
    to: mapToNormalized(range.contentTo)
  }));
  desiredRanges.push({
    from: mapToNormalized(selection.from),
    to: mapToNormalized(selection.to)
  });
  desiredRanges.sort((a, b) => a.from - b.from || a.to - b.to);

  const mergedRanges = [];
  for (const range of desiredRanges) {
    const previous = mergedRanges[mergedRanges.length - 1];
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      mergedRanges.push({ ...range });
    }
  }

  for (const range of mergedRanges) {
    while (range.from < range.to && /\s/.test(normalized[range.from])) range.from++;
    while (range.to > range.from && /\s/.test(normalized[range.to - 1])) range.to--;
  }
  const nonEmptyRanges = mergedRanges.filter(range => range.from < range.to);

  let replacement = '';
  let normalizedCursor = 0;
  for (const range of nonEmptyRanges) {
    replacement += normalized.slice(normalizedCursor, range.from);
    replacement += `${format.open}${normalized.slice(range.from, range.to)}${format.close}`;
    normalizedCursor = range.to;
  }
  replacement += normalized.slice(normalizedCursor);

  const mapToOutput = (position, assoc) => {
    let mapped = position;
    for (const range of nonEmptyRanges) {
      const wrapperLength = format.open.length + format.close.length;
      if (range.to < position || (range.to === position && assoc > 0)) {
        mapped += wrapperLength;
      } else if (range.to === position && assoc < 0) {
        mapped += format.open.length;
      } else if (range.from < position && position < range.to) {
        mapped += format.open.length;
      } else if (range.from === position && assoc > 0) {
        mapped += format.open.length;
      } else if (range.from > position) {
        break;
      }
    }
    return mapped;
  };

  const selectedFrom = mapToNormalized(selection.from);
  const selectedTo = mapToNormalized(selection.to);
  view.dispatch({
    changes: { from: editFrom, to: editTo, insert: replacement },
    selection: {
      anchor: editFrom + mapToOutput(selectedFrom, 1),
      head: editFrom + mapToOutput(selectedTo, -1)
    }
  });
  view.focus();
  return true;
}

export function toggleMarkdownFormat(view, formatName) {
  if (!view?.state) return false;
  const format = MARKDOWN_FORMATS[formatName];
  if (!format || !format.open || !format.close) return false;

  const selection = view.state.selection.main;
  const doc = view.state.doc;
  const ranges = getMarkdownFormatRanges(view, formatName);

  if (selection.empty) {
    const containingRange = ranges.find(range =>
      selection.head >= range.contentFrom && selection.head <= range.contentTo
    );
    if (containingRange && unwrapFormattedRange(view, containingRange, selection, format)) {
      return true;
    }

    const before = doc.sliceString(Math.max(0, selection.head - format.open.length), selection.head);
    const after = doc.sliceString(selection.head, Math.min(doc.length, selection.head + format.close.length));
    if (before === format.open && after === format.close) {
      const from = selection.head - format.open.length;
      const to = selection.head + format.close.length;
      view.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from, head: from }
      });
    } else {
      view.dispatch({
        changes: { from: selection.head, to: selection.head, insert: `${format.open}${format.close}` },
        selection: {
          anchor: selection.head + format.open.length,
          head: selection.head + format.open.length
        }
      });
    }
    view.focus();
    return true;
  }

  const containingRange = ranges.find(range =>
    selection.from >= range.wrapperFrom &&
    selection.to <= range.wrapperTo
  );
  if (containingRange && unwrapFormattedRange(view, containingRange, selection, format)) {
    return true;
  }

  if (selectionIsCovered(selection, ranges)) {
    const activeRange = ranges.find(range =>
      selection.from >= range.wrapperFrom &&
      selection.to <= range.wrapperTo
    );
    if (activeRange && unwrapFormattedRange(view, activeRange, selection, format)) {
      return true;
    }
  }

  if (ranges.some(range =>
    range.wrapperTo > selection.from && range.wrapperFrom < selection.to
  )) {
    return applyFormatToSelection(view, selection, ranges, format);
  }

  const selectedText = doc.sliceString(selection.from, selection.to);
  const leading = selectedText.match(/^\s*/)?.[0] ?? '';
  const trailing = selectedText.match(/\s*$/)?.[0] ?? '';
  const core = selectedText.slice(leading.length, selectedText.length - trailing.length);
  if (!core) return false;

  const replacement = `${leading}${format.open}${core}${format.close}${trailing}`;
  const selectedFrom = selection.from + leading.length + format.open.length;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: replacement },
    selection: {
      anchor: selectedFrom,
      head: selectedFrom + core.length
    }
  });
  view.focus();
  return true;
}
