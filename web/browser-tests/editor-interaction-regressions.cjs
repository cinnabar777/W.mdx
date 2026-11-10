const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');

async function startApp() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
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

async function setDocument(page, markdown, {
  mode = 'rendered',
  scope = 'hidden',
  profile = 'gfm'
} = {}) {
  await page.evaluate(async ({ markdown, mode, scope, profile }) => {
    await window.editorBridge.setEditorMode(mode);
    window.editorBridge.applyAllPreferences({
      pref_markdown_profile: profile,
      pref_markdown_syntax_exposure: scope,
      pref_list_non_hanging: false,
      pref_table_scroll_source_enabled: true
    });
    window.editorBridge.setMarkdown(markdown);
  }, { markdown, mode, scope, profile });
  await page.waitForFunction(
    () => document.querySelector('.cm-content')?.textContent.length > 0,
    null,
    { timeout: 10000 }
  );
  await page.waitForTimeout(120);
}

async function tapText(page, selector, text, { lastRect = false } = {}) {
  const point = await page.locator(selector).filter({ hasText: text }).first().evaluate((root, options) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const offset = node.nodeValue.indexOf(options.text);
      if (offset < 0) continue;
      const range = document.createRange();
      range.setStart(node, offset + Math.floor(options.text.length / 2));
      range.setEnd(node, offset + Math.floor(options.text.length / 2) + 1);
      const rects = [...range.getClientRects()];
      const rect = options.lastRect ? rects.at(-1) : rects[0];
      if (rect?.width && rect?.height) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  }, { text, lastRect });
  assert.ok(point, `Could not locate visible text ${JSON.stringify(text)} in ${selector}`);
  await page.touchscreen.tap(point.x, point.y);
  return point;
}

async function tapTextRow(page, selector, text, lastRow) {
  const point = await page.locator(selector).filter({ hasText: text }).first()
    .evaluate((root, options) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const rows = new Map();
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement.closest(
          '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
        )) continue;
        const offset = node.nodeValue.indexOf(options.text);
        if (offset < 0) continue;
        for (let index = offset; index < node.length; index++) {
          if (/\s/.test(node.nodeValue[index])) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width && rect.height) {
            const row = Math.round(rect.top);
            if (!rows.has(row)) {
              rows.set(row, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }
          }
        }
      }
      const visualRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);
      return options.lastRow
        ? visualRows.at(-1)?.[1] ?? null
        : visualRows[0]?.[1] ?? null;
    }, { text, lastRow });
  assert.ok(point, `Could not find a visual row for ${JSON.stringify(text)}`);
  await page.touchscreen.tap(point.x, point.y);
  return point;
}

async function readListGeometry(item, text) {
  return item.evaluate((element, target) => {
    const rows = new Map();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest(
        '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
      )) continue;
      const targetOffset = node.nodeValue.indexOf(target);
      if (targetOffset < 0) continue;
      for (let index = targetOffset; index < node.length; index++) {
        if (/\s/.test(node.nodeValue[index])) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width && rect.height) {
          const row = Math.round(rect.top);
          if (!rows.has(row)) rows.set(row, rect.left);
        }
      }
    }
    return {
      active: element.classList.contains('cm-activeLine'),
      left: element.getBoundingClientRect().left,
      contentX: element.querySelector('.cm-layout-content')?.getBoundingClientRect().left,
      markerGutter: getComputedStyle(element).getPropertyValue('--list-marker-gutter'),
      rowTops: [...rows.keys()].sort((a, b) => a - b),
      source: window.editorBridge.getMarkdown(),
      selection: window.editorBridge.getSelectionState()
    };
  }, text);
}

async function main() {
  const { server, url } = await startApp();
  let browser;
  let context;
  try {
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
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.addInitScript(() => {
      window.AndroidNative = {
        onHostReady() {},
        onEditorReady() {},
        onContentChanged() {},
        reportDiagnostic() {}
      };
    });
    await page.goto(url);
    await page.waitForFunction(() => window.editorBridge);

    const tableSource = [
      '| Item | Description | Status |',
      '| --- | --- | --- |',
      '| TAP-01 | Tap here to edit this source cell | Open |'
    ].join('\n');
    await setDocument(page, tableSource, { mode: 'source' });
    const tableState = await page.evaluate(() => {
      const editor = document.querySelector('#editor > .cm-editor');
      const directLines = [...editor.querySelectorAll(
        ':scope > .cm-scroller > .cm-content > .cm-line'
      )];
      const sourceWidgets = [...document.querySelectorAll('.cm-source-table-widget')];
      const child = sourceWidgets[0]?.querySelector('.cm-source-table-editor');
      return {
        widgetCount: sourceWidgets.length,
        childEditorCount: document.querySelectorAll('.cm-source-table-editor').length,
        visibleTokenOccurrences: (editor.textContent.match(/TAP-01/g) || []).length,
        matchingParentLines: directLines.filter(line =>
          !line.querySelector('.cm-source-table-widget') &&
          line.textContent.includes('TAP-01')
        ).length,
        matchingChildLines: [...(child?.querySelectorAll('.cm-line') || [])]
          .filter(line => line.textContent.includes('TAP-01')).length,
        childMarkdown: child?._sourceTableEditor?.state.doc.toString() ?? null
      };
    });
    assert.equal(tableState.widgetCount, 1, 'Source mode should create exactly one table widget');
    assert.equal(tableState.childEditorCount, 1, 'Source mode should mount exactly one child editor');
    assert.equal(tableState.visibleTokenOccurrences, 1,
      `The source-table content must be painted once, not duplicated: ${JSON.stringify(tableState)}`);
    assert.equal(tableState.matchingParentLines, 0,
      `The replaced parent table source must not paint underneath its editable widget: ${JSON.stringify(tableState)}`);
    assert.equal(tableState.matchingChildLines, 1,
      `Each source-table character must be painted once: ${JSON.stringify(tableState)}`);
    assert.equal(tableState.childMarkdown, tableSource);

    const sourceTapPoint = await tapText(page, '.cm-source-table-editor .cm-line', 'Tap here');
    await page.waitForTimeout(100);
    const selectionAfterTap = await page.evaluate(({ x, y }) => {
      const child = document.querySelector('.cm-source-table-editor')?._sourceTableEditor;
      return {
        focused: document.activeElement === child?.contentDOM,
        hit: document.elementFromPoint(x, y)?.className ?? null,
        head: child?.state.selection.main.head,
        length: child?.state.doc.length,
        markdown: window.editorBridge.getMarkdown()
      };
    }, sourceTapPoint);
    assert.equal(selectionAfterTap.focused, true,
      `A real touch must focus the nested source editor: ${JSON.stringify(selectionAfterTap)}`);
    assert.ok(selectionAfterTap.head > 0 && selectionAfterTap.head < selectionAfterTap.length - 5,
      `Touch should place the source caret at the tapped cell, not at the end: ${JSON.stringify({ sourceTapPoint, selectionAfterTap })}`);
    assert.ok(Math.abs(selectionAfterTap.head - tableSource.indexOf('Tap here')) < 24,
      `Source-table caret should land near the tapped cell text: ${JSON.stringify(selectionAfterTap)}`);
    assert.equal(selectionAfterTap.markdown, tableSource,
      'Moving the source-table caret must not modify the parent document');
    await page.keyboard.insertText('X');
    const tableAfterTyping = await page.evaluate(() => ({
      parent: window.editorBridge.getMarkdown(),
      child: document.querySelector('.cm-source-table-editor')
        ?._sourceTableEditor?.state.doc.toString()
    }));
    assert.notEqual(tableAfterTyping.parent, tableSource,
      `A real source-table tap must allow typing into the parent document: ${JSON.stringify(tableAfterTyping)}`);
    assert.equal(tableAfterTyping.child, tableAfterTyping.parent,
      'The child editor and parent Markdown must stay synchronized after typing');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(markdown =>
      window.editorBridge.getMarkdown() === markdown, tableSource);

    const views = [
      { name: 'WYSIWYG hidden', mode: 'rendered', scope: 'hidden' },
      { name: 'WYSIWYG caret syntax', mode: 'rendered', scope: 'caret' },
      { name: 'WYSIWYG block syntax', mode: 'rendered', scope: 'block' }
    ];
    const listContexts = [
      {
        name: 'root list',
        profile: 'gfm',
        source: [
          'Before the list.',
          '',
          '- ROOT-TAP-01 item text with enough words to wrap onto several visual rows on a phone, keeping every continuation row aligned under the item text and not the marker.',
          '  This continuation paragraph remains part of the same list item and should keep its block alignment.',
          '- Second root item.',
          '',
          'After the list.'
        ].join('\n'),
        target: 'ROOT-TAP-01'
      },
      {
        name: 'nested blockquote list',
        profile: 'gfm',
        source: [
          '> Before the list.',
          '>',
          '> > - QUOTE-TAP-01 item text with enough words to wrap onto several visual rows on a phone, keeping every continuation row aligned under the item text and not the marker.',
          '> >   Continuation remains in the quoted list item.',
          '> > - Second quoted item.'
        ].join('\n'),
        target: 'QUOTE-TAP-01'
      },
      {
        name: 'callout list',
        profile: 'obsidian',
        source: [
          '> [!note] List tap test',
          '> - CALLOUT-TAP-01 item text with enough words to wrap onto several visual rows on a phone, keeping every continuation row aligned under the item text and not the marker.',
          '>   Continuation remains in the callout list item.',
          '> - Second callout item.'
        ].join('\n'),
        target: 'CALLOUT-TAP-01'
      }
    ];
    for (const view of views) {
      for (const listContext of listContexts) {
        await setDocument(page, listContext.source, {
          ...view,
          profile: listContext.profile
        });
        const itemSelector = '.cm-line.cm-list-item';
        const item = page.locator(itemSelector).filter({ hasText: listContext.target }).first();
        await item.waitFor();
        const initialGeometry = await readListGeometry(item, listContext.target);
        assert.ok(initialGeometry.rowTops.length >= 2,
          `${view.name}/${listContext.name} must truly wrap at phone width: ${JSON.stringify(initialGeometry)}`);
        const firstTapPoint = await tapTextRow(page, itemSelector, listContext.target, false);
        await page.waitForTimeout(100);
        const firstTap = await readListGeometry(item, listContext.target);
        assert.equal(firstTap.active, true,
          `${view.name}/${listContext.name}: first-row touch should enter the list item: ${JSON.stringify({ firstTapPoint, firstTap })}`);
        assert.equal(firstTap.source, listContext.source,
          `${view.name}/${listContext.name}: cursor entry must preserve every source character`);
        const itemStart = listContext.source.indexOf(listContext.target);
        const itemEnd = listContext.source.indexOf('\n', itemStart);
        const firstSelection = JSON.parse(firstTap.selection).head;
        assert.ok(firstSelection >= itemStart && firstSelection < itemEnd,
          `${view.name}/${listContext.name}: caret should land in the tapped item, not another block: ${JSON.stringify(firstTap)}`);
        await tapTextRow(page, itemSelector, listContext.target, true);
        await page.waitForTimeout(100);
        const wrappedTap = await readListGeometry(item, listContext.target);
        assert.equal(wrappedTap.active, true,
          `${view.name}/${listContext.name}: wrapped-row touch should remain in the same item`);
        assert.equal(wrappedTap.source, listContext.source,
          `${view.name}/${listContext.name}: wrapped-row cursor placement must not insert/delete characters`);
        const wrappedSelection = JSON.parse(wrappedTap.selection).head;
        assert.ok(wrappedSelection >= itemStart && wrappedSelection < itemEnd,
          `${view.name}/${listContext.name}: wrapped-row caret should remain in its item: ${JSON.stringify(wrappedTap)}`);
        assert.notEqual(wrappedSelection, firstSelection,
          `${view.name}/${listContext.name}: touching a different visual row should move the caret`);
        assert.ok(Math.abs(wrappedTap.left - firstTap.left) < 1.5 &&
          Math.abs(wrappedTap.contentX - firstTap.contentX) < 1.5,
        `${view.name}/${listContext.name}: touching wrapped text shifted its block: ${JSON.stringify({ firstTap, wrappedTap })}`);
        assert.equal(wrappedTap.markerGutter, firstTap.markerGutter,
          `${view.name}/${listContext.name}: wrapped-row tap changed the marker gutter`);
        assert.equal(wrappedTap.rowTops.length, firstTap.rowTops.length,
          `${view.name}/${listContext.name}: wrapped-row tap changed the line count`);
        await page.setViewportSize({ width: 412, height: 480 });
        await page.waitForTimeout(80);
        await page.setViewportSize({ width: 412, height: 844 });
        await page.waitForTimeout(100);
        const afterKeyboard = await readListGeometry(item, listContext.target);
        assert.ok(Math.abs(afterKeyboard.left - firstTap.left) < 1.5 &&
          Math.abs(afterKeyboard.contentX - firstTap.contentX) < 1.5,
        `${view.name}/${listContext.name}: keyboard close shifted list alignment: ${JSON.stringify({ firstTap, afterKeyboard })}`);
        assert.equal(afterKeyboard.markerGutter, firstTap.markerGutter);
        assert.equal(afterKeyboard.rowTops.length, firstTap.rowTops.length);
        assert.equal(afterKeyboard.source, listContext.source);
      }
    }

    const quoteSource = [
      '> Outer quote paragraph.',
      '>',
      '> > Nested quote paragraph.',
      '> >',
      '> > - Nested quote list item with enough words to wrap when tapped on a phone-sized viewport.',
      '> > - Second nested quote list item.',
      '> >',
      '> > ```text',
      '> > Code inside the nested quote.',
      '> > ```',
      '> > Trailing nested quote paragraph.',
      '> Outer quote resumes.'
    ].join('\n');
    const calloutSource = [
      'Outside paragraph before callout.',
      '',
      '> [!note] Header stays beside its icon',
      '> Body line remains in the callout.',
      '> > [!tip] Nested callout title',
      '> > Nested callout paragraph.',
      '> > - Nested callout list item.',
      '> > ```text',
      '> > Code inside the nested callout.',
      '> > ```',
      '> > End of nested callout.',
      '> Outer callout resumes.'
    ].join('\n');

    for (const view of views) {
      await setDocument(page, quoteSource, view);
      const quoteGeometry = await page.evaluate(() => {
        const lineFor = text => [...document.querySelectorAll('.cm-line')]
          .find(line => line.textContent.includes(text));
        return [
          ['nested paragraph', lineFor('Nested quote paragraph.')],
          ['nested list', lineFor('Nested quote list item')],
          ['nested code', lineFor('Code inside the nested quote.')],
          ['nested trailing paragraph', lineFor('Trailing nested quote paragraph.')]
        ].map(([role, line]) => ({
          role,
          text: line?.textContent.trim(),
          classes: line ? [...line.classList] : [],
          depth: line?.dataset.blockquoteDepth ?? null,
          border: line ? getComputedStyle(line).borderLeftWidth : null,
          nestedRail: line ? getComputedStyle(line, '::before').width : null
        }));
      });
      for (const role of ['nested paragraph', 'nested list', 'nested code', 'nested trailing paragraph']) {
        const line = quoteGeometry.find(item => item.role === role);
        assert.ok(line?.classes.includes('cm-blockquote'),
          `${view.name}: ${role} lost its blockquote rail: ${JSON.stringify(line)}`);
        assert.equal(line.depth, '2',
          `${view.name}: ${role} must retain nested quote depth: ${JSON.stringify(line)}`);
        assert.ok(Number.parseFloat(line.border) >= 3,
          `${view.name}: ${role} border is missing: ${JSON.stringify(line)}`);
        assert.ok(Number.parseFloat(line.nestedRail) > 0,
          `${view.name}: ${role} nested rail is missing: ${JSON.stringify(line)}`);
      }

      await setDocument(page, calloutSource, { ...view, profile: 'obsidian' });
      await page.evaluate(position => {
        window.editorBridge.setSelectionState(
          JSON.stringify({ anchor: position, head: position })
        );
      }, calloutSource.indexOf('Outside paragraph') + 2);
      await page.waitForTimeout(100);
      const calloutGeometry = await page.evaluate(() => {
        const titleLine = [...document.querySelectorAll('.cm-line.cm-callout-title-rendered')]
          .find(line => line.textContent.includes('Header stays beside its icon'));
        const icon = titleLine?.querySelector('.cm-callout-icon');
        const title = titleLine?.querySelector('.cm-callout-title-text');
        const iconRect = icon?.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const lines = [...document.querySelectorAll('.cm-line.cm-callout[data-callout-depth="2"]')]
          .filter(line => /Nested callout|Code inside the nested callout|End of nested/.test(line.textContent));
        return {
          presentation: window.editorBridge.getEditorPresentation(),
          exposure: window.editorBridge.getSyntaxExposureScope(),
          selection: window.editorBridge.getSelectionState(),
          iconCount: document.querySelectorAll('.cm-callout-icon').length,
          titleLines: [...document.querySelectorAll('.cm-line.cm-callout-title')]
            .map(line => ({ text: line.textContent.trim(), classes: [...line.classList] })),
          titleLineClasses: titleLine ? [...titleLine.classList] : [],
          icon: iconRect && { x: iconRect.x, y: iconRect.y, height: iconRect.height },
          title: titleRect && { x: titleRect.x, y: titleRect.y, height: titleRect.height },
          titleLineTop: titleLine?.getBoundingClientRect().top ?? null,
          nestedLines: lines.map(line => ({
            text: line.textContent.trim(),
            classes: [...line.classList],
            border: getComputedStyle(line).borderLeftWidth,
            depth: line.dataset.calloutDepth
          }))
        };
      });
      assert.ok(calloutGeometry.icon && calloutGeometry.title,
        `${view.name}: callout title widget is missing: ${JSON.stringify(calloutGeometry)}`);
      assert.ok(Math.abs(calloutGeometry.icon.y - calloutGeometry.title.y) < 5,
        `${view.name}: callout icon and header text must share a row: ${JSON.stringify(calloutGeometry)}`);
      assert.ok(calloutGeometry.nestedLines.length >= 4,
        `${view.name}: nested callout body/list/code lines must all have geometry: ${JSON.stringify(calloutGeometry)}`);
      for (const line of calloutGeometry.nestedLines) {
        assert.ok(line.classes.includes('cm-callout'),
          `${view.name}: nested callout border is discontinuous at ${JSON.stringify(line)}`);
        assert.ok(Number.parseFloat(line.border) >= 3,
          `${view.name}: nested callout border is missing at ${JSON.stringify(line)}`);
      }

      await tapText(page, '.cm-line.cm-callout-title-rendered', 'Header stays beside its icon');
      const afterHeaderTap = await page.evaluate(() => {
        const titleLine = [...document.querySelectorAll('.cm-line')]
          .find(line => line.textContent.includes('Header stays beside its icon'));
        const icon = titleLine?.querySelector('.cm-callout-icon')?.getBoundingClientRect();
        const title = titleLine?.querySelector('.cm-callout-title-text')?.getBoundingClientRect();
        return {
          icon: icon && { x: icon.x, y: icon.y },
          title: title && { x: title.x, y: title.y },
          titleLineTop: titleLine?.getBoundingClientRect().top ?? null,
          source: window.editorBridge.getMarkdown()
        };
      });
      assert.equal(afterHeaderTap.source, calloutSource,
        `${view.name}: tapping an ordinary callout header must not rewrite syntax`);
      assert.ok(afterHeaderTap.titleLineTop !== null &&
        Math.abs(afterHeaderTap.titleLineTop - calloutGeometry.titleLineTop) < 8,
      `${view.name}: tapping the title jumped the header line: ${JSON.stringify({ before: calloutGeometry, after: afterHeaderTap })}`);
      if (afterHeaderTap.icon && afterHeaderTap.title) {
        assert.ok(Math.abs(afterHeaderTap.icon.y - afterHeaderTap.title.y) < 5,
          `${view.name}: tapping the title moved its icon off the header row: ${JSON.stringify(afterHeaderTap)}`);
      } else {
        assert.notEqual(view.scope, 'hidden',
          `${view.name}: WYSIWYG without syntax exposure must retain its title icon`);
      }
    }

    await setDocument(page, quoteSource, { mode: 'source' });
    const sourceQuote = await page.locator('.cm-content').innerText();
    assert.ok(sourceQuote.includes('> > ```text') && sourceQuote.includes('> > Code inside the nested quote.'),
      'Source/Code must preserve literal quote and fenced-code markers');
    assert.equal(await page.locator('.cm-content .cm-callout-icon').count(), 0,
      'Source/Code should not add callout icon widgets to the literal source');

    assert.deepEqual(failures, [], 'browser errors during mobile interaction regressions');
    console.log('PASS: mobile touch regressions for source-table editing, list/quote rails, and callout headers.');
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
