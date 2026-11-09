import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { normalizeMarkdownOrderedListText } from './listSyntax.mjs';
import {
  convertFromHtml,
  convertFromMarkdown,
  exportMarkdown
} from './markdownConversion.mjs';
import { normalizeMarkdownDialectProfile } from './markdownDialectPreferences.mjs';
import { parseWmdxResourceSyntax } from './wmdxResources.js';

const MAX_AUTO_PASTE_HTML_LENGTH = 200_000;

function containsWmdxSyntax(text) {
  if (/^[ \t]*\.[1-6][ \t]+\S/m.test(text) ||
      /^[ \t]*±[A-Za-z][\w-]*(?:[+-])?(?:[ \t]|$)/m.test(text) ||
      /(?<![~\\])~(?!~)(\S(?:[^~\n]*?\S)?)~(?!~)/u.test(text) ||
      /(?<![\\^])\^([^\s^\n](?:[^^\n]*?[^\s^\n])?)\^(?!\^)/u.test(text) ||
      /==[₀₁₂]\S[^=\n]*==/u.test(text) ||
      /(?<![=\\])=(?:[₀₁₂])?\S[^=\n]*?=(?![=])/u.test(text) ||
      /(?<![_\\])_[₀₁₂₃]\S[^_\n]*?_/u.test(text) ||
      /^[ \t]*_[0-9]+_[ \t]*$/m.test(text)) {
    return true;
  }
  return Array.from(text.matchAll(/(?<!\[)!?\[[^\]\n|]*\|[^\]\n|]*\|[^\]\n|]*\|[^\]\n]*\](?!\])/g))
    .some(match => Boolean(parseWmdxResourceSyntax(match[0])));
}

export function detectMarkdownPasteDialect(source) {
  const text = String(source ?? '');
  if (!text.trim()) return null;
  if (containsWmdxSyntax(text)) return 'wmdx';
  if (
    /!\[\[[^\]\n]+\]\]|\[\[[^\]\n]+\]\]|>\s*\[![\w-]+\]|%%|\^\[[^\]\n]+\]/.test(text) ||
    /(?<![\\])==(?!(?:[₀₁₂]))[^=\n]+==/u.test(text)
  ) {
    return 'obsidian';
  }
  if (
    /^[ \t]*[-+*][ \t]+\[[ xX]\][ \t]+/m.test(text) ||
    /^[ \t]*\|?.+\|.+\n[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/m.test(text) ||
    /~~[^~\n]+~~/.test(text)
  ) {
    return 'gfm';
  }
  if (
    /^[ \t]{0,3}(?:#{1,6}[ \t]+\S|>[ \t]?|[-+*][ \t]+\S|\d+[.)][ \t]+\S|`{3,}|~{3,})/m.test(text) ||
    /!?\\?\[[^\]\n]+\]\([^)]+\)|\[\^[^\]\n]+\](?::|[ \t])|\*\*[^*\n]+\*\*|_[^_\n]+_/.test(text)
  ) {
    return 'commonmark';
  }
  return null;
}

function conversionHasLoss(warnings) {
  return Array.isArray(warnings) && warnings.length > 0;
}

/**
 * Convert confidently recognized clipboard Markdown/HTML to the selected
 * authoring dialect. Ambiguous text and lossy conversions remain untouched;
 * the explicit conversion action remains available for those cases.
 */
export function convertClipboardToMarkdownProfile(
  { text = '', html = '' } = {},
  profileValue = 'wmdx',
  Parser = globalThis.DOMParser
) {
  const plain = String(text ?? '');
  const htmlSource = String(html ?? '');
  const profile = normalizeMarkdownDialectProfile(profileValue);

  if (htmlSource.trim() && htmlSource.length <= MAX_AUTO_PASTE_HTML_LENGTH) {
    try {
      const imported = convertFromHtml(htmlSource, Parser);
      if (imported.markdown && !conversionHasLoss(imported.warnings)) {
        const output = profile === 'wmdx'
          ? imported.markdown
          : exportMarkdown(imported.markdown, profile);
        if (!conversionHasLoss(output.warnings)) {
          return {
            markdown: output.markdown,
            converted: output.markdown !== plain,
            sourceDialect: 'html',
            warnings: []
          };
        }
      }
    } catch {
      // Fall through to the clipboard's plain-text representation.
    }
  }

  const sourceDialect = detectMarkdownPasteDialect(plain);
  if (!sourceDialect || sourceDialect === profile) {
    return { markdown: plain, converted: false, sourceDialect, warnings: [] };
  }

  try {
    if (sourceDialect === 'wmdx') {
      const output = exportMarkdown(plain, profile);
      if (conversionHasLoss(output.warnings)) {
        return {
          markdown: plain,
          converted: false,
          sourceDialect,
          warnings: output.warnings
        };
      }
      return {
        markdown: output.markdown,
        converted: output.markdown !== plain,
        sourceDialect,
        warnings: []
      };
    }

    const imported = convertFromMarkdown(plain, sourceDialect);
    if (conversionHasLoss(imported.warnings)) {
      return { markdown: plain, converted: false, sourceDialect, warnings: imported.warnings };
    }
    const output = profile === 'wmdx'
      ? imported
      : exportMarkdown(imported.markdown, profile);
    const warnings = [...imported.warnings, ...(output.warnings ?? [])];
    if (conversionHasLoss(warnings)) {
      return { markdown: plain, converted: false, sourceDialect, warnings };
    }
    return {
      markdown: output.markdown,
      converted: output.markdown !== plain,
      sourceDialect,
      warnings: []
    };
  } catch {
    return { markdown: plain, converted: false, sourceDialect, warnings: [] };
  }
}

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

function parseClipboardPayload(raw) {
  if (raw && typeof raw === 'object') {
    return {
      text: String(raw.text ?? ''),
      html: String(raw.html ?? '')
    };
  }
  if (typeof raw !== 'string' || !raw) return { text: '', html: '' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        text: String(parsed.text ?? ''),
        html: String(parsed.html ?? '')
      };
    }
  } catch {
    // Older app builds expose only the plain-text clipboard method.
  }
  return { text: raw, html: '' };
}

function readAndroidClipboardPayload() {
  try {
    const native = globalThis.window?.AndroidNative;
    if (typeof native?.readClipboardPayload === 'function') {
      return parseClipboardPayload(native.readClipboardPayload());
    }
    return parseClipboardPayload(
      typeof native?.readClipboard === 'function' ? native.readClipboard() : ''
    );
  } catch {
    return { text: '', html: '' };
  }
}

function getEventClipboardPayload(event, allowNativeFallback = false) {
  const payload = { text: '', html: '' };
  try {
    const transfer = event.clipboardData || event.dataTransfer;
    payload.text = transfer?.getData('text/plain') ||
      transfer?.getData('text') || '';
    payload.html = transfer?.getData('text/html') || '';
  } catch {
    // Some WebView clipboard adapters expose only one of the representations.
  }
  if (allowNativeFallback && (!payload.text || !payload.html)) {
    const native = readAndroidClipboardPayload();
    if (!payload.text) payload.text = native.text;
    if (!payload.html) payload.html = native.html;
  }
  return payload;
}

function extractPlainHtmlText(html) {
  if (!html || html.length > MAX_AUTO_PASTE_HTML_LENGTH) return '';
  try {
    const Parser = globalThis.DOMParser;
    if (typeof Parser !== 'function') return '';
    const document = new Parser().parseFromString(html, 'text/html');
    document.body.querySelectorAll(
      'script, style, iframe, object, embed, form'
    ).forEach(node => node.remove());
    return String(document.body.textContent ?? '').trim();
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
  transformPastedText,
  isBlockquoteEnabled,
  clipboardPayload = { text, html: '', isPaste: userEvent === 'input.paste' }
) {
  const htmlText = String(clipboardPayload?.html ?? '');
  const plainText = String(text ?? '') || extractPlainHtmlText(htmlText);
  if (
    view.state.readOnly ||
    view.state.selection.ranges.length !== 1 ||
    (!plainText && !htmlText)
  ) {
    return false;
  }

  const transformedText = String(
    transformPastedText(plainText, {
      ...clipboardPayload,
      text: plainText,
      html: htmlText,
      isPaste: clipboardPayload?.isPaste === true
    }) ?? ''
  );
  if (!transformedText) {
    // Do not let the browser insert unsanitized HTML when the provider gave
    // no usable plain-text representation and conversion produced no text.
    return Boolean(htmlText && clipboardPayload?.isPaste);
  }
  const blockquotesEnabled = isBlockquoteEnabled();
  const pasteRange = blockquotesEnabled
    ? quotePasteInsertionRange(view.state, from, to)
    : { from, to };
  const multiline = transformedText.includes('\n');
  const context = multiline || !blockquotesEnabled
    ? null
    : blockquoteContext(view.state, pasteRange.from);
  const quotedText = multiline && blockquotesEnabled
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
    quotedText === plainText &&
    !htmlText &&
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
  transformPastedText = normalizeMarkdownOrderedListText,
  isBlockquoteEnabled = () => true
) {
  return [
    EditorView.domEventHandlers({
      paste(event, view) {
        const clipboard = getEventClipboardPayload(event, true);
        const { from, to } = view.state.selection.main;
        const handled = insertQuoteAwareText(
          view,
          from,
          to,
          clipboard.text,
          'input.paste',
          transformPastedText,
          isBlockquoteEnabled,
          { ...clipboard, isPaste: true }
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
        const clipboard = readAndroidClipboardPayload();
        const handled = insertQuoteAwareText(
          view,
          from,
          to,
          clipboard.text,
          'input.paste',
          transformPastedText,
          isBlockquoteEnabled,
          { ...clipboard, isPaste: true }
        );
        if (handled) event.preventDefault();
        return handled;
      },
      beforeinput(event, view) {
        const isPaste = event.inputType === 'insertFromPaste';
        const clipboard = getEventClipboardPayload(event, isPaste);
        const text = clipboard.text || event.data || '';
        const { from, to } = view.state.selection.main;
        const handled = insertQuoteAwareText(
          view,
          from,
          to,
          text,
          isPaste ? 'input.paste' : 'input.type',
          transformPastedText,
          isBlockquoteEnabled,
          { ...clipboard, isPaste }
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
        transformPastedText,
        isBlockquoteEnabled,
        { text, html: '', isPaste: text?.includes('\n') === true }
      )
    )
  ];
}

export const markdownBlockquotePaste = createMarkdownBlockquotePaste();
