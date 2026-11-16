import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { GFM, Strikethrough, Table, TaskList } from '@lezer/markdown';
import { marked } from 'marked';
import TurndownService from 'turndown';
import {
  formatWmdxResourceSyntax,
  getWmdxResourceFallbackTitle,
  parseWmdxResourceSyntax
} from './wmdxResources.js';
import { wmdxCommonMarkCompatibility } from './commonmark-compat.mjs';
import {
  getOrderedMarkerLabel,
  getWmdxOrderedListSequence,
  parseWmdxOrderedListMarker
} from './listSyntax.mjs';
import { encodeMarkdownDestination } from './wmdxLinkSyntax.mjs';
import { escapeMarkdownField } from './markdownEscaping.js';

const markdownConversionParser = markdown({
  extensions: [
    GFM,
    Table,
    Strikethrough,
    TaskList,
    wmdxCommonMarkCompatibility
  ]
});

const MARKDOWN_CONVERSION_PARSE_TIMEOUT_MS = 10_000;

function completeMarkdownSyntaxTree(state) {
  const tree = ensureSyntaxTree(
    state,
    state.doc.length,
    MARKDOWN_CONVERSION_PARSE_TIMEOUT_MS
  );
  if (!tree || tree.length < state.doc.length) {
    throw new Error(
      'Conversion stopped because the complete Markdown document could not be parsed safely.'
    );
  }
  return tree;
}

export const MARKDOWN_IMPORT_FORMATS = Object.freeze([
  'commonmark', 'gfm', 'obsidian', 'html'
]);
export const MARKDOWN_EXPORT_FORMATS = Object.freeze([
  'commonmark', 'gfm', 'obsidian'
]);

const nestedEmphasisMarkers = Object.freeze({
  emOpen: '\uE000WMDX_NESTED_EM_OPEN\uE001',
  emClose: '\uE000WMDX_NESTED_EM_CLOSE\uE001',
  strongOpen: '\uE000WMDX_NESTED_STRONG_OPEN\uE001',
  strongClose: '\uE000WMDX_NESTED_STRONG_CLOSE\uE001'
});

function restoreNestedEmphasisMarkers(source) {
  return String(source ?? '')
    .replaceAll(nestedEmphasisMarkers.emOpen, '<em>')
    .replaceAll(nestedEmphasisMarkers.emClose, '</em>')
    .replaceAll(nestedEmphasisMarkers.strongOpen, '<strong>')
    .replaceAll(nestedEmphasisMarkers.strongClose, '</strong>');
}

function protectHtmlTagTokens(source, protect) {
  const htmlTagStart = /^<\/?[a-z][\w:-]*/i;
  let output = '';
  for (let index = 0; index < source.length;) {
    if (source[index] !== '<' || !htmlTagStart.test(source.slice(index))) {
      output += source[index++];
      continue;
    }

    let quote = null;
    let end = source.length;
    for (let cursor = index + 1; cursor < source.length; cursor++) {
      const character = source[cursor];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        end = cursor + 1;
        break;
      }
    }
    output += protect(source.slice(index, end));
    index = end;
  }
  return output;
}

function protectTagMarkupInsideAttributes(source, protect) {
  const htmlTagStart = /^<\/?[a-z][\w:-]*/i;
  const tagEnd = (text, start) => {
    let quote = null;
    for (let index = start + 1; index < text.length; index++) {
      const character = text[index];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        return index + 1;
      }
    }
    return text.length;
  };
  let output = '';
  for (let index = 0; index < source.length;) {
    if (source[index] !== '<' || !htmlTagStart.test(source.slice(index))) {
      output += source[index++];
      continue;
    }

    const start = index;
    let quote = null;
    let containsTagMarkup = false;
    let end = source.length;
    for (let cursor = start + 1; cursor < source.length; cursor++) {
      const character = source[cursor];
      if (quote) {
        if (character === quote) {
          quote = null;
        } else if (character === '<' && htmlTagStart.test(source.slice(cursor))) {
          containsTagMarkup = true;
          cursor = tagEnd(source, cursor) - 1;
        }
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        end = cursor + 1;
        break;
      }
    }
    const markup = source.slice(start, end);
    output += containsTagMarkup ? protect(markup) : markup;
    index = end;
  }
  return output;
}

function nestedInlineEmphasisHtmlRanges(source) {
  if (!/[*_]/.test(source) || !/<\/?(?:em|i|strong|b)\b/i.test(source)) return [];
  const state = EditorState.create({
    doc: source,
    extensions: [markdownConversionParser]
  });
  const cursor = completeMarkdownSyntaxTree(state).cursor();
  const readNode = () => {
    const node = {
      name: cursor.name,
      from: cursor.from,
      to: cursor.to,
      children: []
    };
    if (cursor.firstChild()) {
      do {
        node.children.push(readNode());
      } while (cursor.nextSibling());
      cursor.parent();
    }
    return node;
  };
  const root = readNode();
  const ranges = [];
  const visit = node => {
    const matchingTags = node.name === 'Emphasis'
      ? new Set(['em', 'i'])
      : node.name === 'StrongEmphasis'
        ? new Set(['strong', 'b'])
        : null;
    if (matchingTags) {
      const openTags = [];
      for (const child of node.children) {
        if (child.name !== 'HTMLTag') continue;
        const token = /^<\s*(\/?)\s*([a-z]+)/i.exec(source.slice(child.from, child.to));
        if (!token || !matchingTags.has(token[2].toLowerCase())) continue;
        const name = token[2].toLowerCase();
        if (!token[1]) {
          openTags.push({ name, from: child.from });
          continue;
        }
        const openIndex = openTags.map(open => open.name).lastIndexOf(name);
        if (openIndex >= 0) {
          ranges.push({ from: openTags[openIndex].from, to: child.to });
          openTags.splice(openIndex, 1);
        }
      }
    }
    node.children.forEach(visit);
  };
  visit(root);

  const outermost = [];
  for (const range of ranges.sort((left, right) =>
    left.from - right.from || right.to - left.to
  )) {
    if (outermost.some(parent => parent.from <= range.from && parent.to >= range.to)) {
      continue;
    }
    outermost.push(range);
  }
  return outermost;
}

function addWarning(warnings, message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function isEscapedMarkdownDelimiter(text, offset) {
  let backslashes = 0;
  for (let index = offset - 1; index >= 0 && text[index] === '\\'; index--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function warnInlineHtmlStyle(attributes, warnings) {
  if (/\bstyle\s*=/i.test(attributes ?? '')) {
    addWarning(warnings, 'Unmapped inline CSS styling was ignored during Markdown import.');
  }
}

function findYamlFrontmatterEndLine(lines) {
  const opening = String(lines[0] ?? '').replace(/^\uFEFF/, '').replace(/\r$/, '');
  if (!/^---[ \t]*$/.test(opening)) return -1;
  for (let index = 1; index < lines.length; index += 1) {
    const line = String(lines[index] ?? '').replace(/\r$/, '');
    if (/^(?:---|\.\.\.)[ \t]*$/.test(line)) return index;
  }
  return -1;
}

function protectCodeFences(source, transformLines) {
  const newline = String(source).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const protectedLines = new Set();
  let fence = null;
  let mathFence = null;
  let protectedMathLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      protectedLines.add(index);
      const close = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    if (
      mathFence &&
      opening &&
      !(opening[1][0] === '`' && opening[2].includes('`'))
    ) {
      // A Markdown code fence takes precedence over an unmatched math opener.
      // Otherwise the abandoned math range can consume and later unprotect the
      // code fence, allowing Wmdx inline syntax to rewrite code contents.
      mathFence = null;
      protectedMathLines = [];
    }
    if (mathFence) {
      protectedLines.add(index);
      protectedMathLines.push(index);
      if (
        (mathFence === '$$' && /^\s*\$\$\s*$/.test(line)) ||
        (mathFence === '\\]' && /^\s*\\\]\s*$/.test(line)) ||
        (mathFence.startsWith('\\end{') && line.includes(mathFence))
      ) {
        mathFence = null;
        protectedMathLines = [];
      }
      continue;
    }
    if (
      opening &&
      !(opening[1][0] === '`' && opening[2].includes('`'))
    ) {
      fence = { character: opening[1][0], length: opening[1].length };
      protectedLines.add(index);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      mathFence = '$$';
      protectedLines.add(index);
      protectedMathLines = [index];
      continue;
    }
    if (/^\s*\\\[\s*$/.test(line)) {
      mathFence = '\\]';
      protectedLines.add(index);
      protectedMathLines = [index];
      continue;
    }
    const mathEnvironment = /^\s*\\begin\{(equation|align|gather|multline)\*?\}/.exec(line);
    if (mathEnvironment) {
      mathFence = `\\end{${mathEnvironment[1]}}`;
      protectedLines.add(index);
      protectedMathLines = [index];
    }
  }
  if (mathFence) {
    for (const index of protectedMathLines) protectedLines.delete(index);
  }

  const frontmatterEndLine = findYamlFrontmatterEndLine(lines);
  if (frontmatterEndLine >= 0) {
    for (let index = 0; index <= frontmatterEndLine; index += 1) {
      protectedLines.add(index);
    }
  }

  return transformLines(lines, protectedLines).join(newline);
}

function protectRawHtmlTableLines(lines, protectedLines) {
  let tableDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const openingTables = [...line.matchAll(/<table\b[^>]*>/gi)].length;
    const closingTables = [...line.matchAll(/<\/table\s*>/gi)].length;
    if (tableDepth > 0 || openingTables > 0) protectedLines.add(index);
    tableDepth = Math.max(0, tableDepth + openingTables - closingTables);
  }
}

function findInlineMathRanges(value) {
  const text = String(value ?? '');
  const patterns = [
    /(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$/g,
    /\\\([\s\S]*?\\\)/g,
    /\\\[[\s\S]*?\\\]/g,
    /(?<!\\)\$(?!\$)([^$\n]*[\\^_{}=+*/-][^$\n]*)(?<!\\)\$(?!\$)/g
  ];
  const candidates = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      candidates.push({
        from: match.index,
        to: match.index + match[0].length,
        value: match[0]
      });
    }
  }
  candidates.sort((left, right) =>
    left.from - right.from || right.to - left.to
  );
  const ranges = [];
  for (const candidate of candidates) {
    if (ranges.some(range =>
      candidate.from < range.to && candidate.to > range.from
    )) continue;
    ranges.push(candidate);
  }
  return ranges;
}

function protectInlineMathSyntax(text, protect) {
  let result = String(text ?? '');
  const ranges = findInlineMathRanges(result);
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const { from, to, value } = ranges[index];
    result = result.slice(0, from) + protect(value) + result.slice(to);
  }
  return result;
}

function protectMathForStandardNormalization(source) {
  const values = [];
  const protect = value => {
    const marker = `\uE000MATH${values.length}\uE001`;
    values.push({ marker, value });
    return marker;
  };
  let masked = String(source ?? '')
    .replace(
      /^ {0,3}\$\$[ \t]*\r?\n[\s\S]*?^ {0,3}\$\$[ \t]*(?=\r?$)/gm,
      protect
    )
    .replace(
      /^ {0,3}\\\[[ \t]*\r?\n[\s\S]*?^ {0,3}\\\][ \t]*(?=\r?$)/gm,
      protect
    )
    .replace(
      /^ {0,3}\\begin\{(equation|align|gather|multline)\*?\}[\s\S]*?^ {0,3}\\end\{\1\}[ \t]*(?=\r?$)/gm,
      protect
    );
  masked = protectInlineMathSyntax(masked, protect);
  if (!values.length) return null;
  return {
    masked,
    restore(value) {
      for (const { marker, value: original } of values.reverse()) {
        value = value.replace(marker, () => original);
      }
      return value;
    }
  };
}

function findClosingBracket(text, start, open = '[', close = ']') {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === open) depth += 1;
    if (text[index] === close && --depth === 0) return index;
  }
  return -1;
}

function parseInlineDestination(text, start) {
  let index = start;
  while (/[ \t]/.test(text[index] ?? '')) index += 1;

  let destination = '';
  if (text[index] === '<') {
    const end = text.indexOf('>', index + 1);
    if (end < 0) return null;
    destination = text.slice(index + 1, end);
    index = end + 1;
  } else {
    let depth = 0;
    const destinationStart = index;
    while (index < text.length) {
      const character = text[index];
      if (character === '\\') {
        index += 2;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') {
        if (depth === 0) break;
        depth -= 1;
      }
      if (/[ \t]/.test(character) && depth === 0) break;
      index += 1;
    }
    destination = text.slice(destinationStart, index);
  }

  while (/[ \t]/.test(text[index] ?? '')) index += 1;
  let title = '';
  if (text[index] === '"' || text[index] === "'") {
    const quote = text[index++];
    const end = text.indexOf(quote, index);
    if (end < 0) return null;
    title = text.slice(index, end);
    index = end + 1;
    while (/[ \t]/.test(text[index] ?? '')) index += 1;
  } else if (text[index] === '(') {
    const end = text.indexOf(')', index + 1);
    if (end < 0) return null;
    title = text.slice(index + 1, end);
    index = end + 1;
    while (/[ \t]/.test(text[index] ?? '')) index += 1;
  }
  if (text[index] !== ')') return null;
  return { destination, title, end: index + 1 };
}

function unescapeMarkdown(value) {
  return String(value ?? '').replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
}

function convertInlineLinksToWmdx(line, warnings) {
  let output = '';
  let index = 0;
  let codeTicks = 0;

  while (index < line.length) {
    if (line[index] === '\\') {
      output += line.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (line[index] === '`') {
      let end = index;
      while (line[end] === '`') end += 1;
      const count = end - index;
      if (!codeTicks) codeTicks = count;
      else if (codeTicks === count) codeTicks = 0;
      output += line.slice(index, end);
      index = end;
      continue;
    }
    if (codeTicks || (line[index] !== '[' &&
        !(line[index] === '!' && line[index + 1] === '['))) {
      output += line[index++];
      continue;
    }

    const embed = line[index] === '!';
    const open = index + (embed ? 1 : 0);
    const labelEnd = findClosingBracket(line, open);
    if (labelEnd < 0 || line[labelEnd + 1] !== '(') {
      output += line[index++];
      continue;
    }
    const parsed = parseInlineDestination(line, labelEnd + 2);
    if (!parsed) {
      output += line[index++];
      continue;
    }

    const label = unescapeMarkdown(line.slice(open + 1, labelEnd));
    const destination = unescapeMarkdown(parsed.destination);
    const original = line.slice(index, parsed.end);
    if (embed) {
      // Markdown images are already native W.mdx syntax. Keeping the original
      // spelling also preserves alt-text and avoids inventing a second caption.
      output += original;
    } else if (/^wmdx-(?:audio|video|attachment)(?::|$)/i.test(parsed.title)) {
      output += original;
    } else if (parsed.title) {
      // Markdown link titles have no W.mdx resource field. Keep the original
      // link so the tooltip is not silently discarded during import.
      addWarning(warnings, 'Some link tooltip titles were kept in Markdown syntax.');
      output += original;
    } else if (/[`*_~<>]/.test(label) || label.includes('[')) {
      // Resource titles are plain text. Keep formatted link labels as Markdown
      // rather than flattening their inline formatting.
      output += original;
    } else {
      try {
        output += formatWmdxResourceSyntax({
          source: destination,
          title: label
        });
      } catch {
        output += original;
      }
    }
    index = parsed.end;
  }
  return output;
}

function buildHeadingFragmentLookup(lines, protectedLines) {
  const headings = new Map();
  const occurrences = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    if (protectedLines.has(index)) continue;
    const match = /^\.([1-6])\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) continue;
    const title = match[2].trim();
    const base = headingFragmentSlug(title);
    if (!base) continue;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    const fragment = occurrence === 0 ? base : `${base}-${occurrence}`;
    if (!headings.has(fragment)) {
      headings.set(fragment, occurrence === 0 ? title : `${title} ${occurrence}`);
    }
  }
  return headings;
}

function removeRedundantHeadingAnchors(lines, protectedLines) {
  const nextLines = [];
  const nextProtectedLines = new Set();
  const headingOccurrences = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    if (!protectedLines.has(index)) {
      const anchor = /^\s*<a\s+id=["']([^"']+)["']\s*><\/a>\s*$/i.exec(lines[index]);
      if (anchor) {
        let headingIndex = index + 1;
        while (headingIndex < lines.length && !lines[headingIndex].trim()) headingIndex += 1;
        const heading = !protectedLines.has(headingIndex)
          ? /^\.([1-6])\s+(.+?)\s*$/.exec(lines[headingIndex] ?? '')
          : null;
        if (heading) {
          const base = headingFragmentSlug(heading[2]);
          const occurrence = headingOccurrences.get(base) ?? 0;
          const expectedFragment = occurrence === 0 ? base : `${base}-${occurrence}`;
          if (anchor[1].toLocaleLowerCase() === expectedFragment.toLocaleLowerCase()) {
            index = headingIndex - 1;
            continue;
          }
        }
      }
    }
    const heading = !protectedLines.has(index)
      ? /^\.([1-6])\s+(.+?)\s*$/.exec(lines[index])
      : null;
    if (heading) {
      const base = headingFragmentSlug(heading[2]);
      if (base) headingOccurrences.set(base, (headingOccurrences.get(base) ?? 0) + 1);
    }
    if (protectedLines.has(index)) nextProtectedLines.add(nextLines.length);
    nextLines.push(lines[index]);
  }
  return { lines: nextLines, protectedLines: nextProtectedLines };
}

function convertInternalHeadingLinksToWmdx(line, headings) {
  let output = '';
  let index = 0;
  let codeTicks = 0;

  while (index < line.length) {
    if (line[index] === '\\') {
      output += line.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (line[index] === '`') {
      let end = index;
      while (line[end] === '`') end += 1;
      const count = end - index;
      if (!codeTicks) codeTicks = count;
      else if (codeTicks === count) codeTicks = 0;
      output += line.slice(index, end);
      index = end;
      continue;
    }
    if (codeTicks || line[index] === '!' || line[index] !== '[') {
      output += line[index++];
      continue;
    }

    const labelEnd = findClosingBracket(line, index);
    if (labelEnd < 0 || line[labelEnd + 1] !== '(') {
      output += line[index++];
      continue;
    }
    const parsed = parseInlineDestination(line, labelEnd + 2);
    if (!parsed || !parsed.destination.startsWith('#') || parsed.title) {
      output += line[index++];
      continue;
    }

    let fragment = parsed.destination.slice(1);
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      // Retain malformed percent escapes for a literal, non-matching link.
    }
    const heading = headings.get(headingFragmentSlug(fragment));
    if (!heading) {
      output += line[index++];
      continue;
    }

    const label = unescapeMarkdown(line.slice(index + 1, labelEnd));
    try {
      output += formatWmdxResourceSyntax({
        source: `#${heading}`,
        title: label
      });
    } catch {
      output += line.slice(index, parsed.end);
    }
    index = parsed.end;
  }
  return output;
}

function findObsidianLinkEnd(line, start) {
  for (let index = start; index < line.length - 1; index += 1) {
    if (line[index] === '\\') {
      index += 1;
      continue;
    }
    if (line[index] === ']' && line[index + 1] === ']') return index;
  }
  return -1;
}

function splitObsidianLinkBody(body) {
  let separator = -1;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '\\') {
      index += 1;
      continue;
    }
    if (body[index] === '|') {
      separator = index;
      break;
    }
  }
  const unescape = value => value.replace(/\\([\\|#])/g, '$1').trim();
  return {
    target: unescape(separator < 0 ? body : body.slice(0, separator)),
    alias: separator < 0 ? '' : unescape(body.slice(separator + 1))
  };
}

function convertObsidianLinksToWmdx(line, warnings) {
  let output = '';
  let index = 0;
  let codeTicks = 0;

  while (index < line.length) {
    if (line[index] === '\\') {
      output += line.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (line[index] === '`') {
      let end = index;
      while (line[end] === '`') end += 1;
      const count = end - index;
      codeTicks = codeTicks === count ? 0 : codeTicks || count;
      output += line.slice(index, end);
      index = end;
      continue;
    }

    const embed = line[index] === '!' &&
      line[index + 1] === '[' &&
      line[index + 2] === '[';
    const linkStart = line[index] === '[' &&
      line[index + 1] === '[' ? index : embed ? index + 1 : -1;
    if (codeTicks || linkStart < 0) {
      output += line[index++];
      continue;
    }

    const close = findObsidianLinkEnd(line, linkStart + 2);
    if (close < 0) {
      output += line[index++];
      continue;
    }

    const originalEnd = close + 2;
    const original = line.slice(index, originalEnd);
    const { target, alias } = splitObsidianLinkBody(
      line.slice(linkStart + 2, close)
    );
    if (!target) {
      output += original;
      index = originalEnd;
      continue;
    }

    if (!embed) {
      output += formatWmdxResourceSyntax({
        source: target,
        title: alias
      });
    } else {
      const extension = target.split(/[?#]/, 1)[0]
        .split('.').at(-1)?.toLowerCase() ?? '';
      if (/^(?:avif|bmp|gif|jpe?g|png|svg|webp|mp3|m4a|aac|wav|ogg|oga|opus|flac|mp4|m4v|mov|webm|mkv|3gp|avi|mpeg|mpg|ogv|wmv|pdf|zip|doc|docx|xls|xlsx|ppt|pptx)$/.test(extension)) {
        const width = /^[1-9]\d{0,4}$/.test(alias) ? alias : '';
        const title = width ? '' : alias;
        output += formatWmdxResourceSyntax({
          embed: true,
          source: target,
          title,
          size: width
        });
      } else {
        addWarning(
          warnings,
          'Obsidian note transclusion cannot be imported as an embedded document and was kept unchanged.'
        );
        output += original;
      }
    }
    index = originalEnd;
  }
  return output;
}

function normalizeStandardMarkdownMarkers(source) {
  const sourceText = String(source);
  const newline = sourceText.includes('\r\n') ? '\r\n' : '\n';
  const lines = sourceText.replace(/\r\n/g, '\n').split('\n');
  const frontmatterEndLine = findYamlFrontmatterEndLine(lines);
  if (frontmatterEndLine >= 0) {
    const frontmatter = lines.slice(0, frontmatterEndLine + 1).join('\n');
    const body = lines.slice(frontmatterEndLine + 1).join('\n');
    return (
      `${frontmatter}${frontmatterEndLine < lines.length - 1 ? '\n' : ''}` +
      normalizeStandardMarkdownMarkers(body)
    ).replace(/\n/g, newline);
  }
  const math = protectMathForStandardNormalization(sourceText);
  if (math) {
    const normalizedMath = normalizeStandardMarkdownMarkers(math.masked);
    return math.restore(normalizedMath);
  }
  const state = EditorState.create({
    doc: source,
    extensions: [markdownConversionParser]
  });
  const cursor = completeMarkdownSyntaxTree(state).cursor();
  const readNode = () => {
    const node = {
      name: cursor.name,
      from: cursor.from,
      to: cursor.to,
      children: []
    };
    if (cursor.firstChild()) {
      do {
        node.children.push(readNode());
      } while (cursor.nextSibling());
      cursor.parent();
    }
    return node;
  };
  const root = readNode();
  const normalizationCache = new WeakMap();
  const needsNormalization = node => {
    if (normalizationCache.has(node)) return normalizationCache.get(node);
    if (node.name === 'Escape' && /^\\["']$/.test(source.slice(node.from, node.to))) {
      normalizationCache.set(node, true);
      return true;
    }
    if (node.name === 'EmphasisMark' && /^_+$/.test(source.slice(node.from, node.to))) {
      normalizationCache.set(node, true);
      return true;
    }
    if (node.name === 'HorizontalRule' &&
        /^([ \t]*)_{3,}[ \t]*$/.test(source.slice(node.from, node.to))) {
      normalizationCache.set(node, true);
      return true;
    }
    const needed = node.children.some(needsNormalization);
    normalizationCache.set(node, needed);
    return needed;
  };
  const escapeEmphasisText = text => {
    const underlineDelimiterOffsets = new Set();
    const underlineExpression =
      /(?<![\w\\])_([₀₁₂₃]?)(?![₀₁₂₃]_)(\S(?:[^\n]*?\S)?)_(?!\w)/gu;
    for (const match of text.matchAll(underlineExpression)) {
      underlineDelimiterOffsets.add(match.index);
    }
    let output = '';
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '*' ||
          (character === '_' && underlineDelimiterOffsets.has(index))) {
        let backslashes = 0;
        for (let cursorIndex = index - 1;
          cursorIndex >= 0 && text[cursorIndex] === '\\';
          cursorIndex -= 1) {
          backslashes += 1;
        }
        if (backslashes % 2 === 0) output += '\\';
      }
      output += character;
    }
    return output;
  };
  const protectedEscapeContexts = new Set([
    'Autolink', 'CodeBlock', 'FencedCode', 'HTMLTag', 'Image', 'InlineCode',
    'Link', 'LinkTitle', 'URL'
  ]);
  const normalizeNode = (node, parentEmphasis = null, insideProtectedContext = false) => {
    const protectedContext = insideProtectedContext ||
      protectedEscapeContexts.has(node.name);
    if (
      node.name === 'Escape' &&
      !protectedContext &&
      /^\\["']$/.test(source.slice(node.from, node.to))
    ) {
      return source.slice(node.from + 1, node.to);
    }
    const isEmphasis = node.name === 'Emphasis' || node.name === 'StrongEmphasis';
    if (isEmphasis && (needsNormalization(node) || parentEmphasis === node.name)) {
      const delimiter = node.name === 'StrongEmphasis' ? '**' : '*';
      let content = '';
      let position = node.from;
      for (const child of node.children) {
        if (child.name === 'EmphasisMark') {
          content += escapeEmphasisText(source.slice(position, child.from));
          position = child.to;
          continue;
        }
        content += escapeEmphasisText(source.slice(position, child.from));
        content += normalizeNode(child, node.name, protectedContext);
        position = child.to;
      }
      content += escapeEmphasisText(source.slice(position, node.to));
      if (parentEmphasis === node.name) {
        const open = node.name === 'StrongEmphasis'
          ? nestedEmphasisMarkers.strongOpen
          : nestedEmphasisMarkers.emOpen;
        const close = node.name === 'StrongEmphasis'
          ? nestedEmphasisMarkers.strongClose
          : nestedEmphasisMarkers.emClose;
        return `${open}${content}${close}`;
      }
      return `${delimiter}${content}${delimiter}`;
    }

    if (node.name === 'HorizontalRule') {
      const marker = /^([ \t]*)_{3,}[ \t]*$/.exec(source.slice(node.from, node.to));
      if (marker) return `${marker[1]}---`;
    }
    if (!node.children.length || !needsNormalization(node)) {
      return source.slice(node.from, node.to);
    }

    let output = '';
    let position = node.from;
    for (const child of node.children) {
      output += source.slice(position, child.from);
      output += normalizeNode(child, null, protectedContext);
      position = child.to;
    }
    return output + source.slice(position, node.to);
  };

  return normalizeNode(root);
}

function convertHeadings(source, protectedLines = new Set()) {
  const state = EditorState.create({
    doc: source,
    extensions: [markdownConversionParser]
  });
  const replacements = [];
  const ancestors = [];

  completeMarkdownSyntaxTree(state).iterate({
    enter(node) {
      const nestedInContainer = ancestors.some(name =>
        name === 'Blockquote' || name === 'ListItem'
      );
      ancestors.push(node.name);
      const firstLine = state.doc.lineAt(node.from).number - 1;
      const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number - 1;
      for (let line = firstLine; line <= lastLine; line += 1) {
        if (protectedLines.has(line)) return;
      }
      const atx = /^ATXHeading([1-6])$/.exec(node.name);
      if (atx) {
        // Wmdx decimal markers are not recognized consistently inside Markdown
        // containers; retain the already-supported ATX spelling there.
        if (nestedInContainer) return;
        const raw = source.slice(node.from, state.doc.lineAt(node.from).to);
        const closing = /^(#{1,6})[ \t]+([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/.exec(raw);
        if (!closing) return;
        replacements.push({
          from: node.from,
          to: node.to,
          text: `.${atx[1]} ${closing[2].trimEnd()}`
        });
        return;
      }

      const setext = /^SetextHeading([12])$/.exec(node.name);
      if (!setext) return;

      const line = state.doc.lineAt(node.from);
      const prefix = source.slice(line.from, node.from);
      // Leave container-nested Setext headings in their standards-based form.
      // Their continuation prefixes are dialect syntax too; converting only
      // part of that structure would risk changing list/quote semantics.
      if (!/^ {0,3}$/.test(prefix)) return;

      const raw = source.slice(node.from, node.to);
      const lines = raw.split('\n');
      const underline = lines.pop() ?? '';
      if (!/^[ \t]*[=-]+[ \t]*$/.test(underline)) return;
      if (lines.some(line => /(?: {2,}|\\)$/.test(line))) return;

      const title = lines.map(line => line.trim()).filter(Boolean).join(' ');
      if (!title) return;
      replacements.push({
        from: node.from,
        to: node.to,
        endLine: state.doc.lineAt(Math.max(node.from, node.to - 1)).number - 1,
        removedLineCount: Math.max(
          0,
          state.doc.lineAt(Math.max(node.from, node.to - 1)).number - line.number
        ),
        text: `.${setext[1]} ${title}`
      });
    },
    leave() {
      ancestors.pop();
    }
  });

  let output = source;
  for (const replacement of replacements.sort((left, right) => right.from - left.from)) {
    output = output.slice(0, replacement.from) +
      replacement.text +
      output.slice(replacement.to);
  }
  if (protectedLines.size && replacements.some(item => item.removedLineCount > 0)) {
    const remapped = [...protectedLines].map(lineIndex => {
      const removedBefore = replacements.reduce(
        (total, item) => total + (
          item.endLine < lineIndex ? item.removedLineCount : 0
        ),
        0
      );
      return lineIndex - removedBefore;
    });
    protectedLines.clear();
    for (const lineIndex of remapped) protectedLines.add(lineIndex);
  }
  return output.split('\n');
}

function parseQuoteLine(line) {
  const match = /^([ \t]*(?:>[ \t]*)+)(.*)$/.exec(line);
  if (!match) return null;
  const depth = (match[1].match(/>/g) ?? []).length;
  return { depth, content: match[2] };
}

const GFM_ALERT_TYPES = new Set(['note', 'tip', 'important', 'warning', 'caution']);

function convertObsidianCallouts(lines, protectedLines, format) {
  const output = [...lines];
  const stack = [];
  for (let index = 0; index < output.length; index += 1) {
    if (protectedLines.has(index)) continue;
    const line = output[index];
    const quote = parseQuoteLine(line);
    const parsedOpener = quote &&
      /^\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?(?:[ \t]+(.*))?$/.exec(quote.content);
    const opener = parsedOpener &&
      (format !== 'gfm' || GFM_ALERT_TYPES.has(parsedOpener[1].toLowerCase()))
      ? parsedOpener
      : null;

    while (stack.length && (!quote || quote.depth < stack.at(-1).quoteDepth)) {
      stack.pop();
    }
    if (!quote && line.trim()) stack.length = 0;

    if (opener) {
      const parent = stack.at(-1);
      const indentLevel = parent
        ? parent.indentLevel + Math.max(1, quote.depth - parent.quoteDepth)
        : quote.depth - 1;
      const state = opener[2] ?? '';
      output[index] = `${'  '.repeat(Math.max(0, indentLevel))}±${opener[1].toLowerCase()}${state}` +
        (opener[3] ? ` ${opener[3]}` : '');
      stack.push({ quoteDepth: quote.depth, indentLevel: Math.max(0, indentLevel) });
      continue;
    }

    const active = stack.at(-1);
    if (!active || !quote || quote.depth < active.quoteDepth) continue;
    if (!quote.content.trim()) {
      output[index] = '';
      continue;
    }
    const relativeDepth = quote.depth - active.quoteDepth;
    const remaining = quote.content;
    output[index] = `${'  '.repeat(active.indentLevel + 1 + relativeDepth)}${remaining}`;
  }
  return output;
}

function convertInlineHtmlToMarkdown(line, warnings, Parser) {
  const protectedValues = [];
  const protect = value => {
    const marker = `\uE010${protectedValues.length}\uE011`;
    protectedValues.push({ marker, value });
    return marker;
  };
  let text = String(line ?? '')
    .replace(
      /<((?!(?:a|audio|video|strong|b|em|i|del|s|strike|sup|sub|mark|code|u|ins)\b)[a-z][\w:-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      value => {
        addWarning(
          warnings,
          'Raw HTML was preserved during Markdown conversion; unconverted tags may not render like the source dialect.'
        );
        return protect(value);
      }
    )
    .replace(
      /<code\b[^>]*>[\s\S]*?<\/code\s*>|(`+)([\s\S]*?)\1/g,
      (match, fence) => fence ? protect(match) : match
    )
    .replace(/<!--[\s\S]*?-->/g, protect);
  text = protectTagMarkupInsideAttributes(text, protect);
  for (const range of nestedInlineEmphasisHtmlRanges(text).sort((left, right) =>
    right.from - left.from
  )) {
    text = text.slice(0, range.from) +
      protect(text.slice(range.from, range.to)) +
      text.slice(range.to);
  }
  if (Parser) {
    text = text.replace(
      /<(audio|video)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      (source, tag, offset, wholeText) => {
        if (isEscapedMarkdownDelimiter(wholeText, offset)) return source;
        const media = new Parser().parseFromString(source, 'text/html')
          .querySelector(tag.toLowerCase());
        return media ? htmlBlock(media, warnings) : source;
      }
    );
    text = text.replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, (source, offset, wholeText) => {
      if (isEscapedMarkdownDelimiter(wholeText, offset)) return source;
      const anchor = new Parser().parseFromString(source, 'text/html').querySelector('a');
      if (
        anchor &&
        !anchor.textContent?.trim() &&
        !anchor.querySelector('img, audio, video, br, svg, canvas, input')
      ) {
        addWarning(
          warnings,
          'Raw HTML was preserved during Markdown conversion; unconverted tags may not render like the source dialect.'
        );
        return protect(source);
      }
      return anchor ? inlineHtmlNode(anchor, warnings) : source;
    });
  }
  text = text
    .replace(/<(strong|b)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (_, _tag, attributes, content) => {
      warnInlineHtmlStyle(attributes, warnings);
      return `**${content}**`;
    })
    .replace(/<(em|i)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (_, _tag, attributes, content) => {
      warnInlineHtmlStyle(attributes, warnings);
      return `*${content}*`;
    })
    .replace(/<(del|s|strike)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (_, _tag, attributes, content) => {
      warnInlineHtmlStyle(attributes, warnings);
      return `~~${content}~~`;
    })
    .replace(/<(u|ins)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (_, _tag, attributes, content) => {
      warnInlineHtmlStyle(attributes, warnings);
      return `<u>${content}</u>`;
    })
    .replace(/<sup\b([^>]*)>([\s\S]*?)<\/sup\s*>/gi, (_, attributes, content) => {
      warnInlineHtmlStyle(attributes, warnings);
      return `^${content}^`;
    })
    .replace(/<sub\b([^>]*)>([\s\S]*?)<\/sub\s*>/gi, (_, attributes, content) => {
      warnInlineHtmlStyle(attributes, warnings);
      return `~${content}~`;
    })
    .replace(/<code\b([^>]*)>([\s\S]*?)<\/code\s*>/gi, (_, attributes, content) => {
      warnInlineHtmlStyle(attributes, warnings);
      return formatMarkdownCodeSpan(content);
    })
    .replace(/<mark\b([^>]*)>([\s\S]*?)<\/mark\s*>/gi, (_, attributes, content) => {
      if (/\bstyle\s*=/i.test(attributes)) {
        addWarning(warnings, 'HTML highlight colors are not retained; highlight meaning is preserved.');
      }
      return `==${content}==`;
    });
  if (Parser) {
    text = text.replace(/<img\b[^>]*\/?>/gi, (source, offset, wholeText) => {
      if (isEscapedMarkdownDelimiter(wholeText, offset)) return source;
      const image = new Parser().parseFromString(source, 'text/html').querySelector('img');
      if (!image) return source;
      if (image.hasAttribute('title')) {
        addWarning(
          warnings,
          'HTML image tooltip titles have no native Wmdx field; raw image HTML was preserved.'
        );
        return protect(source);
      }
      if (image.hasAttribute('style')) warnInlineHtmlStyle('style=', warnings);
      return htmlImageResource(image, warnings) || source;
    });
  }
  text = text.replace(/<br\s*\/?>/gi, (source, offset, wholeText) => {
    return isEscapedMarkdownDelimiter(wholeText, offset) ? source : '  \n';
  });
  for (const { marker, value } of protectedValues.reverse()) {
    text = text.replace(marker, () => value);
  }
  return text;
}

function containsMarkdownInlineSyntax(text) {
  const syntaxPatterns = [
    /\*\*?[^*\n]+\*\*?/,
    /__?[^_\n]+__?/,
    /~~[^~\n]+~~/,
    /==[^=\n]+==/,
    /`+[^`\n]+`+/,
    /\[[^\]\n]+\]\([^)]+\)/
  ];
  return String(text ?? '').split(/\r?\n/).some(line =>
    syntaxPatterns.some(pattern => pattern.test(line))
  );
}

function htmlContainerBalance(source, tagName) {
  let balance = 0;
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  for (const match of String(source ?? '').matchAll(tagPattern)) {
    if (/^<\s*\//.test(match[0])) {
      balance -= 1;
    } else if (!/\/\s*>$/.test(match[0])) {
      balance += 1;
    }
  }
  return balance;
}

function protectTopLevelMarkdownHtmlBlocks(source, format, Parser, warnings) {
  if (!Parser) return { source, restore: text => text };
  const tokens = marked.lexer(source, { gfm: format !== 'commonmark' });
  const replacements = [];
  const chunks = [];
  let cursor = 0;
  let markerIndex = 0;
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    let raw = String(token.raw ?? '');
    if (!raw) continue;
    if (
      token.type === 'html' &&
      token.block === true &&
      /^\s*<table\b/i.test(raw) &&
      !/<\/table\s*>/i.test(raw)
    ) {
      while (
        tokenIndex + 1 < tokens.length &&
        !/<\/table\s*>/i.test(raw)
      ) {
        tokenIndex += 1;
        raw += String(tokens[tokenIndex].raw ?? '');
      }
    }
    if (
      token.type === 'html' &&
      token.block === true &&
      /^\s*<details\b/i.test(raw) &&
      htmlContainerBalance(raw, 'details') > 0
    ) {
      let balance = htmlContainerBalance(raw, 'details');
      let grouped = raw;
      let endTokenIndex = tokenIndex;
      for (let next = tokenIndex + 1; next < tokens.length; next += 1) {
        const candidate = tokens[next];
        grouped += String(candidate.raw ?? '');
        if (candidate.type === 'html' && candidate.block === true) {
          balance += htmlContainerBalance(candidate.raw, 'details');
        }
        if (balance <= 0) {
          endTokenIndex = next;
          break;
        }
      }
      if (endTokenIndex > tokenIndex) {
        raw = grouped;
        tokenIndex = endTokenIndex;
      }
    }
    const from = source.indexOf(raw, cursor);
    if (from < 0) continue;
    const before = source.slice(0, from);
    const after = source.slice(from + raw.length);
    const touchesMarkdownContent = Boolean(
      (before.trim() && !/\n[ \t]*\n[ \t]*$/.test(before)) ||
      (after.trim() && !/^[ \t]*\n[ \t]*\n/.test(after))
    );
    chunks.push(source.slice(cursor, from));
    let replacement = raw;
    if (token.type === 'html' && token.block === true) {
      const needsTextInspection = /[*_~=`]/.test(raw);
      const document = /^\s*<(?:a|table)\b/i.test(raw) || needsTextInspection
        ? new Parser().parseFromString(raw, 'text/html')
        : null;
      const anchor = document?.body?.querySelector('a[href]');
      const standaloneEmptyAnchor = Boolean(
        /^\s*<a\b/i.test(raw) &&
        anchor &&
        document.body.children.length === 1 &&
        document.body.children[0] === anchor &&
        !anchor.textContent?.trim() &&
        !anchor.querySelector('img, audio, video, br, svg, canvas, input')
      );
      const table = document?.body?.querySelector('table');
      const standaloneHeaderlessTable = Boolean(
        /^\s*<table\b/i.test(raw) &&
        table &&
        !table.querySelector('thead, th')
      );
      const activeElement = raw.match(
        /<\s*(script|style|iframe|object|embed|form)\b/i
      )?.[1]?.toLowerCase();
      const hasActiveElement = Boolean(activeElement);
      const containsMarkdownTextSyntax = Boolean(
        document &&
        !hasActiveElement &&
        containsMarkdownInlineSyntax(document.body?.textContent)
      );
      const containsMarkdownBlockSyntax =
        /^[ \t]{0,3}(?:`{3,}|~{3,})/m.test(raw);
      const isCommentOrDeclaration =
        /^\s*(?:<!--|<!\[CDATA\[|<\?)/i.test(raw);
      const preserveForContext =
        touchesMarkdownContent && !hasActiveElement && !isCommentOrDeclaration;
      const isProcessingInstruction = /^\s*<\?/.test(raw);
      if (isProcessingInstruction) {
        let marker;
        do {
          marker = `\uE020MDXHTMLBLOCK${markerIndex++}\uE021`;
        } while (source.includes(marker));
        replacements.push({ marker, value: raw });
        replacement = marker;
        addWarning(
          warnings,
          'An HTML block without convertible text was preserved unchanged.'
        );
      } else if (
        standaloneHeaderlessTable ||
        containsMarkdownTextSyntax ||
        containsMarkdownBlockSyntax ||
        preserveForContext
      ) {
        let marker;
        do {
          marker = `\uE020MDXHTMLBLOCK${markerIndex++}\uE021`;
        } while (source.includes(marker));
        replacements.push({ marker, value: raw });
        replacement = marker;
        addWarning(
          warnings,
          'Raw HTML was preserved during Markdown conversion; unconverted tags may not render like the source dialect.'
        );
      } else if (standaloneEmptyAnchor) {
        addWarning(
          warnings,
          'Raw HTML was preserved during Markdown conversion; unconverted tags may not render like the source dialect.'
        );
      } else {
        try {
          const converted = convertFromHtml(raw, Parser);
          if (activeElement) {
            addWarning(warnings, `Active HTML element <${activeElement}> was omitted.`);
          }
          let marker;
          do {
            marker = `\uE020MDXHTMLBLOCK${markerIndex++}\uE021`;
          } while (source.includes(marker));
          replacements.push({ marker, value: converted.markdown });
          for (const warning of converted.warnings) addWarning(warnings, warning);
          replacement = marker;
        } catch (error) {
          if (!String(error?.message).includes('No readable document content')) throw error;
          if (activeElement) {
            addWarning(warnings, `Active HTML element <${activeElement}> was omitted.`);
            replacement = '';
          } else {
            addWarning(
              warnings,
              'An HTML block without convertible text was preserved unchanged.'
            );
          }
        }
      }
    }
    chunks.push(replacement);
    cursor = from + raw.length;
  }
  chunks.push(source.slice(cursor));
  return {
    source: chunks.join(''),
    restore(text) {
      let restored = text;
      for (const { marker, value } of replacements) {
        restored = restored.replace(marker, () => value);
      }
      return restored;
    }
  };
}

const RAW_HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body',
  'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem',
  'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search',
  'pre', 'script', 'section', 'style', 'summary', 'table', 'tbody', 'td',
  'textarea',
  'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul'
]);
const RAW_HTML_BLOCK_START = new RegExp(
  `^\\s*(?:>\\s*)*<(${[...RAW_HTML_BLOCK_TAGS].join('|')})\\b`,
  'i'
);

function isRawHtmlBlockLine(line, state) {
  if (state.processingInstruction) {
    state.processingInstruction = !line.includes('?>');
    return true;
  }
  const instructionStart = line.indexOf('<?');
  if (instructionStart >= 0) {
    state.processingInstruction = !line.slice(instructionStart + 2).includes('?>');
    return true;
  }
  const opensBlock = RAW_HTML_BLOCK_START.test(line);
  if (!state.tags.length && !state.comment && !opensBlock && !line.includes('<!--')) {
    return false;
  }
  if (state.comment || line.includes('<!--')) {
    const commentStart = state.comment ? -1 : line.indexOf('<!--');
    const commentEnd = line.indexOf('-->', commentStart >= 0 ? commentStart + 4 : 0);
    state.comment = commentEnd < 0;
    return true;
  }
  const tags = line.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi);
  for (const match of tags) {
    const tag = match[1].toLowerCase();
    if (!RAW_HTML_BLOCK_TAGS.has(tag)) continue;
    if (match[0].startsWith('</')) {
      const index = state.tags.lastIndexOf(tag);
      if (index >= 0) state.tags.splice(index, 1);
    } else if (!/\/\s*>$/.test(match[0])) {
      state.tags.push(tag);
    }
  }
  return true;
}

function protectRawHtmlBlockLines(lines, protectedLines) {
  const state = { tags: [], comment: false, processingInstruction: false };
  for (let index = 0; index < lines.length; index += 1) {
    if (
      protectedLines.has(index) &&
      !state.tags.length &&
      !state.comment &&
      !state.processingInstruction
    ) {
      continue;
    }
    if (isRawHtmlBlockLine(lines[index], state)) protectedLines.add(index);
  }
}

function restoreDisabledHtmlTaskItem(line) {
  const match = /^((?:[ \t]*>\s*)*[ \t]*)([-+*]|\d+[.)])\s+<input\b([^>]*)>(?:[ \t]+(.*))?[ \t]*$/i
    .exec(line);
  if (!match) return null;
  const attributes = match[3];
  if (!/(?:^|\s)type\s*=\s*(?:"checkbox"|'checkbox'|checkbox)(?=\s|$)/i.test(attributes) ||
      !/(?:^|\s)disabled(?:\s|=|$)/i.test(attributes)) {
    return null;
  }
  const checked = /(?:^|\s)checked(?:\s|=|$)/i.test(attributes);
  const text = (match[4] ?? '').trimEnd();
  return `${match[1]}${match[2]} [${checked ? 'x' : ' '}]${text ? ` ${text}` : ''}`;
}

function normalizeCommonMarkReferenceLabel(value) {
  return String(value ?? '')
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function collectCommonMarkReferenceLabels(source) {
  const labels = new Set();
  for (const line of String(source ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const definition = /^ {0,3}\[([^\]\n]+)\]:/.exec(line);
    if (definition) labels.add(normalizeCommonMarkReferenceLabel(definition[1]));
  }
  return labels;
}

function protectObsidianCommonMarkReferenceCollisions(
  lines,
  protectedLines,
  referenceLabels
) {
  return lines.map((line, index) => {
    if (protectedLines.has(index)) return line;
    let text = line;

    // The CommonMark importer escapes `![[...]]` to keep it literal in Wmdx.
    // Obsidian still sees the unescaped `[[` as an embed, so escape its first
    // bracket and let the target dialect display the same literal text.
    text = text.replace(/\\!\[\[([^\]\n]+)\]\]/g, (_, target) =>
      `!\\[[${target}]]`
    );

    // A definition beginning with `[[` is not an Obsidian wikilink when it is
    // CommonMark reference syntax. Escaping its first bracket is sufficient:
    // the remaining single bracket cannot start a wikilink by itself.
    text = text.replace(
      /(?<!\\)(\\?)\[\[([^\]\n]+)\]\](?=[ \t]*:)/g,
      (_, _existingEscape, target) => `\\[[${target}]]`
    );

    // CommonMark can use a nested bracket label such as [[*text*]] as a
    // shortcut reference link. Obsidian would parse the same characters as a
    // wikilink; escaping only the outer bracket preserves the reference link.
    text = text.replace(/(?<!\\)\[\[([^\]\n]+)\]\]/g, (match, target) => {
      const referenceLabel = normalizeCommonMarkReferenceLabel(target);
      return referenceLabels.has(referenceLabel) ? `\\${match}` : match;
    });
    return text;
  });
}

function protectBareAutolinks(text, protect) {
  return text.replace(/(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>]+/gi, (match, offset) => {
    const resourceStart = text.lastIndexOf('[', offset);
    const resourceEnd = text.indexOf(']', offset);
    if (
      resourceStart >= 0 &&
      resourceEnd >= offset &&
      parseWmdxResourceSyntax(text.slice(resourceStart, resourceEnd + 1))
    ) {
      return match;
    }
    return protect(match);
  });
}

function escapeDialectSpecificWmdxSyntax(line, format, commonMarkReferences = new Set()) {
  const protectedValues = [];
  let text = String(line ?? '');
  const protect = value => {
    const marker = `\uE000${protectedValues.length}\uE001`;
    protectedValues.push({ marker, value });
    return marker;
  };

  // Markdown is not parsed inside code spans or raw HTML elements. Keep those
  // regions intact before normalizing Wmdx subscript and superscript markers.
  text = text
    .replace(/<([a-z][\w:-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, protect)
    .replace(/<(?:img|br)\b[^>]*\/?>/gi, protect)
    .replace(/(`+)([\s\S]*?)\1/g, protect)
    .replace(/<(?:https?|ftp):\/\/[^>\s]+>|<mailto:[^>\s]+>|<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>/gi, protect);
  text = protectBareAutolinks(text, protect);
  text = protectHtmlTagTokens(text, protect);
  text = protectInlineMathSyntax(text, protect);
  if (format === 'commonmark') {
    text = text.replace(
      /(?<!\\)(!?)\[\[([^\[\]\n]+)\]\]/g,
      (match, embedMarker, target) => {
        if (/[*_`<>]/.test(target)) return match;
        const referenceLabel = normalizeCommonMarkReferenceLabel(
          target.split(/[|#]/, 1)[0]
        );
        if (commonMarkReferences.has(referenceLabel)) return match;
        return embedMarker
          ? `\\![[${target}]]`
          : `\\[[${target}]]`;
      }
    );
  }

  const escapeTildes = value => `\\~${value.slice(1)}`;
  if (format === 'commonmark') {
    text = text.replace(
      /(?<![~\\])~~(?!~)(\S(?:[^~]*?\S)?)~~(?!~)/gu,
      match => escapeTildes(match)
    );
  }
  text = text.replace(
    /(?<![\p{L}\p{N}\p{M}_\\])_([₀₁₂₃]?)(?![₀₁₂₃]_)(\S(?:[^\n]*?\S)?)_(?![\p{L}\p{N}\p{M}_])/gu,
    match => `\\${match}`
  );
  const escapeEquals = match => {
    return `\\=${match.slice(1)}`;
  };
  if (format !== 'obsidian') {
    text = text.replace(
      /(?<![=\\])==([₀₁₂]?)(\S(?:.*?\S)?)(?<!\\)==(?![=])/g,
      escapeEquals
    );
  }
  text = text.replace(
    /(?<![=\\])=(?![=])(?:[₀₁₂])?(\S(?:[^\n]*?\S)?)(?<!\\)=(?![=])/gu,
    escapeEquals
  );
  text = text.replace(
    /(?<![~\\])~(?!~)(\S(?:[^~]*?\S)?)~(?!~)/gu,
    match => escapeTildes(match)
  );
  text = text.replace(
    /(?<![\\^])\^([^\s^\n](?:[^^\n]*?[^\s^\n])?)\^(?!\^)/gu,
    match => `\\^${match.slice(1)}`
  );

  for (const { marker, value } of protectedValues.reverse()) {
    text = text.replace(marker, () => value);
  }
  return text;
}

function escapeForeignCalloutMarkers(line, format) {
  if (format !== 'commonmark') return line;
  return line.replace(
    /^(\s*(?:>\s*)+)\[!([^\]\r\n]+)\]/,
    '$1\\[!$2]'
  );
}

export function convertFromMarkdown(source, format = 'commonmark', options = {}) {
  if (!MARKDOWN_IMPORT_FORMATS.includes(format) || format === 'html') {
    throw new TypeError(`Unsupported Markdown import format: ${format}`);
  }
  const warnings = [];
  const sourceText = String(source ?? '');
  const commonMarkReferences = format === 'commonmark'
    ? collectCommonMarkReferenceLabels(sourceText)
    : new Set();
  if (findYamlFrontmatterEndLine(sourceText.replace(/\r\n/g, '\n').split('\n')) >= 0) {
    addWarning(
      warnings,
      'YAML frontmatter was preserved verbatim; Wmdx does not interpret frontmatter properties.'
    );
  }
  if (format === 'obsidian' && /%%/.test(sourceText)) {
    addWarning(warnings, 'Obsidian comments have no native Wmdx equivalent and were kept unchanged.');
  }
  const htmlParser = options.DOMParser === null
    ? null
    : options.DOMParser ?? globalThis.DOMParser;
  const protectedHtml = protectTopLevelMarkdownHtmlBlocks(
    sourceText, format, htmlParser, warnings
  );
  const normalizedSource = normalizeStandardMarkdownMarkers(protectedHtml.source);
  const converted = protectCodeFences(normalizedSource, (originalLines, protectedLines) => {
    let lines = [...originalLines];
    if (format === 'obsidian' || format === 'gfm') {
      lines = convertObsidianCallouts(lines, protectedLines, format);
    }
    lines = convertHeadings(lines.join('\n'), protectedLines);
    const anchorNormalization = removeRedundantHeadingAnchors(lines, protectedLines);
    lines = anchorNormalization.lines;
    const headingProtectedLines = anchorNormalization.protectedLines;
    const headingFragments = buildHeadingFragmentLookup(lines, headingProtectedLines);
    const rawHtmlBlockState = { tags: [], comment: false };
    return lines.map((line, index) => {
      if (headingProtectedLines.has(index)) return line;
      const restoredTask = restoreDisabledHtmlTaskItem(line);
      if (restoredTask !== null) {
        addWarning(
          warnings,
          'A disabled HTML checkbox in a Markdown list was restored as an editable task item.'
        );
        return restoredTask;
      }
      if (isRawHtmlBlockLine(line, rawHtmlBlockState)) {
        if (!rawHtmlBlockState.comment &&
            !line.includes('<!--') &&
            !line.includes('-->') &&
            /<\/?[a-z][\w:-]*\b/i.test(line)) {
          addWarning(
            warnings,
            'Raw HTML was preserved during Markdown conversion; unconverted tags may not render like the source dialect.'
          );
        }
        return line;
      }
      let text = escapeDialectSpecificWmdxSyntax(line, format, commonMarkReferences);
      text = escapeForeignCalloutMarkers(text, format);
      text = convertInlineHtmlToMarkdown(text, warnings, htmlParser);
      if (format === 'obsidian') {
        text = convertObsidianLinksToWmdx(text, warnings);
      }
      text = convertInternalHeadingLinksToWmdx(text, headingFragments);
      return text;
    });
  });
  const restored = protectedHtml.restore(converted);
  const cleaned = protectCodeFences(restored, (lines, protectedLines) =>
    removeRedundantHeadingAnchors(lines, protectedLines).lines
  );
  return { markdown: restoreNestedEmphasisMarkers(cleaned), warnings };
}

function htmlAlignment(node) {
  const style = node.getAttribute('style') ?? '';
  const attribute = node.getAttribute('align') ?? '';
  const textAlign = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\b/i.exec(style)?.[1];
  const float = /(?:^|;)\s*float\s*:\s*(left|right)\b/i.exec(style)?.[1];
  const alignment = (attribute || textAlign || float || '').trim().toLowerCase();
  return ['left', 'center', 'right', 'justify'].includes(alignment)
    ? alignment
    : '';
}

function htmlImageSize(node, warnings) {
  const style = node.getAttribute('style') ?? '';
  const styledWidth = /(?:^|;)\s*width\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const widthValue = node.getAttribute('width')?.trim() || styledWidth || '';
  const heightValue = node.getAttribute('height')?.trim() || '';
  const normalize = value => {
    const numeric = /^(\d+)(?:px)?$/i.exec(value);
    if (numeric && Number(numeric[1]) > 0) return { value: Number(numeric[1]), unit: 'px' };
    const percent = /^([1-9]\d{0,2})%$/.exec(value);
    if (percent && Number(percent[1]) <= 100) {
      return { value: Number(percent[1]), unit: '%' };
    }
    return null;
  };
  const width = normalize(widthValue);
  const height = normalize(heightValue);
  if (height && width?.unit === 'px' && height.unit === 'px') {
    return `${width.value}x${height.value}`;
  }
  if (height) {
    addWarning(warnings, 'HTML image height could not be represented in Wmdx and was omitted.');
  }
  if (widthValue && !width) {
    addWarning(warnings, 'HTML image width could not be represented in Wmdx and was omitted.');
  }
  return width ? `${width.value}${width.unit === '%' ? '%' : ''}` : '';
}

function htmlImageResource(node, warnings, titleOverride = '', alignmentOverride = '') {
  const source = node.getAttribute('src');
  if (!source) {
    const alt = escapeMarkdownField(node.getAttribute('alt') ?? '', {
      escapeCharacters: '[]'
    });
    return `![${alt}]()`;
  }
  const hasUnrepresentedHtmlLayout = !titleOverride &&
    ['width', 'height', 'align'].some(name => node.hasAttribute(name));
  if (node.hasAttribute('title') || hasUnrepresentedHtmlLayout) {
    if (node.hasAttribute('title')) {
      addWarning(
        warnings,
        'HTML image tooltip titles have no native Wmdx field; raw image HTML was preserved.'
      );
    } else {
      addWarning(
        warnings,
        'HTML image dimensions or alignment were preserved as raw HTML because Wmdx has no matching field.'
      );
    }
    const attributes = ['src', 'alt', 'title', 'width', 'height', 'align']
      .filter(name => node.hasAttribute(name))
      .filter(name => !['width', 'height'].includes(name) ||
        /^\d{1,4}(?:%|px)?$/i.test(node.getAttribute(name).trim()))
      .map(name => `${name}="${escapeHtml(node.getAttribute(name))}"`);
    return `<img ${attributes.join(' ')}>`;
  }
  const displaySource = node.getAttribute('data-wmdx-original-src') || source;
  return formatWmdxResourceSyntax({
    embed: true,
    source,
    title: titleOverride || node.getAttribute('alt') ||
      getWmdxResourceFallbackTitle(displaySource),
    size: htmlImageSize(node, warnings),
    alignment: alignmentOverride || htmlAlignment(node)
  });
}

function resourceExtensionFromSource(source) {
  const dataMimeType = /^data:([^;,]+)/i.exec(String(source ?? ''))?.[1]?.toLowerCase();
  const dataMimeExtensions = {
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'video/3gpp': '3gp',
    'video/mp4': 'mp4',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-msvideo': 'avi',
    'video/x-ms-wmv': 'wmv',
    'application/epub+zip': 'epub',
    'application/json': 'json',
    'application/msword': 'doc',
    'application/octet-stream': 'bin',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/zip': 'zip',
    'text/plain': 'txt'
  };
  if (dataMimeExtensions[dataMimeType]) return dataMimeExtensions[dataMimeType];
  const withoutQuery = String(source ?? '').split(/[?#]/, 1)[0];
  let path = withoutQuery;
  try {
    path = new URL(withoutQuery).pathname;
  } catch {
    // Keep relative resource paths as authored.
  }
  const finalSegment = path.replace(/\/+$/, '').split('/').at(-1) ?? '';
  return finalSegment.split('.').at(-1)?.toLowerCase() ?? '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function delimiterCanOpenOrClose(source, from, to, marker) {
  const before = source[from - 1] ?? '';
  const after = source[to] ?? '';
  const beforeWhitespace = !before || /\s/.test(before);
  const afterWhitespace = !after || /\s/.test(after);
  const beforePunctuation = Boolean(before && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(before));
  const afterPunctuation = Boolean(after && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(after));
  const leftFlanking = !afterWhitespace &&
    (!afterPunctuation || beforeWhitespace || beforePunctuation);
  const rightFlanking = !beforeWhitespace &&
    (!beforePunctuation || afterWhitespace || afterPunctuation);
  if (marker === '_') {
    return {
      canOpen: leftFlanking && (!rightFlanking || beforePunctuation),
      canClose: rightFlanking && (!leftFlanking || afterPunctuation)
    };
  }
  return { canOpen: leftFlanking, canClose: rightFlanking };
}

function pairedMarkdownDelimiterPositions(source, marker, { commonMarkEmphasis = false } = {}) {
  const runs = [];
  for (let index = 0; index < source.length;) {
    if (source[index] !== marker) {
      index++;
      continue;
    }
    let end = index + 1;
    while (source[end] === marker) end++;
    runs.push({ from: index, to: end, length: end - index });
    index = end;
  }

  const positions = new Set();
  for (let openingIndex = 0; openingIndex < runs.length; openingIndex++) {
    const opening = runs[openingIndex];
    const openState = commonMarkEmphasis
      ? delimiterCanOpenOrClose(source, opening.from, opening.to, marker)
      : { canOpen: true };
    if (!openState.canOpen) continue;
    for (let closingIndex = openingIndex + 1; closingIndex < runs.length; closingIndex++) {
      const closing = runs[closingIndex];
      if (marker === '`' && closing.length !== opening.length) continue;
      if (!source.slice(opening.to, closing.from).trim()) continue;
      const closeState = commonMarkEmphasis
        ? delimiterCanOpenOrClose(source, closing.from, closing.to, marker)
        : { canClose: true };
      if (closeState.canClose) {
        for (let position = opening.from; position < opening.to; position++) {
          positions.add(position);
        }
        break;
      }
    }
  }
  return positions;
}

function markdownText(value, {
  escapeBlockSyntax = true,
  tableCell = false,
  wmdxSyntax = true
} = {}) {
  const source = String(value ?? '');
  const escapePositions = new Set();
  const addMatches = (pattern, captureIndex = 0) => {
    for (const match of source.matchAll(pattern)) {
      const capture = match[captureIndex] ?? '';
      const start = match.index + Math.max(0, match[0].indexOf(capture));
      const end = start + capture.length;
      for (let index = start; index < end; index++) escapePositions.add(index);
    }
  };
  const markPaired = (marker, options) => {
    for (const position of pairedMarkdownDelimiterPositions(source, marker, options)) {
      escapePositions.add(position);
    }
  };

  markPaired('*', { commonMarkEmphasis: true });
  markPaired('_', { commonMarkEmphasis: true });
  markPaired('`');
  markPaired('~');
  if (wmdxSyntax) {
    markPaired('^');
    markPaired('=');
    addMatches(/_{4,}/g);
  }

  addMatches(/(&)(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, 1);
  addMatches(/(<)(?=\/?[a-z][\w:-]*(?:\s[^<>]*?)?\/?>|!--[\s\S]*?-->|![A-Z]|!\[CDATA\[|\?)/gi, 1);
  addMatches(/(<)(?=(?:https?|ftp):\/\/[^>\s]+|mailto:[^>\s]+|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)/gi, 1);
  const linkPattern = /!?\[[^\]\n]*\]\([^)\n]*\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const open = match.index + match[0].indexOf('[');
    escapePositions.add(open);
  }
  if (wmdxSyntax) {
    for (const match of source.matchAll(/(!?\[[^\]\n]*\|[^\]\n]*\])/g)) {
      const open = match.index + match[0].indexOf('[');
      escapePositions.add(open);
    }
  }

  if (tableCell) {
    for (let index = 0; index < source.length; index++) {
      if (source[index] === '|') escapePositions.add(index);
    }
  }
  if (escapeBlockSyntax) {
    addMatches(/(^|\n)([ \t]*)(#{1,6})(?=[ \t]|$)/gm, 3);
    addMatches(/(^|\n)([ \t]*)(\d+|[A-Za-z]+)([.)])(?=[ \t])/gm, 4);
    addMatches(/(^|\n)([ \t]*)([-+])(?=[ \t]|$)/gm, 3);
    addMatches(/(^|\n)([ \t]*)(>)(?=[ \t]|$)/gm, 3);
    addMatches(/(^|\n)([ \t]*)(\.)([1-6])(?=[ \t])/gm, 3);
    addMatches(/(^|\n)([ \t]*)([-*_])(?:[ \t]*\3){2,}[ \t]*(?=\n|$)/gm, 3);
    addMatches(/(^|\n)([ \t]*)([=-])\3*[ \t]*(?=\n|$)/gm, 3);
    addMatches(/(^|\n)([ \t]*)(\[)(?=[^\]\n]+\]:)/gm, 3);
  }

  for (const { from, to } of findInlineMathRanges(source)) {
    for (let index = from; index < to; index += 1) {
      escapePositions.delete(index);
    }
  }

  const escapablePunctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
  let escaped = '';
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '\\') {
      let runEnd = index + 1;
      while (source[runEnd] === '\\') runEnd++;
      const runLength = runEnd - index;
      const next = source[runEnd] ?? '';
      const protectFollowingSyntax = !next ||
        next === '\n' ||
        next === '\r' ||
        escapePositions.has(runEnd) ||
        escapablePunctuation.test(next);
      const outputSlashCount = protectFollowingSyntax
        ? runLength * 2
        : runLength === 1
          ? 1
          : runLength * 2 - 1;
      escaped += '\\'.repeat(outputSlashCount);
      index = runEnd - 1;
      continue;
    }
    if (escapePositions.has(index)) escaped += '\\';
    escaped += character;
  }
  return escaped;
}

function markdownLinkDestination(value) {
  const destination = String(value ?? '')
    .replace(/\s/g, '%20')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  let depth = 0;
  let balancedParentheses = true;
  for (const character of destination) {
    if (character === '(') depth++;
    else if (character === ')' && --depth < 0) {
      balancedParentheses = false;
      break;
    }
  }
  balancedParentheses &&= depth === 0;
  return escapeMarkdownField(destination, {
    escapeCharacters: balancedParentheses ? '' : '()'
  });
}

function formatMarkdownCodeSpan(value) {
  const content = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, ' ');
  let longestBacktickRun = 0;
  for (const match of content.matchAll(/`+/g)) {
    longestBacktickRun = Math.max(longestBacktickRun, match[0].length);
  }
  const fence = '`'.repeat(longestBacktickRun + 1);
  const needsPadding =
    content.startsWith('`') ||
    content.endsWith('`') ||
    (content.startsWith(' ') &&
      content.endsWith(' ') &&
      /\S/.test(content));
  const serializedContent = needsPadding ? ` ${content} ` : content;
  return `${fence}${serializedContent}${fence}`;
}

function fragmentForSameDocumentHref(href, baseLocation, document) {
  if (href.startsWith('#')) return href.slice(1);

  const base = document.querySelector('base[href]')?.getAttribute('href') ||
    baseLocation ||
    document.URL;
  if (!base) return null;
  try {
    const page = new URL(base);
    const target = new URL(href, page);
    if (
      target.hash &&
      target.origin === page.origin &&
      target.pathname === page.pathname &&
      target.search === page.search
    ) {
      return target.hash.slice(1);
    }
  } catch {
    // Unknown or malformed bases leave the original link as an ordinary URL.
  }
  return null;
}

function annotateHtmlHeadingLinks(document, baseLocation = '') {
  const headings = Array.from(
    document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')
  );
  if (!headings.length) return;

  const occurrences = new Map();
  const targetsById = new Map();
  for (const heading of headings) {
    const title = heading.textContent?.trim() ?? '';
    const key = title.toLocaleLowerCase();
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    const targetTitle = occurrence === 0 ? title : `${title} ${occurrence}`;
    if (heading.id && title) targetsById.set(heading.id, `#${targetTitle}`);
  }

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    const rawFragment = fragmentForSameDocumentHref(
      href,
      baseLocation,
      document
    );
    if (rawFragment === null) continue;
    let fragment = rawFragment;
    try {
      fragment = decodeURIComponent(rawFragment);
    } catch {
      // Preserve malformed percent escapes and leave unmatched links untouched.
    }
    const target = targetsById.get(fragment);
    if (!target) continue;
    anchor.setAttribute('data-wmdx-kind', 'heading-link');
    anchor.setAttribute('data-wmdx-target', target);
  }
}

function isGeneratedTocNode(node) {
  return Boolean(node.closest?.('nav.toc-container'));
}

function htmlMediaResource(node) {
  const tag = node.tagName.toLowerCase();
  if (tag !== 'audio' && tag !== 'video') return '';
  const sourceNode = node.querySelector('source');
  const source = node.getAttribute('src') || sourceNode?.getAttribute('src');
  if (!source) return '';
  const title = node.getAttribute('aria-label') ||
    sourceNode?.getAttribute('title') ||
    getWmdxResourceFallbackTitle(
      node.getAttribute('data-wmdx-original-src') ||
      sourceNode?.getAttribute('data-wmdx-original-src') ||
      source
    );
  return `[${markdownText(title)}](${markdownLinkDestination(source)} "wmdx-${tag}")`;
}

function inlineHtmlNode(node, warnings, options = {}) {
  if (node.nodeType === 3) return markdownText(node.nodeValue, options);
  if (node.nodeType === 8) {
    addWarning(warnings, 'HTML comments have no native Wmdx equivalent and were omitted.');
    return '';
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (tag === 'audio' || tag === 'video') return htmlMediaResource(node);
  if (node.hasAttribute('style') && !isGeneratedTocNode(node)) {
    addWarning(warnings, 'Unmapped inline CSS styling was ignored during HTML import.');
  }
  if (tag === 'code') {
    const content = node.textContent ?? '';
    if (options.tableCell && content.includes('|')) {
      return formatMarkdownCodeSpan(content).replace(/\|/g, '\\|');
    }
    return formatMarkdownCodeSpan(content);
  }
  const content = Array.from(node.childNodes)
    .map(child => inlineHtmlNode(child, warnings, options)).join('');
  if (tag === 'kbd') return `<kbd>${content}</kbd>`;
  if (tag === 'strong' || tag === 'b') return `**${content}**`;
  if (tag === 'em' || tag === 'i') return `*${content}*`;
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${content}~~`;
  if (tag === 'u' || tag === 'ins') return `<u>${content}</u>`;
  if (tag === 'sup') return `^${content}^`;
  if (tag === 'sub') return `~${content}~`;
  if (tag === 'mark') return `==${content}==`;
  if (tag === 'br') return '  \n';
  if (tag === 'a') {
    const href = node.getAttribute('href');
    const hasHref = node.hasAttribute('href');
    if (node.getAttribute('data-wmdx-kind') === 'heading-link') {
      const target = node.getAttribute('data-wmdx-target');
      if (target) {
        return formatWmdxResourceSyntax({
          source: target,
          title: node.textContent?.trim() ?? content
        });
      }
    }
    if (node.getAttribute('data-wmdx-kind') === 'wikilink') {
      const target = node.getAttribute('data-wmdx-target') || href;
      if (target) {
        return formatWmdxResourceSyntax({
          source: target,
          title: node.textContent?.trim() ?? content
        });
      }
    }
    if (
      hasHref &&
      node.getAttribute('title') === 'wmdx-attachment'
    ) {
      return `[${content || markdownText(href)}](${markdownLinkDestination(href)} "wmdx-attachment")`;
    }
    if (node.hasAttribute('title') && !hasHref) {
      addWarning(warnings, 'HTML link tooltip titles have no native Wmdx field and were omitted.');
    }
    if (hasHref && (node.hasAttribute('download') ||
        node.getAttribute('data-wmdx-kind') === 'attachment')) {
      return `[${content || markdownText(href)}](${markdownLinkDestination(href)} "wmdx-attachment")`;
    }
    if (!hasHref) return content;
    const linkTitle = node.hasAttribute('title')
      ? ` "${escapeMarkdownField(node.getAttribute('title'), { escapeCharacters: '"' })}"`
      : '';
    return `[${content || markdownText(href)}](${markdownLinkDestination(href)}${linkTitle})`;
  }
  if (tag === 'img') {
    return htmlImageResource(node, warnings);
  }
  if (tag === 'script' || tag === 'style' || tag === 'iframe' ||
      tag === 'object' || tag === 'embed') {
    addWarning(warnings, `Active HTML element <${tag}> was omitted.`);
    return '';
  }
  return content;
}

function htmlBlock(node, warnings, depth = 0, options = {}) {
  if (node.nodeType === 3) return markdownText(node.nodeValue, options);
  if (node.nodeType === 8) {
    addWarning(warnings, 'HTML comments have no native Wmdx equivalent and were omitted.');
    return '';
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (node.hasAttribute('style') && !isGeneratedTocNode(node)) {
    const style = node.getAttribute('style') ?? '';
    const textJustifyValue =
      /(?:^|;)\s*text-justify\s*:\s*(auto|none|inter-word|inter-character)\s*(?:;|$)/i
        .exec(style)?.[1]?.toLowerCase() ?? '';
    const canPreserveTextJustify = tag === 'div' &&
      Boolean(htmlAlignment(node)) &&
      node.children.length === 0 &&
      Boolean(textJustifyValue);
    const styleProperties = style
      .split(';')
      .map(declaration => declaration.split(':', 1)[0].trim().toLowerCase())
      .filter(Boolean);
    const hasMappedAlignmentContainer =
      ['div', 'figure'].includes(tag) && Boolean(htmlAlignment(node));
    const preservedProperties = new Set(
      hasMappedAlignmentContainer
        ? ['text-align', ...(canPreserveTextJustify ? ['text-justify'] : [])]
        : []
    );
    const unmappedProperties = hasMappedAlignmentContainer
      ? styleProperties.filter(property => !preservedProperties.has(property))
      : styleProperties;
    if (unmappedProperties.length) {
      addWarning(
        warnings,
        hasMappedAlignmentContainer
          ? `Additional inline CSS properties on aligned HTML content were not preserved: ${unmappedProperties.join(', ')}.`
          : `Unmapped inline CSS styling was ignored during HTML import (${unmappedProperties.join(', ')}).`
      );
    }
  }
  const children = (childOptions = options) => Array.from(node.childNodes)
    .map(child => htmlBlock(child, warnings, depth + 1, childOptions))
    .filter(value => value.trim() !== '');
  const inline = (inlineOptions = options) => Array.from(node.childNodes)
    .map(child => inlineHtmlNode(child, warnings, inlineOptions)).join('');

  if (tag === 'nav') {
    return Array.from(node.childNodes)
      .map(child => htmlBlock(child, warnings, depth, options))
      .filter(value => value.trim() !== '')
      .join('\n\n');
  }
  if (['script', 'style', 'iframe', 'object', 'embed', 'form'].includes(tag)) {
    addWarning(warnings, `Active HTML element <${tag}> was omitted.`);
    return '';
  }
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const serialized = inline({ ...options, escapeBlockSyntax: false }).trim();
    const content = node.querySelector('br')
      ? serialized
      : serialized.replace(/[ \t\r\n\f]+/g, ' ');
    return `.${level} ${content}`;
  }
  if (tag === 'p') {
    const content = inline(options).trim();
    if (/^<img\b[\s\S]*\btitle="[^"]*"[\s\S]*>$/.test(content)) {
      return `<p>${content}</p>`;
    }
    return content;
  }
  if (tag === 'a') return inlineHtmlNode(node, warnings, options);
  if (tag === 'br') return '  \n';
  if (tag === 'hr') return '---';
  if (tag === 'pre') {
    const code = node.querySelector('code');
    const text = code?.textContent ?? node.textContent ?? '';
    const language = code?.className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? '';
    const preserveCodeBlockText = Boolean(options.preserveCodeBlockText);
    const content = preserveCodeBlockText ? text : text.replace(/\n+$/, '');
    const longestFence = Math.max(2, ...Array.from(content.matchAll(/`+/g), match => match[0].length));
    const fence = '`'.repeat(longestFence + 1);
    const codeBody = preserveCodeBlockText
      ? content === '' || content.endsWith('\n') ? content : `${content}\n`
      : `${content}\n`;
    return `${fence}${language}\n${codeBody}${fence}`;
  }
  if (tag === 'blockquote') {
    const quoteContent = children({ ...options, escapeBlockSyntax: true }).join('\n\n');
    if (!quoteContent.trim()) return '';
    return quoteContent.split('\n').map(line => `> ${line}`).join('\n');
  }
  if (tag === 'ul' || tag === 'ol') {
    const ordered = tag === 'ol';
    const unorderedMarkerState = options.unorderedListMarkerState;
    const htmlType = node.getAttribute('type');
    const orderedStyle = ({
      '1': 'decimal',
      a: 'alpha_lower',
      A: 'alpha_upper',
      i: 'roman_lower',
      I: 'roman_upper'
    })[htmlType] || 'decimal';
    const reversed = ordered && node.hasAttribute('reversed');
    if (reversed) {
      addWarning(
        warnings,
        'Reversed HTML ordered lists were converted to ascending Wmdx numbering.'
      );
    }
    const rawStart = Number(node.getAttribute('start'));
    let nextOrdinal = node.hasAttribute('start') && Number.isFinite(rawStart)
      ? rawStart
      : reversed
        ? node.querySelectorAll(':scope > li').length
        : 1;
    if (nextOrdinal < 1) {
      addWarning(
        warnings,
        'HTML ordered-list start values below 1 cannot be represented in Wmdx and were normalized.'
      );
      nextOrdinal = 1;
    }
    let unorderedMarker = '-';
    if (!ordered && unorderedMarkerState) {
      const unorderedMarkers = ['-', '*', '+'];
      unorderedMarkerState.lastByIndent ??= new Map();
      const markerIndent = options.listIndent ?? 0;
      const previous = unorderedMarkerState.lastByIndent.get(markerIndent);
      unorderedMarker = unorderedMarkers.find(value => value !== previous) ?? '-';
      unorderedMarkerState.lastByIndent.set(markerIndent, unorderedMarker);
    }
    const listItems = Array.from(node.children)
      .filter(child => child.tagName.toLowerCase() === 'li');
    const looseList = listItems.some(item =>
      Array.from(item.children).some(child => child.tagName.toLowerCase() === 'p')
    );
    return listItems
      .map(item => {
        let itemOrdinal = nextOrdinal;
        if (item.hasAttribute('value')) {
          const explicitValue = Number(item.getAttribute('value'));
          addWarning(warnings, 'Custom ordered-list item values were normalized during HTML import.');
          if (Number.isFinite(explicitValue) && explicitValue >= 1) itemOrdinal = explicitValue;
        }
        const checkbox = item.querySelector(
          ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]'
        );
        const orderedMarker = getOrderedMarkerLabel(orderedStyle, itemOrdinal);
        const orderedDelimiter = options.orderedListDelimiter === ')' ? ')' : '.';
        const marker = ordered
          ? orderedMarker.replace(/[.)]$/, orderedDelimiter)
          : unorderedMarker;
        const task = checkbox ? `[${checkbox.checked ? 'x' : ' '}] ` : '';
        const bodyBlocks = [];
        let inlineBody = '';
        let hasBlockContent = false;
        let inlineNodes = [];
        const flushInlineNodes = () => {
          if (!inlineNodes.length) return;
          const value = inlineNodes
            .map(child => inlineHtmlNode(child, warnings, {
              ...options,
              escapeBlockSyntax: true
            }))
            .join('')
            .trim();
          inlineNodes = [];
          if (!value) return;
          if (!hasBlockContent && !inlineBody) inlineBody = value;
          else bodyBlocks.push(value);
        };
        for (const child of Array.from(item.childNodes)) {
          if (child.nodeType === 1 &&
              ['input', 'ul', 'ol'].includes(child.tagName.toLowerCase())) {
            continue;
          }
          const childTag = child.nodeType === 1 ? child.tagName.toLowerCase() : '';
          if (childTag === 'p' && !child.hasAttribute('style') && !child.hasAttribute('align')) {
            flushInlineNodes();
            const value = Array.from(child.childNodes)
              .map(grandchild => inlineHtmlNode(grandchild, warnings, {
                ...options,
                escapeBlockSyntax: true
              }))
              .join('')
              .trim();
            if (value) {
              if (!hasBlockContent && !inlineBody) inlineBody = value;
              else {
                bodyBlocks.push(value);
                hasBlockContent = true;
              }
            }
            continue;
          }
          const isBlock = childTag && RAW_HTML_BLOCK_TAGS.has(childTag);
          if (!isBlock) {
            inlineNodes.push(child);
            continue;
          }
          flushInlineNodes();
          const value = htmlBlock(child, warnings, depth + 1, {
            ...options,
            escapeBlockSyntax: true
          });
          if (value.trim()) {
            bodyBlocks.push(value);
            hasBlockContent = true;
          }
        }
        flushInlineNodes();
        const itemIndent = ' '.repeat(options.listIndent ?? 0);
        const continuationIndent = ' '.repeat(
          itemIndent.length + marker.length + 1
        );
        const nested = Array.from(item.children)
          .filter(child => ['ul', 'ol'].includes(child.tagName.toLowerCase()))
          .map(child => htmlBlock(child, warnings, depth + 1, {
            ...options,
            escapeBlockSyntax: true,
            listIndent: continuationIndent.length
          }))
          .filter(Boolean)
          .join('\n');
        const itemContent = task + inlineBody;
        const prefix = `${itemIndent}${marker}${itemContent ? ` ${itemContent}` : ''}`;
        const bodySeparator = looseList ? '\n\n' : '\n';
        const continuation = bodyBlocks
          .map(block => block.split('\n')
            .map(line => `${continuationIndent}${line}`)
            .join('\n'))
          .join(bodySeparator);
        const inlineBlockSeparator = inlineBody && looseList ? '\n\n' : '\n';
        const output = prefix +
          (continuation ? inlineBlockSeparator + continuation : '') +
          (nested ? `\n${nested}` : '');
        nextOrdinal = itemOrdinal + 1;
        return output;
      })
      .join(looseList ? '\n\n' : '\n');
  }
  if (tag === 'table') {
    const rowNodes = Array.from(node.querySelectorAll('tr'))
      .filter(row => row.closest('table') === node);
    if (!rowNodes.length) return '';
    const normalized = rowNodes.map(() => []);
    rowNodes.forEach((row, rowIndex) => {
      let columnIndex = 0;
      const cells = Array.from(row.children).filter(cell =>
        ['th', 'td'].includes(cell.tagName.toLowerCase())
      );
      for (const cell of cells) {
        while (normalized[rowIndex][columnIndex] !== undefined) columnIndex++;
        const rawColSpan = Number(cell.getAttribute('colspan'));
        const rawRowSpan = Number(cell.getAttribute('rowspan'));
        const colSpan = Number.isFinite(rawColSpan) && rawColSpan > 1
          ? Math.floor(rawColSpan)
          : 1;
        let rowSpan = Number.isFinite(rawRowSpan) && rawRowSpan > 0
          ? Math.floor(rawRowSpan)
          : 1;
        if (cell.getAttribute('rowspan') === '0') {
          const group = row.closest('thead, tbody, tfoot');
          const groupRows = group
            ? Array.from(group.querySelectorAll('tr')).filter(candidate =>
              candidate.closest('table') === node
            )
            : rowNodes;
          const localIndex = Math.max(0, groupRows.indexOf(row));
          rowSpan = groupRows.length - localIndex;
        }
        const content = Array.from(cell.childNodes)
          .map(child => inlineHtmlNode(child, warnings, {
            ...options,
            escapeBlockSyntax: false,
            tableCell: true
          }))
          .join('')
          .trim();
        normalized[rowIndex][columnIndex] = content;
        for (let offset = 1; offset < colSpan; offset++) {
          normalized[rowIndex][columnIndex + offset] = '<';
        }
        for (let rowOffset = 1; rowOffset < rowSpan; rowOffset++) {
          const coveredRow = normalized[rowIndex + rowOffset];
          if (!coveredRow) break;
          for (let columnOffset = 0; columnOffset < colSpan; columnOffset++) {
            coveredRow[columnIndex + columnOffset] = '^';
          }
        }
        columnIndex += colSpan;
      }
    });
    const width = Math.max(...normalized.map(row => row.length));
    const rectangular = normalized.map(row =>
      [...row, ...Array(Math.max(0, width - row.length)).fill('')]
    );
    const headerCells = Array.from(rowNodes[0]?.children ?? []).filter(cell =>
      ['th', 'td'].includes(cell.tagName.toLowerCase())
    );
    const divider = Array.from({ length: width }, (_, index) => {
      const cell = headerCells[index];
      const alignment = (
        cell?.getAttribute('align') ??
        /text-align\s*:\s*(left|center|right)/i.exec(cell?.getAttribute('style') ?? '')?.[1] ??
        ''
      ).toLowerCase();
      if (alignment === 'left') return ':---';
      if (alignment === 'center') return ':---:';
      if (alignment === 'right') return '---:';
      return '---';
    });
    return [rectangular[0], divider, ...rectangular.slice(1)]
      .map(row => `| ${row.join(' | ')} |`).join('\n');
  }
  const calloutType = node.classList?.contains('wmdx-callout')
    ? [...node.classList]
      .find(className => className.startsWith('wmdx-callout-') && className !== 'wmdx-callout')
      ?.slice('wmdx-callout-'.length)
    : '';
  if (
    calloutType &&
    /^[A-Za-z][A-Za-z0-9_-]*$/.test(calloutType) &&
    ['aside', 'details'].includes(tag)
  ) {
    const titleNode = node.querySelector(':scope > .wmdx-callout-title');
    const bodyNode = node.querySelector(':scope > .wmdx-callout-body');
    const title = titleNode
      ? Array.from(titleNode.childNodes)
        .map(child => inlineHtmlNode(child, warnings, {
          ...options,
          escapeBlockSyntax: false
        })).join('').trim()
      : 'Callout';
    const body = bodyNode
      ? Array.from(bodyNode.childNodes)
        .map(child => htmlBlock(child, warnings, depth + 1, options))
        .filter(value => value.trim())
        .join('\n\n')
      : '';
    const folded = tag === 'details' ? (node.hasAttribute('open') ? '+' : '-') : '';
    return `±${calloutType}${folded} ${title}` +
      (body ? `\n${body.split('\n').map(line => line ? `  ${line}` : '').join('\n')}` : '');
  }
  if (tag === 'details') {
    const summary = node.querySelector(':scope > summary');
    const title = summary
      ? Array.from(summary.childNodes)
        .map(child => inlineHtmlNode(child, warnings, options)).join('').trim()
      : '';
    const summaryTitle = title || 'Details';
    const body = Array.from(node.childNodes)
      .filter(child => child !== summary)
      .map(child => htmlBlock(child, warnings, depth + 1, options))
      .filter(value => value.trim())
      .join('\n\n');
    const marker = node.hasAttribute('open') ? '+' : '-';
    return `±dropdown${marker} ${summaryTitle}\n${body.split('\n')
      .map(line => line ? `  ${line}` : '').join('\n')}`;
  }
  if (tag === 'figure') {
    const image = node.querySelector('img');
    const caption = node.querySelector('figcaption')?.textContent?.trim();
    if (image) {
      const resource = htmlImageResource(image, warnings, caption, htmlAlignment(node));
      if (/^<img\b/i.test(resource)) {
        const alignment = htmlAlignment(node);
        const style = alignment ? ` style="text-align: ${alignment};"` : '';
        const safeCaption = caption
          ? `<figcaption>${escapeHtml(caption)}</figcaption>`
          : '';
        return `<figure${style}>${resource}${safeCaption}</figure>`;
      }
      return resource;
    }
  }
  if (tag === 'audio' || tag === 'video') {
    return htmlMediaResource(node);
  }
  if (tag === 'img') return inlineHtmlNode(node, warnings, options);
  if (tag === 'div' && (node.hasAttribute('align') ||
      /text-align\s*:/i.test(node.getAttribute('style') ?? ''))) {
    const alignment = htmlAlignment(node);
    const marker = {
      left: '<', center: '><', right: '>', justify: '<>'
    }[alignment];
    if (marker) {
      const textJustifyValue =
        /(?:^|;)\s*text-justify\s*:\s*(auto|none|inter-word|inter-character)\s*(?:;|$)/i
          .exec(node.getAttribute('style') ?? '')?.[1]?.toLowerCase();
      if (textJustifyValue && node.children.length === 0) {
        return `<div style="text-align: ${alignment}; text-justify: ${textJustifyValue};">` +
          `${escapeHtml(node.textContent ?? '')}</div>`;
      }
      const blockChildTags = new Set([
        'blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'ol', 'p', 'pre', 'table', 'ul'
      ]);
      const hasBlockChildren = Array.from(node.children)
        .some(child => blockChildTags.has(child.tagName.toLowerCase()));
      const content = hasBlockChildren
        ? children().join('\n\n')
        : inline();
      return `${marker}\n${content}`;
    }
  }
  if (tag === 'a' && node.hasAttribute('id')) {
    const id = node.getAttribute('id')?.trim();
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
      return `${children().join('')}\n#${id}`;
    }
  }
  if (tag === 'aside') {
    addWarning(warnings, 'Generic HTML aside content was imported as ordinary text; its specific callout type is unknown.');
  }
  if (tag === 'dl') {
    return Array.from(node.children).map(child => {
      const childTag = child.tagName.toLowerCase();
      const text = inlineHtmlNode(child, warnings).trim();
      return childTag === 'dt' ? text : childTag === 'dd' ? `: ${text}` : '';
    }).filter(Boolean).join('\n');
  }
  if (tag === 'li') return children().join(' ');
  return children().join(tag === 'div' || tag === 'section' ? '\n\n' : '');
}

function resolveEmbeddedHtmlResources(
  document,
  embeddedResources,
  baseLocation,
  warnings,
  resolveEmbeddedResource
) {
  if (!embeddedResources || typeof embeddedResources !== 'object') return;
  const base = document.querySelector('base[href]')?.getAttribute('href') ||
    baseLocation ||
    '';
  const resolvedById = new Map();
  const resolveValue = value => {
    const embedded = embeddedResources[value];
    if (typeof embedded !== 'string') return '';
    if (embedded.startsWith('data:')) return embedded;
    if (typeof resolveEmbeddedResource !== 'function') return '';
    if (!resolvedById.has(embedded)) {
      resolvedById.set(embedded, String(resolveEmbeddedResource(embedded) ?? ''));
    }
    return resolvedById.get(embedded);
  };
  const elements = document.querySelectorAll('[src], [href], [poster], [background]');
  for (const element of elements) {
    for (const attribute of ['src', 'href', 'poster', 'background']) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const key = value.trim();
      let lookupKey = key;
      let embedded = resolveValue(key);
      if (!embedded && base) {
        try {
          lookupKey = new URL(key, base).href;
          embedded = resolveValue(lookupKey);
        } catch {
          // The authored reference remains unchanged when it cannot be resolved.
        }
      }
      if (typeof embedded === 'string' && embedded.startsWith('data:')) {
        if (!element.hasAttribute(`data-wmdx-original-${attribute}`)) {
          element.setAttribute(`data-wmdx-original-${attribute}`, key);
        }
        element.setAttribute(attribute, embedded);
      } else if (
        embeddedResources[lookupKey] &&
        typeof resolveEmbeddedResource === 'function'
      ) {
        addWarning(
          warnings,
          'An embedded MHTML resource could not be read; its original link was retained.'
        );
      }
    }
  }
}

function extractWmdxHtmlFootnotes(document, warnings) {
  const section = document.querySelector('section.wmdx-footnotes');
  if (!section) return { definitions: [], restored: false };
  const items = Array.from(section.querySelectorAll(':scope > ol > li'));
  if (!items.length) return { definitions: [], restored: false };
  const labelsById = new Map(items.map((item, index) => [item.id, String(index + 1)]));
  const references = Array.from(
    document.querySelectorAll('sup.wmdx-footnote-reference')
  );
  if (!references.length) return { definitions: [], restored: false };

  const referenceLabels = references.map(reference => {
    const href = reference.querySelector('a[href^="#"]')?.getAttribute('href') ?? '';
    return labelsById.get(href.slice(1)) ?? '';
  });
  if (referenceLabels.some(label => !label)) {
    addWarning(warnings, 'HTML footnote references could not be matched to their definitions.');
    return { definitions: [], restored: false };
  }

  const definitions = items.map((item, index) => {
    const copy = item.cloneNode(true);
    copy.querySelectorAll('.wmdx-footnote-backref').forEach(backref => backref.remove());
    const body = Array.from(copy.childNodes)
      .map(child => htmlBlock(child, warnings))
      .filter(value => value.trim())
      .join('\n\n');
    if (!body) return '';
    const lines = body.split('\n');
    return `[^${index + 1}]: ${lines[0]}` +
      lines.slice(1).map(line => `\n    ${line}`).join('');
  }).filter(Boolean);
  if (definitions.length !== items.length) {
    addWarning(warnings, 'An empty HTML footnote definition could not be restored.');
    return { definitions: [], restored: false };
  }

  references.forEach((reference, index) => {
    reference.replaceWith(
      document.createTextNode(`WMDXFOOTNOTEREF${referenceLabels[index]}END`)
    );
  });
  section.remove();
  return { definitions, restored: true };
}

const commonMarkReferenceHtmlElements = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  'ul', 'ol', 'li', 'pre', 'code', 'em', 'strong', 'del',
  'a', 'img', 'br', 'hr'
]);
const commonMarkReferenceHtmlAttributes = Object.freeze({
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title']),
  code: new Set(['class']),
  ol: new Set(['start'])
});

function isCommonMarkReferenceHtml(body) {
  if (body.querySelector('img[src^="data:"], audio[src^="data:"], video[src^="data:"], source[src^="data:"], a[title="wmdx-attachment"]')) {
    return false;
  }
  const comments = body.ownerDocument.createTreeWalker(body, 128);
  if (comments.nextNode()) return false;
  for (const node of body.querySelectorAll('*')) {
    const tag = node.tagName.toLowerCase();
    if (!commonMarkReferenceHtmlElements.has(tag)) return false;
    const allowedAttributes = commonMarkReferenceHtmlAttributes[tag] ?? new Set();
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!allowedAttributes.has(name)) return false;
      if (tag === 'ol' && name === 'start' && !/^\d+$/.test(attribute.value)) {
        return false;
      }
    }
  }
  return true;
}

function importCommonMarkReferenceHtml(body, Parser, warnings, footnoteDefinitions) {
  const unorderedListMarkerState = { lastByIndent: new Map() };
  const orderedListDelimiters = new WeakMap();
  const blockOptions = { unorderedListMarkerState, preserveCodeBlockText: true };
  const leadingNbspMarkers = new Map();
  const inlineCodeMarkers = new Map();
  const softBreakMarker = String.fromCharCode(0xE002) + 'WMDX_SOFT_BREAK' + String.fromCharCode(0xE003);
  const leadingNbspCharacter = String.fromCharCode(0x00A0);
  const blockStartTags = new Set([
    'blockquote', 'body', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p', 'td', 'th'
  ]);
  const isBlockStartTextNode = textNode => {
    if (!textNode.nodeValue?.startsWith(leadingNbspCharacter)) return false;
    let current = textNode;
    let parent = current.parentNode;
    while (parent && parent !== body.ownerDocument) {
      let sibling = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === 8 ||
            (sibling.nodeType === 3 && !sibling.nodeValue.trim())) {
          sibling = sibling.previousSibling;
          continue;
        }
        return false;
      }
      if (parent.nodeType === 1 && blockStartTags.has(parent.tagName.toLowerCase())) return true;
      current = parent;
      parent = parent.parentNode;
    }
    return false;
  };
  let inlineCodeIndex = 0;
  for (const code of Array.from(body.querySelectorAll('code'))) {
    if (code.closest('pre')) continue;
    let marker = String.fromCharCode(0xE102) + 'WMDX_INLINE_CODE_' + (++inlineCodeIndex) + String.fromCharCode(0xE103);
    while (body.textContent?.includes(marker)) marker += String.fromCharCode(0xE104);
    inlineCodeMarkers.set(marker, formatMarkdownCodeSpan(code.textContent ?? ''));
    code.replaceWith(body.ownerDocument.createTextNode(marker));
  }
  for (const lineBreak of body.querySelectorAll('br')) {
    const next = lineBreak.nextSibling;
    if (next?.nodeType === 3) {
      next.nodeValue = next.nodeValue.replace(/^[ \t]*\r?\n[ \t]*/, ' ');
    }
  }
  for (const heading of body.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const headingWalker = body.ownerDocument.createTreeWalker(heading, 4);
    let headingText = headingWalker.nextNode();
    while (headingText) {
      if (!headingText.parentElement?.closest('code')) {
        headingText.nodeValue = headingText.nodeValue.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
      }
      headingText = headingWalker.nextNode();
    }
  }
  const textWalker = body.ownerDocument.createTreeWalker(body, 4);
  let textNode = textWalker.nextNode();
  let markerIndex = 0;
  while (textNode) {
    if (!textNode.parentElement?.closest('pre, code')) {
      if (isBlockStartTextNode(textNode)) {
        const leading = new RegExp('^' + leadingNbspCharacter + '+').exec(textNode.nodeValue)?.[0] ?? '';
        const marker = String.fromCharCode(0xE100) + 'WMDX_NBSP_' + (++markerIndex) + String.fromCharCode(0xE101);
        leadingNbspMarkers.set(marker, '&nbsp;'.repeat(leading.length));
        textNode.nodeValue = marker + textNode.nodeValue.slice(leading.length);
      }
      if (/\S/.test(textNode.nodeValue)) {
        textNode.nodeValue = textNode.nodeValue.replace(/\r?\n/g, softBreakMarker);
      }
    }
    textNode = textWalker.nextNode();
  }
  const converter = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
    blankReplacement: (_, node) => {
      if (node.nodeType !== 1) return '\n\n';
      const tag = node.tagName.toLowerCase();
      const preserveBlankNode = tag === 'pre' ||
        tag === 'ul' || tag === 'ol' ||
        (tag === 'blockquote' && node.querySelector('pre, ul, ol, hr, table')) ||
        (tag === 'p' && node.querySelector('a[href], img[src], code')) ||
        (tag === 'a' && node.hasAttribute('href'));
      if (!preserveBlankNode) return '\n\n';
      const markdown = htmlBlock(node, warnings, 0, blockOptions);
      return markdown ? '\n\n' + markdown + '\n\n' : '\n\n';
    }
  });
  converter.escape = value => {
    const source = String(value ?? '').split(softBreakMarker).join('\n');
    return markdownText(source, {
      escapeBlockSyntax: true,
      wmdxSyntax: true
    }).replace(/\r?\n/g, softBreakMarker);
  };
  converter.addRule('commonMarkEmphasis', {
    filter: ['em', 'i'],
    replacement: content => {
      const safeContent = content.replace(/\*/g, character => String.fromCharCode(92) + character);
      return '*' + safeContent + '*';
    }
  });
  let literalBangMarker = String.fromCharCode(0xE000) + 'WMDX_LITERAL_BANG' + String.fromCharCode(0xE001);
  while (body.textContent?.includes(literalBangMarker)) {
    literalBangMarker += String.fromCharCode(0xE001);
  }
  for (const link of Array.from(body.querySelectorAll('a'))) {
    const previous = link.previousSibling;
    if (previous?.nodeType !== 3 || !previous.nodeValue?.endsWith('!')) continue;
    previous.nodeValue = previous.nodeValue.slice(0, -1) + literalBangMarker;
  }
  converter.addRule('commonMarkHeading', {
    filter: node => /^H[1-6]$/.test(node.nodeName),
    replacement: (content, node) => {
      const level = Number(node.nodeName[1]);
      const normalizedContent = content.replace(/\s+/g, ' ').trim();
      const safeContent = normalizedContent.replace(/(^|\s)(#{1,6})[ \t]*$/g, (_, prefix, hashes) => prefix + String.fromCharCode(92) + hashes);
      return '\n\n' + '#'.repeat(level) + ' ' + safeContent + '\n\n';
    }
  });
  converter.addRule('emptyImageDestination', {
    filter: node => node.nodeName === 'IMG' && node.getAttribute('src') === '',
    replacement: (_, node) => '!' + '[' + markdownText(node.getAttribute('alt') ?? '', {
      escapeBlockSyntax: false,
      wmdxSyntax: true
    }) + ']()'
  });
  converter.addRule('emptyLinkDestination', {
    filter: node => node.nodeName === 'A' && node.getAttribute('href') === '',
    replacement: content => '[' + content + ']()'
  });
  converter.addRule('commonMarkCodeBlock', {
    filter: 'pre',
    replacement: (_, node) => '\n\n' + htmlBlock(node, warnings, 0, blockOptions) + '\n\n'
  });
  converter.addRule('commonMarkBlockquote', {
    filter: 'blockquote',
    replacement: (_, node) => '\n\n' + htmlBlock(node, warnings, 0, blockOptions) + '\n\n'
  });
  converter.addRule('commonMarkList', {
    filter: ['ul', 'ol'],
    replacement: (_, node) => {
      let orderedListDelimiter = '.';
      if (node.nodeName === 'OL') {
        let previous = node.previousSibling;
        while (previous && (previous.nodeType === 8 ||
          (previous.nodeType === 3 && !previous.nodeValue.trim()))) {
          previous = previous.previousSibling;
        }
        const currentStart = Number(node.getAttribute('start')) || 1;
        const currentCount = Array.from(node.children).filter(child => child.nodeName === 'LI').length;
        if (previous?.nodeType === 1 && previous.nodeName === 'OL') {
          const previousStart = Number(previous.getAttribute('start')) || 1;
          const previousCount = Array.from(previous.children).filter(child => child.nodeName === 'LI').length;
          const state = orderedListDelimiters.get(node.parentNode);
          if (state?.node === previous && currentStart === previousStart + previousCount) {
            orderedListDelimiter = state.delimiter === '.' ? ')' : '.';
          }
        }
        orderedListDelimiters.set(node.parentNode, {
          node,
          delimiter: orderedListDelimiter,
          end: currentStart + currentCount - 1
        });
      }
      const markdown = htmlBlock(node, warnings, 0, {
        ...blockOptions,
        orderedListDelimiter
      });
      return '\n\n' + markdown + '\n\n';
    }
  });
  let markdownSource = converter.turndown(body);
  markdownSource = markdownSource.split(literalBangMarker).join('\\!');
  for (const [marker, replacement] of inlineCodeMarkers) {
    markdownSource = markdownSource.split(marker).join(replacement);
  }
  for (const [marker, replacement] of leadingNbspMarkers) {
    markdownSource = markdownSource.split(marker).join(replacement);
  }
  markdownSource = markdownSource.split(softBreakMarker).join('\n');
  markdownSource = protectCodeFences(markdownSource, (lines, protectedLines) =>
    lines.map((line, index) => !protectedLines.has(index) && line.startsWith(leadingNbspCharacter)
      ? '&nbsp;' + line.slice(1)
      : line)
  );
  const imported = convertFromMarkdown(markdownSource, 'commonmark', { DOMParser: Parser });
  const markdown = [imported.markdown, ...footnoteDefinitions]
    .filter(Boolean)
    .join('\n\n');
  if (!markdown && body.textContent?.trim()) {
    throw new Error('No readable document content could be converted from this HTML.');
  }
  return { markdown, warnings: [...warnings, ...imported.warnings] };
}
export function convertFromHtml(
  source,
  Parser = globalThis.DOMParser,
  {
    embeddedResources = null,
    baseLocation = '',
    resolveEmbeddedResource = null
  } = {}
) {
  if (typeof Parser !== 'function') {
    throw new Error('HTML conversion requires a DOMParser implementation.');
  }
  const warnings = [];
  const document = new Parser().parseFromString(String(source ?? ''), 'text/html');
  annotateHtmlHeadingLinks(document, baseLocation);
  resolveEmbeddedHtmlResources(
    document,
    embeddedResources,
    baseLocation,
    warnings,
    resolveEmbeddedResource
  );
  const commentWalker = document.createTreeWalker(document.body, 128);
  const hasHtmlComments = Boolean(commentWalker.nextNode());
  const footnotes = extractWmdxHtmlFootnotes(document, warnings);
  const body = document.body;
  if (hasHtmlComments && !warnings.some(warning => warning.includes('HTML comments'))) {
    addWarning(warnings, 'HTML comments have no native Wmdx equivalent and were omitted.');
  }
  const hasEmbeddedResources = embeddedResources && Object.keys(embeddedResources).length > 0;
  if (!hasEmbeddedResources && isCommonMarkReferenceHtml(body)) {
    return importCommonMarkReferenceHtml(body, Parser, warnings, footnotes.definitions);
  }
  const unorderedListMarkerState = { lastByIndent: new Map() };
  const mainMarkdown = Array.from(body.childNodes)
    .map(node => htmlBlock(node, warnings, 0, {
      unorderedListMarkerState
    }))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/WMDXFOOTNOTEREF(\d+)END/g, '[^$1]');
  const markdown = [mainMarkdown, ...footnotes.definitions]
    .filter(Boolean)
    .join('\n\n');
  if (!markdown && String(source ?? '').trim()) {
    throw new Error('No readable document content could be converted from this HTML.');
  }
  return { markdown, warnings };
}

function headingFragmentSlug(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function convertWmdxResourceToMarkdown(raw, dialect, warnings) {
  const resource = parseWmdxResourceSyntax(raw);
  if (!resource) return raw;
  const { source, title, size, alignment, embed } = resource;
  const extension = resourceExtensionFromSource(source);
  if (!embed) {
    if (source.startsWith('#') && source.length > 1) {
      const heading = source.slice(1).trim();
      if (dialect === 'obsidian') {
        return `[[#${heading}${title && title !== heading ? `|${title}` : ''}]]`;
      }
      const fragment = headingFragmentSlug(heading);
      return `[${title || heading}](#${encodeMarkdownDestination(fragment)})`;
    }
    if (dialect === 'obsidian' && !/^([a-z][a-z\d+.-]*:|\/|\.\/|\.\.\/|#)/i.test(source)) {
      return `[[${source}${title && title !== getWmdxResourceFallbackTitle(source) ? `|${title}` : ''}]]`;
    }
    return `[${title || getWmdxResourceFallbackTitle(source)}](${encodeMarkdownDestination(source)})`;
  }

  if (
    dialect === 'obsidian' &&
    !alignment &&
    (!size?.unit || size.unit === 'px') &&
    !/^[a-z][a-z\d+.-]*:/i.test(source)
  ) {
    const alias = title && title !== getWmdxResourceFallbackTitle(source)
      ? title
      : size?.width ? String(size.width) : '';
    return `![[${source}${alias ? `|${alias}` : ''}]]`;
  }

  const escapedSource = escapeHtml(source);
  const escapedTitle = escapeHtml(title || getWmdxResourceFallbackTitle(source));
  const dimensionAttrs = [];
  if (size?.unit === 'px') {
    dimensionAttrs.push(`width="${size.width}"`);
    if (size.height) dimensionAttrs.push(`height="${size.height}"`);
  } else if (size?.unit === '%') {
    dimensionAttrs.push(`style="width:${size.width}%"`);
  }
  const imageExtensions = new Set([
    'avif', 'bmp', 'gif', 'jpe', 'jpeg', 'jpg', 'png', 'svg', 'webp'
  ]);
  const hasSize = Boolean(size?.unit);
  if (
    imageExtensions.has(extension) &&
    !alignment &&
    !hasSize &&
    (
      dialect === 'commonmark' ||
      dialect === 'gfm' ||
      (dialect === 'obsidian' && /^[a-z][a-z\d+.-]*:/i.test(source))
    )
  ) {
    const alt = escapeMarkdownField(
      title || getWmdxResourceFallbackTitle(source),
      { escapeCharacters: '[]' }
    );
    return `![${alt}](${encodeMarkdownDestination(source)})`;
  }
  const audioExtensions = new Set([
    'aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav'
  ]);
  const videoExtensions = new Set([
    '3gp', 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg',
    'ogv', 'webm', 'wmv'
  ]);
  if (audioExtensions.has(extension)) {
    if (alignment || hasSize) {
      addWarning(warnings, 'Audio size or alignment is not retained in Markdown export.');
    }
    return `<audio controls src="${escapeHtml(encodeMarkdownDestination(source))}" aria-label="${escapedTitle}"></audio>`;
  }
  if (videoExtensions.has(extension)) {
    if (alignment) {
      addWarning(warnings, 'Video alignment is not retained in Markdown export.');
    }
    return `<video controls src="${escapeHtml(encodeMarkdownDestination(source))}" aria-label="${escapedTitle}"${dimensionAttrs.length ? ` ${dimensionAttrs.join(' ')}` : ''}></video>`;
  }
  if (!imageExtensions.has(extension)) {
    if (alignment || hasSize) {
      addWarning(warnings, 'Attachment size or alignment is not retained in Markdown export.');
    }
    return `[${title || getWmdxResourceFallbackTitle(source)}](${encodeMarkdownDestination(source)} "wmdx-attachment")`;
  }
  if (alignment || hasSize) {
    addWarning(warnings, 'Image size, alignment, or visible caption uses HTML for this Markdown dialect.');
  }
  const image = `<img src="${escapeHtml(encodeMarkdownDestination(source))}" alt="${escapedTitle}"${dimensionAttrs.length ? ` ${dimensionAttrs.join(' ')}` : ''}>`;
  const content = title ? `${image}<figcaption>${escapedTitle}</figcaption>` : image;
  const style = alignment && alignment !== 'left' ? ` style="text-align:${alignment}"` : '';
  return `<figure${style}>${content}</figure>`;
}

function convertWmdxCallouts(lines, dialect, warnings, protectedLines) {
  const output = [...lines];
  const detailsIndexes = [];
  const openerPattern = /^([ \t]*)±([A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)([+-]?)(?:[ \t]+(.*))?$/;
  const emphasizeTitle = value => {
    const title = String(value ?? '').trim();
    return /^\*\*[\s\S]*\*\*$/.test(title) || /^__[\s\S]*__$/.test(title)
      ? title
      : `**${title}**`;
  };
  for (let index = 0; index < lines.length; index += 1) {
    if (protectedLines.has(index)) continue;
    const opener = openerPattern.exec(lines[index]);
    if (!opener) continue;
    const indent = opener[1].length;
    const type = opener[2].toLowerCase();
    const state = opener[3];
    const title = opener[4]?.trim() ?? '';
    let end = index + 1;
    const body = [];
    while (end < lines.length) {
      if (protectedLines.has(end)) break;
      const line = lines[end];
      if (!line.trim()) {
        body.push('');
        end += 1;
        continue;
      }
      const currentIndent = /^[ \t]*/.exec(line)[0].length;
      if (currentIndent <= indent) break;
      body.push(line.slice(Math.min(indent + 2, currentIndent)));
      end += 1;
    }
    const bodyText = body.join('\n').replace(/\n+$/, '');
    if (type === 'dropdown') {
      const summary = marked.parseInline(title || 'Details', {
        gfm: dialect !== 'commonmark'
      });
      const content = marked.parse(bodyText, {
        gfm: dialect !== 'commonmark',
        breaks: false,
        async: false
      });
      output[index] = `<details${state === '+' ? ' open' : ''}>\n` +
        `<summary>${summary}</summary>\n${content.trim()}\n</details>`;
      detailsIndexes.push(index);
      for (let row = index + 1; row < end; row += 1) output[row] = '';
    } else if (dialect === 'obsidian') {
      const opener = `> [!${type}]${state}${title ? ` ${title}` : ''}`;
      const quoted = bodyText.split('\n').map(line => `> ${line}`).join('\n');
      output[index] = `${opener}\n${quoted}`;
      for (let row = index + 1; row < end; row += 1) output[row] = '';
    } else if (dialect === 'gfm' &&
      ['note', 'info', 'tip', 'important', 'warning', 'caution'].includes(type)) {
      const mapped = ['info', 'note'].includes(type) ? 'NOTE' : type.toUpperCase();
      if (type === 'info') {
        addWarning(
          warnings,
          'GFM has NOTE but no INFO alert; an Obsidian info callout returns as note.'
        );
      }
      const quoted = bodyText.split('\n').map(line => `> ${line}`).join('\n');
      const titleLine = title ? `> ${emphasizeTitle(title)}\n` : '';
      output[index] = `> [!${mapped}]\n${titleLine}${quoted}`;
      for (let row = index + 1; row < end; row += 1) output[row] = '';
      if (state) {
        addWarning(warnings, 'GFM alerts do not preserve the Wmdx expanded or collapsed state.');
      }
    } else {
      const titleLine = title ? `> ${emphasizeTitle(title)}\n` : `> **${type}**\n`;
      output[index] = `${titleLine}${bodyText.split('\n').map(line => `> ${line}`).join('\n')}`;
      for (let row = index + 1; row < end; row += 1) output[row] = '';
      addWarning(warnings, 'Wmdx callout type, styling, and fold state were exported as a standard block quote.');
    }
    index = end - 1;
  }
  if (detailsIndexes.length) {
    const removedRows = new Set();
    for (const detailsIndex of detailsIndexes) {
      let row = detailsIndex + 1;
      while (row < output.length && !output[row].trim()) row += 1;
      for (let blank = detailsIndex + 2; blank < row; blank += 1) {
        removedRows.add(blank);
      }
    }
    if (removedRows.size) {
      const compacted = [];
      const remappedProtectedLines = new Set();
      for (let index = 0; index < output.length; index += 1) {
        if (removedRows.has(index)) continue;
        if (protectedLines.has(index)) remappedProtectedLines.add(compacted.length);
        compacted.push(output[index]);
      }
      protectedLines.clear();
      for (const index of remappedProtectedLines) protectedLines.add(index);
      return compacted;
    }
  }
  return output;
}

function transformTextOutsideHtmlTags(value, transform) {
  let output = '';
  let plainStart = 0;
  let index = 0;
  while (index < value.length) {
    if (
      value[index] !== '<' ||
      !/[A-Za-z!/]/.test(value[index + 1] ?? '')
    ) {
      index += 1;
      continue;
    }
    let quote = '';
    let end = index + 1;
    for (; end < value.length; end += 1) {
      const character = value[end];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
    }
    if (end >= value.length) {
      const nextTag = value.indexOf('<', index + 1);
      const literalEnd = nextTag >= 0 ? nextTag : value.length;
      output += transform(value.slice(plainStart, index));
      output += value.slice(index, literalEnd);
      index = literalEnd;
      plainStart = literalEnd;
      continue;
    }
    output += transform(value.slice(plainStart, index));
    output += value.slice(index, end + 1);
    index = end + 1;
    plainStart = index;
  }
  return output + transform(value.slice(plainStart));
}

function removeRedundantMarkdownUnderscoreEscapes(source) {
  let text = String(source ?? '');
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '\\') {
      index += 1;
      continue;
    }
    let runEnd = index;
    while (text[runEnd] === '\\') runEnd += 1;
    const runLength = runEnd - index;
    if (text[runEnd] !== '_' || runLength % 2 === 0) {
      index = runEnd + 1;
      continue;
    }
    const candidate = text.slice(0, runEnd - 1) + text.slice(runEnd);
    if (marked.parseInline(candidate) === marked.parseInline(text)) {
      text = candidate;
      index = Math.max(0, index - 1);
    } else {
      index = runEnd + 1;
    }
  }
  return text;
}

function convertWmdxInlineToMarkdown(
  line,
  dialect,
  warnings,
  generatedFootnotes = [],
  usedFootnoteLabels = new Set()
) {
  let output = '';
  let plainStart = 0;
  let index = 0;
  const transformText = plainText => {
    const protectedValues = [];
    const protect = value => {
      const marker = `\uE000math${protectedValues.length}\uE001`;
      protectedValues.push({ marker, value });
      return marker;
    };
    let text = String(plainText ?? '');
    if (dialect === 'gfm') {
      let output = '';
      for (let index = 0; index < text.length;) {
        if (
          text[index] !== '^' ||
          text[index + 1] !== '[' ||
          (index > 0 && text[index - 1] === '\\')
        ) {
          output += text[index++];
          continue;
        }
        let depth = 1;
        let close = index + 2;
        for (; close < text.length; close++) {
          if (text[close] === '\\') {
            close++;
          } else if (text[close] === '[') {
            depth++;
          } else if (text[close] === ']' && --depth === 0) {
            break;
          }
        }
        const body = text.slice(index + 2, close);
        if (depth !== 0 || !body.trim()) {
          output += text[index++];
          continue;
        }
        let number = generatedFootnotes.length + 1;
        let label = `wmdx-inline-${number}`;
        while (usedFootnoteLabels.has(label.toLowerCase())) {
          number++;
          label = `wmdx-inline-${number}`;
        }
        usedFootnoteLabels.add(label.toLowerCase());
        generatedFootnotes.push({ label, body });
        output += `[^${label}]`;
        index = close + 1;
      }
      text = output;
    }
    if (dialect !== 'obsidian') {
      text = text.replace(/(?<!\\)!\[\[([^\]\n]+)\]\]/g, (_, target) => {
        addWarning(
          warnings,
          'Obsidian note transclusion has no equivalent in this dialect; it was escaped and preserved as literal text.'
        );
        return `\\!\\[\\[${target}\\]\\]`;
      });
    }
    if (dialect === 'commonmark' && /(?<!\\)\^\[[^\]\n]+\]/.test(text)) {
      addWarning(
        warnings,
        'CommonMark has no footnote syntax; Obsidian inline footnotes were preserved as text.'
      );
    }
    text = protectInlineMathSyntax(text, protect);
    text = protectBareAutolinks(text, protect);
    text = text.replace(
      /(?<![\p{L}\p{N}\p{M}_\\])_([₀₁₂₃]?)(?![₀₁₂₃]_)(\S(?:[^\n]*?\S)?)_(?![\p{L}\p{N}\p{M}_])/gu,
      (_, style, content) => {
        if (style) addWarning(warnings, 'Colored or styled underline is exported as plain underline.');
        return `<u>${content}</u>`;
      }
    );
    if (dialect === 'commonmark') {
      text = text.replace(
        /(?<![~\\])~~(?!~)(\S(?:[^~]*?\S)?)~~(?!~)/gu,
        (_, content) => `<del>${content}</del>`
      );
    }
    text = text.replace(
      /(?<![\\^])\^([^\s^\n](?:[^^\n]*?[^\s^\n])?)\^(?!\^)/gu,
      (_, content) => `<sup>${content}</sup>`
    );
    text = text.replace(
      /(?<![~\\])~(?!~)(\S(?:[^~]*?\S)?)~(?!~)/gu,
      (_, content) => `<sub>${content}</sub>`
    );
    text = text.replace(
      /(?<![=\\])==([₀₁₂]?)(\S(?:.*?\S)?)(?<!\\)==(?![=])/g,
      (_, slot, content) => {
      if (slot) addWarning(warnings, 'Colored highlight slots export without their custom color.');
      return dialect === 'obsidian'
        ? `==${content}==`
        : `<mark>${content}</mark>`;
      }
    );
    text = text.replace(
      /(?<![=\\])=(?![=])(?:[₀₁₂])?(\S(?:.*?\S)?)(?<![=\\])=(?![=])/g,
      (_, content) => {
      addWarning(warnings, 'Wmdx pen colors have no portable Markdown equivalent; pen markers were removed.');
      return content;
      }
    );
    text = text.replace(/(?<!\\)(!?)\[[^\]\n]*\]/g, raw =>
      convertWmdxResourceToMarkdown(raw, dialect, warnings)
    );
    text = removeRedundantMarkdownUnderscoreEscapes(text);
    for (const { marker, value } of protectedValues.reverse()) {
      text = text.replace(marker, () => value);
    }
    return text;
  };
  const transform = plainText =>
    transformTextOutsideHtmlTags(plainText, transformText);

  while (index < line.length) {
    if (line[index] === '<') {
      const autolink = /^(?:<(?:https?|ftp):\/\/[^>\s]+>|<mailto:[^>\s]+>|<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>)/i
        .exec(line.slice(index));
      if (autolink) {
        output += transform(line.slice(plainStart, index));
        output += autolink[0];
        index += autolink[0].length;
        plainStart = index;
        continue;
      }
    }
    if (line[index] !== '`' || line[index - 1] === '\\') {
      index += 1;
      continue;
    }
    let runEnd = index;
    while (line[runEnd] === '`') runEnd += 1;
    const runLength = runEnd - index;
    let closing = runEnd;
    let closeStart = -1;
    while (closing < line.length) {
      const nextTick = line.indexOf('`', closing);
      if (nextTick < 0) break;
      let nextEnd = nextTick;
      while (line[nextEnd] === '`') nextEnd += 1;
      if (nextEnd - nextTick === runLength) {
        closeStart = nextTick;
        break;
      }
      closing = nextEnd;
    }
    if (closeStart < 0) {
      index = runEnd;
      continue;
    }
    output += transform(line.slice(plainStart, index));
    const closeEnd = closeStart + runLength;
    output += line.slice(index, closeEnd);
    index = closeEnd;
    plainStart = closeEnd;
  }
  return output + transform(line.slice(plainStart));
}

function convertGfmTablesToCommonMarkHtml(source) {
  const tables = [];
  const collectTables = tokens => {
    for (const token of tokens ?? []) {
      if (token.type === 'table' && token.raw) tables.push(token.raw);
      if (token.tokens) collectTables(token.tokens);
      for (const item of token.items ?? []) {
        if (item.tokens) collectTables(item.tokens);
      }
    }
  };
  collectTables(marked.lexer(source, { gfm: true }));

  const lines = source.split('\n');
  const occupiedLines = new Set();
  const replacements = [];
  const containerPrefix = line => /^[ \t]*(?:>[ \t]*)*/.exec(line)?.[0] ?? '';

  for (const table of tables) {
    const tableLines = table.replace(/\n$/, '').split('\n');
    for (let start = 0; start <= lines.length - tableLines.length; start += 1) {
      const prefix = containerPrefix(lines[start]);
      const matches = tableLines.every((line, offset) =>
        !occupiedLines.has(start + offset) &&
        lines[start + offset].startsWith(prefix) &&
        lines[start + offset].slice(prefix.length).trimEnd() === line.trimEnd()
      );
      if (!matches) continue;

      const htmlLines = marked.parse(table, { gfm: true })
        .trim()
        .split('\n')
        .map(line => `${prefix}${line}`);
      const terminator = prefix.trim() ? prefix : '';
      replacements.push({
        start,
        length: tableLines.length,
        lines: [...htmlLines, terminator]
      });
      for (let offset = 0; offset < tableLines.length; offset += 1) {
        occupiedLines.add(start + offset);
      }
      break;
    }
  }

  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    lines.splice(replacement.start, replacement.length, ...replacement.lines);
  }
  return lines.join('\n');
}

function mapWmdxOrderedLists(lines, protectedLines, warnings) {
  let offset = 0;
  const sourceLines = lines.map((text, index) => {
    const line = { text, from: offset, to: offset + text.length, number: index + 1 };
    offset = line.to + 1;
    return line;
  });
  const listProtectedLines = new Set(protectedLines);
  let linkDestinationDepth = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (protectedLines.has(lineIndex)) continue;
    const line = lines[lineIndex];
    if (linkDestinationDepth > 0) listProtectedLines.add(lineIndex);
    let codeTicks = 0;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '\\') {
        index += 1;
        continue;
      }
      if (line[index] === '`') {
        let end = index;
        while (line[end] === '`') end += 1;
        const count = end - index;
        if (!codeTicks) codeTicks = count;
        else if (codeTicks === count) codeTicks = 0;
        index = end - 1;
        continue;
      }
      if (codeTicks) continue;
      if (linkDestinationDepth > 0) {
        if (line[index] === '(') linkDestinationDepth += 1;
        else if (line[index] === ')') linkDestinationDepth -= 1;
      } else if (line[index] === ']' && line[index + 1] === '(') {
        linkDestinationDepth = 1;
        index += 1;
      }
    }
  }
  const excludedPositions = new Set();
  for (const index of listProtectedLines) {
    const parsed = parseWmdxOrderedListMarker(lines[index]);
    if (parsed) excludedPositions.add(sourceLines[index].from + parsed.markerFrom);
  }
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseWmdxOrderedListMarker(lines[index]);
    if (
      parsed &&
      /^[ \t]*>/.test(lines[index]) &&
      lines[index].slice(parsed.textFrom).trim() === ''
    ) {
      // Empty alphabetic markers inside quotes collide with ordinary quoted
      // prose such as "ex.". Keep that text rather than changing it to a
      // numbered list item during dialect export.
      excludedPositions.add(sourceLines[index].from + parsed.markerFrom);
    }
  }
  const items = getWmdxOrderedListSequence(
    sourceLines,
    position => excludedPositions.has(position)
  );
  if (!items.length) return lines;

  const output = [...lines];
  for (const item of items) {
    const lineIndex = item.line.number - 1;
    const current = output[lineIndex];
    output[lineIndex] =
      `${current.slice(0, item.markerFrom)}${item.ordinal}${item.delimiter}` +
      current.slice(item.markerTo);
  }
  addWarning(
    warnings,
    'Wmdx alphabetic and Roman list markers were converted to decimal markers; item order and nesting are preserved.'
  );
  return output;
}

function mapWmdxHeadings(lines, protectedLines) {
  return lines.map((line, index) => {
    if (protectedLines.has(index)) return line;
    const match = /^([ \t]*(?:>[ \t]+)*)\.([1-6])(?:[ \t]+(.*))?$/.exec(line);
    return match
      ? `${match[1]}${'#'.repeat(Number(match[2]))}${match[3] ? ` ${match[3]}` : ' '}`
      : line;
  });
}

function mapWmdxTaskItems(lines, protectedLines, dialect, warnings) {
  let used = false;
  const output = lines.map((line, index) => {
    if (protectedLines.has(index)) return line;
    const wmdxTask = /^([ \t]*)\[([ xX])\][ \t]+(.*)$/.exec(line);
    const markdownTask =
      /^((?:[ \t]*>\s*)*[ \t]*)([-+*]|\d+[.)])[ \t]+\[([ xX])\][ \t]+(.*)$/
        .exec(line);
    const task = wmdxTask
      ? { indent: wmdxTask[1], marker: '-', checked: wmdxTask[2], text: wmdxTask[3] }
      : markdownTask
        ? { indent: markdownTask[1], marker: markdownTask[2], checked: markdownTask[3], text: markdownTask[4] }
        : null;
    if (!task) return line;
    if (dialect !== 'commonmark') {
      return wmdxTask
        ? `${task.indent}- [${task.checked.toLowerCase()}] ${task.text}`
        : line;
    }
    used = true;
    const checked = task.checked.toLowerCase() === 'x';
    const checkbox = `<input type="checkbox" disabled${checked ? ' checked' : ''}>`;
    return `${task.indent}${task.marker} ${checkbox} ${task.text}`;
  });
  if (used) {
    addWarning(warnings, 'CommonMark has no task-list extension; checkboxes use inline HTML.');
  }
  return output;
}

function addCommonMarkHeadingAnchors(lines, protectedLines = new Set()) {
  const linkedFragments = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    if (protectedLines.has(index)) continue;
    const line = lines[index];
    for (const match of line.matchAll(/\]\(#([^)]+)\)/g)) {
      let fragment = match[1];
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        // Keep the fragment as authored when it is not valid percent encoding.
      }
      linkedFragments.add(fragment.toLocaleLowerCase());
    }
  }

  const occurrences = new Map();
  return lines.flatMap((line, index) => {
    if (protectedLines.has(index)) return [line];
    const heading = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!heading) return [line];
    const base = headingFragmentSlug(heading[1]);
    if (!base) return [line];
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    const fragment = occurrence === 0 ? base : `${base}-${occurrence}`;
    if (!linkedFragments.has(fragment.toLocaleLowerCase())) return [line];
    return [`<a id="${escapeHtml(fragment)}"></a>`, '', line];
  });
}

function mapWmdxParagraphAlignments(lines, protectedLines, dialect) {
  const alignments = new Map([
    ['<', 'left'],
    ['><', 'center'],
    ['>', 'right'],
    ['<>', 'justify']
  ]);
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let marker = protectedLines.has(index)
      ? null
      : /^([ \t]*)(<|><|>|<>)[ \t]*$/.exec(line);
    if (marker?.[2] === '>') {
      const previousLine = lines[index - 1] ?? '';
      const nextLine = lines[index + 1] ?? '';
      if (/^[ \t]*>/.test(previousLine) || /^[ \t]*>/.test(nextLine)) {
        marker = null;
      }
    }
    const alignment = marker ? alignments.get(marker[2]) : null;
    if (!alignment) {
      output.push(line);
      continue;
    }

    let end = index + 1;
    while (end < lines.length && lines[end].trim() && !protectedLines.has(end)) {
      end += 1;
    }
    const body = lines.slice(index + 1, end).join('\n').trim();
    if (!body) {
      output.push(line);
      continue;
    }

    const htmlReadyBody = dialect === 'commonmark'
      ? convertGfmTablesToCommonMarkHtml(body)
      : body;
    const renderOptions = {
      gfm: dialect !== 'commonmark',
      breaks: false,
      async: false
    };
    const tokens = marked.lexer(htmlReadyBody, renderOptions);
    const renderedBody = (
      tokens.length === 1 && tokens[0].type === 'paragraph'
        ? marked.parseInline(htmlReadyBody, renderOptions)
        : marked.parse(htmlReadyBody, renderOptions)
    ).trim();
    const indent = marker[1];
    const alignedHtml = tokens.length === 1 && tokens[0].type === 'paragraph'
      ? `<div align="${alignment}">${renderedBody}</div>`
      : `<div align="${alignment}">\n${renderedBody}\n${indent}</div>`;
    output.push(`${indent}${alignedHtml}`);
    index = end - 1;
  }
  return output;
}

function separateStandaloneHtmlMediaBlocks(lines) {
  const output = [];
  for (let index = 0; index < lines.length; index++) {
    const line = String(lines[index] ?? '');
    const isStandaloneMediaBlock =
      /^<(?:figure|audio|video)\b[\s\S]*<\/(?:figure|audio|video)\s*>$/i
        .test(line.trim());
    if (
      isStandaloneMediaBlock &&
      output.length &&
      output.at(-1).trim()
    ) {
      output.push('');
    }
    output.push(line);
    if (
      isStandaloneMediaBlock &&
      index + 1 < lines.length &&
      String(lines[index + 1] ?? '').trim()
    ) {
      output.push('');
    }
  }
  return output;
}

export function exportMarkdown(source, dialect = 'commonmark') {
  if (!MARKDOWN_EXPORT_FORMATS.includes(dialect)) {
    throw new TypeError(`Unsupported Markdown export format: ${dialect}`);
  }
  const warnings = [];
  const commonMarkReferences = dialect === 'obsidian'
    ? collectCommonMarkReferenceLabels(source)
    : new Set();
  if (
    dialect !== 'obsidian' &&
    findYamlFrontmatterEndLine(String(source ?? '').replace(/\r\n/g, '\n').split('\n')) >= 0
  ) {
    addWarning(
      warnings,
      'YAML frontmatter was preserved verbatim; this target does not standardize frontmatter properties.'
    );
  }
  const markdown = protectCodeFences(source, (originalLines, protectedLines) => {
    protectRawHtmlTableLines(originalLines, protectedLines);
    protectRawHtmlBlockLines(originalLines, protectedLines);
    if (
      dialect === 'commonmark' &&
      originalLines.some((line, index) =>
        !protectedLines.has(index) && /^[ \t]*\[\^[^\]\s]+\]:/.test(line)
      )
    ) {
      addWarning(
        warnings,
        'CommonMark has no footnote syntax; footnote source was preserved but may render as ordinary text.'
      );
    }
    let lines = [...originalLines];
    if (dialect === 'obsidian') {
      lines = protectObsidianCommonMarkReferenceCollisions(
        lines,
        protectedLines,
        commonMarkReferences
      );
    }
    lines = mapWmdxHeadings(lines, protectedLines);
    lines = convertWmdxCallouts(lines, dialect, warnings, protectedLines);
    lines = mapWmdxOrderedLists(lines, protectedLines, warnings);
    lines = mapWmdxTaskItems(lines, protectedLines, dialect, warnings);
    const generatedFootnotes = [];
    const usedFootnoteLabels = new Set(
      [...String(source ?? '').matchAll(/\[\^([^\]\s]+)\]/g)]
        .map(match => match[1].toLowerCase())
    );
    let output = lines.map((line, index) => protectedLines.has(index)
      ? line
      : convertWmdxInlineToMarkdown(
        line,
        dialect,
        warnings,
        generatedFootnotes,
        usedFootnoteLabels
      ));
    output = mapWmdxParagraphAlignments(output, protectedLines, dialect);
    if (dialect === 'gfm' && generatedFootnotes.length) {
      output.push(
        '',
        ...generatedFootnotes.map(({ label, body }) => `[^${label}]: ${body}`)
      );
    }
    if (dialect === 'commonmark') {
      output = addCommonMarkHeadingAnchors(output, protectedLines);
      return separateStandaloneHtmlMediaBlocks(
        convertGfmTablesToCommonMarkHtml(output.join('\n')).split('\n')
      );
    }
    return separateStandaloneHtmlMediaBlocks(output);
  });
  return { markdown, warnings };
}
