const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');

test('applyAllPreferences maps all individualized H1-H6 preferences', () => {
  assert.ok(source.includes('--heading-${i}-color') || source.includes('--heading-1-color'));
  assert.ok(source.includes('--heading-${i}-scale') || source.includes('--heading-1-scale'));
  assert.ok(source.includes('--heading-${i}-align') || source.includes('--heading-1-align'));
  assert.ok(source.includes('--heading-${i}-line-height') || source.includes('--heading-1-line-height'));
  assert.ok(source.includes('--heading-${i}-letter-spacing') || source.includes('--heading-1-letter-spacing'));
  assert.ok(source.includes('--heading-${i}-text-transform') || source.includes('--heading-1-text-transform'));
  assert.ok(source.includes('--heading-${i}-underline-style') || source.includes('--heading-1-underline-style'));
  assert.ok(source.includes('--heading-${i}-underline-thickness') || source.includes('--heading-1-underline-thickness'));
  assert.ok(source.includes('--heading-${i}-underline-color') || source.includes('--heading-1-underline-color'));
  assert.ok(source.includes('--heading-${i}-margin-top') || source.includes('--heading-1-margin-top'));
  assert.ok(source.includes('--heading-${i}-margin-bottom') || source.includes('--heading-1-margin-bottom'));
  assert.ok(source.includes('--heading-${i}-font-weight') || source.includes('--heading-1-font-weight'));
});

test('applyAllPreferences maps typography, lists, quotes, tables, and codeblocks', () => {
  const variables = [
    '--body-font-size',
    '--paragraph-line-height',
    '--paragraph-letter-spacing',
    '--paragraph-align',
    '--paragraph-indent',
    '--paragraph-margin-top',
    '--paragraph-margin-bottom',
    '--bold-color',
    '--italic-color',
    '--link-color',
    '--link-decoration',
    '--code-color',
    '--code-bg-color',
    '--footnote-text-color',
    '--list-left-indent',
    '--list-item-spacing',
    '--list-bullet-color',
    '--list-number-color',
    '--todo-border-color',
    '--todo-accent-color',
    '--todo-bg-color',
    '--blockquote-border-width',
    '--blockquote-border-style',
    '--blockquote-border-color',
    '--blockquote-bg-color',
    '--blockquote-text-color',
    '--table-border-style',
    '--table-border-width',
    '--table-border-color',
    '--table-header-bg',
    '--table-header-color',
    '--table-cell-bg',
    '--table-cell-color',
    '--code-block-color',
    '--code-block-bg-color',
    '--hr-thickness',
    '--hr-style',
    '--hr-color',
    '--hr-width'
  ];

  for (const v of variables) {
    assert.ok(source.includes(v), `Missing CSS variable mapping for ${v}`);
  }
});
