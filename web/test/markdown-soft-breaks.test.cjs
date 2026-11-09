const assert = require('node:assert/strict');
const test = require('node:test');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');

test('soft breaks are limited to paragraph line endings, including quote and list text', async () => {
  const { collectMarkdownSoftBreaks } =
    await import('../src/markdownDocumentLayout.js');
  const source = [
    'Paragraph first line',
    'paragraph second line.',
    '',
    '> Quoted first line',
    '> quoted second line.',
    '',
    '- List first line',
    '  list continuation.'
  ].join('\n');
  const state = EditorState.create({ doc: source, extensions: [markdown()] });

  const breaks = collectMarkdownSoftBreaks(state);
  assert.deepEqual(
    breaks.map(({ from, to, lineFrom, nextLineFrom }) => ({
      text: state.doc.sliceString(from, to),
      lineFrom,
      nextLineFrom
    })),
    [
      { text: '\n', lineFrom: 0, nextLineFrom: 21 },
      { text: '\n', lineFrom: 45, nextLineFrom: 65 },
      { text: '\n', lineFrom: 88, nextLineFrom: 106 }
    ]
  );
});

test('hard breaks, block boundaries, headings, and fenced code are not soft breaks', async () => {
  const { collectMarkdownSoftBreaks } =
    await import('../src/markdownDocumentLayout.js');
  const source = [
    'Soft line one',
    'soft line two',
    'Hard break  ',
    'next hard line',
    '',
    'Setext heading',
    '---------------',
    '',
    '```text',
    'code line one',
    'code line two',
    '```'
  ].join('\n');
  const state = EditorState.create({ doc: source, extensions: [markdown()] });

  assert.deepEqual(
    collectMarkdownSoftBreaks(state).map(({ from, to }) =>
      state.doc.sliceString(from, to)
    ),
    ['\n', '\n']
  );
});

test('Wmdx-only list markers are not mistaken for paragraph soft breaks', async () => {
  const { collectMarkdownSoftBreaks, buildMarkdownDocumentLayout } =
    await import('../src/markdownDocumentLayout.js');
  const { DEFAULT_LIST_SYNTAX_SETTINGS } = await import('../src/listSyntax.mjs');
  const source = 'a. First item\nb. Second item';
  const state = EditorState.create({ doc: source, extensions: [markdown()] });
  const layout = buildMarkdownDocumentLayout(state, {
    list: DEFAULT_LIST_SYNTAX_SETTINGS
  });

  assert.deepEqual(
    collectMarkdownSoftBreaks(state, undefined, layout),
    [],
    'custom alpha markers begin separate list items'
  );
});
