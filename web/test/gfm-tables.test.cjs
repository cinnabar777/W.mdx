const test = require('node:test');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { syntaxTree } = require('@codemirror/language');
const { GFM, Table } = require('@lezer/markdown');

// Small source cases based on GFM specification examples 198–205:
// https://github.github.com/gfm/#tables-extension-
function getParsedNodes(source) {
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ extensions: [GFM, Table] })]
  });
  const tables = [];
  const nodeNames = new Set();
  syntaxTree(state).iterate({
    enter(node) {
      nodeNames.add(node.name);
      if (node.name === 'Table') {
        tables.push({
          from: node.from,
          to: node.to,
          text: state.doc.sliceString(node.from, node.to)
        });
      }
    }
  });
  return { tables, nodeNames };
}

test('official GFM table examples preserve cell counts, alignment, and text through save and reopen', async () => {
  const { TableModel } = await import('../src/tableModule.js');
  const examples = [
    {
      number: 198,
      source: '| foo | bar |\n| --- | --- |\n| baz | bim |',
      rows: [['foo', 'bar'], ['baz', 'bim']],
      alignments: ['left', 'left']
    },
    {
      number: 199,
      source: '| abc | defghi |\n:-: | -----------:\nbar | baz',
      rows: [['abc', 'defghi'], ['bar', 'baz']],
      alignments: ['center', 'right']
    },
    {
      number: 200,
      source: '| f\\|oo  |\n| ------ |\n| b `\\|` az |\n| b **\\|** im |',
      rows: [['f\\|oo'], ['b `\\|` az'], ['b **\\|** im']],
      alignments: ['left']
    },
    {
      number: 201,
      source: '| abc | def |\n| --- | --- |\n| bar | baz |\n> bar',
      rows: [['abc', 'def'], ['bar', 'baz']],
      alignments: ['left', 'left']
    },
    {
      number: 202,
      source: '| abc | def |\n| --- | --- |\n| bar | baz |\nbar\n\nbar',
      rows: [['abc', 'def'], ['bar', 'baz'], ['bar', '']],
      alignments: ['left', 'left']
    },
    {
      number: 204,
      source: '| abc | def |\n| --- | --- |\n| bar |\n| bar | baz | boo |',
      rows: [['abc', 'def'], ['bar', ''], ['bar', 'baz']],
      alignments: ['left', 'left']
    },
    {
      number: 205,
      source: '| abc | def |\n| --- | --- |',
      rows: [['abc', 'def']],
      alignments: ['left', 'left']
    }
  ];

  for (const example of examples) {
    const parsed = getParsedNodes(example.source);
    assert.equal(parsed.tables.length, 1, `GFM example ${example.number} has one table`);
    const tableText = parsed.tables[0].text;
    const model = TableModel.parse(tableText);
    assert.ok(model, `GFM example ${example.number} is accepted by the table model`);
    assert.deepEqual(model.rows, example.rows, `GFM example ${example.number} has the expected cells`);
    assert.deepEqual(
      model.alignments,
      example.alignments,
      `GFM example ${example.number} has the expected alignments`
    );

    const savedMarkdown = model.toMarkdown();
    const reopenedTables = getParsedNodes(savedMarkdown).tables;
    assert.equal(reopenedTables.length, 1, `GFM example ${example.number} saves as a table`);
    const reopenedModel = TableModel.parse(reopenedTables[0].text);
    assert.ok(reopenedModel, `GFM example ${example.number} reopens`);
    assert.deepEqual(reopenedModel.rows, example.rows, `GFM example ${example.number} keeps its cells`);
    assert.deepEqual(
      reopenedModel.alignments,
      example.alignments,
      `GFM example ${example.number} keeps its alignment`
    );
  }
});

test('GFM table parsing keeps block quotes outside tables and rejects mismatched headers', () => {
  const blockquoteSource = '| abc | def |\n| --- | --- |\n| bar | baz |\n> bar';
  const parsed = getParsedNodes(blockquoteSource);
  assert.equal(parsed.tables.length, 1);
  assert.equal(
    parsed.tables[0].text,
    '| abc | def |\n| --- | --- |\n| bar | baz |',
    'the table ends before the following block quote'
  );
  assert.ok(parsed.nodeNames.has('Blockquote'));

  const mismatchedHeader = '| abc | def |\n| --- |\n| bar |';
  assert.equal(
    getParsedNodes(mismatchedHeader).tables.length,
    0,
    'a header with a different number of cells from the delimiter is not a GFM table'
  );
});

test('an escaped pipe at row end remains content, not the table closing boundary', async () => {
  const {
    TableModel,
    getUnescapedPipeOffsets,
    hasTrailingUnescapedPipe
  } = await import('../src/tableModule.js');
  const rowWithoutClosingPipe = '| Alpha | literal \\|   ';
  const offsets = getUnescapedPipeOffsets(rowWithoutClosingPipe);

  assert.equal(
    hasTrailingUnescapedPipe(rowWithoutClosingPipe, offsets),
    false,
    'an escaped pipe followed only by whitespace is cell content'
  );
  assert.equal(
    hasTrailingUnescapedPipe('| Alpha | literal \\| |', getUnescapedPipeOffsets('| Alpha | literal \\| |')),
    true,
    'an unescaped pipe after the cell content is the closing boundary'
  );

  const model = TableModel.parse([
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | literal \\|'
  ].join('\n'));
  assert.deepEqual(model?.rows[1], ['Alpha', 'literal \\|']);

  const mainSource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/main.js'),
    'utf8'
  );
  assert.match(
    mainSource,
    /const hasTrailingPipe = hasTrailingUnescapedPipe\(text, pipeOffsets\)/,
    'WYSIWYG table navigation uses escape-aware trailing-pipe detection'
  );
});
