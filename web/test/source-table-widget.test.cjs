const { test } = require('node:test');
const assert = require('node:assert/strict');

test('source table widget equality retains its child editor during parent edits', async () => {
  const { SourceTableWidget } = await import('../src/sourceTableWidget.js');
  const language = {};
  const highlightStyle = {};
  const before = new SourceTableWidget({
    markdown: '| A |\n| --- |\n| B |',
    from: 10,
    to: 35,
    language,
    highlightStyle
  });
  const afterTyping = new SourceTableWidget({
    markdown: '| A |\n| --- |\n| B edited |',
    from: 10,
    to: 42,
    language,
    highlightStyle
  });

  assert.equal(
    before.eq(afterTyping),
    true,
    'content and range changes are synchronized through updateDOM without recreating the editor'
  );
});

test('source table widget equality recreates only when its editor configuration changes', async () => {
  const { SourceTableWidget } = await import('../src/sourceTableWidget.js');
  const language = {};
  const highlightStyle = {};
  const base = new SourceTableWidget({
    markdown: '| A |',
    from: 0,
    to: 5,
    language,
    highlightStyle
  });

  assert.equal(base.eq(new SourceTableWidget({
    markdown: '| B |',
    from: 0,
    to: 5,
    language,
    highlightStyle,
    horizontalScrollEnabled: false
  })), false);
  assert.equal(base.eq(new SourceTableWidget({
    markdown: '| B |',
    from: 0,
    to: 5,
    language: {},
    highlightStyle
  })), false);
});
