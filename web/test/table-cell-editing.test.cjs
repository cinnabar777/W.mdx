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

    const tapCell = (cell, { dispatchClick = true, x = 0, y = 0 } = {}) => {
      cell.dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
      }));
      cell.dispatchEvent(new dom.window.MouseEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
      }));
      if (dispatchClick) {
        cell.dispatchEvent(new dom.window.MouseEvent('click', {
          bubbles: true,
          cancelable: true
        }));
      }
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

test('one tap enters a cell and switching cells commits the old value', async () => {
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
    tapCell(firstCell, { dispatchClick: false });
    let cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'pointer-up opens the cell editor without a synthesized click');
    assert.equal(document.activeElement, cellEditor, 'the caret is focused inside the tapped cell');
    assert.ok(firstCell.style.outline, 'the selected cell is visibly highlighted');
    cellEditor.textContent = 'Alpha edited';

    const nextCellBeforeCommit = container.querySelector('tbody td[data-row="2"][data-col="1"]');
    tapCell(nextCellBeforeCommit, { dispatchClick: false });
    flushFrames();

    const currentContainer = editor.querySelector('.cm-wp-table-container');
    const nextCell = currentContainer.querySelector('tbody td[data-row="2"][data-col="1"]');
    assert.equal(view.state.doc.toString().includes('Alpha edited'), true, 'the previous cell is saved before switching');
    cellEditor = currentContainer.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'the switch tap enters the newly selected cell');
    assert.equal(cellEditor.textContent, 'Two');
    assert.equal(editorPointerDowns, 0, 'table taps do not create a stray document cursor');
  });
});

test('cell editing keeps rendered inline styling, places the caret at the tap, and preserves scroll', async () => {
  const markdown = [
    '| Name | Value |',
    '| --- | --- |',
    '| **Alpha** tail | One |'
  ].join('\n');

  await withTableEditor(markdown, async ({
    dom,
    container,
    tapCell,
    scroller,
    flushFrames
  }) => {
    const cell = container.querySelector('tbody td[data-row="1"][data-col="0"]');
    cell.style.fontSize = '19px';
    scroller.scrollTop = 42;
    const originalFocus = dom.window.HTMLElement.prototype.focus;
    dom.window.HTMLElement.prototype.focus = function(options) {
      if (this.classList?.contains('cm-wp-cell-editor')) {
        this.dataset.preventScroll = String(options?.preventScroll === true);
        scroller.scrollTop = 777;
      }
      return originalFocus?.call(this, options);
    };
    dom.window.document.caretPositionFromPoint = (x, y) => {
      assert.equal(x, 32);
      assert.equal(y, 14);
      const editor = dom.window.document.querySelector('.cm-wp-cell-editor');
      const text = editor?.querySelector('strong')?.firstChild;
      return text ? { offsetNode: text, offset: 2 } : null;
    };

    try {
      tapCell(cell, { dispatchClick: false, x: 32, y: 14 });
      const cellEditor = container.querySelector('.cm-wp-cell-editor');
      assert.ok(cellEditor, 'the cell editor opens on one tap');
      assert.equal(cellEditor.innerHTML, '<strong>Alpha</strong> tail', 'Markdown emphasis remains rendered while editing');
      assert.equal(cellEditor.style.fontSize, '19px', 'the overlay inherits the rendered cell font size');
      assert.equal(cellEditor.dataset.preventScroll, 'true', 'focus prevents the browser from auto-scrolling');
      const selection = dom.window.getSelection();
      assert.equal(selection.anchorNode.nodeValue, 'Alpha');
      assert.equal(selection.anchorOffset, 2, 'the caret lands at the tapped character position');
      flushFrames();
      assert.equal(scroller.scrollTop, 42, 'focus does not move the document scroll position');
    } finally {
      dom.window.HTMLElement.prototype.focus = originalFocus;
    }
  });
});

test('rendered tables can disable their local horizontal scroller and wrap cells', async () => {
  const markdown = [
    '| Name | Description |',
    '| --- | --- |',
    '| A | A deliberately long cell value |'
  ].join('\n');

  await withTableEditor(markdown, async ({ view, scroller }) => {
    const { WordProcessorTableWidget } = await import('../src/tableWidget.js');
    const widget = new WordProcessorTableWidget(markdown, 0, markdown.length, {
      horizontalScrollEnabled: false
    });
    const container = widget.toDOM(view);
    scroller.appendChild(container);
    assert.equal(container.dataset.horizontalScrollEnabled, 'false');
    assert.equal(container.style.overflowX, 'hidden');
    assert.equal(container.querySelector('table').style.width, '100%');
    assert.equal(container.querySelector('tbody td').style.overflowWrap, 'anywhere');
    widget.destroy(container);
    container.remove();
  });
});

test('clear formatting updates the rich rendered cell editor and its Markdown model', async () => {
  const markdown = [
    '| Name |',
    '| --- |',
    '| **Bold** and ==marked== |'
  ].join('\n');

  await withTableEditor(markdown, async ({ view, container, tapCell, flushFrames }) => {
    const { clearMarkdownFormatting } = await import('../src/markdownFormatting.js');
    const cell = container.querySelector('tbody td[data-row="1"][data-col="0"]');
    tapCell(cell, { dispatchClick: false });
    const editor = container.querySelector('.cm-wp-cell-editor');
    assert.equal(editor?.getAttribute('contenteditable'), 'true');
    assert.equal(clearMarkdownFormatting(view), true);
    assert.equal(editor.innerHTML, 'Bold and marked');
    assert.equal(editor._getMarkdownValue(), 'Bold and marked');
    editor.blur();
    flushFrames();
    assert.ok(
      view.state.doc.toString().includes('| Bold and marked |'),
      'the cleared rich cell is committed back to Markdown'
    );
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
    const cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'one tap opens the cell editor');
    cellEditor.textContent = 'Alpha edited';

    const actions = dom.window.wmdxTableActions;
    assert.ok(actions, 'selecting a cell publishes the table toolbar action bridge');
    assert.equal(actions.isEnabled('insertRowBelow'), true);
    assert.equal(actions.isEnabled('splitCell'), false);
    assert.equal(actions.run('insertRowBelow'), true);
    flushFrames();
    assert.ok(view.state.doc.toString().includes('Alpha edited'), 'table actions commit the open cell draft');
    assert.equal(view.state.doc.toString().split('\n').length, 5, 'the toolbar action inserts a table row');
  });
});

test('only the active table stays highlighted and leaving the table clears the visible selection', async () => {
  const markdown = [
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | One |',
    '| Beta | Two |'
  ].join('\n');

  await withTableEditor(markdown, async ({ dom, container, tapCell, view, scroller, remountWidget, flushFrames }) => {
    scroller.classList.add('cm-content');
    const firstTable = container;
    const firstCell = firstTable.querySelector('tbody td[data-row="1"][data-col="0"]');
    tapCell(firstCell);
    assert.ok(firstTable.querySelector('.cm-wp-cell-editor'));
    const actions = dom.window.wmdxTableActions;
    assert.equal(actions.context.owner, firstTable);
    assert.ok(firstCell.style.backgroundColor, 'the current cell is highlighted');

    const { WordProcessorTableWidget } = await import('../src/tableWidget.js');
    const secondFrom = markdown.length + 10;
    const secondWidget = new WordProcessorTableWidget(
      markdown,
      secondFrom,
      secondFrom + markdown.length
    );
    const secondTable = secondWidget.toDOM(view);
    scroller.appendChild(secondTable);
    const secondCell = secondTable.querySelector('tbody td[data-row="2"][data-col="1"]');
    tapCell(secondCell);
    flushFrames();
    assert.equal(actions.context.owner, secondTable, 'tapping another table makes it the toolbar target');
    assert.equal(firstCell.style.backgroundColor, '', 'the previous table loses its visible highlight');
    assert.ok(secondCell.style.backgroundColor, 'the newly active table is highlighted');
    assert.ok(secondTable.querySelector('.cm-wp-cell-editor'), 'tapping another table opens its cell editor');

    const remountedFirstTable = remountWidget();
    assert.equal(
      actions.context.owner,
      secondTable,
      'redrawing the first table does not steal the toolbar target from the last tapped table'
    );
    const remountedFirstCell = remountedFirstTable.querySelector('tbody td[data-row="1"][data-col="0"]');
    assert.equal(remountedFirstCell.style.backgroundColor, '', 'an inactive table stays visually unselected');

    const text = document.createElement('p');
    text.textContent = 'Text outside the table';
    scroller.appendChild(text);
    text.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    assert.equal(actions.active, null, 'tapping regular text clears the active table target');
    assert.equal(actions.context, null, 'table toolbar actions are unavailable after leaving tables');
    assert.equal(secondCell.style.backgroundColor, '', 'the last table highlight clears when focus leaves it');

    tapCell(remountedFirstCell);
    flushFrames();
    assert.equal(actions.active.from, 0, 'tapping a previously selected cell reactivates that table first');
    assert.ok(remountedFirstCell.style.backgroundColor);
    assert.ok(remountedFirstTable.querySelector('.cm-wp-cell-editor'), 'the tap enters the restored cell');
    secondWidget.destroy(secondTable);
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
    const cellEditorBeforeRefresh = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditorBeforeRefresh, 'the first tap opens the merged-cell editor');
    cellEditorBeforeRefresh.blur();
    flushFrames();
    let currentContainer = remountWidget();
    mergedCell = currentContainer.querySelector('tbody td[colspan="2"]');
    assert.ok(mergedCell.style.outline, 'the highlight survives a table-widget refresh');
    currentContainer.getBoundingClientRect = () => ({ top: 100, left: 40, width: 300, height: 240 });
    mergedCell.getBoundingClientRect = () => ({ top: 175, left: 150, width: 180, height: 60 });
    tapCell(mergedCell);

    const cellEditor = currentContainer.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'one tap opens the merged cell editor');
    assert.equal(cellEditor.innerHTML, 'Alpha<br>One', 'saved Markdown line breaks are shown as editable rendered line breaks');
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

    cellEditor.innerHTML = 'Merged text edited<br>second line';
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

test('GFM table cell edits preserve alignment and escaped pipes through serialization and reopening', async () => {
  const markdown = [
    '| Name | Value |',
    '| :--- | ---: |',
    '| Alpha \\| beta | `one\\|two` |'
  ].join('\n');

  await withTableEditor(markdown, async ({ view, container, tapCell, flushFrames }) => {
    const originalCell = container.querySelector('tbody td[data-row="1"][data-col="0"]');
    assert.equal(originalCell.textContent, 'Alpha | beta', 'escaped pipes render as cell text');
    assert.equal(
      container.querySelector('tbody td[data-row="1"][data-col="1"]').textContent,
      'one|two',
      'escaped pipes render correctly inside code spans'
    );

    tapCell(originalCell);
    const cellEditor = container.querySelector('.cm-wp-cell-editor');
    assert.ok(cellEditor, 'the table cell can be edited');
    cellEditor.textContent = 'Gamma | delta';
    cellEditor.blur();
    flushFrames();

    const serialized = view.state.doc.toString();
    const { TableModel } = await import('../src/tableModule.js');
    const reopenedModel = TableModel.parse(serialized);
    assert.ok(reopenedModel, 'the edited Markdown table can be parsed again');
    assert.deepEqual(reopenedModel.alignments, ['left', 'right']);
    assert.equal(reopenedModel.rows[1][0], 'Gamma \\| delta');
    assert.equal(reopenedModel.rows[1][1], '`one\\|two`');

    const { EditorState } = await import('@codemirror/state');
    const { WordProcessorTableWidget } = await import('../src/tableWidget.js');
    const reopenedView = {
      ...view,
      state: EditorState.create({ doc: serialized })
    };
    const reopenedWidget = new WordProcessorTableWidget(
      serialized,
      0,
      serialized.length
    );
    const reopenedContainer = reopenedWidget.toDOM(reopenedView);
    try {
      assert.equal(
        reopenedContainer.querySelector('tbody td[data-row="1"][data-col="0"]').textContent,
        'Gamma | delta',
        'the reopened document renders the edited escaped-pipe cell'
      );
      assert.equal(
        reopenedContainer.querySelector('thead th[data-col="1"]').style.textAlign,
        'right',
        'column alignment survives serialization and reopening'
      );
    } finally {
      reopenedWidget.destroy(reopenedContainer);
    }
  });
});

test('GFM escaped pipes render inside code and emphasis spans in table cells', async () => {
  const markdown = [
    '| Style | Cell |',
    '| --- | --- |',
    '| code | `\\|` |',
    '| emphasis | **\\|** |'
  ].join('\n');

  await withTableEditor(markdown, async ({ container }) => {
    const codeCell = container.querySelector('tbody td[data-row="1"][data-col="1"]');
    const emphasisCell = container.querySelector('tbody td[data-row="2"][data-col="1"]');

    assert.equal(codeCell.querySelector('code')?.textContent, '|');
    assert.equal(emphasisCell.querySelector('strong')?.textContent, '|');
  });
});
