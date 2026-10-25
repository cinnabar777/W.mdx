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

test('merged cells open for editing on first tap while normal cells keep their existing entry behavior', async () => {
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
      '| merged content | other cell |',
      '| normal cell | another cell |'
    ].join('\n'));
    model.mergeRect(1, 0, 1, 1);

    const editor = document.createElement('div');
    const scroller = document.createElement('div');
    editor.appendChild(scroller);
    document.body.appendChild(editor);
    const view = { dom: editor, scrollDOM: scroller, contentDOM: scroller };
    const markdown = model.toMarkdown();
    const widget = new WordProcessorTableWidget(markdown, 0, markdown.length);
    const container = widget.toDOM(view);
    scroller.appendChild(container);

    const mergedCell = container.querySelector('tbody td[colspan="2"]');
    mergedCell.click();
    const cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'one tap opens the merged-cell editor');
    assert.equal(cellEditor.value, 'merged content <br> other cell');
    cellEditor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));

    const regularCell = container.querySelector('tbody td[data-row="2"][data-col="0"]');
    regularCell.click();
    assert.equal(
      container.querySelector('.cm-wp-cell-editor'),
      null,
      'one tap on a normal cell still selects it without opening the editor'
    );
    regularCell.click();
    assert.ok(
      container.querySelector('.cm-wp-cell-editor'),
      'a second tap on a normal cell still opens its editor'
    );

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

test('the merged-cell long-press menu can split the selected cell', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousGetComputedStyle = global.getComputedStyle;
  const previousEvent = global.Event;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  global.window = dom.window;
  global.document = dom.window.document;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.Event = dom.window.Event;
  global.requestAnimationFrame = callback => {
    callback();
    return 1;
  };

  const makeDoc = text => {
    const lines = text.split('\n');
    const starts = [];
    let offset = 0;
    for (const line of lines) {
      starts.push(offset);
      offset += line.length + 1;
    }
    return {
      text,
      lines: lines.length,
      line(number) {
        const lineText = lines[number - 1];
        const from = starts[number - 1];
        return { number, text: lineText, from, to: from + lineText.length };
      },
      lineAt(position) {
        let number = 1;
        while (number < lines.length && starts[number] <= position) number++;
        return this.line(number);
      }
    };
  };

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
    const markdown = model.toMarkdown();
    const view = {
      dom: editor,
      scrollDOM: scroller,
      contentDOM: scroller,
      state: { doc: makeDoc(markdown) },
      posAtDOM: () => 0,
      dispatch(transaction) {
        const { from, to, insert } = transaction.changes;
        const oldText = this.state.doc.text;
        this.state = { doc: makeDoc(oldText.slice(0, from) + insert + oldText.slice(to)) };
      }
    };
    const widget = new WordProcessorTableWidget(markdown, 0, markdown.length);
    const container = widget.toDOM(view);
    scroller.appendChild(container);

    const mergedCell = container.querySelector('tbody td[colspan="2"]');
    mergedCell.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 550));
    const menu = document.querySelector('.cm-wp-table-context-menu');
    const splitButton = menu?.querySelector('[data-action="splitCell"]');
    assert.ok(splitButton, 'merged cell menu includes the Split Cell action');
    assert.equal(splitButton.disabled, false, 'Split Cell is enabled for a merged cell');
    assert.ok(splitButton.querySelector('svg'), 'the current build uses the icon menu');

    splitButton.click();
    assert.ok(!view.state.doc.text.includes('| < |'), 'the updated table Markdown is committed');

    widget.destroy(container);
    editor.remove();
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
    global.getComputedStyle = previousGetComputedStyle;
    global.Event = previousEvent;
    if (previousRequestAnimationFrame === undefined) {
      delete global.requestAnimationFrame;
    } else {
      global.requestAnimationFrame = previousRequestAnimationFrame;
    }
    dom.window.close();
  }
});
