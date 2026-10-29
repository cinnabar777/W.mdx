const test = require('node:test');
const assert = require('node:assert/strict');

test('live underline rendering can hide the complete Wmdx open and close markers', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const {
    getWmdxUnderlineSyntaxRanges,
    getWmdxUnderlineSyntaxDelimiterRanges,
    setWmdxUnderlineSyntaxEnabled
  } = await import('../src/markdownFormatting.js');

  setWmdxUnderlineSyntaxEnabled(true);
  try {
    const state = EditorState.create({
      doc: '_solid_ _₀dotted_',
      extensions: [markdown()]
    });
    const ranges = getWmdxUnderlineSyntaxRanges(state);
    assert.equal(ranges.length, 2);
    assert.deepEqual(
      ranges.map(range =>
        getWmdxUnderlineSyntaxDelimiterRanges(range)
          .map(({ from, to }) => state.doc.sliceString(from, to))
      ),
      [['_', '_'], ['_₀', '_']]
    );
  } finally {
    setWmdxUnderlineSyntaxEnabled(false);
  }
});
