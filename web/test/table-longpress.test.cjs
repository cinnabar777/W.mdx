const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

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
