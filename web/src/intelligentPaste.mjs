import { convertFromHtml, convertFromMarkdown, exportMarkdown } from './markdownConversion.mjs';

/**
 * Detects whether raw string contains HTML tags
 */
export function isHtmlSnippet(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.includes('<') || !trimmed.includes('>')) return false;
  return /<(?:p|div|span|h[1-6]|ul|ol|li|table|tr|td|th|a|img|blockquote|pre|code|strong|b|em|i|u|del|s|details|summary|dl|dt|dd)[^>]*>/i.test(trimmed);
}

/**
 * Detects the most likely source markdown dialect of a snippet
 */
export function detectMarkdownDialect(text) {
  if (typeof text !== 'string') return 'commonmark';
  // Obsidian markers: [[...]], > [!type], %% comment %%, ^[footnote]
  if (/\[\[[^\]]+\]\]|> *\[![a-z]+\]|%%|\^\[[^\]]+\]/i.test(text)) {
    return 'obsidian';
  }
  // GFM markers: pipe table (|---|), task lists (- [ ] or - [x]), strikethrough (~~...~~)
  if (/\|[ \t]*:?---+:?[ \t]*\||^\s*[-*+]\s*\[[ xX]\]|~~[^~]+~~/m.test(text)) {
    return 'gfm';
  }
  return 'commonmark';
}

/**
 * Intelligently converts pasted text (HTML or Markdown) into the target flavor.
 * Target flavor hierarchy: wmdx > obsidian > gfm > commonmark.
 */
export function convertPastedContent(rawText, targetFlavor = 'wmdx', parser = globalThis.DOMParser) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return rawText;
  }

  // 1. If HTML, convert to Wmdx then export to target flavor if needed
  if (isHtmlSnippet(rawText)) {
    try {
      const { markdown } = convertFromHtml(rawText, parser);
      if (targetFlavor === 'wmdx') {
        return markdown;
      }
      const { markdown: exported } = exportMarkdown(markdown, targetFlavor);
      return exported;
    } catch {
      return rawText;
    }
  }

  // 2. If already Wmdx target:
  if (targetFlavor === 'wmdx') {
    const sourceDialect = detectMarkdownDialect(rawText);
    try {
      const { markdown } = convertFromMarkdown(rawText, sourceDialect);
      return markdown;
    } catch {
      return rawText;
    }
  }

  // 3. For target other than Wmdx: convert to Wmdx intermediate, then export to target flavor
  try {
    const sourceDialect = detectMarkdownDialect(rawText);
    const { markdown: wmdxText } = convertFromMarkdown(rawText, sourceDialect);
    const { markdown: targetText } = exportMarkdown(wmdxText, targetFlavor);
    return targetText;
  } catch {
    return rawText;
  }
}
