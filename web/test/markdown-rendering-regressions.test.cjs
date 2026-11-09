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
  const layout = projectFile('web/src/markdownDocumentLayout.js');
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
  assert.match(layout, /node\.name === 'Blockquote'/);
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
  assert.match(layout, /--source-indent-offset:/);
  assert.match(styles, /cm-source-indented\.cm-paragraph[\s\S]*?padding-left:\s*max\(/);
  assert.match(styles, /cm-source-indented\.cm-paragraph[\s\S]*?text-indent:\s*0\s*!important/);
  assert.match(styles, /cm-source-indented\.cm-paragraph-first[\s\S]*?text-indent:\s*0\s*!important/);
  assert.doesNotMatch(styles, /cm-source-(?:paragraph|quote|list)-wrapped/);
  assert.match(
    styles,
    /body:not\(\.list-wrap-under-text\) \.cm-content \.cm-line\.cm-list-item\s*\{[^}]*padding-left:\s*0[\s\S]*?text-indent:\s*0/
  );
  assert.doesNotMatch(
    styles.match(/body:not\(\.list-wrap-under-text\) \.cm-content \.cm-line\.cm-list-item\s*\{[^}]*\}/)?.[0] ?? '',
    /display:\s*flex/
  );
  assert.match(styles, /body\.list-wrap-under-text \.cm-content \.cm-line\.cm-list-item\s*\{[^}]*display:\s*block/);
  assert.match(styles, /padding-left:\s*var\(--list-marker-gutter/);
  assert.match(
    main,
    /else \{\s*builder\.push\(\s*Decoration\.mark\(\{\s*class: isBullet \? 'cm-list-bullet' : 'cm-list-number'/
  );
  assert.doesNotMatch(main, /Decoration\.mark\(\{ class: 'cm-list-block-text'/);
  assert.match(main, /else if \(isWmdxTask\)[\s\S]*?cm-list-marker-syntax/);
  assert.match(layout, /entry\.contentFrom = entry\.marker\.to/);
  assert.match(
    main,
    /'list-wrap-under-text',\s*prefs\.pref_list_non_hanging !== true/
  );
  assert.doesNotMatch(
    main.match(/function scheduleListMarkerMeasurements\([\s\S]*?const listMarkerMeasurementPlugin/)?.[0] ?? '',
    /classList\.contains\('list-wrap-under-text'\)/
  );
  assert.match(main, /getMarkdownListItemLineRange\(view\.state,\s*selection\.head\)/);
  assert.match(main, /for \(const line of markdownRenderPlan\(state\)\.lines\.values\(\)\)/);
  assert.match(main, /getMarkdownSourceIndentRanges\(line\.text\)/);
  assert.match(main, /paragraphIndentSyntaxRanges/);
  assert.match(main, /if \(calloutLineAttributes\.has\(lineFrom\)\) continue/);
  assert.match(main, /hideSyntax\(line\.from \+ range\.from, line\.from \+ range\.to\)/);
  const indentSyntaxHide = main.match(/for \(const \[lineFrom, ranges\] of paragraphIndentSyntaxRanges\)[\s\S]*?for \(const lineFrom of calloutLineAttributes\.keys\(\)\)/)?.[0] ?? '';
  assert.doesNotMatch(indentSyntaxHide, /isIndentActive/);
  assert.match(styles, /cm-source-indented\.cm-paragraph\.cm-blockquote[\s\S]*?padding-left:\s*calc\([\s\S]*?source-indent-offset/);
  const quoteIndentRule = styles.match(/\.cm-content \.cm-line\.cm-source-indented\.cm-paragraph\.cm-blockquote[\s\S]*?\n    \}/)?.[0] ?? '';
  assert.doesNotMatch(quoteIndentRule, /margin-left:/);
  assert.match(quoteIndentRule, /text-indent:\s*calc\(0px - var\(--list-marker-gutter/);
  assert.match(main, /Table cell\/editing|Table rendering in WYSIWYG/);
});

test('phone fixture is paired with an interaction checklist and packaged media', () => {
  const fixture = projectFile('Documentation/Markdown-Phone-Test.md');
  assert.match(fixture, /Markdown-Phone-Test-Checklist\.md/);
  assert.match(fixture, /GFM additions/);
  assert.match(fixture, /W\.mdx word-processing syntax/);
  assert.match(fixture, /Packaged audio, video, and attachments/i);
  assert.match(fixture, /wide table for horizontal Source scrolling/i);
  assert.match(fixture, /Up to three leading spaces do not create another list level/);
  assert.match(fixture, /> - A list item inside a block quote/);
  assert.match(fixture, /Markdown-Phone-Test-Image\.png/);

  const checklist = projectFile('Documentation/Markdown-Phone-Test-Checklist.md');
  assert.match(checklist, /Source shows original syntax/);
  assert.match(checklist, /Live Preview renders supported structures/);
  assert.match(checklist, /outer quote border should remain continuous/i);
  assert.match(checklist, /nested\s+quotes render farther inward/i);
  assert.match(checklist, /Source, wide rows scroll horizontally inside the row/);
  assert.match(checklist, /CommonMark inline\/reference links and autolinks/);
});
