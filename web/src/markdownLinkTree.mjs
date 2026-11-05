import { syntaxTree } from '@codemirror/language';

const LINK_NODE_NAMES = new Set(['Link', 'Autolink', 'URL']);

export function findMarkdownLinkNodeAtRange(state, from, to) {
  if (
    !state?.doc ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= to ||
    to > state.doc.length
  ) {
    return null;
  }
  let match = null;
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (
        node.from === from &&
        node.to === to &&
        LINK_NODE_NAMES.has(node.name)
      ) {
        match = { name: node.name, from: node.from, to: node.to };
        return false;
      }
    }
  });
  return match;
}
