const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');

test('Source mode supports roundtrip fidelity', () => {
  assert.ok(source.includes("currentEditorMode === 'source'"));
  assert.ok(source.includes('Decoration.none'));
});

test('WYSIWYG mode hides syntax and displays widgets', () => {
  assert.ok(source.includes("currentEditorMode === 'wysiwyg'"));
  assert.ok(source.includes('CheckboxWidget'));
});

test('WYSIWYG code blocks hide the closing fence as well as replacing the opening fence', () => {
  const blockStart = source.indexOf('function buildWysiwygCodeBlockDecorations');
  const blockEnd = source.indexOf('\nfunction rangeTouchesSyntaxNode', blockStart);
  const codeBlockDecorations = source.slice(blockStart, blockEnd);

  assert.ok(blockStart >= 0 && blockEnd > blockStart, 'WYSIWYG code block renderer is present');
  assert.match(
    codeBlockDecorations,
    /isFenceLine\s*&&\s*number\s*===\s*lastLine\.number/,
    'The closing fence line is detected separately from the opening fence'
  );
  assert.ok(
    codeBlockDecorations.includes('Decoration.replace({}).range(line.from, line.to)'),
    'Closing fence syntax is replaced with no visible text'
  );
});
