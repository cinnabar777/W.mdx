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

  const footnoteField = StateField.define({
    create: state => buildFootnoteDecorations(state, { mode: 'wysiwyg' }),
    update: (_value, transaction) => buildFootnoteDecorations(transaction.state, { mode: 'wysiwyg' }),
    provide: field => EditorView.decorations.from(field, value => value.decorations)
  });
  const state = EditorState.create({
    doc: 'A sentence with a note[^1].\n\n[^1]: Footnote body\n    Continued text',
    extensions: [markdown(), footnoteField]
  });
  const view = new EditorView({ state, parent: document.querySelector('#mount') });

  assert.ok(document.querySelector('.cm-footnote-reference'));
  assert.ok(document.querySelector('.cm-footnote-definition'));
  assert.equal(
    document.querySelector('.cm-footnote-text').textContent,
    'Footnote body\nContinued text'
  );
  assert.doesNotMatch(document.querySelector('.cm-content').textContent, /\[\^1\]/);
  assert.doesNotMatch(document.querySelector('.cm-content').textContent, /\[\^1\]:/);

  view.destroy();
  dom.window.close();
});
