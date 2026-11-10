import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { GFM, Strikethrough, Table, TaskList } from '@lezer/markdown';
import { marked } from 'marked';
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

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      protectedLines.add(index);
      const close = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    if (mathFence) {
      protectedLines.add(index);
      if (
        (mathFence === '$$' && /^\s*\$\$\s*$/.test(line)) ||
        (mathFence === '\\]' && /^\s*\\\]\s*$/.test(line)) ||
        (mathFence.startsWith('\\end{') && line.includes(mathFence))
      ) {
        mathFence = null;
      }
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = { character: opening[1][0], length: opening[1].length };
      protectedLines.add(index);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      mathFence = '$$';
      protectedLines.add(index);
      continue;
    }
    if (/^\s*\\\[\s*$/.test(line)) {
      mathFence = '\\]';
      protectedLines.add(index);
      continue;
    }
    const mathEnvironment = /^\s*\\begin\{(equation|align|gather|multline)\*?\}/.exec(line);
    if (mathEnvironment) {
      mathFence = `\\end{${mathEnvironment[1]}}`;
      protectedLines.add(index);
    }
  }

  const frontmatterEndLine = findYamlFrontmatterEndLine(lines);
  if (frontmatterEndLine >= 0) {
    for (let index = 0; index <= frontmatterEndLine; index += 1) {
      protectedLines.add(index);
    }
  }

  return transformLines(lines, protectedLines).join(newline);
}

function protectInlineMathSyntax(text, protect) {
  return String(text ?? '')
    .replace(/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$/g, protect)
    .replace(/\\\([\s\S]*?\\\)/g, protect)
    .replace(/\\\[[\s\S]*?\\\]/g, protect)
    .replace(
      /(?<!\\)\$(?!\$)([^$\n]*[\\^_{}=+*/-][^$\n]*)(?<!\\)\$(?!\$)/g,
      protect
    );
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
  for (let index = 0; index < lines.length; index += 1) {
    if (protectedLines.has(index)) continue;
    const match = /^\.([1-6])\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) continue;
    const title = match[2].trim();
    const slug = headingFragmentSlug(title);
    if (slug && !headings.has(slug)) headings.set(slug, title);
  }
  return headings;
}

function removeRedundantHeadingAnchors(lines, protectedLines) {
  const nextLines = [];
  const nextProtectedLines = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    if (!protectedLines.has(index)) {
      const anchor = /^\s*<a\s+id=["']([^"']+)["']\s*><\/a>\s*$/i.exec(lines[index]);
      if (anchor) {
        let headingIndex = index + 1;
        while (headingIndex < lines.length && !lines[headingIndex].trim()) headingIndex += 1;
        const heading = !protectedLines.has(headingIndex)
          ? /^\.([1-6])\s+(.+?)\s*$/.exec(lines[headingIndex] ?? '')
          : null;
        if (heading &&
            headingFragmentSlug(anchor[1]) === headingFragmentSlug(heading[2])) {
          index = headingIndex - 1;
          continue;
        }
      }
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
    let output = '';
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '*' || character === '_') {
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
  const normalizeNode = (node, parentEmphasis = null) => {
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
        content += normalizeNode(child, node.name);
        position = child.to;
      }
      content += escapeEmphasisText(source.slice(position, node.to));
      return parentEmphasis === node.name
        ? content
        : `${delimiter}${content}${delimiter}`;
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
      output += normalizeNode(child);
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
        const raw = source.slice(node.from, node.to);
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
    .replace(/(`+)([\s\S]*?)\1/g, protect)
    .replace(/<!--[\s\S]*?-->/g, protect);
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
      return `\`${content.replace(/`/g, '\\`')}\``;
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

function protectTopLevelMarkdownHtmlBlocks(source, format, Parser, warnings) {
  if (!Parser) return { source, restore: text => text };
  const tokens = marked.lexer(source, { gfm: format !== 'commonmark' });
  const replacements = [];
  const chunks = [];
  let cursor = 0;
  let markerIndex = 0;
  for (const token of tokens) {
    const raw = String(token.raw ?? '');
    if (!raw) continue;
    const from = source.indexOf(raw, cursor);
    if (from < 0) continue;
    chunks.push(source.slice(cursor, from));
    let replacement = raw;
    if (token.type === 'html' && token.block === true) {
      try {
        const converted = convertFromHtml(token.text ?? raw, Parser);
        let marker;
        do {
          marker = `\uE020MDXHTMLBLOCK${markerIndex++}\uE021`;
        } while (source.includes(marker));
        replacements.push({ marker, value: converted.markdown });
        for (const warning of converted.warnings) addWarning(warnings, warning);
        replacement = marker;
      } catch (error) {
        if (!String(error?.message).includes('No readable document content')) throw error;
        const activeElement = raw.match(
          /<\s*(script|style|iframe|object|embed|form)\b/i
        )?.[1]?.toLowerCase();
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
  'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul'
]);
const RAW_HTML_BLOCK_START = new RegExp(
  `^\\s*(?:>\\s*)*<(${[...RAW_HTML_BLOCK_TAGS].join('|')})\\b`,
  'i'
);

function isRawHtmlBlockLine(line, state) {
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
          ? `\\!\\[\\[${target}]]`
          : `\\[\\[${target}]]`;
      }
    );
  }

  const escapeTildes = value => value.replace(/~/g, '\\~');
  if (format === 'commonmark') {
    text = text.replace(
      /(?<![~\\])~~(?!~)(\S(?:[^~]*?\S)?)~~(?!~)/gu,
      match => escapeTildes(match)
    );
  }
  text = text.replace(
    /(?<![\p{L}\p{N}\p{M}_\\])_([₀₁₂₃]?)(?![₀₁₂₃]_)(\S(?:[^\n]*?\S)?)_(?![\p{L}\p{N}\p{M}_])/gu,
    match => match.replace(/(?<!\\)_/g, '\\_')
  );
  const escapeEquals = match => match.replace(/(?<!\\)=/g, '\\=');
  if (format !== 'obsidian') {
    text = text.replace(
      /(?<![=\\])==([₀₁₂]?)(\S(?:.*?\S)?)(?<!\\)==(?![=])/g,
      escapeEquals
    );
    text = text.replace(/(?<![=\\])={3,}(?![=])/g, escapeEquals);
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
    match => match.replace(/\^/g, '\\^')
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
  return { markdown: cleaned, warnings };
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
  if (!source) return '';
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
  return dataMimeExtensions[dataMimeType] ??
    String(source ?? '').split(/[?#]/, 1)[0].split('.').at(-1)?.toLowerCase() ??
    '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function markdownText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]<>#+|])/g, '\\$1')
    .replace(/(^|\n)([ \t]*)(\d+|[A-Za-z]+)([.)])(?=[ \t])/g, '$1$2$3\\$4')
    .replace(/(^|\n)([ \t]*)([-+])(?=[ \t])/g, '$1$2\\$3')
    .replace(/(^|\n)([ \t]*)\.(?=[1-6][ \t])/g, '$1$2\\.');
}

function markdownLinkDestination(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\s/g, '%20')
    .replace(/([()<>])/g, '\\$1');
}

function annotateHtmlHeadingLinks(document) {
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

  for (const anchor of document.querySelectorAll('a[href^="#"]')) {
    const rawFragment = anchor.getAttribute('href')?.slice(1) ?? '';
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

function inlineHtmlNode(node, warnings) {
  if (node.nodeType === 3) return markdownText(node.nodeValue);
  if (node.nodeType === 8) {
    addWarning(warnings, 'HTML comments have no native Wmdx equivalent and were omitted.');
    return '';
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (node.hasAttribute('style') && !isGeneratedTocNode(node)) {
    addWarning(warnings, 'Unmapped inline CSS styling was ignored during HTML import.');
  }
  const content = Array.from(node.childNodes)
    .map(child => inlineHtmlNode(child, warnings)).join('');
  if (tag === 'strong' || tag === 'b') return `**${content}**`;
  if (tag === 'em' || tag === 'i') return `*${content}*`;
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${content}~~`;
  if (tag === 'u') return `<u>${content}</u>`;
  if (tag === 'sup') return `^${content}^`;
  if (tag === 'sub') return `~${content}~`;
  if (tag === 'code') return `\`${content.replace(/`/g, '\\`')}\``;
  if (tag === 'mark') return `==${content}==`;
  if (tag === 'br') return '  \n';
  if (tag === 'a') {
    const href = node.getAttribute('href');
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
    if (node.hasAttribute('title')) {
      addWarning(warnings, 'HTML link tooltip titles have no native Wmdx field and were omitted.');
    }
    if (href && (node.hasAttribute('download') ||
        node.getAttribute('data-wmdx-kind') === 'attachment')) {
      return `[${content || markdownText(href)}](${markdownLinkDestination(href)} "wmdx-attachment")`;
    }
    return href
      ? `[${content || markdownText(href)}](${markdownLinkDestination(href)})`
      : content;
  }
  if (tag === 'img') {
    const src = node.getAttribute('src');
    if (!src) return '';
    return htmlImageResource(node, warnings);
  }
  if (tag === 'script' || tag === 'style' || tag === 'iframe' ||
      tag === 'object' || tag === 'embed') {
    addWarning(warnings, `Active HTML element <${tag}> was omitted.`);
    return '';
  }
  return content;
}

function htmlBlock(node, warnings, depth = 0) {
  if (node.nodeType === 3) return markdownText(node.nodeValue);
  if (node.nodeType === 8) {
    addWarning(warnings, 'HTML comments have no native Wmdx equivalent and were omitted.');
    return '';
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (node.hasAttribute('style') && !isGeneratedTocNode(node)) {
    addWarning(warnings, 'Unmapped inline CSS styling was ignored during HTML import.');
  }
  const children = () => Array.from(node.childNodes)
    .map(child => htmlBlock(child, warnings, depth + 1))
    .filter(value => value.trim() !== '');
  const inline = () => Array.from(node.childNodes)
    .map(child => inlineHtmlNode(child, warnings)).join('');

  if (['script', 'style', 'iframe', 'object', 'embed', 'form'].includes(tag)) {
    addWarning(warnings, `Active HTML element <${tag}> was omitted.`);
    return '';
  }
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    return `.${level} ${inline().trim()}`;
  }
  if (tag === 'p') return inline().trim();
  if (tag === 'a') return inlineHtmlNode(node, warnings);
  if (tag === 'br') return '  \n';
  if (tag === 'hr') return '---';
  if (tag === 'pre') {
    const code = node.querySelector('code');
    const text = code?.textContent ?? node.textContent ?? '';
    const language = code?.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] ?? '';
    const content = text.replace(/\n+$/, '');
    const longestFence = Math.max(2, ...Array.from(content.matchAll(/`+/g), match => match[0].length));
    const fence = '`'.repeat(longestFence + 1);
    return `${fence}${language}\n${content}\n${fence}`;
  }
  if (tag === 'blockquote') {
    return children().join('\n\n').split('\n').map(line => `> ${line}`).join('\n');
  }
  if (tag === 'ul' || tag === 'ol') {
    const ordered = tag === 'ol';
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
    return Array.from(node.children).filter(child => child.tagName.toLowerCase() === 'li')
      .map(item => {
        let itemOrdinal = nextOrdinal;
        if (item.hasAttribute('value')) {
          const explicitValue = Number(item.getAttribute('value'));
          addWarning(warnings, 'Custom ordered-list item values were normalized during HTML import.');
          if (Number.isFinite(explicitValue) && explicitValue >= 1) {
            itemOrdinal = explicitValue;
          }
        }
        const checkbox = item.querySelector(
          ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]'
        );
        const marker = ordered
          ? getOrderedMarkerLabel(orderedStyle, itemOrdinal)
          : '-';
        const task = checkbox ? `[${checkbox.checked ? 'x' : ' '}] ` : '';
        const bodyBlocks = Array.from(item.childNodes)
          .filter(child => !(child.nodeType === 1 &&
            ['input', 'ul', 'ol'].includes(child.tagName.toLowerCase())))
          .map(child => htmlBlock(child, warnings, depth + 1))
          .filter(value => value.trim() !== '');
        const nested = Array.from(item.children)
          .filter(child => ['ul', 'ol'].includes(child.tagName.toLowerCase()))
          .map(child => htmlBlock(child, warnings, depth + 1))
          .filter(Boolean)
          .join('\n');
        const itemIndent = '  '.repeat(depth);
        const continuationIndent = '  '.repeat(depth + 1);
        const body = bodyBlocks.shift() || '';
        const prefix = `${itemIndent}${marker} ${task}${body}`;
        const continuation = bodyBlocks.map(block => block.split('\n')
          .map(line => `${continuationIndent}${line}`)
          .join('\n')).join('\n\n');
        const output = `${prefix}${continuation ? `\n\n${continuation}` : ''}` +
          `${nested ? `\n${nested}` : ''}`;
        nextOrdinal = itemOrdinal + 1;
        return output;
      }).join('\n');
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
          .map(child => inlineHtmlNode(child, warnings))
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
      ? Array.from(titleNode.childNodes).map(child => inlineHtmlNode(child, warnings)).join('').trim()
      : 'Callout';
    const body = bodyNode
      ? Array.from(bodyNode.childNodes)
        .map(child => htmlBlock(child, warnings, depth + 1))
        .filter(value => value.trim())
        .join('\n\n')
      : '';
    const folded = tag === 'details' ? (node.hasAttribute('open') ? '+' : '-') : '';
    return `±${calloutType}${folded} ${title}` +
      (body ? `\n${body.split('\n').map(line => line ? `  ${line}` : '').join('\n')}` : '');
  }
  if (tag === 'details') {
    const summary = node.querySelector(':scope > summary');
    const title = summary?.textContent?.trim() || 'Details';
    const body = Array.from(node.childNodes)
      .filter(child => child !== summary)
      .map(child => htmlBlock(child, warnings, depth + 1))
      .filter(value => value.trim())
      .join('\n\n');
    const marker = node.hasAttribute('open') ? '+' : '-';
    return `±dropdown${marker} ${markdownText(title)}\n${body.split('\n')
      .map(line => line ? `  ${line}` : '').join('\n')}`;
  }
  if (tag === 'figure') {
    const image = node.querySelector('img');
    const caption = node.querySelector('figcaption')?.textContent?.trim();
    if (image) {
      return htmlImageResource(image, warnings, caption, htmlAlignment(node));
    }
  }
  if (tag === 'audio' || tag === 'video') {
    const sourceNode = node.querySelector('source');
    const source = node.getAttribute('src') || sourceNode?.getAttribute('src');
    if (source) {
      const title = node.getAttribute('aria-label') ||
        sourceNode?.getAttribute('title') ||
        getWmdxResourceFallbackTitle(
          node.getAttribute('data-wmdx-original-src') ||
          sourceNode?.getAttribute('data-wmdx-original-src') ||
          source
        );
      return `[${markdownText(title)}](${source} "wmdx-${tag}")`;
    }
  }
  if (tag === 'img') return inlineHtmlNode(node, warnings);
  if (tag === 'div' && (node.hasAttribute('align') ||
      /text-align\s*:/i.test(node.getAttribute('style') ?? ''))) {
    const alignment = htmlAlignment(node);
    const marker = {
      left: '<', center: '><', right: '>', justify: '<>'
    }[alignment];
    if (marker) return `${marker}\n${children().join('\n\n')}`;
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
  annotateHtmlHeadingLinks(document);
  resolveEmbeddedHtmlResources(
    document,
    embeddedResources,
    baseLocation,
    warnings,
    resolveEmbeddedResource
  );
  const footnotes = extractWmdxHtmlFootnotes(document, warnings);
  const body = document.body;
  const mainMarkdown = Array.from(body.childNodes)
    .map(node => htmlBlock(node, warnings))
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
    if (dialect === 'obsidian') {
      const opener = `> [!${type}]${state}${title ? ` ${title}` : ''}`;
      const quoted = bodyText.split('\n').map(line => `> ${line}`).join('\n');
      output[index] = `${opener}\n${quoted}`;
      for (let row = index + 1; row < end; row += 1) output[row] = '';
    } else if (dialect === 'gfm' &&
      ['note', 'info', 'tip', 'important', 'warning', 'caution'].includes(type)) {
      const mapped = ['info', 'note'].includes(type) ? 'NOTE' : type.toUpperCase();
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
      index += 1;
      continue;
    }
    output += transform(value.slice(plainStart, index));
    output += value.slice(index, end + 1);
    index = end + 1;
    plainStart = index;
  }
  return output + transform(value.slice(plainStart));
}

function convertWmdxInlineToMarkdown(line, dialect, warnings) {
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
    let text = protectInlineMathSyntax(plainText, protect);
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

function warnCommonMarkTables(lines, protectedLines, warnings) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (protectedLines.has(index) || protectedLines.has(index + 1)) continue;
    if (lines[index].includes('|') &&
        /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) {
      addWarning(
        warnings,
        'Pipe tables are a GFM extension, not CommonMark; the source was preserved, but a strict CommonMark renderer may not display a table.'
      );
      return;
    }
  }
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
    const match = /^([ \t]*)\.([1-6])(?:[ \t]+(.*))?$/.exec(line);
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
    const markdownTask = /^([ \t]*)([-+*]|\d+[.)])[ \t]+\[([ xX])\][ \t]+(.*)$/.exec(line);
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

function addCommonMarkHeadingAnchors(lines) {
  const linkedFragments = new Set();
  for (const line of lines) {
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
  return lines.flatMap(line => {
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

export function exportMarkdown(source, dialect = 'commonmark') {
  if (!MARKDOWN_EXPORT_FORMATS.includes(dialect)) {
    throw new TypeError(`Unsupported Markdown export format: ${dialect}`);
  }
  const warnings = [];
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
    if (dialect !== 'obsidian' && originalLines.some((line, index) =>
      !protectedLines.has(index) && /(?<!\\)\^\[[^\]\n]+\]/.test(line)
    )) {
      addWarning(
        warnings,
        'Obsidian inline footnotes were preserved as text because this target dialect has no equivalent.'
      );
    }
    let lines = [...originalLines];
    lines = mapWmdxHeadings(lines, protectedLines);
    lines = convertWmdxCallouts(lines, dialect, warnings, protectedLines);
    lines = mapWmdxOrderedLists(lines, protectedLines, warnings);
    lines = mapWmdxTaskItems(lines, protectedLines, dialect, warnings);
    if (dialect === 'commonmark') {
      warnCommonMarkTables(lines, protectedLines, warnings);
    }
    const output = lines.map((line, index) => protectedLines.has(index)
      ? line
      : convertWmdxInlineToMarkdown(line, dialect, warnings));
    return dialect === 'commonmark'
      ? addCommonMarkHeadingAnchors(output)
      : output;
  });
  return { markdown, warnings };
}
