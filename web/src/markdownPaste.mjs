import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

function blockquoteContext(state, position) {
  if (!state?.doc || !Number.isInteger(position)) {
    return { depth: 0, firstLineIsQuoted: false };
  }

  const safePosition = Math.max(0, Math.min(position, state.doc.length));
  const line = state.doc.lineAt(safePosition);
  const quotePrefix = /^[ \t]*(?:>[ \t]*)+/.exec(line.text);
  const quotePrefixEnd = line.from + (quotePrefix?.[0].length ?? 0);

  if (quotePrefix && safePosition < quotePrefixEnd) {
    return { depth: 0, firstLineIsQuoted: false };
  }

  const firstText = /\S/.exec(line.text);
  const probe = quotePrefix
    ? Math.max(line.from, Math.min(line.to - 1, quotePrefixEnd - 1))
    : firstText
      ? line.from + firstText.index
      : Math.max(line.from, line.to - 1);

  let depth = 0;
  for (
    let node = syntaxTree(state).resolveInner(probe, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'Blockquote') depth++;
  }

  return {
    depth,
    firstLineIsQuoted: depth > 0 &&
      (!quotePrefix || safePosition >= quotePrefixEnd)
  };
}

export function quotePasteInsertionRange(state, from, to) {
  if (!state?.doc || from !== to || !Number.isInteger(from)) {
    return { from, to };
  }

  const safePosition = Math.max(0, Math.min(from, state.doc.length));
  const line = state.doc.lineAt(safePosition);
  const quotePrefix = /^[ \t]*(?:>[ \t]*)+/.exec(line.text);
  if (!quotePrefix) return { from, to };

  const quotePrefixEnd = line.from + quotePrefix[0].length;
  if (
    safePosition >= quotePrefixEnd ||
    line.text.slice(quotePrefix[0].length).trim() !== ''
  ) {
    return { from, to };
  }

  return { from: quotePrefixEnd, to: quotePrefixEnd };
}

export function quoteMultilinePaste(state, from, to, text) {
  if (typeof text !== 'string' || !text.includes('\n')) return text;

  const startContext = blockquoteContext(state, from);
  if (startContext.depth === 0) return text;

  if (to > from) {
    const endContext = blockquoteContext(state, to - 1);
    if (endContext.depth !== startContext.depth) return text;
  }

  const quotePrefix = '> '.repeat(startContext.depth);
  return text
    .split('\n')
    .map((line, index) => (
      index === 0 && startContext.firstLineIsQuoted
        ? line
        : `${quotePrefix}${line}`
    ))
    .join('\n');
}

export const markdownBlockquotePaste = EditorView.domEventHandlers({
  paste(event, view) {
    if (view.state.readOnly || view.state.selection.ranges.length !== 1) {
      return false;
    }

    let text;
    try {
      text = event.clipboardData?.getData('text/plain');
      if (!text) text = event.clipboardData?.getData('text');
      if (
        !text &&
        typeof globalThis.window?.AndroidNative?.readClipboard === 'function'
      ) {
        text = globalThis.window.AndroidNative.readClipboard();
      }
    } catch {
      return false;
    }
    if (typeof text !== 'string' || !text.includes('\n')) return false;

    const { from, to } = view.state.selection.main;
    const pasteRange = quotePasteInsertionRange(view.state, from, to);
    const quotedText = quoteMultilinePaste(
      view.state,
      pasteRange.from,
      pasteRange.to,
      text
    );
    if (
      quotedText === text &&
      pasteRange.from === from &&
      pasteRange.to === to
    ) {
      return false;
    }

    event.preventDefault();
    view.dispatch({
      changes: {
        from: pasteRange.from,
        to: pasteRange.to,
        insert: quotedText
      },
      selection: { anchor: pasteRange.from + quotedText.length },
      userEvent: 'input.paste'
    });
    return true;
  }
});
