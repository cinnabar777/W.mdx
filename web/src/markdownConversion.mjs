import {
  formatWmdxResourceSyntax,
  getWmdxResourceFallbackTitle,
  parseWmdxResourceSyntax
} from './wmdxResources.js';
import {
  getWmdxOrderedListSequence,
  parseWmdxOrderedListMarker
} from './listSyntax.mjs';

export const MARKDOWN_IMPORT_FORMATS = Object.freeze([
  'commonmark', 'gfm', 'obsidian', 'html'
]);
export const MARKDOWN_EXPORT_FORMATS = Object.freeze([
  'commonmark', 'gfm', 'obsidian'
]);

function addWarning(warnings, message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function protectCodeFences(source, transformLines) {
  const newline = String(source).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const protectedLines = new Set();
  let fence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      protectedLines.add(index);
      const close = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = { character: opening[1][0], length: opening[1].length };
      protectedLines.add(index);
    }
  }

  return transformLines(lines, protectedLines).join(newline);
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

function convertHeadings(lines, protectedLines) {
  const output = [...lines];
  for (let index = 0; index < output.length; index += 1) {
    if (protectedLines.has(index)) continue;
    const line = output[index];
    const atx = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*[ \t]*$/.exec(line);
    if (atx) {
      output[index] = `.${atx[1].length} ${atx[2].trim()}`;
      continue;
    }
    if (index + 1 >= output.length || protectedLines.has(index + 1) ||
        !line.trim()) continue;
    const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(output[index + 1]);
    if (!setext) continue;
    output[index] = `.${setext[1][0] === '=' ? 1 : 2} ${line.trim()}`;
    output[index + 1] = '';
    index += 1;
  }
  return output;
}

function parseQuoteLine(line) {
  const match = /^([ \t]*(?:>[ \t]*)+)(.*)$/.exec(line);
  if (!match) return null;
  const depth = (match[1].match(/>/g) ?? []).length;
  return { depth, content: match[2] };
}

function convertObsidianCallouts(lines, protectedLines) {
  const output = [...lines];
  const stack = [];
  for (let index = 0; index < output.length; index += 1) {
    if (protectedLines.has(index)) continue;
    const line = output[index];
    const quote = parseQuoteLine(line);
    const opener = quote && /^\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?(?:[ \t]+(.*))?$/.exec(quote.content);

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

function convertInlineHtmlToMarkdown(line, warnings) {
  return line
    .replace(/<del>([\s\S]*?)<\/del>/gi, '~~$1~~')
    .replace(/<s>([\s\S]*?)<\/s>/gi, '~~$1~~')
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, '<sup>$1</sup>')
    .replace(/<sub>([\s\S]*?)<\/sub>/gi, '<sub>$1</sub>')
    .replace(/<mark(?:\s[^>]*)?>([\s\S]*?)<\/mark>/gi, (_, text) => {
      if (/style\s*=/i.test(line)) {
        addWarning(warnings, 'HTML highlight colors are not retained; highlight meaning is preserved.');
      }
      return `==${text}==`;
    });
}

export function convertFromMarkdown(source, format = 'commonmark') {
  if (!MARKDOWN_IMPORT_FORMATS.includes(format) || format === 'html') {
    throw new TypeError(`Unsupported Markdown import format: ${format}`);
  }
  const warnings = [];
  if (format === 'obsidian' && /%%/.test(String(source ?? ''))) {
    addWarning(warnings, 'Obsidian comments have no native Wmdx equivalent and were kept unchanged.');
  }
  const converted = protectCodeFences(source, (originalLines, protectedLines) => {
    let lines = [...originalLines];
    if (format === 'obsidian' || format === 'gfm') {
      lines = convertObsidianCallouts(lines, protectedLines);
    }
    lines = convertHeadings(lines, protectedLines);
    return lines.map((line, index) => {
      if (protectedLines.has(index)) return line;
      let text = convertInlineHtmlToMarkdown(line, warnings);
      return convertInlineLinksToWmdx(text, warnings);
    });
  });
  return { markdown: converted, warnings };
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
  return formatWmdxResourceSyntax({
    embed: true,
    source,
    title: titleOverride || node.getAttribute('alt') || '',
    size: htmlImageSize(node, warnings),
    alignment: alignmentOverride || htmlAlignment(node)
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function markdownText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]<>#+.!|])/g, '\\$1');
}

function inlineHtmlNode(node, warnings) {
  if (node.nodeType === 3) return markdownText(node.nodeValue);
  if (node.nodeType === 8) {
    addWarning(warnings, 'HTML comments have no native Wmdx equivalent and were omitted.');
    return '';
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (node.hasAttribute('style')) {
    addWarning(warnings, 'Unmapped inline CSS styling was ignored during HTML import.');
  }
  const content = Array.from(node.childNodes)
    .map(child => inlineHtmlNode(child, warnings)).join('');
  if (tag === 'strong' || tag === 'b') return `**${content}**`;
  if (tag === 'em' || tag === 'i') return `*${content}*`;
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${content}~~`;
  if (tag === 'u') return `<u>${content}</u>`;
  if (tag === 'sup' || tag === 'sub') return `<${tag}>${content}</${tag}>`;
  if (tag === 'code') return `\`${content.replace(/`/g, '\\`')}\``;
  if (tag === 'mark') return `==${content}==`;
  if (tag === 'br') return '  \n';
  if (tag === 'a') {
    const href = node.getAttribute('href');
    if (node.hasAttribute('title')) {
      addWarning(warnings, 'HTML link tooltip titles have no native Wmdx field and were omitted.');
    }
    if (href && (node.hasAttribute('download') ||
        node.getAttribute('data-wmdx-kind') === 'attachment')) {
      return `[${content || markdownText(href)}](${href} "wmdx-attachment")`;
    }
    return href ? `[${content || markdownText(href)}](${href})` : content;
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
  if (node.hasAttribute('style')) {
    addWarning(warnings, 'Unmapped inline CSS styling was ignored during HTML import.');
  }
  const children = () => Array.from(node.childNodes)
    .map(child => htmlBlock(child, warnings, depth + 1))
    .filter(value => value !== '');
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
    const start = Number(node.getAttribute('start')) || 1;
    return Array.from(node.children).filter(child => child.tagName.toLowerCase() === 'li')
      .map((item, index) => {
        if (item.hasAttribute('value')) {
          addWarning(warnings, 'Custom ordered-list item values were normalized during HTML import.');
        }
        if (item.querySelectorAll(':scope > p').length > 1) {
          addWarning(warnings, 'Multiple paragraphs within an HTML list item were flattened.');
        }
        const checkbox = item.querySelector(':scope > input[type="checkbox"]');
        const marker = ordered ? `${start + index}.` : '-';
        const task = checkbox ? `[${checkbox.checked ? 'x' : ' '}] ` : '';
        const body = Array.from(item.childNodes)
          .filter(child => !(child.nodeType === 1 &&
            ['input', 'ul', 'ol'].includes(child.tagName.toLowerCase())))
          .map(child => htmlBlock(child, warnings, depth + 1))
          .filter(Boolean)
          .join(' ')
          .trim();
        const nested = Array.from(item.children)
          .filter(child => ['ul', 'ol'].includes(child.tagName.toLowerCase()))
          .map(child => htmlBlock(child, warnings, depth + 1))
          .filter(Boolean)
          .join('\n');
        const prefix = `${'  '.repeat(depth)}${marker} ${task}${body}`;
        return nested ? `${prefix}\n${nested}` : prefix;
      }).join('\n');
  }
  if (tag === 'table') {
    if (node.querySelector('[rowspan], [colspan]')) {
      addWarning(warnings, 'Merged HTML table cells were flattened; row and column spans are not retained yet.');
    }
    if (node.querySelector('a, img, strong, b, em, i, code, del, s, u, mark, br')) {
      addWarning(warnings, 'Rich formatting, links, or media inside HTML table cells were flattened to text.');
    }
    const rows = Array.from(node.querySelectorAll('tr')).map(row =>
      Array.from(row.children).map(cell =>
        cell.textContent.replace(/\|/g, '\\|').trim()
      )
    ).filter(row => row.length);
    if (!rows.length) return '';
    const width = Math.max(...rows.map(row => row.length));
    const normalized = rows.map(row => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
    const divider = Array(width).fill('---');
    return [normalized[0], divider, ...normalized.slice(1)]
      .map(row => `| ${row.join(' | ')} |`).join('\n');
  }
  if (tag === 'details') {
    const summary = node.querySelector(':scope > summary');
    const title = summary?.textContent?.trim() || 'Details';
    const body = Array.from(node.childNodes)
      .filter(child => child !== summary)
      .map(child => htmlBlock(child, warnings, depth + 1))
      .filter(Boolean)
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
    const source = node.getAttribute('src') || node.querySelector('source')?.getAttribute('src');
    if (source) {
      const title = node.getAttribute('aria-label') ||
        node.querySelector('source')?.getAttribute('title') ||
        getWmdxResourceFallbackTitle(source);
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

export function convertFromHtml(source, Parser = globalThis.DOMParser) {
  if (typeof Parser !== 'function') {
    throw new Error('HTML conversion requires a DOMParser implementation.');
  }
  const warnings = [];
  const document = new Parser().parseFromString(String(source ?? ''), 'text/html');
  const body = document.body;
  const markdown = Array.from(body.childNodes)
    .map(node => htmlBlock(node, warnings))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!markdown && String(source ?? '').trim()) {
    throw new Error('No readable document content could be converted from this HTML.');
  }
  return { markdown, warnings };
}

function convertWmdxResourceToMarkdown(raw, dialect, warnings) {
  const resource = parseWmdxResourceSyntax(raw);
  if (!resource) return raw;
  const { source, title, size, alignment, embed } = resource;
  if (!embed) {
    if (dialect === 'obsidian' && !/^([a-z][a-z\d+.-]*:|\/|\.\/|\.\.\/|#)/i.test(source)) {
      return `[[${source}${title && title !== getWmdxResourceFallbackTitle(source) ? `|${title}` : ''}]]`;
    }
    return `[${title || getWmdxResourceFallbackTitle(source)}](${source})`;
  }

  if (dialect === 'obsidian' && !alignment && (!size || size.unit === 'px')) {
    const alias = title && title !== getWmdxResourceFallbackTitle(source)
      ? title
      : size?.width ? String(size.width) : '';
    return `![[${source}${alias ? `|${alias}` : ''}]]`;
  }

  const escapedSource = escapeHtml(source);
  const escapedTitle = escapeHtml(title || getWmdxResourceFallbackTitle(source));
  const attrs = [];
  if (size?.unit === 'px') {
    attrs.push(`width="${size.width}"`);
    if (size.height) attrs.push(`height="${size.height}"`);
  } else if (size?.unit === '%') {
    attrs.push(`style="width:${size.width}%"`);
  }
  const image = `<img src="${escapedSource}" alt="${escapedTitle}"${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
  const content = title ? `${image}<figcaption>${escapedTitle}</figcaption>` : image;
  const style = alignment && alignment !== 'left' ? ` style="text-align:${alignment}"` : '';
  if (alignment || size) {
    addWarning(warnings, 'Image size, alignment, or visible caption uses HTML for this Markdown dialect.');
  }
  return `<figure${style}>${content}</figure>`;
}

function convertWmdxCallouts(lines, dialect, warnings, protectedLines) {
  const output = [...lines];
  const openerPattern = /^([ \t]*)±([A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)([+-]?)(?:[ \t]+(.*))?$/;
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
      const titleLine = title ? `> **${title}**\n` : '';
      output[index] = `> [!${mapped}]\n${titleLine}${quoted}`;
      for (let row = index + 1; row < end; row += 1) output[row] = '';
      if (state) {
        addWarning(warnings, 'GFM alerts do not preserve the Wmdx expanded or collapsed state.');
      }
    } else {
      const titleLine = title ? `> **${title}**\n` : `> **${type}**\n`;
      output[index] = `${titleLine}${bodyText.split('\n').map(line => `> ${line}`).join('\n')}`;
      for (let row = index + 1; row < end; row += 1) output[row] = '';
      addWarning(warnings, 'Wmdx callout type, styling, and fold state were exported as a standard block quote.');
    }
    index = end - 1;
  }
  return output;
}

function convertWmdxInlineToMarkdown(line, dialect, warnings) {
  let output = '';
  let plainStart = 0;
  let index = 0;
  const transform = plainText => {
    let text = plainText;
    text = text.replace(/(?<!\\)_([₀₁₂₃]?)(\S(?:.*?\S)?)_/g, (_, style, content) => {
      if (style) addWarning(warnings, 'Colored or styled underline is exported as plain underline.');
      return `<u>${content}</u>`;
    });
    text = text.replace(/==([₀₁₂]?)(\S(?:.*?\S)?)==/g, (_, slot, content) => {
      if (slot) addWarning(warnings, 'Colored highlight slots export without their custom color.');
      return dialect === 'obsidian'
        ? `==${content}==`
        : `<mark>${content}</mark>`;
    });
    text = text.replace(/=(?:[₀₁₂])?(\S(?:.*?\S)?)=(?![=])/g, (_, content) => {
      addWarning(warnings, 'Wmdx pen colors have no portable Markdown equivalent; pen markers were removed.');
      return content;
    });
    return text.replace(/(?<!\\)(!?)\[[^\]\n]*\]/g, raw =>
      convertWmdxResourceToMarkdown(raw, dialect, warnings)
    );
  };

  while (index < line.length) {
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
  const excludedPositions = new Set();
  for (const index of protectedLines) {
    const parsed = parseWmdxOrderedListMarker(lines[index]);
    if (parsed) excludedPositions.add(sourceLines[index].from + parsed.markerFrom);
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
    const match = /^([ \t]*)\.([1-6])[ \t]+(.+)$/.exec(line);
    return match ? `${match[1]}${'#'.repeat(Number(match[2]))} ${match[3]}` : line;
  });
}

function mapWmdxTaskItems(lines, protectedLines, dialect, warnings) {
  let used = false;
  const output = lines.map((line, index) => {
    if (protectedLines.has(index)) return line;
    const match = /^([ \t]*)\[([ xX])\][ \t]+(.*)$/.exec(line);
    if (!match) return line;
    used = true;
    const checked = match[2].toLowerCase() === 'x';
    const checkbox = dialect === 'commonmark'
      ? `<input type="checkbox" disabled${checked ? ' checked' : ''}>`
      : `[${checked ? 'x' : ' '}]`;
    return `${match[1]}- ${checkbox} ${match[3]}`;
  });
  if (used && dialect === 'commonmark') {
    addWarning(warnings, 'CommonMark has no task-list extension; checkboxes use inline HTML.');
  }
  return output;
}

export function exportMarkdown(source, dialect = 'commonmark') {
  if (!MARKDOWN_EXPORT_FORMATS.includes(dialect)) {
    throw new TypeError(`Unsupported Markdown export format: ${dialect}`);
  }
  const warnings = [];
  const markdown = protectCodeFences(source, (originalLines, protectedLines) => {
    let lines = [...originalLines];
    lines = mapWmdxHeadings(lines, protectedLines);
    lines = convertWmdxCallouts(lines, dialect, warnings, protectedLines);
    lines = mapWmdxOrderedLists(lines, protectedLines, warnings);
    lines = mapWmdxTaskItems(lines, protectedLines, dialect, warnings);
    if (dialect === 'commonmark') {
      warnCommonMarkTables(lines, protectedLines, warnings);
    }
    return lines.map((line, index) => protectedLines.has(index)
      ? line
      : convertWmdxInlineToMarkdown(line, dialect, warnings));
  });
  return { markdown, warnings };
}
