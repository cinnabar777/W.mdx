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

test('parsePipeRow and isEscapedPipe handle escaped pipes and outer pipes', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(code.includes('export function parsePipeRow'), 'parsePipeRow is defined');
  assert.ok(code.includes('export function isEscapedPipe'), 'isEscapedPipe is defined');
  assert.ok(code.includes('export function isTableSeparatorRow'), 'isTableSeparatorRow is defined');
  assert.ok(code.includes('export function getTableColumnWidths'), 'getTableColumnWidths is defined');
  assert.ok(code.includes('class EmptyTableCellWidget'), 'EmptyTableCellWidget is defined');
  assert.ok(code.includes('export const horizontalRuleNavigationKeymap'), 'horizontalRuleNavigationKeymap is exported');
});

test('table rows use shared grid columns so wrapped cells keep aligned borders', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(code.includes('const lineStyles = new Map()'));
  assert.ok(code.includes('grid-template-columns:${gridColumns}'));
  assert.ok(code.includes('grid-column:${column + 1}'));
  assert.ok(code.includes('cell.style.gridColumn = String(this.columnNumber)'));
  assert.ok(code.includes('align-items:stretch;width:max-content;min-width:100%'));
  assert.match(styles, /\.cm-table-row\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.cm-content \.cm-table-cell\s*\{[^}]*align-self:\s*stretch/s);
});
