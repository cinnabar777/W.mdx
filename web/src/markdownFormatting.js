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

export function getWmdxUnderlineSyntaxDelimiterRanges(range) {
  if (!range || range.kind !== 'wmdx') return [];
  return [
    { from: range.wrapperFrom, to: range.contentFrom },
    { from: range.contentTo, to: range.wrapperTo }
  ].filter(delimiter => delimiter.to > delimiter.from);
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

function focusEditor(view, options = {}) {
  if (options.preserveKeyboard === true) return;
  view?.focus?.();
}

function unwrapFormattedRange(view, range, selection, format, options = {}) {
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
    focusEditor(view, options);
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
    focusEditor(view, options);
    return true;
  }

  if (selection.empty && selection.head >= range.contentFrom && selection.head <= range.contentTo) {
    const content = doc.sliceString(range.contentFrom, range.contentTo);
    const cursor = range.wrapperFrom + Math.min(selection.head - range.contentFrom, content.length);
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: content },
      selection: { anchor: cursor, head: cursor }
    });
    focusEditor(view, options);
    return true;
  }

  return false;
}

function getInlineFormattingRanges(view, bounds) {
  const ranges = Object.keys(MARKDOWN_FORMATS).flatMap(formatName =>
    getMarkdownFormatRanges(view, formatName, bounds)
  );
  ranges.push(...getWmdxColorSyntaxRanges(view.state, bounds));

  const seen = new Set();
  return ranges.filter(range => {
    const key = `${range.wrapperFrom}:${range.wrapperTo}:${range.open}:${range.close}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function stripMarkdownInline(text) {
  let res = text;
  // images ![alt](url) -> alt, ![[file|alt]] -> alt or file
  res = res.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, f, a) => a || f || '');
  res = res.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // links [[file|alias]] -> alias or file, [text](url) -> text
  res = res.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, f, a) => a || f || '');
  res = res.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // footnotes [^1]
  res = res.replace(/\[\^[^\]]+\]/g, '');

  for (let i = 0; i < 6; i++) {
    const prev = res;
    res = res.replace(/(?<!\w)(\*\*\*|___)(.*?)\1(?!\w)/g, '$2');
    res = res.replace(/(?<!\w)(\*\*|__)(.*?)\1(?!\w)/g, '$2');
    res = res.replace(/(?<!\w)(\*|_)(.*?)\1(?!\w)/g, '$2');
    res = res.replace(/~~(.*?)~~/g, '$1');
    res = res.replace(/==[₀₁₂]?(.*?)==/gu, '$1');
    res = res.replace(/(?<![=\w])=[₀₁₂]?([^=\n]+)=(?![=\w])/gu, '$1');
    res = res.replace(/(?<![\w])_[₀₁₂₃]?([^_\n]+)_(?![\w])/gu, '$1');
    res = res.replace(/`+([^`]+)`+/g, '$1');
    res = res.replace(/\$\$?([^\$]+)\$\$?/g, '$1');
    res = res.replace(/<\/?(?:u|b|i|em|strong|mark|span|p|div|code|pre|del|s)[^>]*>/gi, '');
    if (res === prev) break;
  }
  return res;
}

export function stripLineBlockPrefixes(lineText) {
  let text = lineText;
  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(text)) {
    return '';
  }
  if (/^\s*(`{3,}|~{3,})[\w-]*\s*$/.test(text)) {
    return '';
  }
  while (/^\s*>+\s*/.test(text)) {
    text = text.replace(/^\s*>+\s*/, '');
    text = text.replace(/^\[![^\]]+\][-+]?\s*/i, '');
  }
  text = text.replace(/^#{1,6}\s+/, '');
  text = text.replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '');
  return text;
}

export function stripMarkdownFormatting(text) {
  const lines = text.split('\n');
  return lines.map(line => stripMarkdownInline(stripLineBlockPrefixes(line))).join('\n');
}

export function stripTableCellFormatting(cellText) {
  const lines = cellText.split(/<br\s*\/?>|\n/gi);
  return lines.map(line => stripMarkdownInline(stripLineBlockPrefixes(line))).join('<br>');
}

function getCursorTargetLines(state, pos) {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const tree = syntaxTree(state);

  let nextLine = line.number < doc.lines ? doc.line(line.number + 1) : null;
  if (nextLine && /^\s*(=+|-+)\s*$/.test(nextLine.text)) {
    return { from: line.from, to: nextLine.to, isSetext: true };
  }
  let prevLine = line.number > 1 ? doc.line(line.number - 1) : null;
  if (prevLine && /^\s*(=+|-+)\s*$/.test(line.text)) {
    return { from: prevLine.from, to: line.to, isSetext: true };
  }

  let targetNode = null;
  for (const bias of [-1, 1]) {
    let node = tree.resolveInner(pos, bias);
    while (node && node.name !== 'Document') {
      if (
        node.name === 'ListItem' ||
        node.name === 'Paragraph' ||
        node.name.startsWith('ATXHeading') ||
        node.name.startsWith('SetextHeading') ||
        node.name === 'FencedCode' ||
        node.name === 'HorizontalRule'
      ) {
        targetNode = node;
        break;
      }
      if (node.name === 'Blockquote') {
        targetNode = node;
      }
      node = node.parent;
    }
    if (targetNode) break;
  }

  if (targetNode) {
    const fromLine = doc.lineAt(targetNode.from);
    const toLine = doc.lineAt(targetNode.to);
    return { from: fromLine.from, to: toLine.to };
  }
  return { from: line.from, to: line.to };
}

export function clearMarkdownFormatting(view, options = {}) {
  // Check if an active table cell editor overlay is open
  if (typeof document !== 'undefined') {
    const activeOverlay = document.querySelector('.cm-wp-cell-editor');
    if (activeOverlay && activeOverlay._cellMeta) {
      const selStart = activeOverlay.selectionStart ?? 0;
      const selEnd = activeOverlay.selectionEnd ?? 0;
      const cellVal = activeOverlay.value || '';
      let newVal = cellVal;
      let newStart = selStart;
      let newEnd = selEnd;

      if (selStart !== selEnd) {
        const selected = cellVal.substring(selStart, selEnd);
        const cleaned = stripMarkdownInline(selected);
        if (cleaned !== selected) {
          newVal = cellVal.substring(0, selStart) + cleaned + cellVal.substring(selEnd);
          newStart = selStart;
          newEnd = selStart + cleaned.length;
        }
      } else {
        const cleaned = stripTableCellFormatting(cellVal);
        if (cleaned !== cellVal) {
          newVal = cleaned;
          newStart = cleaned.length;
          newEnd = cleaned.length;
        }
      }

      if (newVal !== cellVal) {
        activeOverlay.value = newVal;
        activeOverlay.setSelectionRange(newStart, newEnd);
        if (activeOverlay._cellMeta && activeOverlay._cellMeta.model) {
          const meta = activeOverlay._cellMeta;
          meta.model.rows[meta.row][meta.col] = newVal.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
        }
        return true;
      }
      return false;
    }
  }

  // Check if active table cell is selected in table widget
  if (typeof window !== 'undefined' && window.wmdxTableActions?.active) {
    const activeTable = window.wmdxTableActions.active;
    const bridgeContext = window.wmdxTableActions.context;
    if (activeTable.view === view && bridgeContext && bridgeContext.owner) {
      const widget = bridgeContext.owner._tableWidget || bridgeContext.owner.__tableWidget;
      // Also check _lastActiveCellSelection
      if (window._lastActiveCellSelection && window._lastActiveCellSelection.model) {
        const snap = window._lastActiveCellSelection;
        const oldVal = snap.model.rows[snap.row][snap.col] || '';
        const cleaned = stripTableCellFormatting(oldVal);
        if (cleaned !== oldVal) {
          snap.model.rows[snap.row][snap.col] = cleaned;
          snap.widget?.commitTableChange?.();
          snap.widget?.renderTableCells?.();
          return true;
        }
      }
    }
  }

  if (!view?.state) return false;

  const originalState = view.state;
  let workingState = originalState;
  let combinedChanges = originalState.changes();
  let changed = false;
  const workingView = {
    get state() {
      return workingState;
    },
    dispatch(spec) {
      const transaction = workingState.update(spec);
      combinedChanges = combinedChanges.compose(transaction.changes);
      workingState = transaction.state;
      changed = true;
    },
    focus() {}
  };

  // Step 1: Unwrap standard inline formatting using existing tree-aware logic
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const selection = workingState.selection.main;
    const bounds = { from: selection.from, to: selection.to };
    const ranges = getInlineFormattingRanges(workingView, bounds)
      .filter(range => selection.empty
        ? selection.head >= range.contentFrom && selection.head <= range.contentTo
        : range.wrapperTo > selection.from && range.wrapperFrom < selection.to)
      .sort((first, second) =>
        (first.wrapperTo - first.wrapperFrom) - (second.wrapperTo - second.wrapperFrom) ||
        second.wrapperFrom - first.wrapperFrom
      );

    let unwrapped = false;
    for (const range of ranges) {
      if (unwrapFormattedRange(
        workingView,
        range,
        selection,
        { open: range.open, close: range.close },
        options
      )) {
        unwrapped = true;
        break;
      }
    }
    if (!unwrapped) break;
  }

  // Step 2: Clear any remaining inline formatting and block markers
  const currSelection = workingState.selection.main;
  const doc = workingState.doc;

  if (!currSelection.empty) {
    const fromLine = doc.lineAt(currSelection.from);
    const toLine = doc.lineAt(currSelection.to);

    // If selection is partial inside a single line
    if (fromLine.number === toLine.number && (currSelection.from > fromLine.from || currSelection.to < fromLine.to)) {
      const selectedText = doc.sliceString(currSelection.from, currSelection.to);
      const cleaned = stripMarkdownInline(selectedText);
      if (cleaned !== selectedText) {
        workingView.dispatch({
          changes: { from: currSelection.from, to: currSelection.to, insert: cleaned },
          selection: { anchor: currSelection.from, head: currSelection.from + cleaned.length }
        });
      }
    } else {
      // Selection spans the entire line or multiple lines
      const targetFrom = fromLine.from;
      const targetTo = toLine.to;
      const lines = [];
      for (let n = fromLine.number; n <= toLine.number; n++) {
        lines.push(stripMarkdownInline(stripLineBlockPrefixes(doc.line(n).text)));
      }
      const cleaned = lines.join('\n');
      const oldText = doc.sliceString(targetFrom, targetTo);
      if (cleaned !== oldText) {
        workingView.dispatch({
          changes: { from: targetFrom, to: targetTo, insert: cleaned },
          selection: { anchor: targetFrom, head: targetFrom + cleaned.length }
        });
      }
    }
  } else {
    // Caret only: clear the enclosing line/paragraph/block
    const target = getCursorTargetLines(workingState, currSelection.head);
    const fromLine = doc.lineAt(target.from);
    const toLine = doc.lineAt(target.to);
    const lines = [];
    for (let n = fromLine.number; n <= toLine.number; n++) {
      const lText = doc.line(n).text;
      if (target.isSetext && /^\s*(=+|-+)\s*$/.test(lText)) {
        continue;
      }
      lines.push(stripMarkdownInline(stripLineBlockPrefixes(lText)));
    }
    const cleaned = lines.join('\n');
    const oldText = doc.sliceString(target.from, target.to);
    if (cleaned !== oldText) {
      workingView.dispatch({
        changes: { from: target.from, to: target.to, insert: cleaned },
        selection: { anchor: target.from + cleaned.length, head: target.from + cleaned.length }
      });
    }
  }

  if (!changed) return false;
  view.dispatch({
    changes: combinedChanges,
    selection: workingState.selection
  });
  focusEditor(view, options);
  return true;
}

function applyFormatToSelection(view, selection, ranges, format, options = {}) {
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
  focusEditor(view, options);
  return true;
}

function toggleMarkdownFormatInternal(view, formatName, options = {}) {
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
    if (containingRange &&
        unwrapFormattedRange(view, containingRange, selection, format, options)) {
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
    focusEditor(view, options);
    return true;
  }

  const containingRange = ranges.find(range =>
    selection.from >= range.wrapperFrom &&
    selection.to <= range.wrapperTo
  );
  if (containingRange &&
      unwrapFormattedRange(view, containingRange, selection, format, options)) {
    return true;
  }

  if (selectionIsCovered(selection, ranges)) {
    const activeRange = ranges.find(range =>
      selection.from >= range.wrapperFrom &&
      selection.to <= range.wrapperTo
    );
    if (activeRange && unwrapFormattedRange(view, activeRange, selection, format, options)) {
      return true;
    }
  }

  if (ranges.some(range =>
    range.wrapperTo > selection.from && range.wrapperFrom < selection.to
  )) {
    return applyFormatToSelection(view, selection, ranges, format, options);
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
  focusEditor(view, options);
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

function replaceUnderlineRange(view, range, selection, style, options = {}) {
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
    focusEditor(view, options);
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
  focusEditor(view, options);
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

export function toggleUnderlineFormat(view, action = 'cycle', options = {}) {
  if (!view?.state) return false;
  if (!wmdxUnderlineSyntaxEnabled) {
    return toggleMarkdownFormatInternal(view, 'underline', options);
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

  if (current) return replaceUnderlineRange(view, current, selection, style, options);

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
    focusEditor(view, options);
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
  focusEditor(view, options);
  return true;
}

export function toggleMarkdownFormat(view, formatName, options = {}) {
  if (formatName === 'underline') return toggleUnderlineFormat(view, 'cycle', options);
  return toggleMarkdownFormatInternal(view, formatName, options);
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

function replaceWmdxColorRange(view, range, selection, color, options = {}) {
  const doc = view.state.doc;
  if (range.contentFrom === range.contentTo && selection.empty) {
    const delimiters = color ? colorDelimiters(range.group, color) : null;
    const replacement = delimiters ? `${delimiters.open}${delimiters.close}` : '';
    const cursor = range.wrapperFrom + (delimiters ? delimiters.open.length : 0);
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: replacement },
      selection: { anchor: cursor, head: cursor }
    });
    focusEditor(view, options);
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
  focusEditor(view, options);
  return true;
}

export function toggleWmdxColorFormat(view, action = null, options = {}) {
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
    return replaceWmdxColorRange(view, current, selection, null, options);
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

  if (current) return replaceWmdxColorRange(view, current, selection, color, options);
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
    focusEditor(view, options);
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
  focusEditor(view, options);
  return true;
}

function cycleMarkdownListLine(lineText) {
  const indent = /^[ \t]*/.exec(lineText)?.[0] ?? '';
  const content = lineText.slice(indent.length);
  const checkbox = /^[-*+]\s+\[[ xX]\](?:\s+|$)/.exec(content);
  if (checkbox) {
    return `${indent}1. ${content.slice(checkbox[0].length)}`;
  }

  const numbered = /^\d+[.)](?:\s+|$)/.exec(content);
  if (numbered) {
    return `${indent}${content.slice(numbered[0].length)}`;
  }

  const bullet = /^[-*+](?:\s+|$)/.exec(content);
  if (bullet) {
    return `${indent}- [ ] ${content.slice(bullet[0].length)}`;
  }

  return `${indent}- ${content}`;
}

export function parseLineListInfo(text) {
  const isBlank = text.trim().length === 0;
  const prefixMatch = /^([ \t]*(?:>[ \t]*)*)/.exec(text);
  const containerPrefix = prefixMatch ? prefixMatch[0] : '';
  const rest = text.slice(containerPrefix.length);

  const todoMatch = /^(- \[\s?[xX]?\](?:\s+|$))/.exec(rest);
  if (todoMatch) {
    return {
      isBlank,
      containerPrefix,
      type: 'todo',
      markerLength: todoMatch[1].length,
      content: rest.slice(todoMatch[1].length)
    };
  }

  const bulletMatch = /^([-*+](?:\s+|$))/.exec(rest);
  if (bulletMatch) {
    return {
      isBlank,
      containerPrefix,
      type: 'bullet',
      markerLength: bulletMatch[1].length,
      content: rest.slice(bulletMatch[1].length)
    };
  }

  const orderedMatch = /^(\d+[.)](?:\s+|$))/.exec(rest);
  if (orderedMatch) {
    return {
      isBlank,
      containerPrefix,
      type: 'ordered',
      markerLength: orderedMatch[1].length,
      content: rest.slice(orderedMatch[1].length)
    };
  }

  return {
    isBlank,
    containerPrefix,
    type: 'none',
    markerLength: 0,
    content: rest
  };
}

function getIndentLevel(prefix) {
  let spaces = 0;
  for (const ch of prefix) {
    if (ch === '\t') spaces += 2;
    else if (ch === ' ' || ch === '>') spaces += 1;
  }
  return spaces;
}

export function toggleMarkdownList(view, listType, options = {}) {
  if (!view?.state?.doc || typeof view.dispatch !== 'function') return false;
  const { doc, selection } = view.state;
  const code = codeRanges(view.state);
  const lineNumbers = new Set();
  const ranges = selection.ranges || [selection.main];

  for (const range of ranges) {
    const firstLine = doc.lineAt(range.from).number;
    let lastLine = doc.lineAt(range.to).number;
    if (
      !range.empty &&
      lastLine > firstLine &&
      doc.line(lastLine).from === range.to
    ) {
      lastLine--;
    }
    for (let num = firstLine; num <= lastLine; num++) {
      lineNumbers.add(num);
    }
  }

  const isMultilineOrRange = lineNumbers.size > 1 || !ranges[0].empty;
  const sortedLines = [...lineNumbers]
    .sort((a, b) => a - b)
    .map(n => doc.line(n))
    .filter(line => !code.some(range => range.from <= line.from && range.to >= line.to));

  const parsed = sortedLines.map(line => ({ line, info: parseLineListInfo(line.text) }));

  const activeItems = isMultilineOrRange
    ? parsed.filter(item => !item.info.isBlank)
    : parsed;

  if (activeItems.length === 0) return false;

  const toggleOff = activeItems.every(item => item.info.type === listType);

  let orderedNumbers = [];
  if (!toggleOff && listType === 'ordered') {
    const stack = [];
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i];
      const prev = activeItems[i - 1];
      const isContiguous = prev && item.line.number === prev.line.number + 1;
      if (!isContiguous) {
        stack.length = 0;
      }
      const indent = getIndentLevel(item.info.containerPrefix);
      while (stack.length > 0 && stack[stack.length - 1].indent > indent) {
        stack.pop();
      }
      if (stack.length === 0 || stack[stack.length - 1].indent < indent) {
        stack.push({ indent, count: 1 });
        orderedNumbers.push(1);
      } else {
        stack[stack.length - 1].count++;
        orderedNumbers.push(stack[stack.length - 1].count);
      }
    }
  }

  const changes = [];
  for (let i = 0; i < activeItems.length; i++) {
    const { line, info } = activeItems[i];
    const markerStart = line.from + info.containerPrefix.length;
    const markerEnd = markerStart + info.markerLength;

    if (toggleOff) {
      if (info.markerLength > 0) {
        changes.push({ from: markerStart, to: markerEnd, insert: '' });
      }
    } else {
      let newMarker = '';
      if (listType === 'bullet') {
        newMarker = '- ';
      } else if (listType === 'todo') {
        newMarker = '- [ ] ';
      } else if (listType === 'ordered') {
        newMarker = `${orderedNumbers[i]}. `;
      }

      if (info.markerLength > 0) {
        changes.push({ from: markerStart, to: markerEnd, insert: newMarker });
      } else {
        changes.push({ from: markerStart, to: markerStart, insert: newMarker });
      }
    }
  }

  if (changes.length === 0) return false;

  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes: changeSet,
    selection: view.state.selection.map(changeSet, 1)
  });
  if (options.preserveKeyboard !== true) view.focus?.();
  return true;
}

export function cycleMarkdownListType(view) {
  if (!view?.state?.doc || typeof view.dispatch !== 'function') return false;
  const { doc, selection } = view.state;
  const code = codeRanges(view.state);
  const lineNumbers = new Set();

  for (const range of selection.ranges || [selection.main]) {
    const firstLine = doc.lineAt(range.from).number;
    let lastLine = doc.lineAt(range.to).number;
    if (
      !range.empty &&
      lastLine > firstLine &&
      doc.line(lastLine).from === range.to
    ) {
      lastLine--;
    }
    for (let number = firstLine; number <= lastLine; number++) {
      lineNumbers.add(number);
    }
  }

  const changes = [...lineNumbers]
    .sort((a, b) => a - b)
    .flatMap(number => {
      const line = doc.line(number);
      if (code.some(range => range.from <= line.from && range.to >= line.to)) {
        return [];
      }
      const insert = cycleMarkdownListLine(line.text);
      return insert === line.text
        ? []
        : [{ from: line.from, to: line.to, insert }];
    });
  if (changes.length === 0) return false;

  view.dispatch({ changes });
  view.focus?.();
  return true;
}
