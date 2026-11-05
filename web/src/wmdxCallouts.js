function splitLines(text) {
  const lines = [];
  let from = 0;
  for (const rawLine of String(text ?? '').split('\n')) {
    const content = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    lines.push({
      from,
      to: from + rawLine.length,
      text: content
    });
    from += rawLine.length + 1;
  }
  return lines;
}

function indentationOf(text) {
  let count = 0;
  while (text[count] === ' ') count++;
  return count;
}

function calloutMarker(line, indent) {
  const match = /^±([A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)([-+]?)(?:([ \t]+)(.*))?$/.exec(
    line.text.slice(indent)
  );
  if (!match) return null;

  const markerStart = line.from + indent;
  const markerLength = 1 + match[1].length + match[2].length;
  const titleStart = match[4] ? markerStart + markerLength + match[3].length : null;
  return {
    type: match[1].toLowerCase(),
    foldMarker: match[2] || null,
    customTitle: match[4] || null,
    markerStart,
    markerEnd: markerStart + markerLength,
    titleStart
  };
}

export function parseWmdxCallouts(text, isExcluded = () => false) {
  const lines = splitLines(text);
  const openers = [];
  const lineAttributes = new Map();
  const stack = [];
  let pendingBlankLines = [];

  const markBodyLine = (line, callout, isBlank = false) => {
    lineAttributes.set(line.from, {
      type: callout.type,
      depth: callout.depth,
      indentToHide: isBlank
        ? 0
        : Math.min(callout.indent + 2, indentationOf(line.text)),
      isTitle: false
    });
    for (const ancestor of stack) {
      if (indentationOf(line.text) > ancestor.indent) {
        ancestor.info.bodyTo = line.to;
      }
    }
  };

  for (const line of lines) {
    if (!line.text.trim()) {
      if (stack.length) pendingBlankLines.push(line);
      continue;
    }

    const indent = indentationOf(line.text);
    while (stack.length && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1] || null;
    const isIndentedBody = parent && indent > parent.indent;
    if (pendingBlankLines.length) {
      if (isIndentedBody) {
        for (const blankLine of pendingBlankLines) {
          markBodyLine(blankLine, parent, true);
        }
      }
      pendingBlankLines = [];
    }

    const marker = calloutMarker(line, indent);
    const isCalloutOpener = marker && !isExcluded(line.from + indent);
    if (isCalloutOpener) {
      if (isIndentedBody) markBodyLine(line, parent);

      const info = {
        ...marker,
        depth: stack.length + 1,
        bodyFrom: line.to,
        bodyTo: line.to
      };
      const callout = { indent, depth: info.depth, type: info.type, info };
      openers.push({ lineFrom: line.from, info });
      lineAttributes.set(line.from, {
        type: info.type,
        depth: info.depth,
        indentToHide: indent,
        isTitle: true
      });
      stack.push(callout);
      continue;
    }

    if (isIndentedBody) markBodyLine(line, parent);
  }

  return { openers, lineAttributes };
}
