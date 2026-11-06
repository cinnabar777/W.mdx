import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { normalizeMarkdownOrderedListText } from './listSyntax.mjs';

function blockquoteContext(state, position) {
  if (!state?.doc || !Number.isInteger(position)) {
    return {
      depth: 0,
      firstLineIsQuoted: false,
      needsSeparatorAfterPrefix: false
    };
  }

  const safePosition = Math.max(0, Math.min(position, state.doc.length));
  const line = state.doc.lineAt(safePosition);
  const quotePrefix = /^[ \t]*(?:>[ \t]*)+/.exec(line.text);
  const quotePrefixEnd = line.from + (quotePrefix?.[0].length ?? 0);

  if (quotePrefix && safePosition < quotePrefixEnd) {
    return {
      depth: 0,
      firstLineIsQuoted: false,
      needsSeparatorAfterPrefix: false
    };
  }

  const firstText = /\S/.exec(line.text);
  const probe = quotePrefix
    ? Math.max(line.from, Math.min(line.to - 1, quotePrefixEnd - 1))
    : firstText
      ? line.from + firstText.index
      : Math.max(line.from, line.to - 1);

  let depth = 0;
  let blockedContext = false;
  for (
    let node = syntaxTree(state).resolveInner(probe, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'Blockquote') depth++;
    if (
      node.name === 'FencedCode' ||
      node.name === 'CodeBlock' ||
      node.name === 'Table'
    ) {
      blockedContext = true;
    }
  }
  if (blockedContext) depth = 0;
  else if (depth === 0 && quotePrefix) {
    depth = (quotePrefix[0].match(/>/g) || []).length;
  }

  return {
    depth,
    firstLineIsQuoted: depth > 0 &&
      (!quotePrefix || safePosition >= quotePrefixEnd),
    needsSeparatorAfterPrefix: Boolean(
      depth > 0 &&
      quotePrefix &&
      safePosition === quotePrefixEnd &&
      !/[ \t]$/.test(quotePrefix[0])
    )
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
        ? `${startContext.needsSeparatorAfterPrefix ? ' ' : ''}${line}`
        : `${quotePrefix}${line}`
    ))
    .join('\n');
}

function readAndroidClipboard() {
  try {
    const readClipboard = globalThis.window?.AndroidNative?.readClipboard;
    return typeof readClipboard === 'function'
      ? globalThis.window.AndroidNative.readClipboard()
      : '';
  } catch {
    return '';
  }
}

function insertQuoteAwareText(
  view,
  from,
  to,
  text,
  userEvent,
  transformPastedText
) {
  if (
    view.state.readOnly ||
    view.state.selection.ranges.length !== 1 ||
    typeof text !== 'string' ||
    !text
  ) {
    return false;
  }

  const transformedText = transformPastedText(text);
  const pasteRange = quotePasteInsertionRange(view.state, from, to);
  const multiline = transformedText.includes('\n');
  const context = multiline
    ? null
    : blockquoteContext(view.state, pasteRange.from);
  const quotedText = multiline
    ? quoteMultilinePaste(
        view.state,
        pasteRange.from,
        pasteRange.to,
        transformedText
      )
    : context?.needsSeparatorAfterPrefix
      ? ` ${transformedText}`
      : transformedText;
  if (
    quotedText === text &&
    pasteRange.from === from &&
    pasteRange.to === to
  ) {
    return false;
  }

  view.dispatch({
    changes: {
      from: pasteRange.from,
      to: pasteRange.to,
      insert: quotedText
    },
    selection: { anchor: pasteRange.from + quotedText.length },
    userEvent
  });
  return true;
}

export function createMarkdownBlockquotePaste(
  transformPastedText = normalizeMarkdownOrderedListText
) {
  return [
    EditorView.domEventHandlers({
      paste(event, view) {
        let text;
        try {
          text = event.clipboardData?.getData('text/plain');
          if (!text) text = event.clipboardData?.getData('text');
        } catch {
          text = '';
        }
        if (!text) text = readAndroidClipboard();
        const { from, to } = view.state.selection.main;
        const handled = insertQuoteAwareText(
          view,
          from,
          to,
          text,
          'input.paste',
          transformPastedText
        );
        if (handled) event.preventDefault();
        return handled;
      },
      keydown(event, view) {
        const isPasteShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          (event.key || '').toLowerCase() === 'v';
        if (!isPasteShortcut) return false;
        const { from, to } = view.state.selection.main;
        const handled = insertQuoteAwareText(
          view,
          from,
          to,
          readAndroidClipboard(),
          'input.paste',
          transformPastedText
        );
        if (handled) event.preventDefault();
        return handled;
      },
      beforeinput(event, view) {
        let text = '';
        try {
          text = event.dataTransfer?.getData('text/plain') || event.data || '';
        } catch {
          text = event.data || '';
        }
        if (!text && event.inputType === 'insertFromPaste') {
          text = readAndroidClipboard();
        }
        const { from, to } = view.state.selection.main;
        const handled = insertQuoteAwareText(
          view,
          from,
          to,
          text,
          'input.paste',
          transformPastedText
        );
        if (handled) event.preventDefault();
        return handled;
      }
    }),
    EditorView.inputHandler.of((view, from, to, text) =>
      insertQuoteAwareText(
        view,
        from,
        to,
        text,
        text?.includes('\n') ? 'input.paste' : 'input.type',
        transformPastedText
      )
    )
  ];
}

export const markdownBlockquotePaste = createMarkdownBlockquotePaste();
