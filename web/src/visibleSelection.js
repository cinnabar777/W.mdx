import { EditorSelection } from '@codemirror/state';

function moveToRangeBoundary(ranges, position, direction, docLength) {
  let current = Math.max(0, Math.min(docLength, position));

  // Move through adjacent hidden ranges too, but always make progress.
  for (let attempt = 0; attempt <= ranges.length; attempt += 1) {
    const range = ranges.find(({ from, to }) => from <= current && current < to);
    if (!range) break;

    const next = direction < 0 ? range.from : range.to;
    if (next === current) break;
    current = next;
  }

  return current;
}

export function mapSelectionOutsideHiddenSyntax(selection, ranges, docLength) {
  if (!selection || !ranges.length) return selection;

  const rawRanges = selection.ranges || (Array.isArray(selection) ? selection : [selection]);
  const mappedRanges = rawRanges.map((range) => {
    if (range.empty) {
      const before = moveToRangeBoundary(ranges, range.head, -1, docLength);
      const after = moveToRangeBoundary(ranges, range.head, 1, docLength);
      const position =
        range.head - before <= after - range.head ? before : after;
      return EditorSelection.cursor(position);
    }

    const isForward = range.anchor < range.head;
    const anchor = moveToRangeBoundary(
      ranges,
      range.anchor,
      isForward ? 1 : -1,
      docLength
    );
    const head = moveToRangeBoundary(
      ranges,
      range.head,
      isForward ? -1 : 1,
      docLength
    );

    return anchor === head
      ? EditorSelection.cursor(anchor)
      : EditorSelection.range(anchor, head);
  });

  return EditorSelection.create(mappedRanges, selection.mainIndex);
}

export function filterSelectionOutsideHiddenSyntax(transaction, ranges, docLength) {
  if (!transaction.selection || !ranges.length) return transaction;

  const mapped = mapSelectionOutsideHiddenSyntax(
    transaction.newSelection,
    ranges,
    docLength
  );
  if (mapped.eq(transaction.newSelection)) return transaction;

  return [transaction, { selection: mapped, sequential: true }];
}
