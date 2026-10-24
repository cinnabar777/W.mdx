import {
  parser as markdownParser,
  GFM,
  Table as GFMTable,
  Strikethrough as GFMStrikethrough,
  TaskList as GFMTaskList
} from '@lezer/markdown';

const tocParser = markdownParser.configure([
  GFM,
  GFMTable,
  GFMStrikethrough,
  GFMTaskList
]);

function lineIndexAtOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length;

  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lineStarts[middle] <= offset) low = middle + 1;
    else high = middle;
  }

  return Math.max(0, low - 1);
}

export function extractTocHeadings(markdownText) {
  const text = String(markdownText ?? '');
  const lineStarts = [0];

  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }

  const tree = tocParser.parse(text);
  const headings = [];
  const headingNodes = [];
  const headerMarks = [];

  tree.iterate({
    enter(node) {
      if (node.name === 'HeaderMark') {
        headerMarks.push({ from: node.from, to: node.to });
        return;
      }

      const atxMatch = /^ATXHeading([1-6])$/.exec(node.name);
      const setextMatch = /^SetextHeading([12])$/.exec(node.name);
      const headingMatch = atxMatch || setextMatch;
      if (!headingMatch) return;

      headingNodes.push({
        from: node.from,
        to: node.to,
        level: Number(headingMatch[1]),
        isAtx: Boolean(atxMatch)
      });
    }
  });

  let markerIndex = 0;
  for (const node of headingNodes) {
    while (markerIndex < headerMarks.length && headerMarks[markerIndex].from < node.from) {
      markerIndex++;
    }
    const firstMarkerIndex = markerIndex;
    while (markerIndex < headerMarks.length && headerMarks[markerIndex].from < node.to) {
      markerIndex++;
    }

    const lineIndex = lineIndexAtOffset(lineStarts, node.from);
    const lineStart = lineStarts[lineIndex];
    const nextLineStart = lineStarts[lineIndex + 1];
    let lineEnd = nextLineStart === undefined ? text.length : nextLineStart - 1;
    if (lineEnd > lineStart && text.charCodeAt(lineEnd - 1) === 13) lineEnd--;

    let titleStart = lineStart;
    let titleEnd = lineEnd;

    if (node.isAtx) {
      const markerCount = markerIndex - firstMarkerIndex;
      if (markerCount > 0) titleStart = headerMarks[firstMarkerIndex].to;
      if (markerCount > 1) titleEnd = headerMarks[markerIndex - 1].from;
    } else {
      titleStart = node.from;
    }

    const title = text.slice(titleStart, titleEnd).trim();
    if (title) headings.push({ level: node.level, title, lineIndex });
  }

  return headings;
}
