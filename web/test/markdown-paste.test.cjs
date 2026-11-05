const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { JSDOM } = require('jsdom');

let markdownBlockquotePaste;
let quoteMultilinePaste;
let EditorState;
let markdown;
let EditorView;

before(async () => {
  const [pasteModule, stateModule, markdownModule, viewModule] = await Promise.all([
    import('../src/markdownPaste.mjs'),
    import('@codemirror/state'),
    import('@codemirror/lang-markdown'),
    import('@codemirror/view')
  ]);
  markdownBlockquotePaste = pasteModule.markdownBlockquotePaste;
  quoteMultilinePaste = pasteModule.quoteMultilinePaste;
  EditorState = stateModule.EditorState;
  markdown = markdownModule.markdown;
  EditorView = viewModule.EditorView;
});

test('multiline paste preserves explicit and nested blockquote context', () => {

  const doc = '> what is this\n> ';
  const state = EditorState.create({
    doc,
    extensions: [markdown()]
  });
  const pasted = '- First\n  - Second\n    - Third';

  assert.equal(
    quoteMultilinePaste(state, doc.length, doc.length, pasted),
    '- First\n>   - Second\n>     - Third'
  );

  const nestedDoc = '> outer\n> > ';
  const nestedState = EditorState.create({
    doc: nestedDoc,
    extensions: [markdown()]
  });
  assert.equal(
    quoteMultilinePaste(
      nestedState,
      nestedDoc.length,
      nestedDoc.length,
      'First\nSecond'
    ),
    'First\n> > Second'
  );
});

test('native paste event adds quote markers to continuation lines', () => {
  const dom = new JSDOM('<div id="editor"></div>', {
    pretendToBeVisual: true
  });
  const globals = [
    'window', 'document', 'MutationObserver', 'ResizeObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
    'HTMLElement', 'Node'
  ];
  const previous = new Map(
    globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );
  const window = dom.window;
  Object.assign(globalThis, {
    window,
    document: window.document,
    MutationObserver: window.MutationObserver,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    HTMLElement: window.HTMLElement,
    Node: window.Node
  });

  let view;
  try {
    const doc = '> quote\n> ';
    view = new EditorView({
      parent: window.document.querySelector('#editor'),
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdown(), markdownBlockquotePaste]
      })
    });
    const clipboardText = '- First\n  - Second\n    - Third';
    const event = new window.Event('paste', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: type => type === 'text/plain' ? clipboardText : '' }
    });

    view.contentDOM.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(
      view.state.doc.toString(),
      '> quote\n> - First\n>   - Second\n>     - Third'
    );

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      selection: { anchor: doc.length }
    });
    window.AndroidNative = { readClipboard: () => 'Alpha\nBeta' };
    const androidPasteEvent = new window.Event('paste', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(androidPasteEvent, 'clipboardData', {
      value: { getData: () => '' }
    });

    view.contentDOM.dispatchEvent(androidPasteEvent);

    assert.equal(androidPasteEvent.defaultPrevented, true);
    assert.equal(view.state.doc.toString(), '> quote\n> Alpha\n> Beta');
  } finally {
    view?.destroy();
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('multiline paste outside a blockquote keeps its original text', () => {
  const doc = 'ordinary paragraph';
  const state = EditorState.create({ doc, extensions: [markdown()] });
  assert.equal(
    quoteMultilinePaste(state, doc.length, doc.length, 'First\nSecond'),
    'First\nSecond'
  );
});
