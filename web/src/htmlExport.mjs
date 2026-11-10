import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { convertFromMarkdown, exportMarkdown } from './markdownConversion.mjs';
import { parseFootnotes } from './footnotes.js';

function calloutDescriptors(markdown) {
  const descriptors = [];
  let fenceCharacter = '';
  let fenceLength = 0;

  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const character = fence[1][0];
      if (!fenceCharacter) {
        fenceCharacter = character;
        fenceLength = fence[1].length;
      } else if (character === fenceCharacter && fence[1].length >= fenceLength) {
        fenceCharacter = '';
        fenceLength = 0;
      }
      continue;
    }
    if (fenceCharacter) continue;
    const match = /^[ \t]*±([A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)([+-]?)(?:[ \t]+(.*))?$/.exec(line);
    if (!match) continue;
    descriptors.push({
      type: match[1].toLowerCase(),
      foldMarker: match[2] || '',
      title: match[3]?.trim() || match[1]
    });
  }
  return descriptors;
}

function normalizeCalloutTitle(value) {
  return String(value ?? '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function createGfmRenderer() {
  const renderer = new marked.Renderer();
  renderer.html = token => {
    const source = typeof token === 'string'
      ? token
      : String(token.text ?? token.raw ?? '');
    return source.replace(
      /<(\/?)(title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)\b/gi,
      '&lt;$1$2'
    );
  };
  return renderer;
}

function renderMarkdownForDialect(markdown, targetDialect) {
  return marked.parse(markdown, {
    gfm: targetDialect !== 'commonmark',
    ...(targetDialect === 'gfm' ? { renderer: createGfmRenderer() } : {}),
    breaks: false,
    async: false
  });
}

function enhanceCallouts(document, descriptors) {
  let descriptorIndex = 0;
  const blockquotes = Array.from(document.querySelectorAll('blockquote'));
  for (const blockquote of blockquotes) {
    const directChildren = Array.from(blockquote.children);
    const firstParagraph = directChildren.find(child => child.tagName === 'P');
    if (!firstParagraph) continue;

    const paragraphLines = firstParagraph.innerHTML.split('\n');
    const marker = /^\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?$/
      .exec((paragraphLines[0] ?? '').trim());
    const descriptor = descriptors[descriptorIndex];
    if (!descriptor) continue;

    const markerType = marker?.[1]?.toLowerCase();
    const firstText = normalizeCalloutTitle(firstParagraph.textContent);
    const expectedTitle = normalizeCalloutTitle(descriptor.title);
    const expectedType = normalizeCalloutTitle(descriptor.type);
    const isWmdxCallout = marker
      ? markerType === descriptor.type ||
        (descriptor.type === 'info' && markerType === 'note')
      : firstText === expectedTitle || firstText === expectedType;
    if (!isWmdxCallout) continue;
    descriptorIndex += 1;

    let titleParagraph = marker ? null : firstParagraph;
    let inlineCalloutContent = '';
    if (marker) {
      const nextParagraph = directChildren.find(child =>
        child.tagName === 'P' && child !== firstParagraph
      );
      if (paragraphLines.length > 1) {
        inlineCalloutContent = paragraphLines.slice(1).join(' ');
        const inlineTitle = paragraphLines[1] ?? '';
        if (inlineTitle.includes('<strong')) {
          const titleHolder = document.createElement('p');
          titleHolder.innerHTML = inlineTitle;
          titleParagraph = titleHolder;
          inlineCalloutContent = paragraphLines.slice(2).join(' ');
        }
      } else if (nextParagraph && nextParagraph.querySelector('strong')) {
        titleParagraph = nextParagraph;
      }
    }

    const folded = Boolean(descriptor.foldMarker);
    const container = document.createElement(folded ? 'details' : 'aside');
    container.className = `wmdx-callout wmdx-callout-${descriptor.type}`;
    if (folded) container.open = descriptor.foldMarker === '+';

    const title = document.createElement(folded ? 'summary' : 'div');
    title.className = 'wmdx-callout-title';
    if (titleParagraph) {
      while (titleParagraph.firstChild) {
        title.appendChild(titleParagraph.firstChild);
      }
    } else {
      title.textContent = descriptor.type[0].toUpperCase() + descriptor.type.slice(1);
    }
    const body = document.createElement('div');
    body.className = 'wmdx-callout-body';

    if (inlineCalloutContent.trim()) {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = inlineCalloutContent;
      body.appendChild(paragraph);
    }
    for (const child of directChildren) {
      if (child === firstParagraph || child === titleParagraph) continue;
      body.appendChild(child);
    }
    container.append(title, body);
    blockquote.replaceWith(container);
  }
}

function enhanceImportedMediaLinks(document) {
  for (const link of Array.from(
    document.querySelectorAll('a[title="wmdx-audio"], a[title="wmdx-video"]')
  )) {
    const kind = link.getAttribute('title') === 'wmdx-audio' ? 'audio' : 'video';
    const media = document.createElement(kind);
    media.controls = true;
    media.setAttribute('src', link.getAttribute('href') || '');
    media.setAttribute('aria-label', link.textContent.trim() || kind);
    link.replaceWith(media);
  }
}

function protectedMarkdownRanges(source) {
  const fenced = [];
  const lines = [];
  let offset = 0;
  for (const rawLine of String(source ?? '').split('\n')) {
    const text = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    lines.push({ from: offset, to: offset + rawLine.length, text });
    offset += rawLine.length + 1;
  }

  let fence = null;
  for (const line of lines) {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line.text);
    if (!fence && match) {
      fence = { from: line.from, marker: match[1][0], length: match[1].length };
    } else if (
      fence &&
      match &&
      match[1][0] === fence.marker &&
      match[1].length >= fence.length
    ) {
      fenced.push({ from: fence.from, to: line.to + 1 });
      fence = null;
    }
  }
  if (fence) fenced.push({ from: fence.from, to: String(source).length });

  const ranges = [...fenced];
  for (let index = 0; index < source.length;) {
    if (source[index] !== '`' || ranges.some(range => index >= range.from && index < range.to)) {
      index += 1;
      continue;
    }
    let runEnd = index;
    while (source[runEnd] === '`') runEnd += 1;
    const runLength = runEnd - index;
    let search = runEnd;
    let closeStart = -1;
    while (search < source.length) {
      const next = source.indexOf('`', search);
      if (next < 0) break;
      if (ranges.some(range => next >= range.from && next < range.to)) {
        const protectedRange = ranges.find(range => next >= range.from && next < range.to);
        search = protectedRange.to;
        continue;
      }
      let nextEnd = next;
      while (source[nextEnd] === '`') nextEnd += 1;
      if (nextEnd - next === runLength) {
        closeStart = next;
        break;
      }
      search = nextEnd;
    }
    if (closeStart < 0) {
      index = runEnd;
      continue;
    }
    ranges.push({ from: index, to: closeStart + runLength });
    index = closeStart + runLength;
  }

  const tables = [];
  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
    const header = lines[lineIndex];
    const separator = lines[lineIndex + 1];
    if (
      !header.text.includes('|') ||
      !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator.text)
    ) continue;
    let end = lineIndex + 2;
    while (end < lines.length && lines[end].text.includes('|') && lines[end].text.trim()) {
      end += 1;
    }
    tables.push({
      from: header.from,
      to: lines[Math.max(lineIndex + 1, end - 1)].to + 1
    });
    lineIndex = end - 1;
  }
  return {
    ranges,
    fenced,
    tables,
    isCode: position => ranges.some(range => position >= range.from && position < range.to),
    isFenced: position => fenced.some(range => position >= range.from && position < range.to),
    isTable: position => tables.some(range => position >= range.from && position < range.to)
  };
}

function extractFootnotes(source, syntaxSettings) {
  if (!String(source ?? '').includes('^')) {
    return { markdown: String(source ?? ''), rows: [], references: [] };
  }
  const protectedRanges = protectedMarkdownRanges(source);
  const parsed = parseFootnotes(
    source,
    protectedRanges.isCode,
    protectedRanges.isFenced,
    protectedRanges.isTable,
    { syntaxSettings }
  );
  if (!parsed.definitions.length || !parsed.references.length) {
    return { markdown: String(source ?? ''), rows: [], references: [] };
  }

  const rows = [];
  const rowByLabel = new Map();
  for (const definition of parsed.definitions) {
    const key = definition.normalizedLabel || definition.label?.toLowerCase();
    if (!key || rowByLabel.has(key)) continue;
    const row = {
      id: `wmdx-footnote-${rows.length + 1}`,
      number: rows.length + 1,
      body: definition.body,
      references: []
    };
    rows.push(row);
    rowByLabel.set(key, row);
  }

  const references = [];
  const edits = parsed.definitions
    .filter(definition => definition.syntax !== 'obsidian_inline')
    .map(definition => ({
      from: definition.from,
      to: definition.to,
      insert: source.slice(definition.from, definition.to).replace(/[^\r\n]/g, '')
    }));
  for (const reference of parsed.references) {
    const row = rowByLabel.get(reference.normalizedLabel);
    if (!row) continue;
    const id = `wmdx-footnote-ref-${references.length + 1}`;
    const token = `WMDXFOOTNOTEREF${references.length + 1}END`;
    row.references.push(id);
    references.push({
      token,
      id,
      rowId: row.id,
      number: row.number
    });
    edits.push({ from: reference.from, to: reference.to, insert: token });
  }

  let markdown = String(source ?? '');
  for (const edit of edits.sort((left, right) => right.from - left.from)) {
    markdown = markdown.slice(0, edit.from) + edit.insert + markdown.slice(edit.to);
  }
  return { markdown, rows, references };
}

function replaceFootnoteTokens(document, references) {
  if (!references.length) return;
  const byToken = new Map(references.map(reference => [reference.token, reference]));
  const walker = document.createTreeWalker(document.body, 4);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  const pattern = /WMDXFOOTNOTEREF\d+END/g;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    const matches = [...text.matchAll(pattern)];
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let start = 0;
    for (const match of matches) {
      fragment.appendChild(document.createTextNode(text.slice(start, match.index)));
      const reference = byToken.get(match[0]);
      if (reference) {
        const superscript = document.createElement('sup');
        superscript.className = 'wmdx-footnote-reference';
        superscript.id = reference.id;
        const link = document.createElement('a');
        link.href = `#${reference.rowId}`;
        link.textContent = String(reference.number);
        superscript.appendChild(link);
        fragment.appendChild(superscript);
      } else {
        fragment.appendChild(document.createTextNode(match[0]));
      }
      start = match.index + match[0].length;
    }
    fragment.appendChild(document.createTextNode(text.slice(start)));
    textNode.replaceWith(fragment);
  }
}

function appendFootnoteSection(document, rows, profile) {
  if (!rows.length) return [];
  const warnings = [];
  const targetDialect = profile === 'commonmark' ? 'commonmark' : 'gfm';
  const section = document.createElement('section');
  section.className = 'wmdx-footnotes';
  const heading = document.createElement('h2');
  heading.textContent = 'Footnotes';
  section.appendChild(heading);
  const list = document.createElement('ol');
  for (const row of rows) {
    const item = document.createElement('li');
    item.id = row.id;
    const body = exportMarkdown(row.body, targetDialect);
    warnings.push(...body.warnings);
    const bodyHtml = renderMarkdownForDialect(body.markdown, targetDialect);
    const template = document.createElement('template');
    template.innerHTML = bodyHtml;
    while (template.content.firstChild) {
      item.appendChild(template.content.firstChild);
    }
    for (const referenceId of row.references) {
      const backLink = document.createElement('a');
      backLink.className = 'wmdx-footnote-backref';
      backLink.href = `#${referenceId}`;
      backLink.setAttribute('aria-label', 'Back to footnote reference');
      backLink.textContent = ' ↩';
      item.appendChild(backLink);
    }
    list.appendChild(item);
  }
  section.appendChild(list);
  document.body.appendChild(section);
  return warnings;
}

function isSafeAttachmentDataUri(value) {
  return /^data:(?:application\/(?:epub\+zip|json|msword|pdf|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.(?:presentationml\.presentation|spreadsheetml\.sheet|wordprocessingml\.document)|zip)|text\/(?:csv|plain));base64,/i
    .test(String(value ?? ''));
}

function normalizeProfileSource(source, profile) {
  if (profile === 'wmdx') return { markdown: String(source ?? ''), warnings: [] };
  return convertFromMarkdown(source, profile, { DOMParser: null });
}

/**
 * Produces standalone semantic HTML from the document's Markdown source.
 * The editor's CodeMirror DOM is intentionally not used as an export format.
 */
export function renderMarkdownHtml(source, {
  profile = 'wmdx',
  window = globalThis.window,
  resolveAssetDataUri = null,
  footnoteSyntaxSettings = {}
} = {}) {
  if (!window?.DOMParser || !window?.document) {
    throw new Error('HTML export requires a browser DOM implementation.');
  }
  const normalizedProfile = ['wmdx', 'commonmark', 'gfm', 'obsidian'].includes(profile)
    ? profile
    : 'wmdx';
  const footnotes = extractFootnotes(String(source ?? ''), footnoteSyntaxSettings);
  const normalized = normalizeProfileSource(footnotes.markdown, normalizedProfile);
  const footnoteBodyWarnings = [];
  const normalizedFootnoteRows = footnotes.rows.map(row => {
    if (normalizedProfile === 'wmdx') return row;
    const convertedBody = convertFromMarkdown(row.body, normalizedProfile);
    footnoteBodyWarnings.push(...convertedBody.warnings);
    return { ...row, body: convertedBody.markdown };
  });
  const targetDialect = normalizedProfile === 'commonmark' ? 'commonmark' : 'gfm';
  const exported = exportMarkdown(normalized.markdown, targetDialect);
  const markdownWarnings = [...normalized.warnings, ...exported.warnings]
    .filter((warning, index, all) => all.indexOf(warning) === index)
    .filter(warning => !warning.includes('GFM alerts do not preserve the Wmdx expanded or collapsed state.'));
  const markdownHtml = renderMarkdownForDialect(exported.markdown, targetDialect);
  const parsed = new window.DOMParser().parseFromString(markdownHtml, 'text/html');
  replaceFootnoteTokens(parsed, footnotes.references);
  enhanceCallouts(parsed, calloutDescriptors(normalized.markdown));
  enhanceImportedMediaLinks(parsed);
  const footnoteWarnings = [
    ...footnoteBodyWarnings,
    ...appendFootnoteSection(parsed, normalizedFootnoteRows, normalizedProfile)
  ];
  const assetWarnings = [];
  const resolvedAssets = new Map();
  if (typeof resolveAssetDataUri === 'function') {
    const assetElements = parsed.querySelectorAll(
      'img[src], audio[src], video[src], video[poster], source[src], a[title="wmdx-attachment"][href]'
    );
    for (const element of assetElements) {
      for (const attribute of ['src', 'poster', 'href']) {
        const reference = element.getAttribute(attribute)?.trim();
        if (
          !reference ||
          reference.startsWith('#') ||
          reference.startsWith('//') ||
          /^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference)
        ) continue;
        if (!resolvedAssets.has(reference)) {
          resolvedAssets.set(reference, resolveAssetDataUri(reference));
        }
        const dataUri = resolvedAssets.get(reference);
        if (typeof dataUri === 'string' && /^data:[^,]+;base64,/i.test(dataUri)) {
          element.setAttribute(attribute, dataUri);
        } else {
          assetWarnings.push(
            `A local export resource could not be embedded: ${reference}`
          );
        }
      }
    }
  }

  const purifier = createDOMPurify(window);
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    if (node.nodeName === 'A' && data.attrName === 'href' && /^data:/i.test(data.attrValue)) {
      data.keepAttr = isSafeAttachmentDataUri(data.attrValue);
    }
  });
  const html = purifier.sanitize(parsed.body.innerHTML, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['audio', 'video', 'source', 'track', 'figure', 'figcaption', 'mark', 'details', 'summary'],
    ADD_ATTR: [
      'controls', 'preload', 'poster', 'width', 'height', 'download',
      'start', 'checked', 'disabled', 'colspan', 'rowspan', 'data-wmdx-kind'
    ],
    ADD_DATA_URI_TAGS: ['audio', 'video', 'source', 'a'],
    FORBID_TAGS: ['style', 'link', 'iframe', 'object', 'embed', 'form']
  });
  return {
    html,
    warnings: [...markdownWarnings, ...footnoteWarnings, ...assetWarnings]
      .filter((warning, index, all) => all.indexOf(warning) === index)
  };
}
