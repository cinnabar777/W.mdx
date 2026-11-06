const test = require('node:test');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { Table, TaskList } = require('@lezer/markdown');

async function fixture(doc, preferences = {}) {
  const [layout, lists, headings, callouts, quotes, commonmark] = await Promise.all([
    import('../src/markdownDocumentLayout.js'), import('../src/listSyntax.mjs'),
    import('../src/headingSyntax.mjs'), import('../src/calloutSyntax.mjs'),
    import('../src/blockquoteSyntax.mjs'), import('../src/commonmark-compat.mjs')
  ]);
  const state = EditorState.create({
    doc, extensions: [markdown({ extensions: [Table, TaskList, commonmark.wmdxCommonMarkCompatibility] })]
  });
  const settings = {
    list: lists.normalizeListSyntaxSettings(preferences),
    heading: headings.normalizeHeadingSyntaxSettings(preferences),
    callout: callouts.normalizeCalloutSyntaxSettings(preferences),
    blockquote: quotes.normalizeBlockquoteSyntaxSettings(preferences)
  };
  return { state, settings, ...layout };
}

test('one mode-independent semantic model covers the entire mixed document', async () => {
  const source = '# Heading\n\nParagraph\nsoft continuation.\n\n> Quote\nlazy quote continuation\n\n- Parent\n  - Child\n\n    continuation\n\n```js\n- literal, not a list\n```\n\n    indented code\n\n| Head | Other |\n| --- | --- |\n| Cell | Value |\n\nA. Native item\nB. Next item\n\n[ ] Native task';
  const f = await fixture(source);
  const model = f.getMarkdownDocumentLayout(f.state, f.settings);
  const byText = text => [...model.lines.values()].find(line => f.state.doc.line(line.number).text === text);
  assert.equal(byText('# Heading').kind, 'heading');
  assert.equal(byText('Paragraph').kind, 'paragraph');
  assert.ok(byText('Paragraph').classes.has('cm-paragraph-first'));
  assert.ok(byText('soft continuation.').classes.has('cm-paragraph-last'));
  assert.equal(byText('> Quote').quoteDepth, 1);
  assert.equal(byText('lazy quote continuation').quoteDepth, 1);
  assert.equal(byText('- Parent').kind, 'list');
  assert.equal(byText('  - Child').listDepth, 1);
  assert.equal(byText('    continuation').kind, 'list-continuation');
  assert.equal(byText('- literal, not a list').kind, 'code');
  assert.ok(!byText('- literal, not a list').classes.has('cm-list-item'));
  assert.equal(model.codeBlocks.length, 2);
  assert.equal(model.tables.length, 1);
  assert.equal(byText('A. Native item').kind, 'list');
  assert.equal(byText('[ ] Native task').kind, 'list');
  for (const mode of ['source', 'live_preview', 'wysiwyg']) {
    assert.strictEqual(f.getMarkdownDocumentLayout(f.state, f.settings), model);
    assert.equal(f.markdownPresentation(mode).raw, mode === 'source');
    assert.equal(f.markdownPresentation(mode).renderedTables, mode !== 'source');
  }
  assert.equal(f.state.doc.toString(), source);
});

test('top-level optional spaces are not nesting; nested syntax is semantic', async () => {
  for (let spaces = 0; spaces <= 3; spaces++) {
    const f = await fixture(' '.repeat(spaces) + '- Top-level\n' + ' '.repeat(spaces + 2) + '- Nested');
    const lines = [...f.getMarkdownDocumentLayout(f.state, f.settings).lines.values()];
    assert.equal(lines[0].listDepth, 0);
    assert.ok(lines[0].styles.includes('--list-depth-offset:0px'));
    assert.equal(lines[1].listDepth, 1);
  }
});

test('selection reuses semantics, while edits and syntax preferences invalidate it', async () => {
  const f = await fixture('- Item\n\nTail');
  const first = f.getMarkdownDocumentLayout(f.state, f.settings);
  const selected = f.state.update({ selection: { anchor: 3 } }).state;
  assert.strictEqual(f.getMarkdownDocumentLayout(selected, f.settings), first);
  const changed = f.state.update({ changes: { from: 0, to: 1, insert: '#' } }).state;
  assert.notStrictEqual(f.getMarkdownDocumentLayout(changed, f.settings), first);
  const disabled = { ...f.settings, list: { ...f.settings.list, enabled: false } };
  const model = f.getMarkdownDocumentLayout(f.state, disabled);
  assert.ok([...model.lines.values()].every(line => !line.classes.has('cm-list-item')));
});

test('Wmdx list continuation and every ordered style use the same semantic roles', async () => {
  for (const marker of ['1.', '1)', 'a.', 'A.', 'i.', 'I.', '[ ]', '- [ ]', '+', '*']) {
    const f = await fixture(`${marker} Item\n  continuation`);
    const lines = [...f.getMarkdownDocumentLayout(f.state, f.settings).lines.values()];
    assert.equal(lines[0].kind, 'list', marker);
    assert.ok(lines[0].marker && lines[0].contentFrom > lines[0].marker.from, marker);
    assert.equal(lines[1].kind, 'list-continuation', marker);
  }
});

test('callout metadata and lazy quote lines share one owner', async () => {
  const f = await fixture('> [!note]+ Title\n> Body\n> > Nested quote\n\nOutside\n\n±tip Native\n  Native body');
  const model = f.getMarkdownDocumentLayout(f.state, f.settings);
  assert.equal(model.calloutOpeners.size, 2);
  const first = model.calloutOpeners.get(0);
  assert.equal(first.type, 'note');
  assert.equal(first.foldMarker, '+');
  assert.equal(first.customTitle, 'Title');
  assert.ok(first.bodyTo > first.bodyFrom);
  assert.equal(model.lines.get(f.state.doc.line(2).from).callout.type, 'note');
  assert.equal(model.lines.get(f.state.doc.line(5).from).callout, null);
});

test('plain-text edit mapping matches a complete semantic rebuild', async () => {
  const f = await fixture('Paragraph words.\n\n# Heading\n\n- Item\n\n```js\ncode\n```\n\n| H | H |\n| --- | --- |\n| V | V |');
  const previous = f.getMarkdownDocumentLayout(f.state, f.settings);
  const transaction = f.state.update({ changes: { from: 10, insert: 'more ' } });
  const mapped = f.mapMarkdownDocumentLayout(previous, transaction, f.settings);
  const rebuilt = f.buildMarkdownDocumentLayout(transaction.state, f.settings);
  const serialize = model => ({
    blocks: model.blocks.map(({ kind, from, to }) => ({ kind, from, to })),
    lines: [...model.lines.values()].map(line => ({
      from: line.from, to: line.to, kind: line.kind,
      marker: line.marker, contentFrom: line.contentFrom, indentTo: line.indentTo,
      classes: [...line.classes], styles: line.styles
    })),
    tables: model.tables.map(({ from, to }) => ({ from, to })),
    codes: model.codeBlocks.map(({ from, to, indent }) => ({ from, to, indent }))
  });
  assert.deepEqual(serialize(mapped), serialize(rebuilt));
  assert.strictEqual(f.getMarkdownDocumentLayout(transaction.state, f.settings), mapped);
});
