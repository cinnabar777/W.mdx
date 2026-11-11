const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');
const prefix = 'Before table.\n\n';
const suffix = '\n\nAfter table.';
const baseTable = [
  '| H1 | H2 | H3 |',
  '| :--- | :---: | ---: |',
  '| A1 | B1 | C1 |',
  '| A2 | B2 | C2 |',
  '| A3 | B3 | C3 |'
].join('\n');

const actionCases = [
  {
    id: 'insertRowBelow',
    target: [1, 1],
    table: baseTable,
    expected: [
      '| H1 | H2 | H3 |',
      '| :--- | :---: | ---: |',
      '| A1 | B1 | C1 |',
      '|  |  |  |',
      '| A2 | B2 | C2 |',
      '| A3 | B3 | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows.length, 5);
      assert.ok(state.markdown.includes('|  |  |  |'));
      assert.ok(state.markdown.includes('A3'));
    }
  },
  {
    id: 'insertColumnRight',
    target: [1, 1],
    table: baseTable,
    expected: [
      '| H1 | H2 |  | H3 |',
      '| :--- | :---: | :---: | ---: |',
      '| A1 | B1 |  | C1 |',
      '| A2 | B2 |  | C2 |',
      '| A3 | B3 |  | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows[0].length, 4);
      assert.equal(state.rows[1][1].text, 'B1');
      assert.equal(state.rows[1][3].text, 'C1');
    }
  },
  {
    id: 'deleteRow',
    target: [2, 1],
    table: baseTable,
    expected: [
      '| H1 | H2 | H3 |',
      '| :--- | :---: | ---: |',
      '| A1 | B1 | C1 |',
      '| A3 | B3 | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows.length, 3);
      assert.ok(!state.markdown.includes('A2'));
      assert.ok(state.markdown.includes('A3'));
    }
  },
  {
    id: 'deleteColumn',
    target: [1, 2],
    table: baseTable,
    expected: [
      '| H1 | H2 |',
      '| :--- | :---: |',
      '| A1 | B1 |',
      '| A2 | B2 |',
      '| A3 | B3 |'
    ].join('\n'),
    verify: state => {
      assert.ok(state.rows.every(row => row.length === 2));
      assert.ok(!state.markdown.includes('C1'));
      assert.ok(state.markdown.includes('B3'));
    }
  },
  {
    id: 'mergeLeft',
    target: [1, 1],
    table: baseTable,
    expected: [
      '| H1 | H2 | H3 |',
      '| :--- | :---: | ---: |',
      '| A1 <br> B1 | < | C1 |',
      '| A2 | B2 | C2 |',
      '| A3 | B3 | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows[1][0].colSpan, 2);
      assert.match(state.rows[1][0].text, /A1.*B1/);
    }
  },
  {
    id: 'mergeRight',
    target: [1, 1],
    table: baseTable,
    expected: [
      '| H1 | H2 | H3 |',
      '| :--- | :---: | ---: |',
      '| A1 | B1 <br> C1 | < |',
      '| A2 | B2 | C2 |',
      '| A3 | B3 | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows[1][1].colSpan, 2);
      assert.match(state.rows[1][1].text, /B1.*C1/);
    }
  },
  {
    id: 'mergeUp',
    target: [2, 1],
    table: baseTable,
    expected: [
      '| H1 | H2 | H3 |',
      '| :--- | :---: | ---: |',
      '| A1 | B1 <br> B2 | C1 |',
      '| A2 | ^ | C2 |',
      '| A3 | B3 | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows[1][1].rowSpan, 2);
      assert.match(state.rows[1][1].text, /B1.*B2/);
    }
  },
  {
    id: 'mergeDown',
    target: [1, 1],
    table: baseTable,
    expected: [
      '| H1 | H2 | H3 |',
      '| :--- | :---: | ---: |',
      '| A1 | B1 <br> B2 | C1 |',
      '| A2 | ^ | C2 |',
      '| A3 | B3 | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows[1][1].rowSpan, 2);
      assert.match(state.rows[1][1].text, /B1.*B2/);
    }
  },
  {
    id: 'splitCell',
    target: [1, 1],
    setup: 'mergeRight',
    table: baseTable,
    expected: [
      '| H1 | H2 | H3 |',
      '| :--- | :---: | ---: |',
      '| A1 | B1 <br> C1 |  |',
      '| A2 | B2 | C2 |',
      '| A3 | B3 | C3 |'
    ].join('\n'),
    verify: state => {
      assert.equal(state.rows[1].length, 3);
      assert.ok(state.rows[1].every(cell => cell.colSpan === 1));
      assert.match(state.rows[1][1].text, /B1.*C1/);
    }
  }
];

async function startApp() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const content = await fs.readFile(file);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' :
        file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function setDocument(page, markdown, { mode = 'rendered', profile, scope }) {
  await page.evaluate(async ({ markdown, mode, profile, scope }) => {
    await window.editorBridge.setEditorMode(mode);
    window.editorBridge.applyAllPreferences({
      pref_markdown_profile: profile,
      pref_markdown_syntax_exposure: scope,
      pref_table_scroll_wysiwyg_enabled: true,
      pref_table_scroll_source_enabled: true,
      pref_table_inherit_body_typography: false
    });
    window.editorBridge.setMarkdown(markdown);
    if (mode === 'rendered') {
      const caret = markdown.indexOf('Before table.') + 2;
      window.editorBridge.setSelectionState(JSON.stringify({ anchor: caret, head: caret }));
    }
  }, { markdown, mode, profile, scope });
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected &&
      document.querySelector('.cm-content'),
    markdown,
    { timeout: 7000 }
  );
  if (mode === 'rendered' && profile !== 'commonmark') {
    await page.waitForFunction(
      () => document.querySelector('.cm-wp-table-container .cm-wp-table'),
      { timeout: 7000 }
    );
  }
}

async function readTableState(page) {
  return page.evaluate(() => {
    const table = document.querySelector('.cm-wp-table-container .cm-wp-table');
    return {
      markdown: window.editorBridge.getMarkdown(),
      rows: [...(table?.rows || [])].map(row =>
        [...row.cells].map(cell => ({
          text: cell.textContent.trim(),
          colSpan: cell.colSpan,
          rowSpan: cell.rowSpan
        }))
      )
    };
  });
}

async function openActionsWithLongPress(page, row, col) {
  const selector = `.cm-wp-table-container td[data-row="${row}"][data-col="${col}"]`;
  let box = null;
  for (let attempt = 0; attempt < 4 && !box; attempt += 1) {
    await page.waitForFunction(({ row, col }) => {
      const currentSelector =
        `.cm-wp-table-container td[data-row="${row}"][data-col="${col}"]`;
      const cell = document.querySelector(currentSelector);
      if (!cell) return false;
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(cell.isConnected && document.querySelector(currentSelector) === cell);
      })));
    }, { row, col }, { timeout: 5000 });
    const cell = page.locator(selector).first();
    try {
      await cell.scrollIntoViewIfNeeded({ timeout: 1500 });
      box = await cell.boundingBox();
    } catch (error) {
      if (!/not attached|detached/i.test(error.message) || attempt === 3) throw error;
    }
  }
  assert.ok(box, `No visible table cell at row ${row}, column ${col}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  const menu = page.getByRole('toolbar', { name: 'Table actions' });
  await menu.waitFor({ state: 'visible', timeout: 5000 });
  return menu;
}

async function applyAction(page, actionCase, profile, scope) {
  let table = actionCase.table;
  let source = `${prefix}${table}${suffix}`;
  await setDocument(page, source, { profile, scope });
  if (actionCase.setup === 'mergeRight') {
    const originalContainer = await page.locator('.cm-wp-table-container').elementHandle();
    const setupMenu = await openActionsWithLongPress(page, 1, 1);
    await setupMenu.locator('[data-action="mergeRight"]').click();
    await page.waitForFunction(
      previous => window.editorBridge.getMarkdown() !== previous,
      source,
      { timeout: 5000 }
    );
    await page.waitForFunction(
      previousContainer => !previousContainer.isConnected,
      originalContainer,
      { timeout: 5000 }
    );
    await page.waitForFunction(
      () => document.querySelector(
        '.cm-wp-table-container td[data-row="1"][data-col="1"]'
      )?.colSpan === 2,
      { timeout: 5000 }
    );
    const merged = await readTableState(page);
    table = merged.markdown.slice(prefix.length, -suffix.length);
    source = merged.markdown;
    assert.match(table, /B1 <br> C1/);
  }
  const menu = await openActionsWithLongPress(
    page,
    actionCase.target[0],
    actionCase.target[1]
  );
  const buttons = menu.locator('button.cm-wp-table-action');
  assert.equal(await buttons.count(), 9, 'The visible menu must expose all nine table actions');
  const action = menu.locator(`[data-action="${actionCase.id}"]`);
  assert.equal(await action.isDisabled(), false, `${actionCase.id} must be enabled for its fixture`);
  await action.click();
  try {
    await page.waitForFunction(
      previous => window.editorBridge.getMarkdown() !== previous,
      source,
      { timeout: 5000 }
    );
  } catch (error) {
    const observed = await readTableState(page);
    throw new Error(`${error.message}; observed after action: ${JSON.stringify(observed)}`);
  }

  const state = await readTableState(page);
  assert.equal(
    state.markdown,
    `${prefix}${actionCase.expected}${suffix}`,
    `${profile}/${scope}/${actionCase.id}: exact Markdown after visible menu action`
  );
  actionCase.verify(state);

  // Reopen the changed document so assertions cover serialization and rendering,
  // not just the action's temporary model.
  await setDocument(page, state.markdown, { profile, scope });
  const reopened = await readTableState(page);
  assert.equal(reopened.markdown, state.markdown);
  actionCase.verify(reopened);
}

async function tapText(page, selector, targetText) {
  const locator = page.locator(selector).filter({ hasText: targetText }).first();
  await locator.scrollIntoViewIfNeeded();
  const point = await locator.evaluate((element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const offset = node.nodeValue.indexOf(text);
      if (offset < 0) continue;
      const range = document.createRange();
      const midpoint = offset + Math.floor(text.length / 2);
      range.setStart(node, midpoint);
      range.setEnd(node, midpoint + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  }, targetText);
  assert.ok(point, `Could not locate visible text ${JSON.stringify(targetText)}`);
  await page.touchscreen.tap(point.x, point.y);
}

async function editCellWithKeyboard(page, profile, scope) {
  const table = [
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | Beta |',
    '| Gamma | Delta |'
  ].join('\n');
  const source = `${prefix}${table}${suffix}`;
  await setDocument(page, source, { profile, scope });
  await tapText(page, '.cm-wp-table-container td', 'Alpha');
  const firstEditor = page.locator('.cm-wp-cell-editor');
  await firstEditor.waitFor({ state: 'visible', timeout: 5000 });
  const initial = await firstEditor.evaluate(element => ({
    focused: document.activeElement === element,
    markdown: element._getMarkdownValue(),
    selection: element._getSelectionOffsets()
  }));
  assert.equal(initial.focused, true, `${profile}/${scope}: actual cell editor receives focus`);
  assert.equal(initial.markdown, 'Alpha');
  assert.ok(initial.selection.from >= 1 && initial.selection.from <= 4,
    `Tap should place the caret inside Alpha, got ${JSON.stringify(initial)}`);

  const firstLine = 'A rewritten phrase with several words';
  const secondLine = 'A second paragraph that stays in this cell';
  const firstCell = `${firstLine}<br>${secondLine}`;
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  assert.deepEqual(
    await firstEditor.evaluate(element => element._getSelectionOffsets()),
    { from: 0, to: 'Alpha'.length },
    `${profile}/${scope}: keyboard selection must span the whole cell text`
  );
  await page.keyboard.insertText(firstLine);
  assert.equal(await firstEditor.evaluate(element => element._getMarkdownValue()), firstLine,
    `${profile}/${scope}: select-and-replace must replace the whole cell value`);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText(secondLine);
  assert.equal(await firstEditor.evaluate(element => element._getMarkdownValue()), firstCell,
    `${profile}/${scope}: Return must create a serialized line break inside the same cell`);
  assert.equal(
    await firstEditor.evaluate(element => document.activeElement === element),
    true,
    `${profile}/${scope}: the cell editor must keep focus after paragraph input`
  );

  await page.keyboard.press('Tab');
  const firstCommitTable = [
    '| Name | Value |',
    '| :--- | :--- |',
    `| ${firstCell} | Beta |`,
    '| Gamma | Delta |'
  ].join('\n');
  const firstCommit = `${prefix}${firstCommitTable}${suffix}`;
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected,
    firstCommit,
    { timeout: 5000 }
  );
  // Let CodeMirror's 500ms history-group window close so the next cell edit is
  // a separate user operation and one undo should restore this committed table.
  await page.waitForTimeout(600);
  const secondEditor = page.locator(
    '.cm-wp-cell-editor[aria-label="Table cell, row 2, column 2"]'
  );
  await secondEditor.waitFor({ state: 'visible', timeout: 5000 });
  assert.deepEqual(await secondEditor.evaluate(element => ({
    markdown: element._getMarkdownValue(),
    focused: document.activeElement === element
  })), { markdown: 'Beta', focused: true },
    `${profile}/${scope}: Tab must focus the next cell after Markdown commits`);

  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected,
    firstCommit,
    { timeout: 5000 }
  );
  await firstEditor.waitFor({ state: 'visible', timeout: 5000 });
  assert.deepEqual(await firstEditor.evaluate(element => ({
    markdown: element._getMarkdownValue(),
    focused: document.activeElement === element
  })), { markdown: firstCell, focused: true },
    `${profile}/${scope}: Shift+Tab must return to the previously edited cell`);

  await page.keyboard.press('Tab');
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected,
    firstCommit,
    { timeout: 5000 }
  );
  await secondEditor.waitFor({ state: 'visible', timeout: 5000 });
  assert.deepEqual(await secondEditor.evaluate(element => ({
    markdown: element._getMarkdownValue(),
    focused: document.activeElement === element
  })), { markdown: 'Beta', focused: true },
    `${profile}/${scope}: the next cell must remain editable after reverse navigation`);

  const pastedText = 'Pasted words from the clipboard';
  await page.context().grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: page.url() }
  );
  await page.evaluate(async text => navigator.clipboard.writeText(text), pastedText);
  assert.equal(
    await secondEditor.evaluate(element => document.activeElement === element),
    true,
    `${profile}/${scope}: clipboard setup must not steal cell focus`
  );
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+v');
  const pasteState = await page.evaluate(() => ({
    editorValue: document.querySelector('.cm-wp-cell-editor')?._getMarkdownValue() ?? null,
    editorConnected: Boolean(document.querySelector('.cm-wp-cell-editor')),
    focused: document.activeElement === document.querySelector('.cm-wp-cell-editor'),
    activeElement: document.activeElement?.className || document.activeElement?.tagName,
    markdown: window.editorBridge.getMarkdown()
  }));
  assert.equal(pasteState.editorValue, pastedText,
    `${profile}/${scope}: real clipboard paste must replace the active cell: ${JSON.stringify(pasteState)}`);
  assert.equal(pasteState.focused, true,
    `${profile}/${scope}: pasted text must remain in the focused cell editor`);
  const expectedTable = [
    '| Name | Value |',
    '| :--- | :--- |',
    `| ${firstCell} | ${pastedText} |`,
    '| Gamma | Delta |'
  ].join('\n');
  const expectedMarkdown = `${prefix}${expectedTable}${suffix}`;

  await tapText(page, '.cm-line', 'After table.');
  try {
    await page.waitForFunction(
      expected => window.editorBridge.getMarkdown() === expected,
      expectedMarkdown,
      { timeout: 5000 }
    );
  } catch (error) {
    const observed = await page.evaluate(() => ({
      markdown: window.editorBridge.getMarkdown(),
      editorText: document.querySelector('.cm-wp-cell-editor')?.textContent ?? null,
      editorConnected: Boolean(document.querySelector('.cm-wp-cell-editor')),
      activeElement: document.activeElement?.className || document.activeElement?.tagName
    }));
    throw new Error(`${error.message}; expected ${JSON.stringify(expectedMarkdown)}; observed ${JSON.stringify(observed)}`);
  }
  const renderedCells = await page.locator('.cm-wp-table-container tbody tr').evaluateAll(rows =>
    [...rows[0].cells].map(cell => cell.innerText.trim())
  );
  assert.deepEqual(renderedCells, [`${firstLine}\n${secondLine}`, pastedText],
    `${profile}/${scope}: both edited cells must render their complete multi-word text`);

  await tapText(page, '.cm-wp-table-container td', 'Gamma');
  const cancelEditor = page.locator('.cm-wp-cell-editor');
  await cancelEditor.waitFor({ state: 'visible', timeout: 5000 });
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('Temporary words that must not persist');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Delete');
  assert.equal(await cancelEditor.evaluate(element => element._getMarkdownValue()), '',
    `${profile}/${scope}: Delete must clear the selected cell text`);
  await page.keyboard.insertText('Cancelled edit');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.cm-wp-cell-editor'));
  assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), expectedMarkdown,
    `${profile}/${scope}: Escape must discard the temporary cell edit`);

  await tapText(page, '.cm-line', 'After table.');
  await page.keyboard.press('Control+z');
  try {
    await page.waitForFunction(
      previous => window.editorBridge.getMarkdown() === previous,
      firstCommit,
      { timeout: 5000 }
    );
  } catch (error) {
    const undoState = await page.evaluate(() => ({
      markdown: window.editorBridge.getMarkdown(),
      activeElement: document.activeElement?.className || document.activeElement?.tagName
    }));
    throw new Error(`${error.message}; post-undo state ${JSON.stringify(undoState)}`);
  }
  await page.keyboard.press('Control+y');
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected,
    expectedMarkdown,
    { timeout: 5000 }
  );
}

async function sourceViewCellEdit(page, profile) {
  const table = [
    '| Item | Description | Status |',
    '| --- | --- | --- |',
    '| TAP-01 | Alpha | Open |'
  ].join('\n');
  const source = `${prefix}${table}`;
  await setDocument(page, source, { mode: 'source', profile, scope: 'hidden' });
  await page.waitForFunction(
    () => window.editorBridge.getEditorMode() === 'source',
    { timeout: 5000 }
  );
  const usesTableWidget = profile !== 'commonmark';
  if (usesTableWidget) {
    try {
      await page.waitForFunction(
        () => document.querySelector('.cm-source-table-editor'),
        { timeout: 5000 }
      );
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        mode: window.editorBridge.getEditorMode(),
        presentation: window.editorBridge.getEditorPresentation(),
        markdown: window.editorBridge.getMarkdown(),
        editorText: document.querySelector('.cm-content')?.textContent,
        tableWidgets: document.querySelectorAll('.cm-source-table-widget').length,
        sourceModeClass: document.querySelector('#editor-container')?.className
      }));
      throw new Error(`${error.message}; source-mode state ${JSON.stringify(diagnostics)}`);
    }
    await tapText(page, '.cm-source-table-editor .cm-line', 'Alpha');
  } else {
    await page.waitForFunction(
      () => !document.querySelector('.cm-source-table-widget'),
      { timeout: 5000 }
    );
    await tapText(page, '.cm-content .cm-line', 'Alpha');
  }
  const expectedCaret = usesTableWidget
    ? table.indexOf('Alpha') + 2
    : source.indexOf(table) + table.indexOf('Alpha') + 2;
  await page.waitForFunction(({ usesTableWidget, expectedCaret }) => {
    const child = document.querySelector('.cm-source-table-editor')?._sourceTableEditor;
    const parent = JSON.parse(window.editorBridge.getSelectionState());
    const head = usesTableWidget ? child?.state.selection.main.head : parent.head;
    return Number.isInteger(head) && Math.abs(head - expectedCaret) <= 8;
  }, { usesTableWidget, expectedCaret }, { timeout: 5000 });

  const selection = await page.evaluate(usesTableWidget => {
    const child = document.querySelector('.cm-source-table-editor')?._sourceTableEditor;
    const parent = JSON.parse(window.editorBridge.getSelectionState());
    return {
      childMarkdown: child?.state.doc.toString() ?? null,
      childHead: child?.state.selection.main.head ?? null,
      parentHead: parent.head,
      focused: usesTableWidget
        ? document.activeElement === child?.contentDOM
        : document.activeElement?.closest?.('.cm-editor') === document.querySelector('#editor > .cm-editor')
    };
  }, usesTableWidget);
  assert.equal(selection.focused, true, `${profile}/source: the tapped editor must receive focus`);
  const localHead = usesTableWidget ? selection.childHead : selection.parentHead - source.indexOf(table);
  assert.ok(Number.isInteger(localHead) && localHead > 0 && localHead < table.length,
    `${profile}/source: tap must place the caret inside the table, got ${JSON.stringify(selection)}`);
  assert.ok(Math.abs(localHead - table.indexOf('Alpha') - 2) <= 8,
    `${profile}/source: caret should be near the tapped cell text, got ${JSON.stringify(selection)}`);
  assert.equal(selection.childMarkdown, usesTableWidget ? table : null);

  await page.keyboard.press('Control+ArrowLeft');
  await page.keyboard.press('Control+Shift+ArrowRight');
  const replacement = 'Replaced words in this cell';
  await page.keyboard.insertText(replacement);
  const editedTable = table.replace('Alpha', replacement);
  const edited = source.replace(table, editedTable);
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected,
    edited,
    { timeout: 5000 }
  );
  if (usesTableWidget) {
    const childMarkdown = await page.evaluate(
      () => document.querySelector('.cm-source-table-editor')?._sourceTableEditor.state.doc.toString()
    );
    assert.equal(childMarkdown, editedTable,
      `${profile}/source: nested table text and parent Markdown must agree`);
  }

  await page.keyboard.press('Control+z');
  await page.waitForFunction(
    original => window.editorBridge.getMarkdown() === original,
    source,
    { timeout: 5000 }
  );
  if (usesTableWidget) {
    assert.equal(
      await page.evaluate(
        () => document.querySelector('.cm-source-table-editor')?._sourceTableEditor.state.doc.toString()
      ),
      table,
      `${profile}/source: undo must restore the nested table source`
    );
  }
  await page.keyboard.press('Control+y');
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected,
    edited,
    { timeout: 5000 }
  );
}

async function commonmarkLiteralTable(page, scope) {
  const source = `${prefix}${baseTable}${suffix}`;
  await setDocument(page, source, { profile: 'commonmark', scope });
  const state = await page.evaluate(() => ({
    markdown: window.editorBridge.getMarkdown(),
    widgetCount: document.querySelectorAll('.cm-wp-table-container').length,
    visiblePipeSyntax: document.querySelector('.cm-content')?.textContent.includes('| H1 |')
  }));
  assert.equal(state.markdown, source);
  assert.equal(state.widgetCount, 0,
    `CommonMark does not define pipe tables; do not expose GFM table actions by default: ${JSON.stringify(state)}`);
  assert.equal(state.visiblePipeSyntax, true,
    `Pipe-table source should remain visible under the CommonMark profile: ${JSON.stringify(state)}`);
}

async function main() {
  const { server, url } = await startApp();
  let browser;
  let context;
  const failures = [];
  let passed = 0;

  try {
    const { TABLE_ACTIONS } = await import('../src/tableActions.js');
    assert.deepEqual(
      actionCases.map(item => item.id).sort(),
      TABLE_ACTIONS.map(item => item.id).sort(),
      'Every current table menu action must have an explicit UI workflow case'
    );

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox'],
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    });
    context = await browser.newContext({
      viewport: { width: 412, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.addInitScript(() => {
      window.AndroidNative = {
        onHostReady() {},
        onEditorReady() {},
        onContentChanged() {},
        reportDiagnostic() {}
      };
    });
    page.on('console', message => {
      if (message.type() === 'error') console.error(`BROWSER ERROR: ${message.text()}`);
    });
    page.on('pageerror', error => console.error(`BROWSER PAGE ERROR: ${error.message}`));
    await page.goto(url);
    await page.waitForFunction(() => window.editorBridge);

    const tableProfiles = ['gfm', 'obsidian', 'wmdx'];
    const allProfiles = ['commonmark', 'gfm', 'obsidian', 'wmdx'];
    const scopes = ['hidden', 'caret', 'line', 'block'];

    for (const profile of ['gfm', 'obsidian', 'wmdx', 'commonmark']) {
      const label = `${profile}/source/source-cell-edit`;
      if (process.env.TABLE_MATRIX_FILTER && !label.includes(process.env.TABLE_MATRIX_FILTER)) continue;
      try {
        await sourceViewCellEdit(page, profile);
        passed += 1;
        console.log(`PASS source view cell edit ${profile}`);
      } catch (error) {
        failures.push(`${label}: ${error.stack || error.message}`);
        console.error(`FAIL source view cell edit ${profile}: ${error.message}`);
      }
    }

    for (const profile of tableProfiles) {
      for (const scope of scopes) {
        for (const actionCase of actionCases) {
          const label = `${profile}/${scope}/${actionCase.id}`;
          if (process.env.TABLE_MATRIX_FILTER && !label.includes(process.env.TABLE_MATRIX_FILTER)) continue;
          try {
            await applyAction(page, actionCase, profile, scope);
            passed += 1;
            console.log(`PASS table menu ${label}`);
          } catch (error) {
            failures.push(`${label}: ${error.stack || error.message}`);
            console.error(`FAIL table menu ${label}: ${error.message}`);
          }
        }
      }
    }

    for (const profile of tableProfiles) {
      for (const scope of scopes) {
        const label = `${profile}/${scope}/keyboard-edit`;
        if (process.env.TABLE_MATRIX_FILTER && !label.includes(process.env.TABLE_MATRIX_FILTER)) continue;
        try {
          await editCellWithKeyboard(page, profile, scope);
          passed += 1;
          console.log(`PASS table keyboard edit ${label}`);
        } catch (error) {
          failures.push(`${label}: ${error.stack || error.message}`);
          console.error(`FAIL table keyboard edit ${label}: ${error.message}`);
        }
      }
    }

    for (const scope of scopes) {
      const label = `commonmark/${scope}/literal-pipe-table`;
      if (process.env.TABLE_MATRIX_FILTER && !label.includes(process.env.TABLE_MATRIX_FILTER)) continue;
      try {
        await commonmarkLiteralTable(page, scope);
        passed += 1;
        console.log(`PASS CommonMark literal table ${scope}`);
      } catch (error) {
        failures.push(`${label}: ${error.stack || error.message}`);
        console.error(`FAIL CommonMark literal table ${scope}: ${error.message}`);
      }
    }

    console.log(`Table interaction matrix: ${passed} passed, ${failures.length} failed.`);
    if (failures.length) {
      throw new Error(failures.join('\n\n'));
    }
  } finally {
    await context?.close();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
