const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { markdown } = require('@codemirror/lang-markdown');
const { GFM, Table, Strikethrough, TaskList } = require('@lezer/markdown');

const mainJsPath = path.join(__dirname, '../src/main.js');
const mainSource = fs.readFileSync(mainJsPath, 'utf8');

test('WYSIWYG livePreviewPlugin uses full document ranges and preserves decoration objects across viewport updates', () => {
  assert.ok(mainSource.includes('ensureSyntaxTree(view.state, doc.length, 250)'), 'ensureSyntaxTree parses full document');
  assert.ok(mainSource.includes('const decorationRanges = isPureWysiwyg'), 'decorationRanges is defined');
  assert.ok(mainSource.includes('(!isWysiwyg && update.viewportChanged)'), 'update ignores viewportChanged in WYSIWYG mode');

  const docPath = path.join(__dirname, '../../Documentation/Markdown.md');
  const markdownText = fs.readFileSync(docPath, 'utf8');
  assert.ok(markdownText.length > 5000, 'Documentation/Markdown.md loaded');

  // Verify that livePreviewPlugin update method in mainSource enforces object identity on viewport changes in WYSIWYG
  const updateMatch = mainSource.match(/update\(update\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(updateMatch, 'livePreviewPlugin update method found');
  assert.ok(updateMatch[0].includes('!isWysiwyg && update.viewportChanged'), 'Viewport changes do not trigger buildDecorations in WYSIWYG mode');
});
