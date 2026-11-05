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
  const titleStart = match[3]
    ? markerStart + markerLength + match[3].length
    : null;
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
    const calloutIndex = stack.lastIndexOf(callout);
    const parentCallout = calloutIndex > 0 ? stack[calloutIndex - 1] : null;
    lineAttributes.set(line.from, {
      type: callout.type,
      depth: callout.depth,
      continuationIndent: callout.indent + 2,
      exitIndent: parentCallout ? parentCallout.indent + 2 : 0,
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
        continuationIndent: indent + 2,
        indentToHide: indent,
        isTitle: true
      });
      stack.push(callout);
      continue;
    }

    if (isIndentedBody) markBodyLine(line, parent);
  }

  if (stack.length && pendingBlankLines.length) {
    for (const blankLine of pendingBlankLines) {
      const blankIndent = indentationOf(blankLine.text);
      const containingCallout = [...stack]
        .reverse()
        .find(callout => blankIndent > callout.indent);
      if (containingCallout) markBodyLine(blankLine, containingCallout, true);
    }
  }

  return { openers, lineAttributes };
}

export function getWmdxCalloutContinuationIndent(
  text,
  position,
  isExcluded = () => false
) {
  const source = String(text ?? '');
  const line = splitLines(source).find(
    candidate => position >= candidate.from && position <= candidate.to
  );
  if (!line) return null;

  const attributes = parseWmdxCallouts(source, isExcluded)
    .lineAttributes.get(line.from);
  if (!attributes) return null;

  if (!line.text.trim()) {
    return attributes.exitIndent ?? 0;
  }
  if (attributes.isTitle) {
    return attributes.continuationIndent;
  }
  return indentationOf(line.text);
}

export function getWmdxCalloutEnterEdit(
  text,
  selection,
  isExcluded = () => false
) {
  const source = String(text ?? '');
  const position = selection?.head;
  if (!Number.isInteger(position)) return null;

  const line = splitLines(source).find(
    candidate => position >= candidate.from && position <= candidate.to
  );
  if (!line) return null;

  const indent = getWmdxCalloutContinuationIndent(
    source,
    position,
    isExcluded
  );
  if (indent == null) return null;

  const exitsCurrentCallout = Boolean(
    selection.empty && !line.text.trim()
  );
  const from = exitsCurrentCallout ? line.from : selection.from;
  const to = exitsCurrentCallout ? line.to : selection.to;
  const insert = `\n${' '.repeat(indent)}`;
  return {
    from,
    to,
    insert,
    cursor: from + insert.length,
    exitsCurrentCallout
  };
}

export function isWmdxCalloutTitleDraftActive(selection, info, lineTo) {
  if (
    !selection?.empty ||
    !info ||
    !Number.isInteger(info.markerStart) ||
    !Number.isInteger(lineTo)
  ) {
    return false;
  }

  return !info.customTitle?.trim() &&
    selection.head >= info.markerStart &&
    selection.head <= lineTo;
}
