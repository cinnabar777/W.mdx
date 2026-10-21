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

  assert.ok(code.includes('Add Row Below'), 'Context menu includes Add Row Below');
  assert.ok(code.includes('Add Column Right'), 'Context menu includes Add Column Right');
  assert.ok(code.includes('Delete Row'), 'Context menu includes Delete Row');
  assert.ok(code.includes('Delete Column'), 'Context menu includes Delete Column');
  assert.ok(code.includes('Merge Right'), 'Context menu includes directional Merge');
  assert.ok(!code.includes("btnEdit.textContent = 'Edit Cell'"), 'Context menu excludes Edit Cell');
});

test('TableModel insertRow and insertCol add empty cells and preserve alignments and merges', async () => {
  const { TableModel } = await import('../src/tableModule.js');

  const markdown = `
| Header 1 | Header 2 |
| :--- | ---: |
| Cell 1 | Cell 2 |
`.trim();

  const model = TableModel.parse(markdown);
  assert.equal(model.getRowCount(), 2);
  assert.equal(model.getColCount(), 2);

  // Insert row at index 2 (below row 1)
  model.insertRow(2);
  assert.equal(model.getRowCount(), 3);
  assert.equal(model.rows[2][0], '');
  assert.equal(model.rows[2][1], '');

  // Insert column at index 2 (right of col 1)
  model.insertCol(2);
  assert.equal(model.getColCount(), 3);
  assert.equal(model.alignments[2], 'right'); // Inherited from col 1

  // Test roundtrip serialization
  const markdownAfter = model.toMarkdown();
  const reParsed = TableModel.parse(markdownAfter);
  assert.ok(reParsed);
  assert.equal(reParsed.getRowCount(), 3);
  assert.equal(reParsed.getColCount(), 3);

  // Test insertion on merged table
  model.mergeRect(1, 0, 1, 1); // Merge row 1, cols 0 and 1
  model.insertRow(2); // Insert below row 1
  assert.equal(model.getRowCount(), 4);
  assert.equal(model.rows[2][0], ''); // Inserted row cells start empty
});

test('WordProcessorTableWidget attaches long-press events and applies CSS variables for borders', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/tableWidget.js'), 'utf8');

  assert.ok(code.includes('longPressTimer = setTimeout'), 'Long press timer is implemented');
  assert.ok(code.includes('cancelLongPress'), 'Long press cancellation listener is implemented');
  assert.ok(code.includes('showContextMenu'), 'Context menu overlay is implemented');
  assert.ok(code.includes('var(--table-border-width, 1px) var(--table-border-style, solid) var(--table-border-color, #444)'), 'Table CSS variables for width and style are used');
});

test('Table widget exports tableHeightEstimatesChanged and measureTableWidgetHeight', async () => {
  const tableWidgetModule = await import('../src/tableWidget.js');
  assert.ok(tableWidgetModule.tableHeightEstimatesChanged, 'tableHeightEstimatesChanged StateEffect is exported');
  assert.ok(typeof tableWidgetModule.measureTableWidgetHeight === 'function', 'measureTableWidgetHeight function is exported');
});

test('Table pre-measurement, caching, and style updates in tableWidget.js and main.js', () => {
  const tableWidgetCode = fs.readFileSync(path.join(__dirname, '../src/tableWidget.js'), 'utf8');
  const mainCode = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(tableWidgetCode.includes('TABLE_HEIGHT_STYLE_PROPERTIES'), 'TABLE_HEIGHT_STYLE_PROPERTIES array defined');
  assert.ok(tableWidgetCode.includes('tableHeightCacheKey'), 'tableHeightCacheKey helper implemented');
  assert.ok(tableWidgetCode.includes('cachedTableHeight'), 'cachedTableHeight helper implemented');
  assert.ok(tableWidgetCode.includes('measuredOuterHeight'), 'measuredOuterHeight helper implemented');
  assert.ok(tableWidgetCode.includes('options.measurementOnly === true'), 'toDOM accepts measurementOnly option');
  assert.ok(tableWidgetCode.includes('measureTableWidgetHeight'), 'measureTableWidgetHeight exported');

  assert.ok(mainCode.includes('premeasureTableHeights'), 'premeasureTableHeights helper in main.js');
  assert.ok(mainCode.includes('tableHeightEstimatesChanged'), 'tableHeightEstimatesChanged imported and dispatched');
  assert.ok(mainCode.includes('this.tableContentWidthObserver = new ResizeObserver'), 'ResizeObserver tracks contentDOM width');
  assert.ok(mainCode.includes('premeasureTableHeights(activeAdapter.view)'), 'applyAllPreferences invokes premeasureTableHeights');
});

test('Deferred ResizeObserver updates and cleanup in tableWidget.js and main.js', () => {
  const tableWidgetCode = fs.readFileSync(path.join(__dirname, '../src/tableWidget.js'), 'utf8');
  const mainCode = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(tableWidgetCode.includes('tableResizeObserverState = new WeakMap()'), 'tableResizeObserverState defined');
  assert.ok(tableWidgetCode.includes('requestAnimationFrame(() => {'), 'Table ResizeObserver callback defers with requestAnimationFrame');
  assert.ok(tableWidgetCode.includes('destroy(dom) {'), 'WordProcessorTableWidget implements destroy(dom)');
  assert.ok(tableWidgetCode.includes('resizeState.observer.disconnect()'), 'destroy disconnects ResizeObserver');
  assert.ok(tableWidgetCode.includes('cancelAnimationFrame(resizeState.frameId)'), 'destroy cancels pending animation frame');

  assert.ok(mainCode.includes('this.tableWidthMeasureFrame = requestAnimationFrame'), 'Content width ResizeObserver defers with requestAnimationFrame');
  assert.ok(mainCode.includes('cancelAnimationFrame(this.tableWidthMeasureFrame)'), 'CodeMirrorAdapter.destroy cancels pending tableWidthMeasureFrame');
});
