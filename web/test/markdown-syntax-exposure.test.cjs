const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { EditorState } = require('@codemirror/state');

const root = path.resolve(__dirname, '../..');

test('syntax exposure scopes normalize safely and select caret, line, or block ranges', async () => {
  const {
    normalizeMarkdownSyntaxExposureScope,
    syntaxExposureRangeIsActive
  } = await import('../src/markdownSyntaxExposure.mjs');
  const state = EditorState.create({
    doc: 'First **bold** line\nSecond *italic* line\n\nOutside ~~strike~~'
  });
  const doc = state.doc;
  const layout = {
    blocks: [
      { kind: 'Paragraph', from: 0, to: 43 },
      { kind: 'Paragraph', from: 45, to: doc.length }
    ]
  };
  const cursor = { empty: true, head: 2 };
  const firstLine = doc.line(1);
  const secondLine = doc.line(2);
  const firstLineSyntax = { from: firstLine.from + 6, to: firstLine.from + 14 };
  const secondLineSyntax = { from: secondLine.from + 7, to: secondLine.from + 15 };

  assert.equal(normalizeMarkdownSyntaxExposureScope('line'), 'line');
  assert.equal(normalizeMarkdownSyntaxExposureScope('unknown'), 'hidden');
  assert.equal(syntaxExposureRangeIsActive(
    cursor, doc, layout, firstLineSyntax.from, firstLineSyntax.to, 'hidden'
  ), false);
  assert.equal(syntaxExposureRangeIsActive(
    cursor, doc, layout, firstLineSyntax.from, firstLineSyntax.to, 'caret'
  ), false);
  assert.equal(syntaxExposureRangeIsActive(
    cursor, doc, layout, firstLineSyntax.from, firstLineSyntax.to, 'line'
  ), true, 'line scope exposes syntax anywhere on the caret line');
  assert.equal(syntaxExposureRangeIsActive(
    cursor, doc, layout, secondLineSyntax.from, secondLineSyntax.to, 'block'
  ), true, 'block scope exposes syntax elsewhere in the same paragraph');
  assert.equal(syntaxExposureRangeIsActive(
    cursor, doc, layout, doc.length - 8, doc.length - 2, 'block'
  ), false, 'block scope does not expose a different paragraph');
});

test('editor settings provide one rendered mode with configurable syntax exposure', () => {
  const arrays = fs.readFileSync(
    path.join(root, 'app/src/main/res/values/arrays.xml'),
    'utf8'
  );
  const preferences = fs.readFileSync(
    path.join(root, 'app/src/main/res/xml/preferences.xml'),
    'utf8'
  );
  const dialectSettings = fs.readFileSync(
    path.join(root, 'app/src/main/res/xml/preferences_markdown_dialects.xml'),
    'utf8'
  );
  const activity = fs.readFileSync(
    path.join(root, 'app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'),
    'utf8'
  );

  assert.match(arrays, /<string-array name="pref_editor_mode_values">[\s\S]*?<item>rendered<\/item>[\s\S]*?<item>source<\/item>[\s\S]*?<\/string-array>/);
  assert.doesNotMatch(
    arrays.match(/<string-array name="pref_editor_mode_values">[\s\S]*?<\/string-array>/)?.[0] || '',
    /live_preview|wysiwyg/
  );
  assert.match(arrays, /<string-array name="pref_syntax_exposure_values">[\s\S]*?<item>hidden<\/item>[\s\S]*?<item>caret<\/item>[\s\S]*?<item>line<\/item>[\s\S]*?<item>block<\/item>[\s\S]*?<\/string-array>/);
  assert.match(preferences, /pref_editor_mode[\s\S]*?defaultValue="rendered"/);
  assert.match(dialectSettings, /pref_markdown_syntax_exposure[\s\S]*?defaultValue="hidden"/);
  assert.ok(activity.includes(
    'if (previousMode == "live_preview") "caret" else "hidden"'
  ));
});
