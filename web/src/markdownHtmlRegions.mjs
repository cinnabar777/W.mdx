import { syntaxTree } from '@codemirror/language';

const INLINE_HTML_CONTAINERS = new Set([
  'Paragraph',
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
  'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
  'SetextHeading1', 'SetextHeading2'
]);
const NON_RENDERABLE_HTML_CONTEXTS = new Set([
  'FencedCode', 'CodeBlock', 'InlineCode', 'Table'
]);

export function collectMarkdownHtmlRegions(state) {
  const tree = syntaxTree(state);
  const regions = new Map();
  const htmlBlocks = [];
  tree.iterate({
    enter(node) {
      if (node.name !== 'HTMLBlock' || node.to <= node.from) return;
      const region = { from: node.from, to: node.to, kind: 'block' };
      htmlBlocks.push(region);
      regions.set(node.from + ':' + node.to, region);
    }
  });

  tree.iterate({
    enter(node) {
      if (node.name !== 'HTMLTag' && node.name !== 'HTMLComment' &&
          node.name !== 'HTMLDeclaration' && node.name !== 'HTMLProcessingInstruction') return;
      if (htmlBlocks.some(region => node.from >= region.from && node.to <= region.to)) return;

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
      if (!regions.has(key)) {
        regions.set(key, {
          from: container.from,
          to: container.to,
          kind: container.name === 'Paragraph' ? 'inline' : 'heading'
        });
      }
    }
  });

  const ordered = [...regions.values()].sort((a, b) => a.from - b.from || b.to - a.to);
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
  return nonOverlapping.sort((a, b) => a.from - b.from);
}
