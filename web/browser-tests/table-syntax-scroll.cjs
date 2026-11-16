const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');
const markdown = [
  'Before the table.',
  '',
  '| Header | A much wider column header |',
  '| --- | --- |',
  '| First cell | This long cell keeps the table wider than the viewport |',
  '| Second cell | Another long value for a whole-table scroll check |',
  '',
  'After the table.'
].join('\n');

function startServer() {
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname
    );
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const file = path.resolve(
      root,
      `.${pathname === '/' ? '/index.html' : pathname}`
    );
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = await fs.readFile(file);
      response.setHeader(
        'Content-Type',
        file.endsWith('.js') ? 'text/javascript' :
          file.endsWith('.css') ? 'text/css' : 'text/html'
      );
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 360, height: 720 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.editorBridge?.setMarkdown);
    await page.evaluate(async source => {
      await window.editorBridge.setEditorMode('rendered');
      window.tableScrollChanges = [];
      window.AndroidNative = {
        setTableScrollEnabled: (view, enabled) => {
          window.tableScrollChanges.push({ view, enabled });
        }
      };
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'gfm',
        pref_markdown_syntax_exposure: 'caret',
        pref_table_scroll_source_enabled: false,
        pref_table_scroll_wysiwyg_enabled: true
      });
      window.editorBridge.setMarkdown(source);
    }, markdown);
    await page.waitForFunction(() =>
      window.editorBridge.getEditorPresentation() === 'live_preview'
    , null, { timeout: 7000 });
    await page.waitForFunction(() =>
      document.querySelector('.cm-wp-table-container')
    , null, { timeout: 7000 });
    await page.evaluate(() =>
      window.editorBridge.setMarkdownSyntaxExposure('block')
    );
    await page.waitForFunction(() =>
      window.editorBridge.getSyntaxExposureScope() === 'block' &&
      window.editorBridge.getEditorPresentation() === 'live_preview' &&
      document.querySelector('.cm-wp-table-container')
    , null, { timeout: 7000 });
    await page.locator(
      '.cm-wp-table-container tbody td[data-row="1"][data-col="1"]'
    ).click({ position: { x: 44, y: 12 } });

    await page.waitForFunction(() =>
      document.querySelector('.cm-source-table-widget') &&
      !document.querySelector('.cm-wp-table-container')
    , null, { timeout: 7000 });
    const enteredSelection = JSON.parse(
      await page.evaluate(() => window.editorBridge.getSelectionState())
    );
    const tappedCellStart = markdown.indexOf('This long cell');
    const tappedCellEnd = markdown.indexOf('\n', tappedCellStart);
    assert.ok(
      enteredSelection.head >= tappedCellStart &&
      enteredSelection.head <= tappedCellEnd,
      `Tapping a rendered table cell must expose source at that cell, not elsewhere: ${JSON.stringify(enteredSelection)}`
    );
    assert.equal(
      await page.locator('.cm-source-table-widget .cm-source-table-editor')
        .evaluate(mount => mount._sourceTableEditor.hasFocus),
      true,
      'The exposed table source editor should receive focus after a rendered-cell tap'
    );
    const exposed = await page.locator('.cm-source-table-widget').evaluate(widget => {
      const scroller = widget.querySelector('.cm-source-table-editor .cm-scroller');
      const content = widget.querySelector('.cm-source-table-editor .cm-content');
      const editorScroller = document.querySelector(
        '#editor > .cm-editor > .cm-scroller'
      );
      const editorContainer = document.querySelector('#editor-container');
      const rect = widget.getBoundingClientRect();
      const editorRect = editorContainer.getBoundingClientRect();
      return {
        enabled: widget.dataset.horizontalScrollEnabled,
        overflowX: getComputedStyle(scroller).overflowX,
        contentWidth: getComputedStyle(content).width,
        text: [...content.querySelectorAll('.cm-line')]
          .map(line => line.textContent)
          .join('\n'),
        widgetWidth: rect.width,
        editorWidth: editorRect.width,
        sourceScrollerWidth: scroller.clientWidth,
        outerEditorOverflow: editorScroller.scrollWidth > editorScroller.clientWidth + 1,
        viewportOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1
      };
    });
    assert.equal(exposed.enabled, 'false');
    assert.equal(exposed.overflowX, 'hidden');
    assert.equal(
      exposed.text,
      markdown.slice(markdown.indexOf('| Header'), markdown.indexOf('\n\nAfter the table.'))
    );
    assert.ok(
      exposed.widgetWidth <= exposed.editorWidth + 1,
      `The exposed source widget must stay within the document width: ${JSON.stringify(exposed)}`
    );
    assert.ok(
      !exposed.outerEditorOverflow && !exposed.viewportOverflow,
      `Wrapped source must not widen the document or viewport: ${JSON.stringify(exposed)}`
    );

    const exposedToggle = await page.evaluate(() =>
      window.editorBridge.toggleTableScrolling()
    );
    assert.deepEqual(exposedToggle, {
      preferenceKey: 'pref_table_scroll_source_enabled',
      enabled: true
    });
    assert.deepEqual(await page.evaluate(() => window.tableScrollChanges.at(-1)), {
      view: 'source',
      enabled: true
    });
    assert.equal(
      await page.locator('.cm-source-table-widget')
        .getAttribute('data-horizontal-scroll-enabled'),
      'true'
    );
    const sourceScrollLayout = await page.locator('.cm-source-table-widget').evaluate(widget => {
      const scroller = widget.querySelector('.cm-source-table-editor .cm-scroller');
      const editorScroller = document.querySelector(
        '#editor > .cm-editor > .cm-scroller'
      );
      return {
        enabled: widget.dataset.horizontalScrollEnabled,
        localOverflow: scroller.scrollWidth > scroller.clientWidth + 1,
        localScrollMoves: (() => {
          scroller.scrollLeft = Math.min(100, scroller.scrollWidth - scroller.clientWidth);
          return scroller.scrollLeft > 0;
        })(),
        outerEditorOverflow: editorScroller.scrollWidth > editorScroller.clientWidth + 1,
        viewportOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1
      };
    });
    assert.ok(
      sourceScrollLayout.localOverflow && sourceScrollLayout.localScrollMoves,
      `The whole exposed table must scroll inside its own source scroller: ${JSON.stringify(sourceScrollLayout)}`
    );
    assert.ok(
      !sourceScrollLayout.outerEditorOverflow && !sourceScrollLayout.viewportOverflow,
      `Source table scrolling must not widen the editor or viewport: ${JSON.stringify(sourceScrollLayout)}`
    );

    await page.evaluate(source => {
      const afterTable = source.indexOf('After the table.') + 4;
      window.editorBridge.setSelectionState(JSON.stringify({
        anchor: afterTable,
        head: afterTable
      }));
    }, markdown);
    await page.waitForFunction(() =>
      document.querySelector('.cm-wp-table-container') &&
      !document.querySelector('.cm-source-table-widget')
    );
    const renderedToggle = await page.evaluate(() =>
      window.editorBridge.toggleTableScrolling()
    );
    assert.deepEqual(renderedToggle, {
      preferenceKey: 'pref_table_scroll_wysiwyg_enabled',
      enabled: false
    });
    assert.deepEqual(await page.evaluate(() => window.tableScrollChanges.at(-1)), {
      view: 'wysiwyg',
      enabled: false
    });
    assert.equal(
      await page.locator('.cm-wp-table-container')
        .getAttribute('data-horizontal-scroll-enabled'),
      'false'
    );
    console.log('PASS: exposed tables use Source scrolling; rendered tables keep WYSIWYG scrolling');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
