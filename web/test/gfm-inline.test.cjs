const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '../../', relativePath), 'utf8');
}

const gfmInlineExamples = [
  '- [ ] foo',
  '- [X] bar',
  '  - [ ] baz',
  '',
  '~~Hi~~ Hello, there world!',
  'This will ~~~not~~~ strike.',
  'www.commonmark.org.',
  'Visit https://commonmark.org/help.',
  'foo@bar.example.com',
  'ftp://foo.bar.baz.'
].join('\n');

async function createEditorState(markdownText, {
  embedded,
  gfmExtensions = true,
  wmdxSubscript = true
}) {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { Autolink, Table, TaskList } = await import('@lezer/markdown');
  const { wmdxGfmFtpAutolink } = await import('../src/gfm-autolink.mjs');
  const { createWmdxGfmTildeExtension } =
    await import('../src/gfm-strikethrough.mjs');
  const { wmdxCommonMarkCompatibility } = await import('../src/commonmark-compat.mjs');
  const extensions = [];
  if (gfmExtensions) {
    extensions.push(
      Autolink,
      ...(!embedded ? [Table] : []),
      TaskList,
      wmdxGfmFtpAutolink
    );
  }
  if (gfmExtensions || wmdxSubscript) {
    extensions.push(createWmdxGfmTildeExtension({
      gfmStrikethrough: gfmExtensions,
      wmdxSubscript
    }));
  }
  extensions.push(wmdxCommonMarkCompatibility);

  return EditorState.create({
    doc: markdownText,
    extensions: [markdown({ extensions })]
  });
}

function collectNodes(state, syntaxTree) {
  const nodes = [];
  const source = state.doc.toString();
  syntaxTree(state).iterate({
    enter(node) {
      nodes.push({
        name: node.name,
        from: node.from,
        to: node.to,
        text: source.slice(node.from, node.to)
      });
    }
  });
  return nodes;
}

for (const embedded of [false, true]) {
  const editorName = embedded ? 'embedded editor' : 'main editor';

  test(`${editorName} follows GFM task, strikethrough, and autolink examples through edit and reopen`, async () => {
    const { syntaxTree } = await import('@codemirror/language');
    const state = await createEditorState(gfmInlineExamples, { embedded });
    let nodes = collectNodes(state, syntaxTree);

    assert.equal(nodes.filter(node => node.name === 'TaskMarker').length, 3);
    assert.deepEqual(
      nodes.filter(node => node.name === 'Strikethrough').map(node => node.text),
      ['~~Hi~~']
    );
    assert.deepEqual(
      nodes.filter(node => node.name === 'URL').map(node => node.text),
      [
        'www.commonmark.org',
        'https://commonmark.org/help',
        'foo@bar.example.com',
        'ftp://foo.bar.baz'
      ]
    );
    assert.equal(state.doc.toString(), gfmInlineExamples);

    const unchecked = nodes.find(node =>
      node.name === 'TaskMarker' && node.text === '[ ]'
    );
    const toggledState = state.update({
      changes: {
        from: unchecked.from + 1,
        to: unchecked.to - 1,
        insert: 'x'
      }
    }).state;
    const savedMarkdown = toggledState.doc.toString();
    const reopenedState = await createEditorState(savedMarkdown, { embedded });
    nodes = collectNodes(reopenedState, syntaxTree);

    assert.match(savedMarkdown, /^- \[x\] foo/m);
    assert.equal(nodes.filter(node => node.name === 'TaskMarker').length, 3);
    assert.deepEqual(
      nodes.filter(node => node.name === 'Strikethrough').map(node => node.text),
      ['~~Hi~~']
    );
    assert.deepEqual(
      nodes.filter(node => node.name === 'URL').map(node => node.text),
      [
        'www.commonmark.org',
        'https://commonmark.org/help',
        'foo@bar.example.com',
        'ftp://foo.bar.baz'
      ]
    );
  });
}

test('single tilde is Wmdx subscript, not GFM strikethrough', async () => {
  const { syntaxTree } = await import('@codemirror/language');
  const state = await createEditorState(
    '~sub~ ~~strike~~ \\~literal\\~ `~code~` ~~~literal~~~',
    { embedded: false }
  );
  const nodes = collectNodes(state, syntaxTree);

  assert.deepEqual(
    nodes.filter(node => node.name === 'Subscript').map(node => node.text),
    ['~sub~']
  );
  assert.deepEqual(
    nodes.filter(node => node.name === 'Strikethrough').map(node => node.text),
    ['~~strike~~']
  );
});

test('GFM-only parses double-tilde strikethrough but leaves single tildes literal', async () => {
  const { syntaxTree } = await import('@codemirror/language');
  const state = await createEditorState('~literal~ ~~strike~~', {
    embedded: false,
    gfmExtensions: true,
    wmdxSubscript: false
  });
  const nodes = collectNodes(state, syntaxTree);
  assert.equal(nodes.some(node => node.name === 'Subscript'), false);
  assert.deepEqual(
    nodes.filter(node => node.name === 'Strikethrough').map(node => node.text),
    ['~~strike~~']
  );
});

test('Wmdx subscript remains independently selectable with GFM extensions off', async () => {
  const { syntaxTree } = await import('@codemirror/language');
  const state = await createEditorState('~sub~ ~~literal~~', {
    embedded: false,
    gfmExtensions: false,
    wmdxSubscript: true
  });
  const nodes = collectNodes(state, syntaxTree);
  assert.deepEqual(
    nodes.filter(node => node.name === 'Subscript').map(node => node.text),
    ['~sub~']
  );
  assert.equal(nodes.some(node => node.name === 'Strikethrough'), false);
});

test('CommonMark-only leaves GFM and Wmdx tilde forms literal', async () => {
  const { syntaxTree } = await import('@codemirror/language');
  const state = await createEditorState('~literal~ ~~literal~~', {
    embedded: false,
    gfmExtensions: false,
    wmdxSubscript: false
  });
  const nodes = collectNodes(state, syntaxTree);
  assert.equal(nodes.some(node =>
    node.name === 'Subscript' || node.name === 'Strikethrough'
  ), false);
});

test('main and embedded parser configurations use explicit GFM extensions', () => {
  const source = readProjectFile('web/src/main.js');
  assert.match(
    source,
    /if \(gfmExtensionsEnabled\) \{\s*extensions\.push\(\s*GFMAutolink,\s*GFMTaskList,\s*createWmdxGfmTildeExtension\(\{[\s\S]*?wmdxSubscript:\s*wmdxSubscriptEnabled[\s\S]*?wmdxGfmFtpAutolink\s*\);[\s\S]*?if \(includeTables\) extensions\.push\(GFMTable\);/
  );
  assert.match(
    source,
    /markdownLanguageCompartment\.of\(\s*createMarkdownLanguageExtension\(true\)\s*\)/
  );
  assert.match(
    source,
    /markdownLanguageCompartment\.of\(createMarkdownLanguageExtension\(\)\)/
  );
});

test('Android Markdown open, save, and Save As use the tested UTF-8 file codec', () => {
  const activity = readProjectFile('app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  assert.match(activity, /MarkdownTextFileCodec\.read\(inputStream\)/);
  assert.match(activity, /MarkdownTextFileCodec\.prepareForSave\(/);
  assert.match(activity, /MarkdownTextFileCodec\.write\(outputStream, markdownText\)/);
});
