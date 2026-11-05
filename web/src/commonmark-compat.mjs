import { Element, parser as baseMarkdownParser } from '@lezer/markdown';
import { tags } from '@lezer/highlight';

const referenceLabelsByInput = new WeakMap();
let activeInput = null;

function normalizeReferenceLabel(label) {
  const unescaped = label
    .replace(/\\([\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])/g, '$1')
    .trim()
    .replace(/[\t\n\r ]+/g, ' ');
  return [...unescaped]
    .map(char => {
      if (char === 'ı') return char;
      if (char === 'ς') return 'σ';
      if (char === 'ß' || char === 'ẞ') return 'ss';
      return char.toUpperCase().toLowerCase();
    })
    .join('');
}

function getReferenceLabels(input) {
  let labels = referenceLabelsByInput.get(input);
  if (labels) return labels;

  labels = new Set();
  const source = input.read(0, input.length);
  let inReferenceDefinition = 0;
  baseMarkdownParser.parse(input).iterate({
    enter(node) {
      if (node.name === 'LinkReference') {
        inReferenceDefinition++;
      } else if (inReferenceDefinition && node.name === 'LinkLabel') {
        labels.add(normalizeReferenceLabel(source.slice(node.from + 1, node.to - 1)));
      }
    },
    leave(node) {
      if (node.name === 'LinkReference') inReferenceDefinition--;
    }
  });

  referenceLabelsByInput.set(input, labels);
  return labels;
}

function hasPotentialEmphasisAcrossLabel(text, openingBracket, closingBracket) {
  const prefix = text.slice(0, openingBracket);
  const label = text.slice(openingBracket + 1, closingBracket);
  let escaped = false;
  let openAsterisk = false;

  for (let pos = 0; pos < prefix.length; pos++) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (prefix[pos] === '\\') {
      escaped = true;
      continue;
    }
    if (prefix[pos] === '`') {
      let runEnd = pos + 1;
      while (prefix[runEnd] === '`') runEnd++;
      const run = prefix.slice(pos, runEnd);
      const closing = prefix.indexOf(run, runEnd);
      if (closing >= 0) {
        pos = closing + run.length - 1;
        continue;
      }
      pos = runEnd - 1;
      continue;
    }
    if (prefix[pos] === '*') {
      let runEnd = pos + 1;
      while (prefix[runEnd] === '*') runEnd++;
      if ((runEnd - pos) % 2 === 1) openAsterisk = !openAsterisk;
      pos = runEnd - 1;
    }
  }

  if (!openAsterisk) return false;
  escaped = false;
  for (let pos = 0; pos < label.length; pos++) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (label[pos] === '\\') {
      escaped = true;
      continue;
    }
    if (label[pos] !== '*') continue;
    let runEnd = pos + 1;
    while (label[runEnd] === '*') runEnd++;
    const before = label[pos - 1] || '';
    const after = label[runEnd] || '';
    if (runEnd - pos === 1 && before && !/[\t\n\r ]/.test(before) &&
        (!after || /[\t\n\r ]/.test(after) || /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(after))) {
      return true;
    }
    pos = runEnd - 1;
  }
  return false;
}

function findLabelEnd(text, openingBracket) {
  for (let pos = openingBracket + 1; pos < text.length; pos++) {
    const char = text[pos];
    if (char === '\\') {
      pos++;
    } else if (char === '[') {
      return -1;
    } else if (char === ']') {
      return pos;
    }
  }
  return -1;
}

function nodeTypeId(parser, name) {
  const type = parser.nodeSet.types.find(candidate => candidate.name === name);
  if (!type) throw new Error(`Markdown parser node type is missing: ${name}`);
  return type.id;
}

function tabSeparatedAtxHeading(cx, line) {
  if (line.indent > 3) return false;

  const offset = line.pos;
  const marker = /^(#{1,6})(?=\t)/.exec(line.text.slice(offset));
  if (!marker) return false;

  const level = marker[1].length;
  const from = cx.lineStart + offset;
  let trailingSpaceStart = line.text.length;
  while (
    trailingSpaceStart > offset &&
    (line.text.charCodeAt(trailingSpaceStart - 1) === 32 ||
      line.text.charCodeAt(trailingSpaceStart - 1) === 9)
  ) {
    trailingSpaceStart--;
  }

  let contentEnd = trailingSpaceStart;
  while (
    contentEnd > offset &&
    line.text.charCodeAt(contentEnd - 1) === 35
  ) {
    contentEnd--;
  }
  if (
    contentEnd === trailingSpaceStart ||
    contentEnd === offset ||
    (line.text.charCodeAt(contentEnd - 1) !== 32 &&
      line.text.charCodeAt(contentEnd - 1) !== 9)
  ) {
    contentEnd = line.text.length;
  }

  const headerMarkType = nodeTypeId(cx.parser, 'HeaderMark');
  const children = [
    new Element(headerMarkType, from, from + level),
    ...cx.parser.parseInline(
      line.text.slice(offset + level + 1, contentEnd),
      from + level + 1
    )
  ];

  if (contentEnd < line.text.length) {
    children.push(new Element(
      headerMarkType,
      cx.lineStart + contentEnd,
      cx.lineStart + trailingSpaceStart
    ));
  }

  const heading = new Element(
    nodeTypeId(cx.parser, `ATXHeading${level}`),
    from,
    cx.lineStart + line.text.length,
    children
  );
  cx.nextLine();
  cx.addElement(heading);
  return true;
}

function wmdxDecimalHeading(cx, line) {
  if (line.indent > 3) return false;

  const offset = line.pos;
  const marker = /^\.([1-6])(?=[ \t])/.exec(line.text.slice(offset));
  if (!marker) return false;

  let contentStart = offset + marker[0].length;
  while (line.text[contentStart] === ' ' || line.text[contentStart] === '\t') {
    contentStart++;
  }

  const from = cx.lineStart + offset;
  const markerEnd = cx.lineStart + contentStart;
  const heading = new Element(
    nodeTypeId(cx.parser, `ATXHeading${marker[1]}`),
    from,
    cx.lineStart + line.text.length,
    [
      new Element(nodeTypeId(cx.parser, 'WmdxHeadingMarker'), from, markerEnd),
      ...cx.parser.parseInline(
        line.text.slice(contentStart),
        cx.lineStart + contentStart
      )
    ]
  );
  cx.nextLine();
  cx.addElement(heading);
  return true;
}

const unresolvedShortcutReferenceGuard = {
  name: 'WmdxUnresolvedShortcutReference',
  before: 'Link',
  parse(cx, next, pos) {
    if (next !== 91 || cx.hasOpenLink || cx.char(pos - 1) === 33) return -1;

    const openingBracket = pos - cx.offset;
    const closingBracket = findLabelEnd(cx.text, openingBracket);
    if (closingBracket < 0) return -1;
    if (!hasPotentialEmphasisAcrossLabel(cx.text, openingBracket, closingBracket)) return -1;

    const label = cx.text.slice(openingBracket + 1, closingBracket);
    let referenceLabel = label;
    const suffix = cx.text[closingBracket + 1];

    if (suffix === '(') return -1;
    if (suffix === '[') {
      const referenceEnd = findLabelEnd(cx.text, closingBracket + 1);
      if (referenceEnd < 0) return -1;
      const explicitLabel = cx.text.slice(closingBracket + 2, referenceEnd);
      if (explicitLabel) referenceLabel = explicitLabel;
    }

    if (!activeInput ||
        getReferenceLabels(activeInput).has(normalizeReferenceLabel(referenceLabel))) {
      return -1;
    }

    return cx.addElement(cx.elt('WmdxLiteralBracket', pos, pos + 1));
  }
};

const wmdxTaskMarker = {
  name: 'WmdxTaskMarker',
  before: 'Link',
  parse(cx, next, pos) {
    if (next !== 91 || cx.hasOpenLink) return -1;

    const offset = pos - cx.offset;
    const linePrefix = cx.text.slice(0, offset).split(/\r?\n/).at(-1);
    if (!/^[ \t]*$/.test(linePrefix)) return -1;
    const marker = /^\[[ xX]\](?=[ \t]|$)/.exec(cx.text.slice(offset));
    if (!marker) return -1;
    return cx.addElement(cx.elt('WmdxTaskMarker', pos, pos + 3));
  }
};

export const wmdxCommonMarkCompatibility = {
  defineNodes: [{
    name: 'WmdxLiteralBracket',
    style: tags.content
  }, {
    name: 'WmdxHeadingMarker',
    style: tags.processingInstruction
  }, {
    name: 'WmdxTaskMarker',
    style: tags.processingInstruction
  }],
  parseBlock: [{
    name: 'WmdxDecimalHeading',
    before: 'ATXHeading',
    parse: wmdxDecimalHeading
  }, {
    name: 'WmdxTabSeparatedATXHeading',
    before: 'ATXHeading',
    parse: tabSeparatedAtxHeading
  }],
  parseInline: [wmdxTaskMarker, unresolvedShortcutReferenceGuard],
  wrap(inner, input) {
    return {
      get parsedPos() {
        return inner.parsedPos;
      },
      get stoppedAt() {
        return inner.stoppedAt;
      },
      stopAt(pos) {
        inner.stopAt(pos);
      },
      advance() {
        const previousInput = activeInput;
        activeInput = input;
        try {
          return inner.advance();
        } finally {
          activeInput = previousInput;
        }
      }
    };
  }
};
