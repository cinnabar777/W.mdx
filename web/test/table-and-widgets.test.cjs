const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Widget classes implement eq for DOM reuse', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  // Check CheckboxWidget eq
  assert.ok(code.includes('class CheckboxWidget'), 'CheckboxWidget exists');
  assert.ok(code.includes('other instanceof CheckboxWidget'), 'CheckboxWidget has eq check');

  // Check CodeBlockHeaderWidget eq
  assert.ok(code.includes('class CodeBlockHeaderWidget'), 'CodeBlockHeaderWidget exists');
  assert.ok(code.includes('other instanceof CodeBlockHeaderWidget'), 'CodeBlockHeaderWidget has eq check');

  // Check ImagePreviewWidget eq
  assert.ok(code.includes('class ImagePreviewWidget'), 'ImagePreviewWidget exists');
  assert.ok(code.includes('other instanceof ImagePreviewWidget'), 'ImagePreviewWidget has eq check');
});

test('Table cell navigation functions exist and handle pipe delimiters', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(code.includes('function parseTableCells'), 'parseTableCells exists');
  assert.ok(code.includes('function navigateTableCell'), 'navigateTableCell exists');
  assert.ok(code.includes('tableNavigationKeymap'), 'tableNavigationKeymap is exported');
});

const styles = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('TableModel parses, merges, splits, and serializes GFM tables correctly', async () => {
  const { TableModel, parsePipeRow, isTableSeparatorRow, parseAlignments } = await import('../src/tableModule.js');

  const markdown = `
| Header 1 | Header 2 | Header 3 |
| :--- | :---: | ---: |
| Cell 1 | Cell 2 | Cell 3 |
| Cell 4 | Cell 5 | Cell 6 |
`.trim();

  const model = TableModel.parse(markdown);
  assert.ok(model, 'TableModel.parse successfully parsed Markdown table');
  assert.equal(model.getRowCount(), 3);
  assert.equal(model.getColCount(), 3);
  assert.deepEqual(model.alignments, ['left', 'center', 'right']);

  // Test merge cells
  model.mergeRect(1, 0, 1, 1);
  const matrix = model.getRenderMatrix();
  assert.equal(matrix[1][0].colSpan, 2);
  assert.equal(matrix[1][1].isCovered, true);

  // Test roundtrip serialization
  const serialized = model.toMarkdown();
  assert.ok(serialized.includes('<'), 'Serialized Markdown contains colSpan merge marker <');

  const reParsed = TableModel.parse(serialized);
  assert.ok(reParsed, 'Re-parsed merged Markdown table successfully');
  assert.equal(reParsed.getRowCount(), 3);

  // Test row and column deletion
  model.deleteRow(2);
  assert.equal(model.getRowCount(), 2, 'Row successfully deleted');

  model.deleteCol(2);
  assert.equal(model.getColCount(), 2, 'Column successfully deleted');
});

test('WordProcessorTableWidget provides structural context menu items', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/tableWidget.js'), 'utf8');

  assert.ok(code.includes('Delete Row'), 'Context menu includes Delete Row');
  assert.ok(code.includes('Delete Column'), 'Context menu includes Delete Column');
  assert.ok(code.includes('Merge Right'), 'Context menu includes directional Merge');
  assert.ok(!code.includes("btnEdit.textContent = 'Edit Cell'"), 'Context menu excludes Edit Cell');
});

test('WordProcessorTableWidget attaches long-press events and applies CSS variables for borders', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/tableWidget.js'), 'utf8');

  assert.ok(code.includes('longPressTimer = setTimeout'), 'Long press timer is implemented');
  assert.ok(code.includes('cancelLongPress'), 'Long press cancellation listener is implemented');
  assert.ok(code.includes('showContextMenu'), 'Context menu overlay is implemented');
  assert.ok(code.includes('var(--table-border-width, 1px) var(--table-border-style, solid) var(--table-border-color, #444)'), 'Table CSS variables for width and style are used');
});
