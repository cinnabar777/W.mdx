const test = require('node:test');
const assert = require('node:assert/strict');

test('Setext heading underlines are not interpreted as Wmdx highlight or pen syntax', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { getWmdxColorSyntaxRanges } = await import('../src/markdownFormatting.js');
  const doc = [
    'Setext ==heading==',
    '==================',
    '',
    'Ordinary ==highlight== and =pen= remain formatted.'
  ].join('\n');
  const state = EditorState.create({ doc, extensions: [markdown()] });

  const ranges = getWmdxColorSyntaxRanges(state);
  const rangeText = ranges.map(range => doc.slice(range.wrapperFrom, range.wrapperTo));
  const rangeLines = ranges.map(range => state.doc.lineAt(range.wrapperFrom).number);

  assert.ok(rangeText.includes('==heading=='), 'highlight syntax in the heading text should remain supported');
  assert.ok(rangeText.includes('==highlight=='), 'ordinary highlight syntax should remain supported');
  assert.ok(rangeText.includes('=pen='), 'ordinary pen syntax should remain supported');
  assert.ok(!rangeLines.includes(2), 'the Setext level-one delimiter must not receive color decorations');

  const underlineOnly = getWmdxColorSyntaxRanges(state, {
    from: state.doc.line(2).from,
    to: state.doc.line(2).to
  });
  assert.deepEqual(underlineOnly, [], 'partial visible-range scans must also skip the Setext delimiter');
});
