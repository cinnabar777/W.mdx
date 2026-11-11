export const MARKDOWN_SYNTAX_EXPOSURE_SCOPES = Object.freeze([
  'hidden',
  'caret',
  'line',
  'block'
]);

export function normalizeMarkdownSyntaxExposureScope(value) {
  const scope = String(value || 'hidden');
  return MARKDOWN_SYNTAX_EXPOSURE_SCOPES.includes(scope) ? scope : 'hidden';
}

export function selectionTouchesRange(selection, from, to) {
  return selection.empty
    ? selection.head >= from && selection.head <= to
    : selection.from < to && selection.to > from;
}

export function syntaxExposureRangeIsActive(
  selection,
  doc,
  layout,
  from,
  to,
  scope
) {
  if (scope === 'hidden') return false;
  if (scope === 'caret') {
    return selectionTouchesRange(selection, from, to);
  }

  const firstLine = doc.lineAt(from);
  const lastLine = doc.lineAt(Math.max(from, to - 1));
  if (scope === 'line') {
    return selectionTouchesRange(selection, firstLine.from, lastLine.to);
  }

  if (scope === 'block') {
    const containingBlocks = layout.blocks
      .filter(block => block.from <= from && block.to >= to && block.to > block.from)
      .sort((left, right) =>
        (left.to - left.from) - (right.to - right.from)
      );
    const block = containingBlocks[0];
    return block
      ? selectionTouchesRange(selection, block.from, block.to)
      : selectionTouchesRange(selection, firstLine.from, lastLine.to);
  }
  return false;
}
