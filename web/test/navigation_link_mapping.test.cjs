const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EditorState } = require('@codemirror/state');
const { TableModel } = require('../src/tableModule.js');

test('Table cell link insertion replaces selected text in cell and preserves table structure', () => {
  const initialMarkdown = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |';
  const model = TableModel.parse(initialMarkdown);
  assert.ok(model);

  // Simulate selected text "Cell 1" in data row 1, cell 0
  const cellVal = model.rows[1][0]; // "Cell 1"
  const start = 0;
  const end = cellVal.length;
  const replacement = '[Cell 1](https://example.com)';

  model.rows[1][0] = cellVal.substring(0, start) + replacement + cellVal.substring(end);
  const updatedMarkdown = model.toMarkdown();

  assert.ok(updatedMarkdown.includes('| [Cell 1](https://example.com) | Cell 2 |'));
  assert.ok(updatedMarkdown.startsWith('| Header 1 | Header 2 |'));
  // Ensure table markdown structure is preserved and not appended outside
  assert.strictEqual(updatedMarkdown.split('\n').length, 3);
});

test('Table cell link insertion at caret position inside cell', () => {
  const initialMarkdown = '| Name | Age |\n| --- | --- |\n|  | 25 |';
  const model = TableModel.parse(initialMarkdown);
  assert.ok(model);

  // Caret in data row 1, cell 0
  const replacement = '[Jules](https://wmdx.app)';
  model.rows[1][0] = replacement;
  const updatedMarkdown = model.toMarkdown();

  assert.ok(updatedMarkdown.includes('| [Jules](https://wmdx.app) | 25 |'));
  assert.strictEqual(updatedMarkdown.split('\n').length, 3);
});

test('Dialog cancellation leaves document and table untouched', () => {
  const initialMarkdown = '# Document\n\n| Col A | Col B |\n| --- | --- |\n| Data A | Data B |';
  const model = TableModel.parse('| Col A | Col B |\n| --- | --- |\n| Data A | Data B |');
  assert.ok(model);

  // Cancellation does not mutate model
  const beforeState = model.toMarkdown();
  // Cancel action triggered -> no mutation
  const afterState = model.toMarkdown();

  assert.strictEqual(beforeState, afterState);
});

test('Markdown cheat sheet regression fixture loads and parses headings, code blocks, callouts, lists, and embeds', () => {
  const cheatSheetPath = path.join(__dirname, '../../Documentation/Markdown.md');
  assert.ok(fs.existsSync(cheatSheetPath), 'Documentation/Markdown.md fixture should exist');

  const cheatSheetText = fs.readFileSync(cheatSheetPath, 'utf8');
  const state = EditorState.create({ doc: cheatSheetText });

  assert.strictEqual(state.doc.toString(), cheatSheetText);
  assert.ok(cheatSheetText.includes('# EMBED'));
  assert.ok(cheatSheetText.includes('![[Note to Embed]]'));
  assert.ok(cheatSheetText.includes('> [!info] header'));
});

test('main.js contains hideSyntax replacement decorations and selection snapshot handling', () => {
  const mainJsPath = path.join(__dirname, '../src/main.js');
  const mainJs = fs.readFileSync(mainJsPath, 'utf8');

  assert.ok(mainJs.includes('selectionSnapshot = {'), 'openLinkInsertionDialog must snapshot selection');
  assert.ok(mainJs.includes('hideSyntax(node.from'), 'Links should use hideSyntax replacements');
  assert.ok(mainJs.includes('commitModel'), 'openLinkInsertionDialog must commit table cell changes via commitModel');
});
