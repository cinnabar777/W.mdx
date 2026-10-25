const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const test = require('node:test');

const dom = new JSDOM('<!doctype html><html><body><div id="mount"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'https://wmdx.test/'
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: dom.window.navigator
});
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.Window = dom.window.constructor;
global.Range = dom.window.Range;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = clearTimeout;
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
dom.window.ResizeObserver = global.ResizeObserver;

const rangePrototype = dom.window.document.createRange().constructor.prototype;
rangePrototype.getClientRects = () => [];
rangePrototype.getBoundingClientRect = () => ({
  top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0
});

test('WYSIWYG renders footnote widgets instead of Markdown syntax', async () => {
  const [{ EditorState, StateField }, { EditorView }, { markdown }, { buildFootnoteDecorations }] =
    await Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/lang-markdown'),
      import('../src/footnotes.js')
    ]);

  const navigationTargets = [];
  const build = state => buildFootnoteDecorations(state, {
    mode: 'wysiwyg',
    onNavigate: (_view, position) => navigationTargets.push(position)
  });
  const footnoteField = StateField.define({
    create: build,
    update: (_value, transaction) => build(transaction.state),
    provide: field => EditorView.decorations.from(field, value => value.decorations)
  });
  const markdownText = 'First [^1], then another [^1].\n\n[^1]: Footnote body\n    Continued text';
  const state = EditorState.create({
    doc: markdownText,
    extensions: [markdown(), footnoteField]
  });
  const view = new EditorView({ state, parent: document.querySelector('#mount') });

  const references = [...document.querySelectorAll('.cm-footnote-reference')];
  const backlinks = [...document.querySelectorAll('.cm-footnote-backlink')];
  assert.equal(references.length, 2);
  assert.ok(document.querySelector('.cm-footnote-definition'));
  assert.equal(backlinks.length, 2, 'each footnote reference gets its own return link');
  assert.equal(
    document.querySelector('.cm-footnote-text').textContent,
    'Footnote body\nContinued text'
  );
  assert.doesNotMatch(document.querySelector('.cm-content').textContent, /\[\^1\]/);
  assert.doesNotMatch(document.querySelector('.cm-content').textContent, /\[\^1\]:/);

  const firstReferencePosition = markdownText.indexOf('[^1]');
  const secondReferencePosition = markdownText.indexOf('[^1]', firstReferencePosition + 1);
  const definitionPosition = markdownText.indexOf('[^1]:');
  references[0].click();
  backlinks[1].click();
  backlinks[0].click();
  assert.deepEqual(navigationTargets, [
    definitionPosition,
    secondReferencePosition,
    firstReferencePosition
  ]);
  assert.notEqual(firstReferencePosition, secondReferencePosition);

  view.destroy();
  dom.window.close();
});
