import { syntaxTree } from '@codemirror/language';
import {
  DEFAULT_HEADING_SYNTAX_SETTINGS,
  getHeadingFlavor,
  getHeadingLevel,
  getHeadingPrefix,
  isHeadingFlavorEnabled,
  isHeadingLevelAvailable
} from './headingSyntax.mjs';

const autoHeadingProgress = new WeakMap();

export function getPrecedingHeadingLevel(
  state,
  beforeLineNumber,
  settings = DEFAULT_HEADING_SYNTAX_SETTINGS
) {
  if (!state || beforeLineNumber <= 1) return null;

  let previousHeading = null;
  syntaxTree(state).iterate({
    enter(node) {
      const level = getHeadingLevel(node.name);
      const flavor = getHeadingFlavor(
        node.name,
        state.doc.sliceString(node.from, node.to)
      );
      if (
        !level ||
        !isHeadingFlavorEnabled(settings, flavor)
      ) return;

      const lineNumber = state.doc.lineAt(node.from).number;
      if (
        lineNumber < beforeLineNumber &&
        (!previousHeading || lineNumber > previousHeading.lineNumber)
      ) {
        previousHeading = {
          lineNumber,
          level
        };
      }
    }
  });

  return previousHeading?.level ?? null;
}

export function getAutoHeadingLevel(previousLevel, tapNumber) {
  return getAutoHeadingLevelForMaximum(previousLevel, tapNumber, 6);
}

function getAutoHeadingLevelForMaximum(previousLevel, tapNumber, maxLevel) {
  const previous = Math.max(1, Math.min(previousLevel ?? 1, maxLevel));
  const levels = [
    previousLevel == null ? 1 : Math.min(previous + 1, maxLevel),
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

function getSetextHeadingRange(state, lineNumber) {
  let result = null;
  syntaxTree(state).iterate({
    enter(node) {
      const level = getHeadingLevel(node.name);
      if (!node.name.startsWith('SetextHeading') || !level) return;
      if (state.doc.lineAt(node.from).number !== lineNumber) return;
      result = { to: node.to, level };
      return false;
    }
  });
  return result;
}

function parseCurrentLine(lineText, setextLevel = null) {
  const indent = /^( {0,3})/.exec(lineText)?.[1] ?? '';
  let bodyStart = indent.length;
  const quotePrefix = /^(?:>[ \t]?)+/.exec(lineText.slice(bodyStart))?.[0] ?? '';
  bodyStart += quotePrefix.length;

  const rest = lineText.slice(bodyStart);
  const hashHeading = /^(#{1,6})(?:[ \t]+|$)/.exec(rest);
  const wmdxHeading = /^\.([1-6])(?:[ \t]+|$)/.exec(rest);
  const list = /^(?:- \[[ \t]?[xX ]?\][ \t]+|[-+*][ \t]+|\d+[.)][ \t]+)/.exec(rest);
  const oldPrefix = hashHeading?.[0] ?? wmdxHeading?.[0] ?? list?.[0] ?? '';
  bodyStart += oldPrefix.length;

  return {
    indent,
    quotePrefix,
    bodyStart,
    body: lineText.slice(bodyStart),
    currentLevel: hashHeading
      ? hashHeading[1].length
      : wmdxHeading
        ? Number(wmdxHeading[1])
        : setextLevel
  };
}

export function applyAutoHeading(
  view,
  settings = DEFAULT_HEADING_SYNTAX_SETTINGS
) {
  if (!view?.state || !view?.dispatch) return false;
  if (settings?.enabled === false || !settings?.authoringSyntax) return false;

  const state = view.state;
  const selection = state.selection.main;
  const cursorLine = state.doc.lineAt(selection.head);
  if (isInsideCodeBlock(state, selection.head)) return false;

  const syntax = settings.authoringSyntax;
  const maxLevel = syntax === 'setext' ? 2 : 6;
  const previousLevel = getPrecedingHeadingLevel(
    state,
    cursorLine.number,
    settings
  );
  const setextHeading = getSetextHeadingRange(state, cursorLine.number);
  const current = parseCurrentLine(cursorLine.text, setextHeading?.level);
  const priorProgress = autoHeadingProgress.get(view);
  const isContinuation = priorProgress &&
    priorProgress.lineNumber === cursorLine.number &&
    priorProgress.body === current.body &&
    priorProgress.previousLevel === previousLevel &&
    priorProgress.lastAppliedLevel === current.currentLevel;
  const tapNumber = isContinuation ? priorProgress.nextTap : 0;
  const level = getAutoHeadingLevelForMaximum(
    previousLevel,
    tapNumber,
    maxLevel
  );
  if (!isHeadingLevelAvailable(settings, level)) return false;
  const marker = getHeadingPrefix(level, syntax);
  if (!marker) return false;
  const nextPrefix = `${current.indent}${current.quotePrefix}${
    syntax === 'setext' ? '' : marker
  }`;
  const replacement = syntax === 'setext'
    ? `${nextPrefix}${current.body}\n${current.indent}${current.quotePrefix}${marker.repeat(Math.max(1, current.body.trim().length))}`
    : `${nextPrefix}${current.body}`;
  const changeEnd = setextHeading?.to ?? cursorLine.to;

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
