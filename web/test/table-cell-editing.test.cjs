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

    const remountWidget = () => {
      widget.destroy(container);
      container.remove();
      const currentMarkdown = view.state.doc.toString();
      widget = new WordProcessorTableWidget(
        currentMarkdown,
        0,
        currentMarkdown.length
      );
      container = widget.toDOM(view);
      scroller.appendChild(container);
      return container;
    };

    await run({
      dom,
      editor,
      scroller,
      view,
      widget,
      container,
      tapCell,
      remountWidget,
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

test('table toolbar actions are enabled for the selected cell and still edit the table', async () => {
  const markdown = [
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | One |',
    '| Beta | Two |'
  ].join('\n');

  await withTableEditor(markdown, async ({ dom, container, tapCell, view, flushFrames }) => {
    const cell = container.querySelector('tbody td[data-row="1"][data-col="0"]');
    tapCell(cell);

    const actions = dom.window.wmdxTableActions;
    assert.ok(actions, 'selecting a cell publishes the table toolbar action bridge');
    assert.equal(actions.isEnabled('insertRowBelow'), true);
    assert.equal(actions.isEnabled('splitCell'), false);
    assert.equal(actions.run('insertRowBelow'), true);
    flushFrames();
    assert.equal(view.state.doc.toString().split('\n').length, 5, 'the toolbar action inserts a table row');
  });
});

test('merged-cell selection survives a widget refresh and its editor uses rendered bounds', async () => {
  const { TableModel } = await import('../src/tableModule.js');
  const model = TableModel.parse([
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | One |',
    '| Beta | Two |'
  ].join('\n'));
  model.mergeRect(1, 0, 1, 1);
  const markdown = model.toMarkdown();

  await withTableEditor(markdown, async ({ dom, container, view, tapCell, remountWidget, flushFrames }) => {
    let mergedCell = container.querySelector('tbody td[colspan="2"]');
    assert.ok(mergedCell, 'the merged table cell is rendered as a spanning cell');

    tapCell(mergedCell);
    assert.ok(mergedCell.style.outline, 'the first tap selects the merged cell');
    let currentContainer = remountWidget();
    mergedCell = currentContainer.querySelector('tbody td[colspan="2"]');
    assert.ok(mergedCell.style.outline, 'the highlight survives a table-widget refresh');
    currentContainer.getBoundingClientRect = () => ({ top: 100, left: 40, width: 300, height: 240 });
    mergedCell.getBoundingClientRect = () => ({ top: 175, left: 150, width: 180, height: 60 });
    tapCell(mergedCell);

    const cellEditor = currentContainer.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'the second tap opens the merged cell editor');
    assert.equal(cellEditor.value, 'Alpha\nOne', 'saved Markdown line breaks are shown as editable line breaks');
    assert.equal(cellEditor.style.top, '75px');
    assert.equal(cellEditor.style.left, '110px');
    assert.equal(cellEditor.style.width, '180px');
    assert.equal(cellEditor.style.height, '60px');

    const enter = new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    });
    cellEditor.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, false, 'Return inserts a line break instead of closing the cell');
    assert.equal(cellEditor.isConnected, true, 'Return keeps the text box open in the merged cell');

    cellEditor.value = 'Merged text edited\nsecond line';
    cellEditor.blur();
    flushFrames();
    assert.ok(
      view.state.doc.toString().includes('Merged text edited<br>second line'),
      'cell line breaks are saved without visible whitespace around the <br> marker'
    );
    const renderedMergedCell = view.dom.querySelector('tbody td[colspan="2"]');
    assert.ok(renderedMergedCell, 'the merged cell remains rendered after saving');
    assert.equal(
      renderedMergedCell.innerHTML,
      'Merged text edited<br>second line',
      'the saved line starts at the same horizontal position when rendered'
    );
    assert.equal(view.state.doc.toString().split('\n').length, 4, 'a cell line break does not create a new Markdown table row');
  });
});

test('long-press opens the horizontal table action menu above the touch point without entering the cell', async () => {
  const markdown = [
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | One |'
  ].join('\n');

  await withTableEditor(markdown, async ({ dom, container, tapCell: _tapCell }) => {
    const cell = container.querySelector('tbody td[data-row="1"][data-col="0"]');
    cell.getBoundingClientRect = () => ({ top: 100, bottom: 700, left: 20, width: 280, height: 600 });
    cell.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 650
    }));
    await new Promise(resolve => setTimeout(resolve, 520));
    dom.window.dispatchEvent(new dom.window.Event('pointerup', { bubbles: true }));
    cell.dispatchEvent(new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true
    }));

    const menu = document.querySelector('.cm-wp-table-context-menu');
    assert.ok(menu, 'the long-press menu remains open after release');
    assert.equal(menu.style.top, '592px', 'the compact menu opens above the long-press point when there is room');
    assert.equal(menu.style.left, '120px', 'the horizontal menu is anchored near the touch point');
    assert.equal(container.querySelector('.cm-wp-cell-editor'), null, 'the follow-up click does not open the cell editor');
    document.querySelector('.cm-wp-table-context-menu')?.remove();
  });
});
