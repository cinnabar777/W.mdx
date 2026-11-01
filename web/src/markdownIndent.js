const ROOT_LIST_MARKER = /^([-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;

function selectedLineNumbers(doc, selection) {
  const first = doc.lineAt(selection.from).number;
  let last = doc.lineAt(selection.to).number;

  // A selection ending at the start of a line does not include that line.
  if (selection.to > selection.from && doc.line(last).from === selection.to) {
    last -= 1;
  }

  return { first, last: Math.max(first, last) };
}

export function getMarkdownIndentChanges(doc, selection, direction, spaces = '  ') {
  if (!doc || !selection || !['indent', 'outdent'].includes(direction)) return [];

  const changes = [];
  const { first, last } = selectedLineNumbers(doc, selection);
  for (let number = first; number <= last; number += 1) {
    const line = doc.line(number);
    if (direction === 'indent') {
      changes.push({ from: line.from, to: line.from, insert: spaces });
      continue;
    }

    const leadingWhitespace = /^[ \t]*/.exec(line.text)[0];
    if (leadingWhitespace) {
      const removeLength = leadingWhitespace.startsWith('\t')
        ? 1
        : Math.min(spaces.length, leadingWhitespace.length);
      changes.push({
        from: line.from,
        to: line.from + removeLength,
        insert: ''
      });
      continue;
    }

    const listMarker = ROOT_LIST_MARKER.exec(line.text);
    if (listMarker) {
      changes.push({
        from: line.from,
        to: line.from + listMarker[0].length,
        insert: ''
      });
    }
  }

  return changes;
}

export function applyMarkdownIndent(view, direction, spaces = '  ') {
  if (!view?.state) return false;

  const changes = getMarkdownIndentChanges(
    view.state.doc,
    view.state.selection.main,
    direction,
    spaces
  );
  if (changes.length) {
    const changeSet = view.state.changes(changes);
    view.dispatch({
      changes: changeSet,
      selection: view.state.selection.map(changeSet, 1)
    });
  }
  view.focus();
  return true;
}
