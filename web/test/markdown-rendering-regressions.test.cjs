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
    '[unsafe](javascript:alert(1))',
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
  let unsafeLinkInfo = 'not-found';

  tree.iterate({
    enter(node) {
      if (!['Link', 'Autolink', 'URL'].includes(node.name)) return;
      const raw = state.doc.sliceString(node.from, node.to);
      if (node.name === 'URL' && !raw.includes('@') && !raw.startsWith('www.')) return;
      const info = getMarkdownLinkInfo(node, state.doc, targets);
      if (node.name === 'Link' && raw.startsWith('[unsafe]')) unsafeLinkInfo = info;
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
  assert.equal(unsafeLinkInfo, null);
});

test('rendering and interaction regressions stay covered without changing table editing', () => {
  const main = projectFile('web/src/main.js');
  const activity = projectFile('app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const styles = projectFile('web/index.html');
  const heightMapStart = main.indexOf('function buildHeightMapValue(state)');
  const heightMapEnd = main.indexOf('const heightMapField =', heightMapStart);
  const heightMapBuilder = main.slice(heightMapStart, heightMapEnd);

  assert.match(main, /node\.name === 'LinkReference'/);
  assert.match(main, /node\.name === 'Autolink'/);
  assert.match(main, /tagName: 'a'[\s\S]*?'data-wmdx-link-target'/);
  assert.match(main, /a\.cm-link\[data-wmdx-link-target\]/);
  assert.match(main, /new WikilinkWidget\([\s\S]*?embeddedDocumentSourceFacet/);
  assert.match(main, /markdownLinkClickHandler = event =>/);
  assert.match(main, /nativeBridge\.openMarkdownLink\(/);
  assert.match(main, /const isBlockquoteLine = insideBlockquote \|\| Boolean\(quotePrefix\)/);
  assert.match(main, /activeSelectionDragView = this\.view/);
  assert.match(main, /window\.addEventListener\('pointermove', onGlobalPointerMove, true\)/);
  assert.doesNotMatch(main, /EmptyLineCursorAnchorWidget|emptyLineCursorAnchorWidget/);
  assert.notEqual(heightMapEnd, -1);
  assert.match(heightMapBuilder, /node\.name === 'LinkReference'/);
  assert.match(heightMapBuilder, /node\.name === 'Autolink'/);
  assert.match(heightMapBuilder, /getMarkdownLinkInfo\(node, doc, linkReferenceTargets\)/);

  assert.match(activity, /fun openMarkdownLink\(/);
  assert.match(activity, /resolveExternalEmbeddedDocumentUri\(parentUri, relativePath\)/);
  assert.match(activity, /resolveEmbeddedDocumentTarget\(relativePath, sourceContextJson\)/);
  assert.match(activity, /showUnsavedChangesDialog\(openLinkedFile\)/);

  assert.match(styles, /cm-link-reference-definition\s*\{\s*display:\s*none/);
  assert.match(styles, /--blockquote-depth-offset/);
  assert.match(styles, /margin-left:\s*calc\([\s\S]*?blockquote-depth-offset/);
  assert.match(styles, /cm-line\.cm-blockquote\[data-blockquote-depth\][\s\S]*?::before/);
  assert.match(styles, /left:\s*calc\([\s\S]*blockquote-depth-offset[\s\S]*blockquote-border-width/);
  assert.match(styles, /cm-paragraph-first\.cm-blockquote[\s\S]*?padding-top:/);
  assert.match(styles, /cm-paragraph-last\.cm-blockquote[\s\S]*?padding-bottom:/);
  assert.match(main, /paragraphIndentByLine/);
  assert.match(main, /--source-indent-offset:/);
  assert.match(styles, /cm-source-indented\.cm-paragraph[\s\S]*?text-indent:\s*calc\(0px - var\(--source-line-indent-offset/);
  assert.match(styles, /cm-source-indented\.cm-paragraph\.cm-blockquote[\s\S]*?blockquote-depth-offset[\s\S]*source-indent-offset/);
  assert.match(main, /Table cell\/editing|Table rendering in WYSIWYG/);
});

test('phone fixture states the manual expected behavior and its limited coverage', () => {
  const fixture = projectFile('Documentation/Markdown-Phone-Test.md');
  assert.match(fixture, /visual smoke test/i);
  assert.match(fixture, /inline and reference-link source syntax should be hidden/i);
  assert.match(fixture, /outer quote border should continue/i);
  assert.match(fixture, /nested quote.*indent/i);
  assert.match(fixture, /up to three leading spaces before its markers\s+should stay flat/i);
  assert.match(fixture, /> - A list item inside a block quote/);
  assert.match(fixture, /tap.*automatic links/i);
});
