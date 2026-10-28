import { syntaxTree } from '@codemirror/language';

const UNDERLINE_STYLE_MARKERS = Object.freeze({
  solid: '',
  dotted: '₀',
  dashed: '₁',
  double: '₂',
  wavy: '₃'
});
const UNDERLINE_CYCLE = Object.keys(UNDERLINE_STYLE_MARKERS);
let wmdxUnderlineSyntaxEnabled = false;

const WMDX_COLOR_GROUPS = Object.freeze({
  highlight: Object.freeze({
    delimiter: '==',
    colors: Object.freeze([
      ['yellow', ''],
      ['green', '₀'],
      ['pink', '₁'],
      ['blue', '₂']
    ])
  }),
  pen: Object.freeze({
    delimiter: '=',
    colors: Object.freeze([
      ['red', ''],
      ['green', '₀'],
      ['blue', '₁'],
      ['purple', '₂']
    ])
  })
});
const WMDX_COLOR_ACTION_IDS = Object.freeze(
  Object.entries(WMDX_COLOR_GROUPS).flatMap(([group, config]) =>
    config.colors.map(([color]) =>
      `${group}${color[0].toUpperCase()}${color.slice(1)}`
    )
  )
);

const MARKDOWN_FORMATS = {
  bold: { node: 'StrongEmphasis', open: '**', close: '**' },
  italic: { node: 'Emphasis', open: '*', close: '*' },
  strikethrough: { node: 'Strikethrough', open: '~~', close: '~~' },
  code: { node: 'InlineCode', open: '`', close: '`' },
  underline: { htmlTag: 'u', open: '<u>', close: '</u>' }
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

function colorActionId(group, color) {
  return `${group}${color[0].toUpperCase()}${color.slice(1)}`;
}

export function getWmdxColorSyntaxRanges(state, bounds = null) {
  if (!state) return [];
  const scanBounds = bounds
    ? expandedLineBounds(state, bounds.from, Math.max(bounds.from, bounds.to - 1))
    : { from: 0, to: state.doc.length };
  const scanFrom = scanBounds.from;
  const source = state.doc.sliceString(scanFrom, scanBounds.to);
  const code = codeRanges(state, scanBounds);
  const ranges = [];

  for (const [group, config] of Object.entries(WMDX_COLOR_GROUPS)) {
    const expressions = group === 'highlight'
      ? [/(?<![\\])==([₀₁₂]?)(?![₀₁₂]==)(\S(?:[^\n]*?\S)?)(?<![\\])==/gu]
      : [/(?<![=\\])=(?![=])([₀₁₂]?)(?![₀₁₂]=)(\S(?:[^\n]*?\S)?)(?<![\\])=(?![=])/gu];
    for (const expression of expressions) {
      let match;
      while ((match = expression.exec(source))) {
        const wrapperFrom = scanFrom + match.index;
        const wrapperTo = wrapperFrom + match[0].length;
        if (code.some(range => range.from < wrapperTo && range.to > wrapperFrom)) continue;
        const marker = match[1] ?? '';
        const color = config.colors.find(([, value]) => value === marker)?.[0];
        if (!color) continue;
        const open = `${config.delimiter}${marker}`;
        ranges.push({
          wrapperFrom,
          wrapperTo,
          contentFrom: wrapperFrom + open.length,
          contentTo: wrapperTo - config.delimiter.length,
          open,
          close: config.delimiter,
          group,
          color,
          marker,
          actionId: colorActionId(group, color),
          kind: 'color'
        });
      }
    }
  }
  return ranges.sort((a, b) => a.wrapperFrom - b.wrapperFrom);
}

export function setWmdxUnderlineSyntaxEnabled(enabled) {
  wmdxUnderlineSyntaxEnabled = Boolean(enabled);
}

export function isWmdxUnderlineSyntaxEnabled() {
  return wmdxUnderlineSyntaxEnabled;
}

export function getWmdxUnderlineSyntaxRanges(state, bounds = null) {
  if (!wmdxUnderlineSyntaxEnabled || !state) return [];
  const scanFrom = bounds?.from ?? 0;
  const scanTo = bounds?.to ?? state.doc.length;
  const source = state.doc.sliceString(scanFrom, scanTo);
  const code = codeRanges(state, bounds);
  const ranges = [];
  const expression = /(?<![\w\\])_([₀₁₂₃]?)(?![₀₁₂₃]_)(\S(?:[^\n]*?\S)?)_(?!\w)/gu;
  let match;
  while ((match = expression.exec(source))) {
    const wrapperFrom = scanFrom + match.index;
    const wrapperTo = wrapperFrom + match[0].length;
    if (code.some(range => range.from < wrapperTo && range.to > wrapperFrom)) continue;
    const style = Object.entries(UNDERLINE_STYLE_MARKERS)
      .find(([, marker]) => marker === match[1])?.[0] ?? 'solid';
    const open = `_${match[1]}`;
    ranges.push({
      wrapperFrom,
      wrapperTo,
      contentFrom: wrapperFrom + open.length,
      contentTo: wrapperTo - 1,
      open,
      close: '_',
      style,
      kind: 'wmdx'
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
  if (WMDX_COLOR_ACTION_IDS.includes(formatName)) {
    return getWmdxColorSyntaxRanges(state, bounds)
      .filter(range => range.actionId === formatName);
  }
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
    if (formatName === 'italic' && wmdxUnderlineSyntaxEnabled) {
      const customRanges = getWmdxUnderlineSyntaxRanges(state, scanBounds);
      return ranges.filter(range => !customRanges.some(custom =>
        custom.wrapperFrom === range.wrapperFrom &&
        custom.wrapperTo === range.wrapperTo
      ));
    }
    return ranges;
  }
  if (formatName === 'underline') {
    return [
      ...htmlFormatRanges(state, format, scanBounds).map(range => ({
        ...range,
        style: 'solid',
        kind: 'html'
      })),
      ...getWmdxUnderlineSyntaxRanges(state, scanBounds)
    ].sort((a, b) => a.wrapperFrom - b.wrapperFrom);
  }
  if (format.htmlTag) return htmlFormatRanges(state, format, scanBounds);
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
    const line = view.state.doc.lineAt(selection.head);
    const ranges = getMarkdownFormatRanges(view, formatName, {
      from: line.from,
      to: line.to
    });
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
  for (const actionId of WMDX_COLOR_ACTION_IDS) state[actionId] = false;
  state.highlightCycle = false;
  state.penCycle = false;
  for (const style of UNDERLINE_CYCLE) {
    state[`underline${style[0].toUpperCase()}${style.slice(1)}`] = false;
  }
  const selection = view.state.selection.main;
  if (!selection.empty) {
    for (const formatName of Object.keys(MARKDOWN_FORMATS)) {
      state[formatName] = isMarkdownFormatActive(view, formatName);
    }
    for (const range of getMarkdownFormatRanges(view, 'underline', {
      from: selection.from,
      to: selection.to
    })) {
      if (range.wrapperFrom <= selection.from && range.wrapperTo >= selection.to) {
        state.underline = true;
        const key = `underline${range.style[0].toUpperCase()}${range.style.slice(1)}`;
        state[key] = true;
      }
    }
    for (const range of getWmdxColorSyntaxRanges(view.state, {
      from: selection.from,
      to: selection.to
    })) {
      if (range.wrapperFrom <= selection.from && range.wrapperTo >= selection.to) {
        state[range.actionId] = true;
        state[`${range.group}Cycle`] = true;
      }
    }
    return state;
  }

  const line = view.state.doc.lineAt(selection.head);
  const bounds = { from: line.from, to: line.to };
  const customUnderlineRanges = getWmdxUnderlineSyntaxRanges(view.state, bounds);
  const tree = syntaxTree(view.state);
  for (const bias of [-1, 1]) {
    let node = tree.resolveInner(selection.head, bias);
    while (node) {
      for (const [formatName, format] of Object.entries(MARKDOWN_FORMATS)) {
        if (!format.node || node.name !== format.node) continue;
        const range = rangeFromSyntaxNode(view.state, node, format);
        if (formatName === 'italic' && customUnderlineRanges.some(custom =>
          custom.wrapperFrom === range?.wrapperFrom &&
          custom.wrapperTo === range?.wrapperTo
        )) continue;
        if (range && selection.head >= range.contentFrom && selection.head < range.contentTo) {
          state[formatName] = true;
        }
      }
      node = node.parent;
    }
  }

  for (const [formatName, format] of Object.entries(MARKDOWN_FORMATS)) {
    if (!format.htmlTag) continue;
    state[formatName] = htmlFormatRanges(view.state, format, bounds).some(range =>
      selection.head >= range.contentFrom && selection.head < range.contentTo
    );
  }
  for (const range of getWmdxColorSyntaxRanges(view.state, bounds)) {
    if (selection.head >= range.contentFrom && selection.head < range.contentTo) {
      state[range.actionId] = true;
      state[`${range.group}Cycle`] = true;
    }
  }
  const underline = getMarkdownFormatRanges(view, 'underline', bounds).find(range =>
    selection.head >= range.contentFrom && selection.head < range.contentTo
  );
  if (underline) {
    state.underline = true;
    const key = `underline${underline.style[0].toUpperCase()}${underline.style.slice(1)}`;
    state[key] = true;
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

function toggleMarkdownFormatInternal(view, formatName) {
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

function underlineDelimiters(style) {
  const marker = UNDERLINE_STYLE_MARKERS[style];
  return marker == null ? null : { open: `_${marker}`, close: '_' };
}

function wrapUnderlineSegment(text, style) {
  if (!style) return { text, contentStart: 0, contentLength: text.length };
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
  if (!core) return { text, contentStart: 0, contentLength: text.length };
  const delimiters = underlineDelimiters(style);
  return {
    text: `${leading}${delimiters.open}${core}${delimiters.close}${trailing}`,
    contentStart: leading.length + delimiters.open.length,
    contentLength: core.length
  };
}

function replaceUnderlineRange(view, range, selection, style) {
  const doc = view.state.doc;
  if (range.contentFrom === range.contentTo && selection.empty) {
    const delimiters = style ? underlineDelimiters(style) : null;
    const replacement = delimiters
      ? `${delimiters.open}${delimiters.close}`
      : '';
    const cursor = range.wrapperFrom + (delimiters ? delimiters.open.length : 0);
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: replacement },
      selection: { anchor: cursor, head: cursor }
    });
    view.focus();
    return true;
  }
  const oldText = doc.sliceString(range.contentFrom, range.contentTo);
  const selectedFrom = Math.max(selection.from, range.contentFrom);
  const selectedTo = Math.min(selection.to, range.contentTo);
  const hasSelection = selectedTo > selectedFrom;
  const leftText = hasSelection ? doc.sliceString(range.contentFrom, selectedFrom) : '';
  const selectedText = hasSelection
    ? doc.sliceString(selectedFrom, selectedTo)
    : oldText;
  const rightText = hasSelection ? doc.sliceString(selectedTo, range.contentTo) : '';
  const previousStyle = range.kind === 'wmdx' ? range.style : 'solid';
  const left = wrapUnderlineSegment(leftText, previousStyle);
  const selected = wrapUnderlineSegment(selectedText, style);
  const right = wrapUnderlineSegment(rightText, previousStyle);
  const replacement = left.text + selected.text + right.text;
  const anchorInSelection = hasSelection
    ? Math.max(0, Math.min(selectedText.length, selection.anchor - selectedFrom))
    : Math.max(0, Math.min(selectedText.length, selection.anchor - range.contentFrom));
  const headInSelection = hasSelection
    ? Math.max(0, Math.min(selectedText.length, selection.head - selectedFrom))
    : Math.max(0, Math.min(selectedText.length, selection.head - range.contentFrom));
  const newContentFrom = range.wrapperFrom + left.text.length + selected.contentStart;
  const anchor = style
    ? newContentFrom + anchorInSelection
    : range.wrapperFrom + left.text.length + anchorInSelection;
  const head = style
    ? newContentFrom + headInSelection
    : range.wrapperFrom + left.text.length + headInSelection;
  view.dispatch({
    changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: replacement },
    selection: { anchor, head }
  });
  view.focus();
  return true;
}

function emptyUnderlinePairAt(view, position) {
  const doc = view.state.doc;
  for (const style of UNDERLINE_CYCLE) {
    const { open, close } = underlineDelimiters(style);
    const wrapperFrom = position - open.length;
    if (
      wrapperFrom >= 0 &&
      doc.sliceString(wrapperFrom, position) === open &&
      doc.sliceString(position, position + close.length) === close
    ) {
      return {
        wrapperFrom,
        wrapperTo: position + close.length,
        contentFrom: position,
        contentTo: position,
        open,
        close,
        style,
        kind: 'wmdx'
      };
    }
  }
  return null;
}

export function toggleUnderlineFormat(view, action = 'cycle') {
  if (!view?.state) return false;
  if (!wmdxUnderlineSyntaxEnabled) {
    return toggleMarkdownFormatInternal(view, 'underline');
  }

  const isCycle = action === 'cycle';
  const requestedStyle = isCycle ? null : action;
  if (!isCycle &&
      !Object.prototype.hasOwnProperty.call(UNDERLINE_STYLE_MARKERS, requestedStyle)) {
    return false;
  }

  const selection = view.state.selection.main;
  const ranges = getMarkdownFormatRanges(view, 'underline');
  const current = ranges.find(range => selection.empty
    ? selection.head >= range.contentFrom && selection.head <= range.contentTo
    : selection.from >= range.contentFrom && selection.to <= range.contentTo
  ) || (selection.empty ? emptyUnderlinePairAt(view, selection.head) : null);
  let style = requestedStyle;
  if (isCycle) {
    if (!current) {
      style = 'solid';
    } else {
      const currentIndex = UNDERLINE_CYCLE.indexOf(current.style || 'solid');
      style = currentIndex >= UNDERLINE_CYCLE.length - 1
        ? null
        : UNDERLINE_CYCLE[currentIndex + 1];
    }
  } else if (current?.style === requestedStyle) {
    style = null;
  }

  if (current) return replaceUnderlineRange(view, current, selection, style);

  if (selection.empty) {
    const delimiters = underlineDelimiters(style || 'solid');
    const position = selection.head;
    const insertion = style
      ? `${delimiters.open}${delimiters.close}`
      : '';
    view.dispatch({
      changes: { from: position, to: position, insert: insertion },
      selection: {
        anchor: position + (style ? delimiters.open.length : 0),
        head: position + (style ? delimiters.open.length : 0)
      }
    });
    view.focus();
    return true;
  }

  const selectedText = view.state.doc.sliceString(selection.from, selection.to);
  const wrapped = wrapUnderlineSegment(selectedText, style);
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: wrapped.text },
    selection: {
      anchor: selection.from + wrapped.contentStart,
      head: selection.from + wrapped.contentStart + wrapped.contentLength
    }
  });
  view.focus();
  return true;
}

export function toggleMarkdownFormat(view, formatName) {
  if (formatName === 'underline') return toggleUnderlineFormat(view, 'cycle');
  return toggleMarkdownFormatInternal(view, formatName);
}

function colorDelimiters(group, color) {
  const config = WMDX_COLOR_GROUPS[group];
  const marker = config?.colors.find(([name]) => name === color)?.[1];
  return config && marker !== undefined
    ? { open: `${config.delimiter}${marker}`, close: config.delimiter }
    : null;
}

function wrapColorSegment(text, group, color) {
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
  if (!core || !color) {
    return { text, contentStart: 0, contentLength: text.length };
  }
  const delimiters = colorDelimiters(group, color);
  return {
    text: `${leading}${delimiters.open}${core}${delimiters.close}${trailing}`,
    contentStart: leading.length + delimiters.open.length,
    contentLength: core.length
  };
}

function emptyColorPairAt(view, group, position) {
  if (group !== 'highlight') return null;
  const doc = view.state.doc;
  for (const [color] of WMDX_COLOR_GROUPS[group].colors) {
    const { open, close } = colorDelimiters(group, color);
    const wrapperFrom = position - open.length;
    if (
      wrapperFrom >= 0 &&
      doc.sliceString(wrapperFrom, position) === open &&
      doc.sliceString(position, position + close.length) === close
    ) {
      return {
        wrapperFrom,
        wrapperTo: position + close.length,
        contentFrom: position,
        contentTo: position,
        open,
        close,
        group,
        color,
        actionId: colorActionId(group, color),
        kind: 'color'
      };
    }
  }
  return null;
}

function replaceWmdxColorRange(view, range, selection, color) {
  const doc = view.state.doc;
  if (range.contentFrom === range.contentTo && selection.empty) {
    const delimiters = color ? colorDelimiters(range.group, color) : null;
    const replacement = delimiters ? `${delimiters.open}${delimiters.close}` : '';
    const cursor = range.wrapperFrom + (delimiters ? delimiters.open.length : 0);
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: replacement },
      selection: { anchor: cursor, head: cursor }
    });
    view.focus();
    return true;
  }

  const oldText = doc.sliceString(range.contentFrom, range.contentTo);
  const selectedFrom = Math.max(selection.from, range.contentFrom);
  const selectedTo = Math.min(selection.to, range.contentTo);
  const hasSelection = selectedTo > selectedFrom;
  const leftText = hasSelection ? doc.sliceString(range.contentFrom, selectedFrom) : '';
  const selectedText = hasSelection
    ? doc.sliceString(selectedFrom, selectedTo)
    : oldText;
  const rightText = hasSelection ? doc.sliceString(selectedTo, range.contentTo) : '';
  const left = wrapColorSegment(leftText, range.group, range.color);
  const selected = wrapColorSegment(selectedText, range.group, color);
  const right = wrapColorSegment(rightText, range.group, range.color);
  const replacement = left.text + selected.text + right.text;
  const anchorInSelection = hasSelection
    ? Math.max(0, Math.min(selectedText.length, selection.anchor - selectedFrom))
    : Math.max(0, Math.min(selectedText.length, selection.anchor - range.contentFrom));
  const headInSelection = hasSelection
    ? Math.max(0, Math.min(selectedText.length, selection.head - selectedFrom))
    : Math.max(0, Math.min(selectedText.length, selection.head - range.contentFrom));
  const selectedContentFrom = range.wrapperFrom + left.text.length + selected.contentStart;
  const anchor = color
    ? selectedContentFrom + anchorInSelection
    : range.wrapperFrom + left.text.length + anchorInSelection;
  const head = color
    ? selectedContentFrom + headInSelection
    : range.wrapperFrom + left.text.length + headInSelection;

  view.dispatch({
    changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: replacement },
    selection: { anchor, head }
  });
  view.focus();
  return true;
}

export function toggleWmdxColorFormat(view, action = null) {
  if (!view?.state) return false;
  const selection = view.state.selection.main;
  let group = null;
  let requestedColor = null;
  let isCycle = false;
  if (action === 'highlightCycle' || action === 'penCycle') {
    group = action === 'highlightCycle' ? 'highlight' : 'pen';
    isCycle = true;
  } else if (action) {
    for (const candidate of Object.keys(WMDX_COLOR_GROUPS)) {
      if (!action.startsWith(candidate)) continue;
      group = candidate;
      requestedColor = WMDX_COLOR_GROUPS[candidate].colors
        .map(([color]) => color)
        .find(color => colorActionId(candidate, color) === action) ?? null;
      break;
    }
    if (!requestedColor) return false;
  }

  const ranges = getWmdxColorSyntaxRanges(view.state);
  const current = ranges.find(range =>
    (!group || range.group === group) && (selection.empty
      ? selection.head >= range.contentFrom && selection.head <= range.contentTo
      : selection.from >= range.contentFrom && selection.to <= range.contentTo)
  ) || (selection.empty && group
    ? emptyColorPairAt(view, group, selection.head)
    : null);

  if (!action) {
    if (!current) return false;
    return replaceWmdxColorRange(view, current, selection, null);
  }

  let color = requestedColor;
  if (isCycle) {
    const colors = WMDX_COLOR_GROUPS[group].colors.map(([name]) => name);
    if (!current) {
      color = colors[0];
    } else {
      const index = colors.indexOf(current.color);
      color = index >= colors.length - 1 ? null : colors[index + 1];
    }
  } else if (current?.color === requestedColor) {
    color = null;
  }

  if (current) return replaceWmdxColorRange(view, current, selection, color);
  if (selection.empty) {
    if (group !== 'highlight' || !color) return false;
    const delimiters = colorDelimiters(group, color);
    const position = selection.head;
    view.dispatch({
      changes: {
        from: position,
        to: position,
        insert: `${delimiters.open}${delimiters.close}`
      },
      selection: {
        anchor: position + delimiters.open.length,
        head: position + delimiters.open.length
      }
    });
    view.focus();
    return true;
  }

  const selectedText = view.state.doc.sliceString(selection.from, selection.to);
  const wrapped = wrapColorSegment(selectedText, group, color);
  if (wrapped.text === selectedText) return false;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: wrapped.text },
    selection: {
      anchor: selection.from + wrapped.contentStart,
      head: selection.from + wrapped.contentStart + wrapped.contentLength
    }
  });
  view.focus();
  return true;
}
