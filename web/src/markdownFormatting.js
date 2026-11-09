import { EditorSelection, EditorState } from '@codemirror/state';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import {
  Autolink as GFMAutolink,
  TaskList as GFMTaskList
} from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import {
  collectMarkdownReferenceTargets,
  getMarkdownLinkInfo
} from './markdown-link-utils.mjs';
import {
  getWmdxResourceTitleRange,
  parseWmdxResourceSyntax
} from './wmdxResources.js';
import {
  getIndentedCodeBlockAtLine,
  getIndentedCodeBlockRenderLayout
} from './markdownIndent.js';
import { wmdxCommonMarkCompatibility } from './commonmark-compat.mjs';
import { wmdxGfmFtpAutolink } from './gfm-autolink.mjs';
import { wmdxGfmStrikethrough } from './gfm-strikethrough.mjs';

const UNDERLINE_STYLE_MARKERS = Object.freeze({
  solid: '',
  dotted: '₀',
  dashed: '₁',
  double: '₂',
  wavy: '₃'
});
const UNDERLINE_CYCLE = Object.keys(UNDERLINE_STYLE_MARKERS);
let wmdxUnderlineSyntaxEnabled = false;
let wmdxSuperscriptSyntaxEnabled = true;

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
let wmdxColorSyntaxEnabled = true;
let obsidianHighlightSyntaxEnabled = false;

const MARKDOWN_FORMATS = {
  bold: { node: 'StrongEmphasis', open: '**', close: '**' },
  italic: { node: 'Emphasis', open: '*', close: '*' },
  strikethrough: { node: 'Strikethrough', open: '~~', close: '~~' },
  subscript: { node: 'Subscript', open: '~', close: '~' },
  superscript: { open: '^', close: '^' },
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
  if (
    !state ||
    (!wmdxColorSyntaxEnabled && !obsidianHighlightSyntaxEnabled)
  ) return [];
  const scanBounds = bounds
    ? expandedLineBounds(state, bounds.from, Math.max(bounds.from, bounds.to - 1))
    : { from: 0, to: state.doc.length };
  const scanFrom = scanBounds.from;
  const source = state.doc.sliceString(scanFrom, scanBounds.to);
  const code = codeRanges(state, scanBounds);
  const setextUnderlineLines = new Set();
  syntaxTree(state).iterate({
    from: scanFrom,
    to: scanBounds.to,
    enter(node) {
      if (node.name !== 'SetextHeading1' && node.name !== 'SetextHeading2') return;
      const underlineLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
      if (
        underlineLine.from > node.from &&
        /^[ \t]*(?:=+|-+)[ \t]*$/.test(underlineLine.text)
      ) {
        setextUnderlineLines.add(underlineLine.from);
      }
    }
  });
  const ranges = [];

  for (const [group, config] of Object.entries(WMDX_COLOR_GROUPS)) {
    if (!wmdxColorSyntaxEnabled && group !== 'highlight') continue;
    const expressions = !wmdxColorSyntaxEnabled
      ? [/(?<![\\])==(?![₀₁₂])(\S(?:[^\n]*?\S)?)(?<![\\])==/gu]
      : group === 'highlight'
        ? [/(?<![\\])==([₀₁₂]?)(?![₀₁₂]==)(\S(?:[^\n]*?\S)?)(?<![\\])==/gu]
        : [/(?<![=\\])=(?![=])([₀₁₂]?)(?![₀₁₂]=)(\S(?:[^\n]*?\S)?)(?<![\\])=(?![=])/gu];
    for (const expression of expressions) {
      let match;
      while ((match = expression.exec(source))) {
        const wrapperFrom = scanFrom + match.index;
        const wrapperTo = wrapperFrom + match[0].length;
        if (setextUnderlineLines.has(state.doc.lineAt(wrapperFrom).from)) continue;
        if (code.some(range => range.from < wrapperTo && range.to > wrapperFrom)) continue;
        const marker = wmdxColorSyntaxEnabled ? (match[1] ?? '') : '';
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

export function setWmdxSuperscriptSyntaxEnabled(enabled) {
  wmdxSuperscriptSyntaxEnabled = Boolean(enabled);
}

export function setWmdxColorSyntaxEnabled(enabled) {
  wmdxColorSyntaxEnabled = Boolean(enabled);
}

export function setObsidianHighlightSyntaxEnabled(enabled) {
  obsidianHighlightSyntaxEnabled = Boolean(enabled);
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

function getWmdxSuperscriptRanges(state, bounds = null) {
  const scanBounds = bounds
    ? expandedLineBounds(state, bounds.from, Math.max(bounds.from, bounds.to - 1))
    : { from: 0, to: state.doc.length };
  const source = state.doc.sliceString(scanBounds.from, scanBounds.to);
  const code = codeRanges(state, scanBounds);
  const ranges = [];
  const expression = /(?<![\\])\^([^\s^\n](?:[^^\n]*?[^\s^\n])?)\^/gu;
  let match;
  while ((match = expression.exec(source))) {
    const wrapperFrom = scanBounds.from + match.index;
    const wrapperTo = wrapperFrom + match[0].length;
    if (code.some(range => range.from < wrapperTo && range.to > wrapperFrom)) continue;
    ranges.push({
      wrapperFrom,
      wrapperTo,
      contentFrom: wrapperFrom + 1,
      contentTo: wrapperTo - 1,
      open: '^',
      close: '^',
      kind: 'superscript'
    });
  }
  return ranges;
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
  if (formatName === 'superscript') {
    return wmdxSuperscriptSyntaxEnabled
      ? getWmdxSuperscriptRanges(state, scanBounds)
      : [];
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
  state.superscript = getMarkdownFormatRanges(view, 'superscript', bounds).some(range =>
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
  const replacementText = range.replacementText;
  const selectedInsideContent =
    selection.from >= range.contentFrom &&
    selection.to <= range.contentTo;
  const selectsWholeWrapper =
    selection.from <= range.wrapperFrom &&
    selection.to >= range.wrapperTo;

  if (selectsWholeWrapper) {
    const content = replacementText ??
      doc.sliceString(range.contentFrom, range.contentTo);
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

  if (
    range.replaceWholeOnPartial &&
    range.wrapperTo > selection.from &&
    range.wrapperFrom < selection.to
  ) {
    const content = replacementText ??
      doc.sliceString(range.contentFrom, range.contentTo);
    const cursor = range.wrapperFrom + content.length;
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert: content },
      selection: { anchor: cursor, head: cursor }
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
    const content = replacementText ??
      doc.sliceString(range.contentFrom, range.contentTo);
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

function unwrapRangeWithinSelection(view, range, selection, options = {}) {
  const state = view.state;
  const doc = state.doc;
  if (
    range.wrapperTo <= selection.from ||
    range.wrapperFrom >= selection.to
  ) return false;

  if (range.replacementText !== undefined) {
    const insert = range.replacementText;
    const delta = insert.length - (range.wrapperTo - range.wrapperFrom);
    const mapOutside = position => position >= range.wrapperTo
      ? position + delta
      : position;
    const selectedFrom = selection.from <= range.wrapperFrom
      ? selection.from
      : range.wrapperFrom;
    const selectedTo = selection.to >= range.wrapperTo
      ? mapOutside(selection.to)
      : range.wrapperFrom + insert.length;
    view.dispatch({
      changes: { from: range.wrapperFrom, to: range.wrapperTo, insert },
      selection: selection.anchor <= selection.head
        ? { anchor: selectedFrom, head: selectedTo }
        : { anchor: selectedTo, head: selectedFrom }
    });
    focusEditor(view, options);
    return true;
  }

  const selectedContentFrom = Math.max(selection.from, range.contentFrom);
  const selectedContentTo = Math.min(selection.to, range.contentTo);
  if (selectedContentTo <= selectedContentFrom) return false;

  const left = doc.sliceString(range.contentFrom, selectedContentFrom);
  const selected = doc.sliceString(selectedContentFrom, selectedContentTo);
  const right = doc.sliceString(selectedContentTo, range.contentTo);
  const wrappedLeft = wrapSegment(
    left,
    range.open,
    range.close
  );
  const wrappedRight = wrapSegment(
    right,
    range.open,
    range.close
  );
  const insert = `${wrappedLeft}${selected}${wrappedRight}`;
  const insertedSelectionFrom = range.wrapperFrom + wrappedLeft.length;
  const insertedSelectionTo = insertedSelectionFrom + selected.length;
  const delta = insert.length - (range.wrapperTo - range.wrapperFrom);
  const mappedFrom = selection.from <= range.wrapperFrom
    ? selection.from
    : selection.from >= range.wrapperTo
      ? selection.from + delta
      : insertedSelectionFrom;
  const mappedTo = selection.to >= range.wrapperTo
    ? selection.to + delta
    : selection.to <= range.wrapperFrom
      ? selection.to
      : insertedSelectionTo;

  view.dispatch({
    changes: { from: range.wrapperFrom, to: range.wrapperTo, insert },
    selection: selection.anchor <= selection.head
      ? { anchor: mappedFrom, head: mappedTo }
      : { anchor: mappedTo, head: mappedFrom }
  });
  focusEditor(view, options);
  return true;
}

function getInlineFormattingRanges(view, bounds) {
  const ranges = Object.keys(MARKDOWN_FORMATS).flatMap(formatName =>
    getMarkdownFormatRanges(view, formatName, bounds)
  );
  ranges.push(...getWmdxColorSyntaxRanges(view.state, bounds));

  const { state } = view;
  const { doc } = state;
  const tree = syntaxTree(state);
  const referenceTargets = collectMarkdownReferenceTargets(doc, tree);
  const code = codeRanges(state, bounds);
  tree.iterate({
    ...(bounds ? { from: bounds.from, to: bounds.to } : {}),
    enter(node) {
      if (node.name === 'Link') {
        const info = getMarkdownLinkInfo(node, doc, referenceTargets);
        if (!info) return;
        ranges.push({
          wrapperFrom: node.from,
          wrapperTo: node.to,
          contentFrom: info.labelFrom,
          contentTo: info.labelTo,
          open: doc.sliceString(node.from, info.labelFrom),
          close: doc.sliceString(info.labelTo, node.to),
          kind: 'link'
        });
      } else if (node.name === 'WmdxResource') {
        const raw = doc.sliceString(node.from, node.to);
        const resource = parseWmdxResourceSyntax(raw);
        if (!resource || resource.embed) return;
        const titleRange = getWmdxResourceTitleRange(raw);
        if (!titleRange) return;
        const contentFrom = node.from + titleRange.from;
        const contentTo = node.from + titleRange.to;
        if (contentFrom === contentTo) {
          ranges.push({
            wrapperFrom: node.from,
            wrapperTo: node.to,
            contentFrom: node.from,
            contentTo: node.to,
            replacementText: resource.displayTitle,
            replaceWholeOnPartial: true,
            open: '',
            close: '',
            kind: 'link'
          });
          return;
        }
        ranges.push({
          wrapperFrom: node.from,
          wrapperTo: node.to,
          contentFrom,
          contentTo,
          open: doc.sliceString(node.from, contentFrom),
          close: doc.sliceString(contentTo, node.to),
          kind: 'link'
        });
      }
    }
  });

  const scanFrom = bounds ? doc.lineAt(bounds.from).from : 0;
  const scanTo = bounds
    ? doc.lineAt(Math.max(bounds.from, bounds.to - 1)).to
    : doc.length;
  const source = doc.sliceString(scanFrom, scanTo);
  const footnoteRanges = [
    {
      expression: /\^\[([^\]\n]+)\]/gu,
      openLength: 2,
      closeLength: 1,
      kind: 'footnote'
    },
    {
      expression: /\[\^([^\]\n]+)\]/gu,
      openLength: 2,
      closeLength: 1,
      kind: 'footnote'
    },
    {
      expression: /(?<![\\])\^(\d+)(?!\^)/gu,
      openLength: 1,
      closeLength: 0,
      kind: 'footnote'
    }
  ];
  for (const syntax of footnoteRanges) {
    let match;
    while ((match = syntax.expression.exec(source))) {
      const wrapperFrom = scanFrom + match.index;
      const wrapperTo = wrapperFrom + match[0].length;
      if (code.some(range => range.from < wrapperTo && range.to > wrapperFrom)) continue;
      const contentFrom = wrapperFrom + syntax.openLength;
      const contentTo = wrapperTo - syntax.closeLength;
      ranges.push({
        wrapperFrom,
        wrapperTo,
        contentFrom,
        contentTo,
        open: doc.sliceString(wrapperFrom, contentFrom),
        close: doc.sliceString(contentTo, wrapperTo),
        kind: syntax.kind
      });
    }
  }

  const wikiLinks = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/gu;
  let wikiMatch;
  while ((wikiMatch = wikiLinks.exec(source))) {
    const wrapperFrom = scanFrom + wikiMatch.index;
    const wrapperTo = wrapperFrom + wikiMatch[0].length;
    if (code.some(range => range.from < wrapperTo && range.to > wrapperFrom)) continue;
    const aliasOffset = wikiMatch[2] === undefined
      ? 2
      : wikiMatch[0].lastIndexOf('|') + 1;
    const contentFrom = wrapperFrom + aliasOffset;
    const contentTo = wrapperTo - 2;
    ranges.push({
      wrapperFrom,
      wrapperTo,
      contentFrom,
      contentTo,
      open: doc.sliceString(wrapperFrom, contentFrom),
      close: doc.sliceString(contentTo, wrapperTo),
      kind: 'link'
    });
  }

  const seen = new Set();
  return ranges.filter(range => {
    const key = `${range.wrapperFrom}:${range.wrapperTo}:${range.open}:${range.close}:${range.replacementText ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getHeadingNodeAt(state, position) {
  for (
    let node = syntaxTree(state).resolveInner(position, 1);
    node;
    node = node.parent
  ) {
    if (
      /^(?:ATXHeading|SetextHeading)[1-6]$/.test(node.name) ||
      node.name === 'WmdxDecimalHeading'
    ) return node;
  }
  return null;
}

function getClearFormattingScope(state) {
  const { doc, selection } = state;
  const main = selection.main;
  if (!main.empty) {
    const firstHeading = getHeadingNodeAt(state, main.from);
    const lastHeading = getHeadingNodeAt(state, Math.max(main.from, main.to - 1));
    if (
      firstHeading &&
      lastHeading &&
      firstHeading.from === lastHeading.from &&
      firstHeading.to === lastHeading.to
    ) {
      const lastPosition = Math.max(firstHeading.from, firstHeading.to - 1);
      return {
        from: doc.lineAt(firstHeading.from).from,
        to: doc.lineAt(lastPosition).to
      };
    }
    const firstLine = doc.lineAt(main.from);
    const lastPosition = main.to > main.from ? main.to - 1 : main.to;
    const lastLine = doc.lineAt(lastPosition);
    return { from: firstLine.from, to: lastLine.to };
  }

  const cursorLine = doc.lineAt(main.head);
  const codeBlock = getIndentedCodeBlockAtLine(state, cursorLine.number);
  if (codeBlock) {
    const lastPosition = Math.max(codeBlock.from, codeBlock.to - 1);
    return {
      from: doc.lineAt(codeBlock.from).from,
      to: doc.lineAt(lastPosition).to
    };
  }

  let block = getHeadingNodeAt(state, main.head);
  for (
    let node = block ? null : syntaxTree(state).resolveInner(main.head, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'Paragraph') {
      block = node;
      break;
    }
  }
  if (!block) {
    const line = doc.lineAt(main.head);
    return { from: line.from, to: line.to };
  }

  const lastPosition = Math.max(block.from, block.to - 1);
  return {
    from: doc.lineAt(block.from).from,
    to: doc.lineAt(lastPosition).to
  };
}

function getBlockFormattingPrefixLength(text) {
  let offset = 0;
  const consume = expression => {
    const match = expression.exec(text.slice(offset));
    if (!match || match.index !== 0 || !match[0]) return false;
    offset += match[0].length;
    return true;
  };

  consume(/^[ \t]+/);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (
      consume(/^(?:>[ \t]*)+/) ||
      consume(/^\[![A-Za-z][A-Za-z0-9_-]*\][+-]?[ \t]*/) ||
      consume(/^±[A-Za-z][A-Za-z0-9_-]*[-+]?(?:[ \t]+|$)/) ||
      consume(/^#{1,6}(?:[ \t]+|$)/) ||
      consume(/^\.[1-6](?:[ \t]+|$)/) ||
      consume(/^(?:(?:\d+|[A-Za-z]+)[.)]|[-+*])[ \t]+(?:\[[ xX]\][ \t]+)?/) ||
      consume(/^\[[ xX]\][ \t]+/) ||
      consume(/^(?:->|><|<>|<)(?:[ \t]+|$)/) ||
      consume(/^\[\^[^\]]+\]:[ \t]*/) ||
      consume(/^\[[^\]]+\]:[ \t]*/)
    ) {
      continue;
    }
    break;
  }

  const remainder = text.slice(offset);
  if (/^(?:={1,}|-{3,})[ \t]*$/.test(remainder)) return text.length;
  return offset;
}

function isCodeBlockLine(state, line) {
  const probe = line.from + (/^[ \t]*/.exec(line.text)?.[0].length ?? 0);
  for (let node = syntaxTree(state).resolveInner(probe, 1); node; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
  }
  return false;
}

function stripBlockFormatting(view, scope) {
  const { state } = view;
  const firstLine = state.doc.lineAt(scope.from).number;
  const lastLine = state.doc.lineAt(Math.max(scope.from, scope.to - 1)).number;
  const changes = [];
  const codeBlockLayouts = new Map();
  for (let number = firstLine; number <= lastLine; number += 1) {
    const line = state.doc.line(number);
    const codeBlock = getIndentedCodeBlockAtLine(state, number);
    if (codeBlock) {
      const key = `${codeBlock.from}:${codeBlock.to}`;
      let layout = codeBlockLayouts.get(key);
      if (!layout) {
        layout = getIndentedCodeBlockRenderLayout(
          state,
          codeBlock.from,
          codeBlock.to
        );
        codeBlockLayouts.set(key, layout);
      }
      for (const range of layout.hiddenRanges) {
        if (range.from >= line.from && range.to <= line.to) {
          changes.push({ from: range.from, to: range.to, insert: '' });
        }
      }
      continue;
    }
    if (isCodeBlockLine(state, line)) continue;
    const heading = getHeadingNodeAt(state, line.from);
    if (
      heading?.name.startsWith('SetextHeading') &&
      state.doc.lineAt(heading.from).number < number
    ) {
      changes.push({
        from: Math.max(0, line.from - 1),
        to: line.to,
        insert: ''
      });
      continue;
    }
    const prefixLength = getBlockFormattingPrefixLength(line.text);
    if (prefixLength > 0) {
      changes.push({
        from: line.from,
        to: line.from + prefixLength,
        insert: ''
      });
    }
  }
  if (!changes.length) return false;
  changes.sort((first, second) => first.from - second.from);
  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    selection: state.selection.map(changeSet, 1)
  });
  return true;
}

function stripCollapsedInlineFormatting(view, scope) {
  const { state } = view;
  const ranges = getInlineFormattingRanges(view, scope);
  const changes = [];
  for (const range of ranges) {
    if (
      range.wrapperFrom < scope.from ||
      range.wrapperTo > scope.to
    ) continue;
    if (range.replacementText !== undefined) {
      changes.push({
        from: range.wrapperFrom,
        to: range.wrapperTo,
        insert: range.replacementText
      });
      continue;
    }
    changes.push(
      { from: range.wrapperFrom, to: range.contentFrom, insert: '' },
      { from: range.contentTo, to: range.wrapperTo, insert: '' }
    );
  }
  const uniqueChanges = [...new Map(
    changes
      .filter(change => change.to > change.from)
      .map(change => [`${change.from}:${change.to}`, change])
  ).values()].sort((first, second) => first.from - second.from);
  if (!uniqueChanges.length) return false;

  const changeSet = state.changes(uniqueChanges);
  view.dispatch({
    changes: changeSet,
    selection: state.selection.map(changeSet, 1)
  });
  return true;
}

function clearTableCellFormatting(view, options = {}) {
  if (options.skipTableCellRouting === true) return null;
  const activeTable = globalThis.window?.wmdxTableActions?.active;
  if (activeTable?.view !== view) return null;

  const overlay = globalThis.document?.querySelector('.cm-wp-cell-editor');
  const meta = overlay?._cellMeta;
  const snapshot = globalThis.window?._lastActiveCellSelection;
  const useOverlay = Boolean(meta?.model && Number.isInteger(meta.row) && Number.isInteger(meta.col));
  const useSnapshot = !useOverlay &&
    snapshot?.widget &&
    snapshot?.model &&
    Number.isInteger(snapshot.row) &&
    Number.isInteger(snapshot.col) &&
    Date.now() - Number(snapshot.timestamp || 0) < 3000;
  if (!useOverlay && !useSnapshot) return null;

  const cellMeta = useOverlay ? meta : snapshot;
  const rows = cellMeta.model.rows;
  if (
    !Array.isArray(rows) ||
    cellMeta.row < 0 ||
    cellMeta.col < 0 ||
    cellMeta.row >= rows.length
  ) {
    return null;
  }
  const modelRow = rows[cellMeta.row];
  if (!Array.isArray(modelRow) || cellMeta.col >= modelRow.length) return null;
  const cellText = useOverlay
    ? String(overlay.value ?? '')
    : String(snapshot.cellValue ?? modelRow[cellMeta.col] ?? '');
  const selectionStart = useOverlay
    ? (overlay.selectionStart ?? 0)
    : (snapshot.selStart ?? cellText.length);
  const selectionEnd = useOverlay
    ? (overlay.selectionEnd ?? selectionStart)
    : (snapshot.selEnd ?? selectionStart);
  const selection = selectionStart === selectionEnd
    ? EditorSelection.cursor(selectionStart)
    : EditorSelection.range(selectionStart, selectionEnd);
  let state = EditorState.create({
    doc: cellText,
    selection,
    extensions: [
      cmMarkdown({
        extensions: [
          GFMAutolink,
          GFMTaskList,
          wmdxGfmFtpAutolink,
          wmdxGfmStrikethrough,
          wmdxCommonMarkCompatibility
        ]
      })
    ]
  });
  const cellView = {
    get state() {
      return state;
    },
    dispatch(transaction) {
      state = state.update(transaction).state;
    },
    focus() {}
  };
  if (!clearMarkdownFormatting(cellView, {
    ...options,
    preserveKeyboard: true,
    skipTableCellRouting: true
  })) {
    return false;
  }

  const cleaned = state.doc.toString();
  const mappedSelection = state.selection.main;
  const serialized = cleaned.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
  cellMeta.model.rows[cellMeta.row][cellMeta.col] = serialized;

  if (useOverlay) {
    overlay.value = cleaned;
    overlay.setSelectionRange(mappedSelection.from, mappedSelection.to);
    if (globalThis.window) {
      globalThis.window._lastActiveCellSelection = {
        widget: meta.widget,
        model: meta.model,
        row: meta.row,
        col: meta.col,
        selStart: mappedSelection.from,
        selEnd: mappedSelection.to,
        cellValue: cleaned,
        selectedText: cleaned.slice(mappedSelection.from, mappedSelection.to),
        timestamp: Date.now()
      };
    }
    return true;
  }

  snapshot.cellValue = cleaned;
  snapshot.selStart = mappedSelection.from;
  snapshot.selEnd = mappedSelection.to;
  snapshot.selectedText = cleaned.slice(mappedSelection.from, mappedSelection.to);
  snapshot.timestamp = Date.now();
  snapshot.widget.commitModel?.(view, cellMeta.model);
  return true;
}

export function clearMarkdownFormatting(view, options = {}) {
  const tableCellResult = clearTableCellFormatting(view, options);
  if (tableCellResult !== null) return tableCellResult;
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

  const initiallyCollapsed = originalState.selection.main.empty;
  let scope = getClearFormattingScope(workingState);
  stripBlockFormatting(workingView, scope);
  if (initiallyCollapsed) {
    scope = getClearFormattingScope(workingState);
    stripCollapsedInlineFormatting(workingView, scope);
  }

  for (let attempt = 0; attempt < 128; attempt += 1) {
    const selection = workingState.selection.main;
    if (selection.empty && initiallyCollapsed) break;
    const bounds = selection.empty
      ? getClearFormattingScope(workingState)
      : { from: selection.from, to: selection.to };
    const ranges = getInlineFormattingRanges(workingView, bounds)
      .filter(range =>
        range.wrapperTo > selection.from &&
        range.wrapperFrom < selection.to
      )
      .sort((first, second) =>
        (first.wrapperTo - first.wrapperFrom) - (second.wrapperTo - second.wrapperFrom) ||
        second.wrapperFrom - first.wrapperFrom
      );

    let unwrapped = false;
    for (const range of ranges) {
      if (unwrapRangeWithinSelection(
        workingView,
        range,
        selection,
        options
      )) {
        unwrapped = true;
        break;
      }
    }
    if (!unwrapped) break;
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
  if (formatName === 'superscript' && !wmdxSuperscriptSyntaxEnabled) return false;
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
  const availableColors = !wmdxColorSyntaxEnabled
    ? (
        group === 'highlight' && obsidianHighlightSyntaxEnabled
          ? ['yellow']
          : []
      )
    : group
      ? WMDX_COLOR_GROUPS[group].colors.map(([name]) => name)
      : [];
  if (action && (!availableColors.length ||
      (requestedColor && !availableColors.includes(requestedColor)))) {
    return false;
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
    const colors = availableColors;
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

function cycleMarkdownListLine(
  lineText,
  { bulletPrefix = '- ', orderedPrefix = '1. ', taskPrefix = '- [ ] ' } = {}
) {
  const indent = /^[ \t]*/.exec(lineText)?.[0] ?? '';
  const content = lineText.slice(indent.length);
  const checkbox = /^(?:[-*+]\s+)?\[[ xX]\](?:\s+|$)/.exec(content);
  if (checkbox) {
    return `${indent}${orderedPrefix}${content.slice(checkbox[0].length)}`;
  }

  const numbered = /^(?:\d+|[A-Za-z]+)[.)](?:\s+|$)/.exec(content);
  if (numbered) {
    return `${indent}${content.slice(numbered[0].length)}`;
  }

  const bullet = /^[-*+](?:\s+|$)/.exec(content);
  if (bullet) {
    const prefix = taskPrefix || orderedPrefix;
    return `${indent}${prefix}${content.slice(bullet[0].length)}`;
  }

  return `${indent}${bulletPrefix}${content}`;
}

export function cycleMarkdownListType(view, options = {}) {
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
      const insert = cycleMarkdownListLine(line.text, options);
      return insert === line.text
        ? []
        : [{ from: line.from, to: line.to, insert }];
    });
  if (changes.length === 0) return false;

  view.dispatch({ changes });
  view.focus?.();
  return true;
}
