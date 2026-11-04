const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { syntaxTree } = require('@codemirror/language');
const { Autolink } = require('@lezer/markdown');

const projectFile = relativePath =>
  fs.readFileSync(path.join(__dirname, '../../', relativePath), 'utf8');

test('CommonMark reference links and CommonMark/GFM autolinks resolve targets', async () => {
  const {
    collectMarkdownReferenceTargets,
    getMarkdownLinkInfo
  } = await import('../src/markdown-link-utils.mjs');
  const source = [
    'Read [the specification][commonmark-spec].',
    '[inline link](https://example.com/inline)',
    '<https://commonmark.org/>',
    '<reader@example.com>',
    'www.commonmark.org https://github.com/ reader@example.com',
    '',
    '[commonmark-spec]: https://spec.commonmark.org/0.31.2/'
  ].join('\n');
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ extensions: [Autolink] })]
  });
  const tree = syntaxTree(state);
  const targets = collectMarkdownReferenceTargets(state.doc, tree);
  const resolvedLinks = [];

  tree.iterate({
    enter(node) {
      if (!['Link', 'Autolink', 'URL'].includes(node.name)) return;
      const raw = state.doc.sliceString(node.from, node.to);
      if (node.name === 'URL' && !raw.includes('@') && !raw.startsWith('www.')) return;
      const info = getMarkdownLinkInfo(node, state.doc, targets);
      if (info) resolvedLinks.push({ raw, target: info.target });
    }
  });

  assert.deepEqual(targets.get('commonmark-spec'), 'https://spec.commonmark.org/0.31.2/');
  assert.ok(resolvedLinks.some(link =>
    link.raw === '[the specification][commonmark-spec]' &&
    link.target === 'https://spec.commonmark.org/0.31.2/'
  ));
  assert.ok(resolvedLinks.some(link =>
    link.raw === '<https://commonmark.org/>' &&
    link.target === 'https://commonmark.org/'
  ));
  assert.ok(resolvedLinks.some(link =>
    link.raw === '<reader@example.com>' &&
    link.target === 'mailto:reader@example.com'
  ));
  assert.ok(resolvedLinks.some(link =>
    link.raw === 'www.commonmark.org' &&
    link.target === 'https://www.commonmark.org'
  ));
  assert.ok(resolvedLinks.some(link =>
    link.raw === 'reader@example.com' &&
    link.target === 'mailto:reader@example.com'
  ));
});

test('rendering and interaction regressions stay covered without changing table editing', () => {
  const main = projectFile('web/src/main.js');
  const activity = projectFile('app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const styles = projectFile('web/index.html');

  assert.match(main, /node\.name === 'LinkReference'/);
  assert.match(main, /node\.name === 'Autolink'/);
  assert.match(main, /new WikilinkWidget\([\s\S]*?embeddedDocumentSourceFacet/);
  assert.match(main, /openMarkdownLink\?\.\(/);
  assert.match(main, /activeSelectionDragView = this\.view/);
  assert.match(main, /window\.addEventListener\('pointermove', onGlobalPointerMove, true\)/);
  assert.doesNotMatch(main, /EmptyLineCursorAnchorWidget|emptyLineCursorAnchorWidget/);

  assert.match(activity, /fun openMarkdownLink\(/);
  assert.match(activity, /resolveExternalEmbeddedDocumentUri\(parentUri, relativePath\)/);
  assert.match(activity, /resolveEmbeddedDocumentTarget\(relativePath, sourceContextJson\)/);
  assert.match(activity, /showUnsavedChangesDialog\(openLinkedFile\)/);

  assert.match(styles, /cm-link-reference-definition\s*\{\s*display:\s*none/);
  assert.match(styles, /--blockquote-depth-offset/);
  assert.match(styles, /margin-left:\s*calc\([\s\S]*?blockquote-depth-offset/);
  assert.match(main, /Table cell\/editing|Table rendering in WYSIWYG/);
});

test('phone fixture states the manual expected behavior and its limited coverage', () => {
  const fixture = projectFile('Documentation/Markdown-Phone-Test.md');
  assert.match(fixture, /visual smoke test/i);
  assert.match(fixture, /reference-link syntax and its definition should be hidden/i);
  assert.match(fixture, /nested quote.*indent/i);
  assert.match(fixture, /tap.*automatic links/i);
});
