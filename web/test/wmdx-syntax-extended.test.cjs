const test = require('node:test');
const assert = require('node:assert/strict');

test('Wmdx superscript and subscript parse in markdown state', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { syntaxTree } = await import('@codemirror/language');
  const { wmdxSubSuperExtension } = await import('../src/wmdxSubSuper.mjs');

  const doc = 'E=mc^2^ and H~2~O';
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [wmdxSubSuperExtension] })]
  });

  const tree = syntaxTree(state);
  const nodes = [];
  tree.iterate({
    enter(node) {
      nodes.push(node.name);
    }
  });

  assert.ok(nodes.includes('Superscript'), 'should recognize Superscript node');
  assert.ok(nodes.includes('Subscript'), 'should recognize Subscript node');
});

test('Wmdx and Obsidian comments parse in markdown state', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { markdown } = await import('@codemirror/lang-markdown');
  const { syntaxTree } = await import('@codemirror/language');
  const { wmdxCommentsExtension } = await import('../src/wmdxComments.mjs');

  const doc = 'Text /* inline comment */ and %% obsidian comment %%';
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [wmdxCommentsExtension] })]
  });

  const tree = syntaxTree(state);
  const nodes = [];
  tree.iterate({
    enter(node) {
      nodes.push(node.name);
    }
  });

  assert.ok(nodes.includes('Comment'), 'should recognize Comment node');
});
