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
const HTML_TEXT_CONTAINERS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'del', 'dfn',
  'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'ins', 'kbd',
  'mark', 'p', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub',
  'sup', 'time', 'u', 'var'
]);
const HTML_BLOCK_CONTAINERS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'dd', 'div',
  'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'header', 'li', 'main', 'nav', 'ol', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
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

function mappedRange(node, base, sourceMap) {
  return {
    from: base + sourceMap.mapStart(node.from),
    to: base + sourceMap.mapEnd(node.to)
  };
}

function createPreviewRegion(element, ancestors, source, base, sourceMap) {
  const tagName = elementTagName(element, source);
  return {
    ...mappedRange(element, base, sourceMap),
    kind: 'html-element',
    tagName,
    tagStack: [...ancestors.map(ancestor => elementTagName(ancestor, source)), tagName]
      .filter(Boolean),
    editableTextRanges: [],
    entityRanges: [],
    syntaxRanges: [],
    renderSource: renderSourceWithContext(element, ancestors, source)
  };
}

function collectEditableHtmlContent(
  element,
  ancestors,
  source,
  base,
  sourceMap,
  editableTextRanges,
  entityRanges,
  syntaxRanges,
  previewRegions
) {
  const tagName = elementTagName(element, source);
  const tagStack = [...ancestors.map(ancestor => elementTagName(ancestor, source)), tagName]
    .filter(Boolean);

  for (const child of childrenOf(element)) {
    if (child.name === 'Element') {
      const childTagName = elementTagName(child, source);
      if (childTagName === 'table' || HTML_VISIBLE_VOID_ELEMENTS.has(childTagName)) {
        previewRegions.push(createPreviewRegion(
          child, [...ancestors, element], source, base, sourceMap
        ));
        continue;
      }
      collectEditableHtmlContent(
        child,
        [...ancestors, element],
        source,
        base,
        sourceMap,
        editableTextRanges,
        entityRanges,
        syntaxRanges,
        previewRegions
      );
      continue;
    }

    if (HTML_HIDDEN_SYNTAX_NODES.has(child.name)) {
      syntaxRanges.push(mappedRange(child, base, sourceMap));
      continue;
    }

    if (!HTML_TEXT_NODES.has(child.name)) continue;
    const text = source.slice(child.from, child.to);
    if (!text || (!text.trim() && /[\r\n]/.test(text))) continue;
    const range = {
      ...mappedRange(child, base, sourceMap),
      tagStack
    };
    if (['EntityReference', 'CharacterReference', 'InvalidEntity'].includes(child.name)) {
      entityRanges.push(range);
    } else {
      editableTextRanges.push(range);
    }
  }
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
  const hasBlockChildren = childElements.some(child =>
    HTML_BLOCK_CONTAINERS.has(elementTagName(child, source))
  );

  // A table is one navigable editing unit; splitting its cells would destroy
  // the visual row/column continuity that the editor preserves elsewhere.
  const keepTogether = tagName === 'table' || HTML_VISIBLE_VOID_ELEMENTS.has(tagName);
  if (keepTogether) {
    regions.push(createPreviewRegion(element, ancestors, source, base, sourceMap));
    return;
  }

  // Keep text-bearing containers (and anchors around nested inline content)
  // editable. Only their tags are hidden; nested text keeps its own HTML style.
  if (
    (hasText && !hasBlockChildren && HTML_TEXT_CONTAINERS.has(tagName)) ||
    tagName === 'a' ||
    childElements.length === 0
  ) {
    const editableTextRanges = [];
    const entityRanges = [];
    const syntaxRanges = [];
    const previewRegions = [];
    collectEditableHtmlContent(
      element,
      ancestors,
      source,
      base,
      sourceMap,
      editableTextRanges,
      entityRanges,
      syntaxRanges,
      previewRegions
    );

    if (editableTextRanges.length || entityRanges.length) {
      regions.push({
        ...mappedRange(element, base, sourceMap),
        kind: 'html-element',
        tagName,
        tagStack: [...ancestors.map(ancestor => elementTagName(ancestor, source)), tagName]
          .filter(Boolean),
        editableTextRanges,
        entityRanges,
        syntaxRanges,
        renderSource: renderSourceWithContext(element, ancestors, source)
      });
      regions.push(...previewRegions);
      return;
    }

    if (previewRegions.length) {
      regions.push(...previewRegions);
      return;
    }

    // Empty elements are still presented as a single HTML object when there
    // is meaningful rendered content but no text node to edit.
    regions.push(createPreviewRegion(element, ancestors, source, base, sourceMap));
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
        if (to > from) hiddenRanges.push({ from, to, kind: 'html-syntax' });
      } else if (
        HTML_TEXT_NODES.has(node.name) &&
        !sourceMap.source.slice(node.from, node.to).trim() &&
        /[\r\n]/.test(sourceMap.source.slice(node.from, node.to))
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

  // Lezer can recover from malformed bookmark HTML by treating an unmatched
  // closing tag as an error token plus plain text. Restore the complete tag as
  // one hideable/exposable source range instead of letting its tail leak into
  // the rendered document.
  for (const match of sourceMap.source.matchAll(/<\/([A-Za-z][A-Za-z0-9:_-]*)[ \t]*>/g)) {
    const localFrom = match.index;
    const localTo = localFrom + match[0].length;
    const range = {
      from: base + sourceMap.mapStart(localFrom),
      to: base + sourceMap.mapEnd(localTo)
    };
    const containingRegion = regions.find(region =>
      range.from >= region.from && range.to <= region.to
    );
    if (containingRegion) {
      if (['pre', 'code', 'script', 'style', 'textarea'].some(tag =>
        containingRegion.tagStack?.includes(tag)
      )) continue;
      if (containingRegion.kind !== 'html-element') continue;
      const alreadySyntax = containingRegion.syntaxRanges.some(syntax =>
        range.from >= syntax.from && range.to <= syntax.to
      );
      if (alreadySyntax) continue;

      containingRegion.editableTextRanges =
        containingRegion.editableTextRanges.flatMap(textRange => {
          if (range.to <= textRange.from || range.from >= textRange.to) {
            return [textRange];
          }
          return [
            ...(range.from > textRange.from
              ? [{ ...textRange, to: range.from }]
              : []),
            ...(range.to < textRange.to
              ? [{ ...textRange, from: range.to }]
              : [])
          ];
        });
      containingRegion.syntaxRanges.push(range);
      continue;
    }

    const alreadyHidden = hiddenRanges.some(hidden =>
      range.from >= hidden.from && range.to <= hidden.to
    );
    if (!alreadyHidden) hiddenRanges.push({ ...range, kind: 'html-syntax' });
    regions.push({
      ...range,
      kind: 'html-syntax',
      tagName: match[1].toLowerCase(),
      editableTextRanges: [],
      entityRanges: [],
      syntaxRanges: [],
      renderSource: ''
    });
  }

  // Structural tags outside text-bearing elements should stay hidden in the
  // default view, but remain individually targetable by caret exposure.
  for (const range of hiddenRanges) {
    if (range.kind !== 'html-syntax' || range.to <= range.from) continue;
    if (regions.some(region =>
      range.from >= region.from && range.to <= region.to
    )) continue;
    regions.push({
      from: range.from,
      to: range.to,
      kind: 'html-syntax',
      tagName: '',
      editableTextRanges: [],
      entityRanges: [],
      syntaxRanges: [],
      renderSource: ''
    });
  }
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
    const containedPreview = existing.editableTextRanges?.length &&
      region.from >= existing.from && region.to <= existing.to &&
      !region.editableTextRanges?.length && !region.entityRanges?.length;
    if (containedPreview) {
      nonOverlapping.push(region);
      continue;
    }
    if (region.from <= existing.from && region.to >= existing.to) {
      nonOverlapping[overlapIndex] = region;
    }
  }
  const renderedRegions = nonOverlapping.sort((a, b) => a.from - b.from);
  const nonOverlappingHiddenRanges = hiddenRanges
    .filter(range => !renderedRegions.some(region => {
      if (range.from >= region.to || range.to <= region.from) return false;
      const hasEditableText = region.editableTextRanges?.length ||
        region.entityRanges?.length;
      if (
        hasEditableText &&
        ['html-whitespace', 'markdown-container-prefix'].includes(range.kind)
      ) {
        const textRanges = [
          ...(region.editableTextRanges ?? []),
          ...(region.entityRanges ?? [])
        ];
        return textRanges.some(textRange =>
          range.from < textRange.to && range.to > textRange.from
        );
      }
      return true;
    }))
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
