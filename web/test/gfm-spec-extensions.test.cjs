const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/gfm-0.29-extensions.json'),
  'utf8'
));

test('GFM 0.29 non-HTML extension examples expose expected parser semantics', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { syntaxTree } = await import('@codemirror/language');
  const { Autolink, Table, TaskList } = await import('@lezer/markdown');
  const { wmdxGfmFtpAutolink } = await import('../src/gfm-autolink.mjs');
  const { wmdxGfmStrikethrough } = await import('../src/gfm-strikethrough.mjs');
  const { wmdxCommonMarkCompatibility } = await import('../src/commonmark-compat.mjs');
  const { getMarkdownLinkInfo } = await import('../src/markdown-link-utils.mjs');
  const extensions = [
    Autolink,
    Table,
    TaskList,
    wmdxGfmFtpAutolink,
    wmdxGfmStrikethrough,
    wmdxCommonMarkCompatibility
  ];

  assert.equal(fixture.specification, 'GitHub Flavored Markdown 0.29');
  assert.equal(fixture.examples.length, 21);

  for (const example of fixture.examples) {
    const state = EditorState.create({
      doc: example.markdown,
      extensions: [markdown({ extensions })]
    });
    const actual = {
      tables: 0,
      strikethrough: 0,
      autolinks: 0
    };
    const urlNodes = [];

    syntaxTree(state).iterate({
      enter(node) {
        if (node.name === 'Table') actual.tables++;
        if (node.name === 'Strikethrough') actual.strikethrough++;
        if (node.name === 'URL') {
          actual.autolinks++;
          urlNodes.push({
            name: node.name,
            from: node.from,
            to: node.to
          });
        }
      }
    });

    assert.deepEqual(
      actual,
      example.expected,
      `GFM ${example.section} example ${example.number}`
    );

    if (example.number === 628) {
      const ftpNode = urlNodes.find(node =>
        state.doc.sliceString(node.from, node.to).startsWith('ftp://')
      );
      assert.ok(
        ftpNode,
        `GFM example 628 parses its FTP autolink; found: ${
          urlNodes.map(node =>
            state.doc.sliceString(node.from, node.to)
          ).join(', ')
        }`
      );
      assert.equal(
        getMarkdownLinkInfo(ftpNode, state.doc)?.target,
        'ftp://foo.bar.baz',
        'the FTP autolink remains an openable external link'
      );
    }
  }
});

test('GFM raw-HTML tag-filter example remains outside the native parser corpus', () => {
  assert.deepEqual(
    fixture.excludedExamples.map(({ number, extension, reason }) => ({
      number,
      extension,
      reason
    })),
    [{
      number: 651,
      extension: 'tagfilter',
      reason: "Raw HTML tag filtering is tracked under Wmdx's no-HTML compatibility policy."
    }]
  );
});
