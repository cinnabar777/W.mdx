import { syntaxTree } from '@codemirror/language';

const headingNodePattern = /^(?:ATXHeading|SetextHeading)([1-6])$/;
const autoHeadingProgress = new WeakMap();

export function getPrecedingHeadingLevel(state, beforeLineNumber) {
  if (!state || beforeLineNumber <= 1) return null;

  let previousHeading = null;
  syntaxTree(state).iterate({
    enter(node) {
      const match = headingNodePattern.exec(node.name);
      if (!match) return;

      const lineNumber = state.doc.lineAt(node.from).number;
      if (
        lineNumber < beforeLineNumber &&
        (!previousHeading || lineNumber > previousHeading.lineNumber)
      ) {
        previousHeading = {
          lineNumber,
          level: Number(match[1])
        };
      }
    }
  });

  return previousHeading?.level ?? null;
}

export function getAutoHeadingLevel(previousLevel, tapNumber) {
  const previous = previousLevel ?? 1;
  const levels = [
    previousLevel == null ? 1 : Math.min(previous + 1, 6),
    previous,
    Math.max(previous - 1, 1),
    1
  ];
  return levels[((tapNumber % levels.length) + levels.length) % levels.length];
}

function isInsideCodeBlock(state, position) {
  for (
    let node = syntaxTree(state).resolveInner(position, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
  }
  return false;
}

function getSetextHeadingEndLine(state, lineNumber) {
  let endLine = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (!/^SetextHeading[12]$/.test(node.name)) return;
      if (state.doc.lineAt(node.from).number !== lineNumber) return;
      endLine = state.doc.lineAt(node.to);
    }
  });
  return endLine;
}

function parseCurrentLine(lineText) {
  const indent = /^( {0,3})/.exec(lineText)?.[1] ?? '';
  let bodyStart = indent.length;
  const quotePrefix = /^(?:>[ \t]?)+/.exec(lineText.slice(bodyStart))?.[0] ?? '';
  bodyStart += quotePrefix.length;

  const rest = lineText.slice(bodyStart);
  const heading = /^(#{1,6})(?:[ \t]+|$)/.exec(rest);
  const list = /^(?:- \[[ \t]?[xX ]?\][ \t]+|[-+*][ \t]+|\d+[.)][ \t]+)/.exec(rest);
  const oldPrefix = heading?.[0] ?? list?.[0] ?? '';
  bodyStart += oldPrefix.length;

  return {
    indent,
    quotePrefix,
    bodyStart,
    body: lineText.slice(bodyStart),
    currentLevel: heading ? heading[1].length : null
  };
}

export function applyAutoHeading(view) {
  if (!view?.state || !view?.dispatch) return false;

  const state = view.state;
  const selection = state.selection.main;
  const cursorLine = state.doc.lineAt(selection.head);
  if (isInsideCodeBlock(state, selection.head)) return false;

  const previousLevel = getPrecedingHeadingLevel(state, cursorLine.number);
  const current = parseCurrentLine(cursorLine.text);
  const priorProgress = autoHeadingProgress.get(view);
  const isContinuation = priorProgress &&
    priorProgress.lineNumber === cursorLine.number &&
    priorProgress.body === current.body &&
    priorProgress.previousLevel === previousLevel &&
    priorProgress.lastAppliedLevel === current.currentLevel;
  const tapNumber = isContinuation ? priorProgress.nextTap : 0;
  const level = getAutoHeadingLevel(previousLevel, tapNumber);
  const nextPrefix = `${current.indent}${current.quotePrefix}${'#'.repeat(level)} `;
  const replacement = `${nextPrefix}${current.body}`;
  const setextEndLine = getSetextHeadingEndLine(state, cursorLine.number);
  const changeEnd = setextEndLine?.to ?? cursorLine.to;

  autoHeadingProgress.set(view, {
    lineNumber: cursorLine.number,
    body: current.body,
    previousLevel,
    lastAppliedLevel: level,
    nextTap: (tapNumber + 1) % 4
  });

  const currentLineText = state.doc.sliceString(cursorLine.from, changeEnd);
  if (currentLineText !== replacement) {
    const mapPosition = position => {
      const bodyOffset = Math.max(
        0,
        Math.min(current.body.length, position - cursorLine.from - current.bodyStart)
      );
      return cursorLine.from + nextPrefix.length + bodyOffset;
    };
    const bothEndpointsOnLine =
      selection.anchor >= cursorLine.from &&
      selection.anchor <= cursorLine.to &&
      selection.head >= cursorLine.from &&
      selection.head <= cursorLine.to;
    const cursorPosition = mapPosition(selection.head);

    view.dispatch({
      changes: {
        from: cursorLine.from,
        to: changeEnd,
        insert: replacement
      },
      selection: bothEndpointsOnLine
        ? {
            anchor: mapPosition(selection.anchor),
            head: cursorPosition
          }
        : {
            anchor: cursorPosition,
            head: cursorPosition
          },
      scrollIntoView: true
    });
  }

  view.focus?.();
  return true;
}
