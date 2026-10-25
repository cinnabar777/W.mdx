const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('table editing isolates cell taps and commits before document taps regain the cursor', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousGetComputedStyle = global.getComputedStyle;
  const previousEvent = global.Event;
  const previousAnimationFrame = global.requestAnimationFrame;
  const pendingFrames = [];
  global.window = dom.window;
  global.document = dom.window.document;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.Event = dom.window.Event;
  global.requestAnimationFrame = callback => pendingFrames.push(callback);
  dom.window.requestAnimationFrame = global.requestAnimationFrame;

  try {
    const { EditorState } = await import('@codemirror/state');
    const { TableModel } = await import('../src/tableModule.js');
    const { WordProcessorTableWidget } = await import('../src/tableWidget.js');
    const model = TableModel.parse([
      '| First | Second |',
      '| --- | --- |',
      '| merged content | other cell |',
      '| regular left | regular right |'
    ].join('\n'));
    model.mergeRect(1, 0, 1, 1);
    const markdown = model.toMarkdown();

    const editor = document.createElement('div');
    const scroller = document.createElement('div');
    editor.appendChild(scroller);
    document.body.appendChild(editor);
    const view = {
      dom: editor,
      scrollDOM: scroller,
      contentDOM: scroller,
      state: EditorState.create({ doc: markdown }),
      posAtDOM: () => 0,
      dispatch(transaction) {
        this.state = this.state.update(transaction).state;
      }
    };
    const widget = new WordProcessorTableWidget(markdown, 0, markdown.length);
    const container = widget.toDOM(view);
    scroller.appendChild(container);
    const mergedCell = container.querySelector('tbody td[colspan="2"]');
    const regularCell = container.querySelector('tbody td[data-row="2"][data-col="1"]');
    assert.ok(mergedCell, 'the table contains a merged cell');
    assert.ok(regularCell, 'the table contains an ordinary cell');

    let editorPointerDowns = 0;
    editor.addEventListener('pointerdown', () => editorPointerDowns++);
    const tapCell = cell => {
      cell.dispatchEvent(new dom.window.Event('pointerdown', {
        bubbles: true,
        cancelable: true
      }));
      dom.window.dispatchEvent(new dom.window.Event('pointerup', { bubbles: true }));
      cell.dispatchEvent(new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true
      }));
    };
    const tapDocument = target => target.dispatchEvent(new dom.window.Event('pointerdown', {
      bubbles: true,
      cancelable: true
    }));

    tapCell(mergedCell);
    let cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'one tap opens a merged cell editor');
    assert.equal(document.activeElement, cellEditor, 'the merged cell editor receives focus');
    assert.equal(editorPointerDowns, 0, 'merged-cell taps do not place a second cursor in the document');
    cellEditor.value = 'edited merged content';

    const documentText = document.createElement('p');
    editor.appendChild(documentText);
    tapDocument(documentText);
    assert.equal(container.querySelector('.cm-wp-cell-editor'), null, 'a document tap closes the merged cell editor');
    assert.equal(widget.model.rows[1][0], 'edited merged content', 'the merged-cell edit is saved');
    assert.equal(editorPointerDowns, 1, 'the document receives the tap after the cell editor closes');

    tapCell(regularCell);
    cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'one tap opens an ordinary cell editor');
    cellEditor.value = 'edited regular cell';
    tapDocument(documentText);
    assert.equal(container.querySelector('.cm-wp-cell-editor'), null, 'a document tap closes the ordinary cell editor');
    assert.equal(widget.model.rows[2][1], 'edited regular cell', 'the ordinary-cell edit is saved');
    assert.equal(editorPointerDowns, 2, 'ordinary document text receives the next tap');

    widget.destroy(container);
    editor.remove();
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
    global.getComputedStyle = previousGetComputedStyle;
    global.Event = previousEvent;
    global.requestAnimationFrame = previousAnimationFrame;
    dom.window.close();
  }
});

test('long-pressing a merged table cell keeps the custom menu open after release', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousGetComputedStyle = global.getComputedStyle;
  const previousEvent = global.Event;
  global.window = dom.window;
  global.document = dom.window.document;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.Event = dom.window.Event;

  try {
    const { TableModel } = await import('../src/tableModule.js');
    const { WordProcessorTableWidget } = await import('../src/tableWidget.js');
    const model = TableModel.parse([
      '| First | Second |',
      '| --- | --- |',
      '| merged content | other cell |'
    ].join('\n'));
    model.mergeRect(1, 0, 1, 1);

    const editor = document.createElement('div');
    const scroller = document.createElement('div');
    editor.appendChild(scroller);
    document.body.appendChild(editor);
    const view = {
      dom: editor,
      scrollDOM: scroller,
      contentDOM: scroller
    };
    const widget = new WordProcessorTableWidget(model.toMarkdown(), 0, model.toMarkdown().length);
    const container = widget.toDOM(view);
    scroller.appendChild(container);

    const mergedCell = container.querySelector('tbody td[colspan="2"]');
    assert.ok(mergedCell, 'the test table includes a rendered merged cell');

    mergedCell.dispatchEvent(new dom.window.Event('pointerdown', {
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.ok(document.querySelector('.cm-wp-table-context-menu'), 'the custom menu opens after a hold');

    dom.window.dispatchEvent(new dom.window.Event('pointerup', { bubbles: true }));
    mergedCell.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true
    }));
    assert.ok(document.querySelector('.cm-wp-table-context-menu'), 'pointer release and its synthetic click do not dismiss the menu');

    const nativeContextMenu = new dom.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    });
    mergedCell.dispatchEvent(nativeContextMenu);
    assert.equal(nativeContextMenu.defaultPrevented, true, 'the platform text-selection menu is suppressed');
    assert.ok(document.querySelector('.cm-wp-table-context-menu'), 'the custom menu remains after the platform event');
    assert.equal(mergedCell.style.userSelect, 'none', 'table cells do not trigger native long-press text selection');

    widget.destroy(container);
    editor.remove();
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
    global.getComputedStyle = previousGetComputedStyle;
    global.Event = previousEvent;
    dom.window.close();
  }
});
