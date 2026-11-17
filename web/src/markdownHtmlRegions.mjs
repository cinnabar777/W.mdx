import { syntaxTree } from '@codemirror/language';
import { htmlLanguage } from '@codemirror/lang-html';

const INLINE_HTML_CONTAINERS = new Set([
  'Paragraph',
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
  'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
  'SetextHeading1', 'SetextHeading2'
]);
const NON_RENDERABLE_HTML_CONTEXTS = new Set([
  'FencedCode', 'CodeBlock', 'InlineCode', 'Table'
]);
const HTML_OPEN_TAGS = new Set([
  'OpenTag', 'OpenScriptTag', 'OpenStyleTag', 'OpenTextareaTag',
  'SelfClosingTag'
]);
const HTML_CLOSE_TAGS = new Set([
  'CloseTag', 'CloseScriptTag', 'CloseStyleTag', 'CloseTextareaTag',
  'MismatchedCloseTag', 'NoMatchCloseTag'
]);
const HTML_HIDDEN_SYNTAX_NODES = new Set([
  ...HTML_OPEN_TAGS,
  ...HTML_CLOSE_TAGS,
  'Comment', 'ProcessingInst', 'DoctypeDecl', 'IncompleteTag',
  'IncompleteCloseTag'
]);
const HTML_TEXT_NODES = new Set([
  'Text', 'ScriptText', 'StyleText', 'TextareaText',
  'EntityReference', 'CharacterReference', 'InvalidEntity'
]);
const HTML_VISIBLE_VOID_ELEMENTS = new Set([
  'area', 'br', 'canvas', 'embed', 'hr', 'iframe', 'img', 'input',
  'object', 'source', 'svg', 'video', 'audio'
]);

function childrenOf(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function elementTagName(element, source) {
  const openTag = childrenOf(element).find(child => HTML_OPEN_TAGS.has(child.name));
  const tagName = openTag && childrenOf(openTag).find(child => child.name === 'TagName');
  return tagName ? source.slice(tagName.from, tagName.to).toLowerCase() : '';
}

function hasDirectVisibleText(element, source) {
  return childrenOf(element).some(child =>
    HTML_TEXT_NODES.has(child.name) &&
    source.slice(child.from, child.to).trim().length > 0
  );
}

function hasVisibleContent(element, source) {
  const tagName = elementTagName(element, source);
  if (HTML_VISIBLE_VOID_ELEMENTS.has(tagName)) return true;
  return hasDirectVisibleText(element, source) ||
    childrenOf(element).some(child =>
      child.name === 'Element' && hasVisibleContent(child, source)
    );
}

function openTagSource(element, source) {
  const openTag = childrenOf(element).find(child => HTML_OPEN_TAGS.has(child.name));
  return openTag ? source.slice(openTag.from, openTag.to) : '';
}

function closeTagSource(element, source) {
  const children = childrenOf(element);
  const closeTag = [...children].reverse().find(child => HTML_CLOSE_TAGS.has(child.name));
  if (closeTag) return source.slice(closeTag.from, closeTag.to);
  const tagName = elementTagName(element, source);
  return tagName ? `</${tagName}>` : '';
}

function renderSourceWithContext(element, ancestors, source) {
  const opening = ancestors.map(ancestor => openTagSource(ancestor, source)).join('');
  const closing = [...ancestors]
    .reverse()
    .map(ancestor => closeTagSource(ancestor, source))
    .join('');
  return opening + source.slice(element.from, element.to) + closing;
}

function sourceWithoutQuotePrefixes(source, quotePrefixes) {
  const removed = new Uint8Array(source.length);
  for (const prefix of quotePrefixes) {
    for (let position = prefix.from; position < prefix.to; position++) {
      if (position >= 0 && position < removed.length) removed[position] = 1;
    }
  }

  let normalized = '';
  const originalOffsets = [];
  for (let position = 0; position < source.length; position++) {
    if (removed[position]) continue;
    normalized += source[position];
    originalOffsets.push(position);
  }
  return {
    source: normalized,
    mapStart(position) {
      return originalOffsets[position] ?? source.length;
    },
    mapEnd(position) {
      return position > 0
        ? (originalOffsets[position - 1] ?? source.length - 1) + 1
        : 0;
    }
  };
}

function collectBlockElementRegions(element, ancestors, source, base, regions, sourceMap) {
  if (!hasVisibleContent(element, source)) return;

  const tagName = elementTagName(element, source);
  const elementChildren = childrenOf(element);
  const childElements = elementChildren.filter(child =>
    child.name === 'Element' && hasVisibleContent(child, source)
  );
  const hasText = hasDirectVisibleText(element, source);

  // A table is one navigable editing unit; splitting its cells would destroy
  // the visual row/column continuity that the editor preserves elsewhere.
  const keepTogether = tagName === 'table' || HTML_VISIBLE_VOID_ELEMENTS.has(tagName);
  if (keepTogether || hasText || childElements.length === 0) {
    const openTag = elementChildren.find(child => HTML_OPEN_TAGS.has(child.name));
    const closeTag = [...elementChildren].reverse()
      .find(child => HTML_CLOSE_TAGS.has(child.name));
    regions.push({
      from: base + sourceMap.mapStart(element.from),
      to: base + sourceMap.mapEnd(element.to),
      kind: 'html-element',
      tagName,
      tagStack: [...ancestors.map(ancestor => elementTagName(ancestor, source)), tagName]
        .filter(Boolean),
      editableTextRanges: childElements.length === 0
        ? elementChildren
          .filter(child => ['Text', 'ScriptText', 'StyleText', 'TextareaText'].includes(child.name))
          .map(child => ({
            from: base + sourceMap.mapStart(child.from),
            to: base + sourceMap.mapEnd(child.to)
          }))
        : [],
      syntaxRanges: [openTag, closeTag]
        .filter(Boolean)
        .map(node => ({
          from: base + sourceMap.mapStart(node.from),
          to: base + sourceMap.mapEnd(node.to)
        })),
      renderSource: renderSourceWithContext(element, ancestors, source)
    });
    return;
  }

  for (const child of childElements) {
    collectBlockElementRegions(
      child, [...ancestors, element], source, base, regions, sourceMap
    );
  }
}

function collectHtmlBlockPresentation(blockSource, base, quotePrefixes = []) {
  const sourceMap = sourceWithoutQuotePrefixes(blockSource, quotePrefixes);
  const htmlTree = htmlLanguage.parser.parse(sourceMap.source);
  const regions = [];
  const hiddenRanges = [];
  const visitElements = (node, ancestors = []) => {
    if (node.name === 'Element') {
      collectBlockElementRegions(
        node, ancestors, sourceMap.source, base, regions, sourceMap
      );
      return;
    }
    for (const child of childrenOf(node)) visitElements(child, ancestors);
  };
  visitElements(htmlTree.topNode);

  // If the HTML parser cannot identify an editable/renderable child, leave the
  // block as source text instead of replacing the whole block with an atom.
  if (!regions.length) return { regions, hiddenRanges };

  htmlTree.iterate({
    enter(node) {
      const from = base + sourceMap.mapStart(node.from);
      const to = base + sourceMap.mapEnd(node.to);
      const insideRenderedElement = regions.some(region =>
        from >= region.from && to <= region.to
      );
      if (insideRenderedElement) return;
      if (HTML_HIDDEN_SYNTAX_NODES.has(node.name)) {
        hiddenRanges.push({ from, to, kind: 'html-syntax' });
      } else if (
        HTML_TEXT_NODES.has(node.name) &&
        !sourceMap.source.slice(node.from, node.to).trim()
      ) {
        const whitespace = sourceMap.source.slice(node.from, node.to);
        for (const match of whitespace.matchAll(/[ \t]+/g)) {
          const start = node.from + match.index;
          const end = start + match[0].length;
          hiddenRanges.push({
            from: base + sourceMap.mapStart(start),
            to: base + sourceMap.mapEnd(end),
            kind: 'html-whitespace'
          });
        }
      }
    }
  });
  return { regions, hiddenRanges };
}

export function collectMarkdownHtmlPresentation(state) {
  const tree = syntaxTree(state);
  const regions = [];
  const hiddenRanges = [];
  const htmlBlocks = [];
  const inlineContainers = new Map();
  const quoteMarks = [];
  tree.iterate({
    enter: node => {
      if (node.name === 'QuoteMark') quoteMarks.push({ from: node.from, to: node.to });
    }
  });
  tree.iterate({
    enter(node) {
      if (node.name !== 'HTMLBlock' || node.to <= node.from) return;
      htmlBlocks.push({ from: node.from, to: node.to });
      const source = state.doc.sliceString(node.from, node.to);
      const quotePrefixes = quoteMarks
        .filter(mark => mark.from >= node.from && mark.to <= node.to)
        .map(mark => ({
          from: mark.from - node.from,
          to: mark.to - node.from +
            (/^[ \t]/.test(state.doc.sliceString(mark.to, Math.min(mark.to + 1, node.to))) ? 1 : 0)
        }));
      const htmlBlock = collectHtmlBlockPresentation(source, node.from, quotePrefixes);
      for (const prefix of quotePrefixes) {
        hiddenRanges.push({
          from: node.from + prefix.from,
          to: node.from + prefix.to,
          kind: 'markdown-container-prefix'
        });
      }
      regions.push(...htmlBlock.regions);
      hiddenRanges.push(...htmlBlock.hiddenRanges);
    }
  });

  tree.iterate({
    enter(node) {
      if (node.name !== 'HTMLTag' && node.name !== 'HTMLComment' &&
          node.name !== 'HTMLDeclaration' && node.name !== 'HTMLProcessingInstruction') return;
      if (htmlBlocks.some(block => node.from >= block.from && node.to <= block.to)) return;

      let ancestor = tree.resolveInner(node.from, 1);
      let container = null;
      while (ancestor) {
        if (ancestor.name === 'HTMLBlock' || NON_RENDERABLE_HTML_CONTEXTS.has(ancestor.name)) return;
        if (INLINE_HTML_CONTAINERS.has(ancestor.name)) {
          container = ancestor;
          break;
        }
        ancestor = ancestor.parent;
      }
      if (!container || container.to <= container.from) return;
      const key = container.from + ':' + container.to;
      if (!inlineContainers.has(key)) inlineContainers.set(key, container);
    }
  });

  for (const container of inlineContainers.values()) {
    const source = state.doc.sliceString(container.from, container.to);
    const inlinePresentation = collectHtmlBlockPresentation(source, container.from);
    if (inlinePresentation.regions.length) {
      regions.push(...inlinePresentation.regions.map(region => ({
        ...region,
        kind: 'html-inline-element'
      })));
      hiddenRanges.push(...inlinePresentation.hiddenRanges);
    } else {
      regions.push({
        from: container.from,
        to: container.to,
        kind: container.name === 'Paragraph' ? 'inline' : 'heading'
      });
    }
  }

  const ordered = regions.sort((a, b) => a.from - b.from || b.to - a.to);
  const nonOverlapping = [];
  for (const region of ordered) {
    const overlapIndex = nonOverlapping.findIndex(existing =>
      region.from < existing.to && region.to > existing.from
    );
    if (overlapIndex < 0) {
      nonOverlapping.push(region);
      continue;
    }
    const existing = nonOverlapping[overlapIndex];
    if (region.from <= existing.from && region.to >= existing.to) {
      nonOverlapping[overlapIndex] = region;
    }
  }
  const renderedRegions = nonOverlapping.sort((a, b) => a.from - b.from);
  const nonOverlappingHiddenRanges = hiddenRanges
    .filter(range => !renderedRegions.some(region =>
      range.from < region.to && range.to > region.from
    ))
    .sort((a, b) => a.from - b.from);
  return {
    regions: renderedRegions,
    hiddenRanges: nonOverlappingHiddenRanges,
    blockRanges: htmlBlocks
  };
}

export function collectMarkdownHtmlRegions(state) {
  return collectMarkdownHtmlPresentation(state).regions;
}
