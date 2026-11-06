import { syntaxTree } from '@codemirror/language';
import { getHeadingFlavor, getHeadingLevel, isHeadingFlavorEnabled } from './headingSyntax.mjs';
import { isListFlavorEnabled, getWmdxOrderedListSequence } from './listSyntax.mjs';
import { isCalloutFlavorEnabled } from './calloutSyntax.mjs';
import { parseWmdxCallouts } from './wmdxCallouts.js';
import { getIndentedCodeBlockRenderLayout, getMarkdownSourceIndentColumns } from './markdownIndent.js';

// Text and syntax trees are immutable. Selection-only transactions reuse this
// model; parser progress and syntax preference changes invalidate it. No mode,
// selection, DOM measurement, or editor-global document is part of this cache.
const documentCache = new WeakMap();

export function markdownPresentation(mode) {
  return {
    raw: mode === 'source',
    contextual: mode === 'live_preview',
    renderedTables: mode !== 'source'
  };
}

export function getMarkdownDocumentLayout(state, settings) {
  const tree = syntaxTree(state);
  const signature = JSON.stringify(settings);
  const cached = documentCache.get(state.doc);
  if (cached?.tree === tree && cached.signature === signature) return cached.model;
  const model = buildMarkdownDocumentLayout(state, settings, tree);
  documentCache.set(state.doc, { tree, signature, model });
  return model;
}

// For edits that cannot change block structure, move semantic source positions
// through CodeMirror's ChangeSet instead of reparsing the whole document.
export function mapMarkdownDocumentLayout(previous, transaction, settings) {
  const changes = transaction.changes;
  const pos = (value, side = 1) => changes.mapPos(value, side);
  const range = value => value && ({ ...value, from: pos(value.from, -1), to: pos(value.to, 1) });
  const mappedBlocks = new Map();
  const block = value => {
    if (!value) return value;
    if (!mappedBlocks.has(value)) {
      mappedBlocks.set(value, {
        ...range(value),
        ...(value.indent ? { indent: {
          ...value.indent,
          hiddenRanges: value.indent.hiddenRanges.map(range)
        } } : {})
      });
    }
    return mappedBlocks.get(value);
  };
  const calloutInfo = value => ({
    ...value,
    markerStart: pos(value.markerStart, -1),
    markerEnd: pos(value.markerEnd),
    titleStart: pos(value.titleStart),
    bodyFrom: pos(value.bodyFrom),
    bodyTo: pos(value.bodyTo)
  });
  const model = {
    blocks: previous.blocks.map(block),
    tables: previous.tables.map(block),
    codeBlocks: previous.codeBlocks.map(block),
    lines: new Map([...previous.lines.values()].map(line => {
      const mapped = {
        ...range(line), contentFrom: pos(line.contentFrom, -1),
        indentTo: pos(line.indentTo, -1), marker: range(line.marker),
        code: block(line.code), table: block(line.table)
      };
      return [mapped.from, mapped];
    })),
    orderedItems: previous.orderedItems.map(item => ({
      ...range(item), line: transaction.state.doc.line(item.line.number)
    })),
    nativeCallouts: {
      ...previous.nativeCallouts,
      openers: previous.nativeCallouts.openers.map(opener => ({
        lineFrom: pos(opener.lineFrom, -1), info: calloutInfo(opener.info)
      })),
      lineAttributes: new Map([...previous.nativeCallouts.lineAttributes]
        .map(([from, attributes]) => [pos(from, -1), attributes]))
    },
    calloutOpeners: new Map([...previous.calloutOpeners]
      .map(([from, info]) => [pos(from, -1), calloutInfo(info)]))
  };
  documentCache.set(transaction.state.doc, {
    tree: syntaxTree(transaction.state), signature: JSON.stringify(settings), model
  });
  return model;
}

export function buildMarkdownDocumentLayout(state, settings, tree = syntaxTree(state)) {
  const doc = state.doc;
  const lines = new Map();
  const tables = [];
  const codeBlocks = [];
  const blocks = [];
  const lists = settings.list?.enabled !== false &&
    (isListFlavorEnabled(settings.list, 'markdown') || isListFlavorEnabled(settings.list, 'wmdx'));
  const excluded = position => {
    for (let node = tree.resolveInner(position, 1); node; node = node.parent) {
      if (['FencedCode', 'CodeBlock', 'Table'].includes(node.name)) return true;
    }
    return false;
  };
  const nativeCallouts = isCalloutFlavorEnabled(settings.callout, 'wmdx')
    ? parseWmdxCallouts(doc.toString(), excluded)
    : { openers: [], lineAttributes: new Map() };
  const orderedItems = isListFlavorEnabled(settings.list, 'wmdx')
    ? getWmdxOrderedListSequence(
        Array.from({ length: doc.lines }, (_, i) => doc.line(i + 1)),
        excluded
      )
    : [];
  const orderedByLine = new Map(orderedItems.map(item => [item.line.number, item]));
  const codeByLine = new Map();
  const tableByLine = new Map();

  tree.iterate({
    enter(node) {
      if (!['Paragraph', 'ListItem', 'Blockquote', 'FencedCode', 'CodeBlock', 'Table',
        'HorizontalRule'].includes(node.name) && !getHeadingLevel(node.name)) return;
      const block = { kind: node.name, from: node.from, to: node.to };
      blocks.push(block);
      if (node.name !== 'Table' && node.name !== 'FencedCode' && node.name !== 'CodeBlock') return;
      const first = doc.lineAt(node.from).number;
      const last = doc.lineAt(Math.max(node.from, node.to - 1)).number;
      block.first = first;
      block.last = last;
      if (node.name === 'Table') {
        tables.push(block);
        for (let number = first; number <= last; number++) tableByLine.set(number, block);
      } else {
        block.first = first;
        block.last = last;
        block.indent = node.name === 'CodeBlock'
          ? getIndentedCodeBlockRenderLayout(state, node.from, node.to)
          : { hiddenRanges: [], commonIndentColumns: 0 };
        codeBlocks.push(block);
        for (let number = first; number <= last; number++) codeByLine.set(number, block);
      }
      return false;
    }
  });

  const activeCallouts = [];
  const calloutOpeners = new Map(nativeCallouts.openers.map(({ lineFrom, info }) => [lineFrom, info]));
  let supplementaryOwner = null;
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const sourceIndent = getMarkdownSourceIndentColumns(line.text);
    const entry = {
      from: line.from, to: line.to, number, kind: 'blank', classes: new Set(),
      styles: [], quoteDepth: 0, callout: null, marker: null,
      contentFrom: line.from, indentTo: line.from, listDepth: 0
    };
    lines.set(line.from, entry);
    const code = codeByLine.get(number);
    const table = tableByLine.get(number);
    if (code) {
      entry.kind = 'code';
      entry.code = code;
      entry.classes.add('cm-codeblock-line');
      if (number === code.first) entry.classes.add('cm-codeblock-first');
      if (number === code.last) entry.classes.add('cm-codeblock-last');
      if (code.indent.commonIndentColumns) {
        entry.styles.push(`--code-block-common-indent:${code.indent.commonIndentColumns}ch`);
      }
      continue;
    }
    if (table) {
      entry.kind = 'table';
      entry.table = table;
      entry.classes.add('cm-table-source-line');
      if (number === table.first) entry.classes.add('cm-table-header-source-line');
      continue;
    }
    const quotePrefix = /^[ \t]*(?:>[ \t]*)+/.exec(line.text)?.[0] ?? '';
    entry.contentFrom = line.from + quotePrefix.length;
    const leading = /^[ \t]*/.exec(line.text)[0];
    entry.indentTo = line.from + leading.length;
    const offset = line.text.slice(quotePrefix.length).search(/\S/);
    const probe = line.from + quotePrefix.length + Math.max(0, offset);
    let paragraph = null;
    let item = null;
    let heading = null;
    let depth = 0;
    let quoteDepth = 0;
    let task = false;
    for (let node = tree.resolveInner(probe, 1); node; node = node.parent) {
      if (node.name === 'Paragraph' && !paragraph) paragraph = node;
      if (node.name === 'ListItem') {
        if (!item) item = node;
        depth++;
      }
      if (node.name === 'Blockquote') quoteDepth++;
      if (node.name === 'WmdxTaskMarker') task = true;
      if (getHeadingLevel(node.name)) heading = node;
      if (node.name === 'HorizontalRule') entry.classes.add('cm-hr');
    }
    entry.quoteDepth = quoteDepth;
    while (activeCallouts.length && activeCallouts[activeCallouts.length - 1].depth > quoteDepth) activeCallouts.pop();
    if (!quoteDepth) activeCallouts.length = 0;
    const opener = quoteDepth && isCalloutFlavorEnabled(settings.callout, 'obsidian')
      ? /^[ \t]*(?:>[ \t]*)+\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?(?:[ \t]+(.*))?$/.exec(line.text)
      : null;
    if (opener) {
      const marker = /^\[![A-Za-z][A-Za-z0-9_-]*\][+-]?/.exec(line.text.slice(quotePrefix.length))[0];
      const markerStart = line.from + quotePrefix.length;
      const markerEnd = markerStart + marker.length;
      const separator = /^[ \t]*/.exec(doc.sliceString(markerEnd, line.to))[0];
      const info = {
        type: opener[1].toLowerCase(), depth: quoteDepth,
        foldMarker: opener[2], customTitle: opener[3],
        markerStart, markerEnd,
        titleStart: markerEnd + separator.length,
        bodyFrom: line.to, bodyTo: line.to
      };
      activeCallouts.push({ type: info.type, depth: quoteDepth, info });
      calloutOpeners.set(line.from, info);
    }
    for (const ancestor of activeCallouts) {
      if (ancestor.info.bodyFrom < line.to) ancestor.info.bodyTo = line.to;
    }
    const callout = nativeCallouts.lineAttributes.get(line.from) ??
      (activeCallouts.length ? { ...activeCallouts[activeCallouts.length - 1], isTitle: Boolean(opener) } : null);
    if (callout) {
      entry.callout = callout;
      entry.classes.add('cm-callout');
      entry.classes.add(callout.isTitle ? 'cm-callout-title' : 'cm-callout-body');
      entry.styles.push(`--callout-depth-offset:${Math.max(0, callout.depth - 1) * 12}px`);
    } else if (quoteDepth && settings.blockquote?.enabled !== false) {
      entry.classes.add('cm-blockquote');
      entry.styles.push(`--blockquote-depth-offset:${Math.max(0, quoteDepth - 1) * 12}px`);
    }
    if (heading) {
      const level = getHeadingLevel(heading.name);
      const flavor = getHeadingFlavor(heading.name, doc.sliceString(heading.from, heading.to));
      if (isHeadingFlavorEnabled(settings.heading, flavor)) {
        entry.kind = 'heading';
        entry.classes.add('cm-heading');
        entry.classes.add(`cm-heading-${level}`);
      } else entry.classes.add('cm-heading-syntax-literal');
    }
    const ordered = orderedByLine.get(number);
    const nativeTask = isListFlavorEnabled(settings.list, 'wmdx') &&
      /^[ \t]*\[[ xX]\](?=[ \t]|$)/.test(line.text);
    const prefixLength = quotePrefix.length || leading.length;
    const markerMatch = /^(?:[-+*]|\d+[.)]|[A-Za-z]+[.)]|\[[ xX]\])(?:[ \t]+\[[ xX]\])?(?:[ \t]+|$)/
      .exec(line.text.slice(prefixLength));
    const firstItemLine = item ? doc.lineAt(item.from) : null;
    const hasMarker = lists && markerMatch &&
      ((item && firstItemLine.number === number) || ordered || (nativeTask && task));
    if (hasMarker) {
      entry.kind = 'list';
      entry.listDepth = Math.max(0, depth - 1);
      // Wmdx's alphabetic/Roman lists are supplementary syntax. Their source
      // indentation expresses nesting; top-level optional Markdown spaces do not.
      const sourceIndent = getMarkdownSourceIndentColumns(line.text);
      const nesting = item ? (depth > 1 ? sourceIndent : 0) : sourceIndent;
      entry.styles.push(`--list-depth-offset:${nesting ? `${nesting}ch` : '0px'}`);
      entry.styles.push('--list-quote-inset:var(--list-left-indent, 24px)');
      entry.classes.add('cm-list-item');
      if (callout) entry.classes.add('cm-callout-list-item');
      const taskEnabled = nativeTask || (isListFlavorEnabled(settings.list, 'markdown') &&
        settings.list.gfmTasks !== false && /\[[ xX]\]/.test(markerMatch[0]));
      if (taskEnabled) entry.classes.add('cm-todo-list-item');
      if (nativeTask) entry.classes.add('cm-wmdx-task-item');
      entry.marker = {
        from: line.from + prefixLength,
        to: line.from + prefixLength + markerMatch[0].length
      };
      entry.contentFrom = entry.marker.to;
      if (!item) supplementaryOwner = {
        indent: sourceIndent, width: markerMatch[0].length,
        nesting, quoteDepth
      };
    } else if (lists && item && firstItemLine.number < number) {
      entry.kind = 'list-continuation';
      entry.classes.add('cm-list-continuation');
      const rootPrefix = /^[ \t]*(?:>[ \t]*)*(?:[-+*]|\d+[.)])(?:[ \t]+\[[ xX]\])?[ \t]+/.exec(firstItemLine.text)?.[0] ?? '';
      const ownerIndent = depth > 1 ? getMarkdownSourceIndentColumns(firstItemLine.text) : 0;
      entry.styles.push(`--list-depth-offset:${ownerIndent ? `${ownerIndent}ch` : '0px'}`);
      entry.styles.push(`--list-continuation-offset:${Math.max(rootPrefix.trimStart().length, sourceIndent - ownerIndent)}ch`);
    } else if (lists && supplementaryOwner && line.text.trim() &&
        sourceIndent > supplementaryOwner.indent && quoteDepth === supplementaryOwner.quoteDepth) {
      entry.kind = 'list-continuation';
      entry.classes.add('cm-list-continuation');
      entry.styles.push(`--list-depth-offset:${supplementaryOwner.nesting}ch`);
      entry.styles.push(`--list-continuation-offset:${Math.max(supplementaryOwner.width, sourceIndent - supplementaryOwner.nesting)}ch`);
    } else if (paragraph) {
      entry.kind = entry.kind === 'heading' ? entry.kind : 'paragraph';
      entry.classes.add('cm-paragraph');
      if (number === doc.lineAt(paragraph.from).number) entry.classes.add('cm-paragraph-first');
      if (number === doc.lineAt(Math.max(paragraph.from, paragraph.to - 1)).number) entry.classes.add('cm-paragraph-last');
    }
    if (line.text.trim() && entry.kind !== 'list' && entry.kind !== 'list-continuation') supplementaryOwner = null;
    const indentation = Math.max(sourceIndent, paragraph
      ? getMarkdownSourceIndentColumns(doc.lineAt(paragraph.from).text) : 0);
    if (indentation && (entry.kind === 'paragraph' || entry.kind === 'heading') && !callout) {
      entry.classes.add('cm-source-indented');
      entry.styles.push(`--source-indent-offset:${indentation}ch`);
    }
  }
  return { blocks, lines, tables, codeBlocks, orderedItems, nativeCallouts, calloutOpeners };
}
