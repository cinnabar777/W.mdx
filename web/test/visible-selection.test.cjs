const test = require('node:test');
const assert = require('node:assert/strict');
const { EditorSelection } = require('@codemirror/state');

test('mapSelectionOutsideHiddenSyntax moves collapsed caret inside hidden range to nearest boundary', async () => {
  const { mapSelectionOutsideHiddenSyntax } = await import('../src/visibleSelection.js');
  const ranges = [{ from: 10, to: 15 }];
  const docLength = 100;

  const sel1 = EditorSelection.cursor(12);
  const mapped1 = mapSelectionOutsideHiddenSyntax(sel1, ranges, docLength);
  assert.equal(mapped1.main.head, 10);

  const sel2 = EditorSelection.cursor(14);
  const mapped2 = mapSelectionOutsideHiddenSyntax(sel2, ranges, docLength);
  assert.equal(mapped2.main.head, 15);
});

test('mapSelectionOutsideHiddenSyntax maps range selection inward and preserves direction', async () => {
  const { mapSelectionOutsideHiddenSyntax } = await import('../src/visibleSelection.js');
  const ranges = [{ from: 5, to: 8 }, { from: 20, to: 25 }];
  const docLength = 100;

  const selForward = EditorSelection.range(6, 22);
  const mappedForward = mapSelectionOutsideHiddenSyntax(selForward, ranges, docLength);
  assert.equal(mappedForward.main.anchor, 8);
  assert.equal(mappedForward.main.head, 20);

  const selBackward = EditorSelection.range(22, 6);
  const mappedBackward = mapSelectionOutsideHiddenSyntax(selBackward, ranges, docLength);
  assert.equal(mappedBackward.main.anchor, 20);
  assert.equal(mappedBackward.main.head, 8);
});

test('mapSelectionOutsideHiddenSyntax leaves positions outside hidden ranges unchanged', async () => {
  const { mapSelectionOutsideHiddenSyntax } = await import('../src/visibleSelection.js');
  const ranges = [{ from: 10, to: 15 }];
  const docLength = 100;

  const sel = EditorSelection.cursor(5);
  const mapped = mapSelectionOutsideHiddenSyntax(sel, ranges, docLength);
  assert.equal(mapped.main.head, 5);
});

test('mapSelectionOutsideHiddenSyntax skips adjacent hidden ranges without infinite loop', async () => {
  const { mapSelectionOutsideHiddenSyntax } = await import('../src/visibleSelection.js');
  const ranges = [{ from: 10, to: 15 }, { from: 15, to: 20 }];
  const docLength = 100;

  const sel = EditorSelection.cursor(12);
  const mapped = mapSelectionOutsideHiddenSyntax(sel, ranges, docLength);
  assert.equal(mapped.main.head, 10);
});
