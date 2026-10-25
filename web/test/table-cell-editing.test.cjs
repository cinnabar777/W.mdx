const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

async function withTableEditor(markdown, run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true
  });
  const previousGlobals = {
    window: global.window,
    document: global.document,
    getComputedStyle: global.getComputedStyle,
    Event: global.Event,
    requestAnimationFrame: global.requestAnimationFrame
  };
  const frames = [];
  const requestAnimationFrame = callback => {
    frames.push(callback);
    return frames.length;
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.Event = dom.window.Event;
  global.requestAnimationFrame = requestAnimationFrame;
  dom.window.requestAnimationFrame = requestAnimationFrame;

  let editor;
  let widget;
  let container;
  try {
    const { EditorState } = await import('@codemirror/state');
    const { WordProcessorTableWidget } = await import('../src/tableWidget.js');
    editor = document.createElement('div');
    const scroller = document.createElement('div');
    editor.className = 'cm-editor';
    scroller.className = 'cm-scroller';
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
    widget = new WordProcessorTableWidget(markdown, 0, markdown.length);
    container = widget.toDOM(view);
    scroller.appendChild(container);

    const flushFrames = () => {
      let count = 0;
      while (frames.length && count < 100) {
        frames.shift()();
        count++;
      }
      assert.ok(count < 100, 'animation-frame callbacks settle without looping');
    };

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

    await run({
      dom,
      editor,
      scroller,
      view,
      widget,
      container,
      tapCell,
      flushFrames,
      frames
    });
  } finally {
    widget?.destroy(container);
    editor?.remove();
    global.window = previousGlobals.window;
    global.document = previousGlobals.document;
    global.getComputedStyle = previousGlobals.getComputedStyle;
    global.Event = previousGlobals.Event;
    global.requestAnimationFrame = previousGlobals.requestAnimationFrame;
    dom.window.close();
  }
}

test('cell switching commits the old cell and selects the tapped cell without losing the tap', async () => {
  const markdown = [
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | One |',
    '| Beta | Two |'
  ].join('\n');

  await withTableEditor(markdown, async ({ dom, editor, view, container, tapCell, flushFrames }) => {
    let editorPointerDowns = 0;
    editor.addEventListener('pointerdown', () => editorPointerDowns++);

    let firstCell = container.querySelector('tbody td[data-row="1"][data-col="0"]');
    tapCell(firstCell);
    assert.equal(container.querySelector('.cm-wp-cell-editor'), null, 'first tap selects the cell');
    assert.ok(firstCell.style.outline, 'the selected cell is visibly highlighted');

    tapCell(firstCell);
    let cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'second tap enters the selected cell');
    cellEditor.value = 'Alpha edited';

    const nextCellBeforeCommit = container.querySelector('tbody td[data-row="2"][data-col="1"]');
    tapCell(nextCellBeforeCommit);
    flushFrames();

    const currentContainer = editor.querySelector('.cm-wp-table-container');
    const nextCell = currentContainer.querySelector('tbody td[data-row="2"][data-col="1"]');
    assert.equal(view.state.doc.toString().includes('Alpha edited'), true, 'the previous cell is saved before switching');
    assert.equal(currentContainer.querySelector('.cm-wp-cell-editor'), null, 'the switch tap selects instead of reopening an editor');
    assert.ok(nextCell.style.outline, 'the tap that leaves the old editor selects the new cell');

    tapCell(nextCell);
    cellEditor = currentContainer.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'the next tap enters the newly selected cell');
    assert.equal(cellEditor.value, 'Two');
    assert.equal(editorPointerDowns, 0, 'table taps do not create a stray document cursor');
  });
});

test('merged-cell editor uses the rendered cell bounds and saves its merged content', async () => {
  const { TableModel } = await import('../src/tableModule.js');
  const model = TableModel.parse([
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | One |',
    '| Beta | Two |'
  ].join('\n'));
  model.mergeRect(1, 0, 1, 1);
  const markdown = model.toMarkdown();

  await withTableEditor(markdown, async ({ container, view, tapCell, flushFrames }) => {
    const mergedCell = container.querySelector('tbody td[colspan="2"]');
    assert.ok(mergedCell, 'the merged table cell is rendered as a spanning cell');
    container.getBoundingClientRect = () => ({ top: 100, left: 40, width: 300, height: 240 });
    mergedCell.getBoundingClientRect = () => ({ top: 175, left: 150, width: 180, height: 60 });

    tapCell(mergedCell);
    assert.ok(mergedCell.style.outline, 'the first tap selects the merged cell');
    tapCell(mergedCell);

    const cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'the second tap opens the merged cell editor');
    assert.equal(cellEditor.value, 'Alpha <br> One');
    assert.equal(cellEditor.style.top, '75px');
    assert.equal(cellEditor.style.left, '110px');
    assert.equal(cellEditor.style.width, '180px');
    assert.equal(cellEditor.style.height, '60px');

    cellEditor.value = 'Merged text edited';
    cellEditor.blur();
    flushFrames();
    assert.ok(view.state.doc.toString().includes('Merged text edited'), 'the merged cell edit is committed to the document');
  });
});

test('long-press still opens the table action menu without also entering the cell', async () => {
  const markdown = [
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | One |'
  ].join('\n');

  await withTableEditor(markdown, async ({ dom, container, tapCell: _tapCell }) => {
    const cell = container.querySelector('tbody td[data-row="1"][data-col="0"]');
    cell.dispatchEvent(new dom.window.Event('pointerdown', {
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 520));
    dom.window.dispatchEvent(new dom.window.Event('pointerup', { bubbles: true }));
    cell.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true
    }));

    assert.ok(document.querySelector('.cm-wp-table-context-menu'), 'the long-press menu remains open after release');
    assert.equal(container.querySelector('.cm-wp-cell-editor'), null, 'the follow-up click does not open the cell editor');
    document.querySelector('.cm-wp-table-context-menu')?.remove();
  });
});
