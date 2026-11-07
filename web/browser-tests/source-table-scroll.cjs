const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');

async function main() {
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

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox'],
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {})
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      window.AndroidNative = {
        onHostReady() {},
        onEditorReady() {},
        onContentChanged() {}
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.editorBridge);

    const markdown = [
      '| Identifier | Description | Owner | Updated | State | Notes |',
      '| :--- | :--- | :--- | ---: | :---: | :--- |',
      '| WMDX-001 | A deliberately long table row that should remain on one source line | Editor | 2026-11-06 | Open | Keep every pipe and separator intact |'
    ].join('\n');

    for (const mode of ['source', 'live_preview', 'wysiwyg']) {
      await page.evaluate(async ({ mode, markdown }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown(markdown);
      }, { mode, markdown });
      await page.waitForTimeout(120);

      const result = await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller');
        const lines = [...document.querySelectorAll('.cm-table-source-line')];
        const tableWidgets = document.querySelectorAll('.cm-wp-table-container').length;
        if (!scroller) return null;
        if (!lines.length) {
          return {
            mode: 'rendered',
            tableWidgets,
            markdown: window.editorBridge.getMarkdown()
          };
        }
        const line = lines.at(-1);
        const style = getComputedStyle(line);
        line.scrollLeft = line.scrollWidth;
        return {
          mode: 'source',
          rowCount: lines.length,
          lineWidth: line.clientWidth,
          lineScrollWidth: line.scrollWidth,
          lineScrollLeft: line.scrollLeft,
          lineOverflowX: style.overflowX,
          whiteSpace: style.whiteSpace,
          scrollerWidth: scroller.clientWidth,
          scrollerScrollWidth: scroller.scrollWidth,
          scrollerScrollLeft: scroller.scrollLeft,
          tableWidgets,
          markdown: window.editorBridge.getMarkdown()
        };
      });

      assert.ok(result, `${mode}: editor scroller missing`);
      assert.equal(result.markdown, markdown, `${mode}: table source changed`);
      if (mode === 'source') {
        assert.equal(result.mode, 'source');
        assert.equal(result.rowCount, 3, 'every raw table row should remain present');
        assert.equal(result.whiteSpace, 'pre', 'raw table syntax must not wrap');
        assert.equal(result.lineOverflowX, 'auto', 'each raw row should scroll horizontally');
        assert.ok(
          result.lineScrollWidth > result.lineWidth,
          `wide table row should overflow its own viewport: ${JSON.stringify(result)}`
        );
        assert.ok(result.lineScrollLeft > 0, 'the raw table row should be horizontally scrollable');
        assert.ok(
          result.scrollerScrollWidth <= result.scrollerWidth + 1,
          `table must not widen the whole document: ${JSON.stringify(result)}`
        );
        assert.equal(result.scrollerScrollLeft, 0, 'scrolling a row must not pan the whole editor');
        assert.equal(result.tableWidgets, 0, 'Source should show raw table text');
      } else {
        assert.equal(result.mode, 'rendered');
        assert.equal(result.tableWidgets, 1, `${mode}: table should remain rendered and editable`);
      }
    }
    assert.deepEqual(pageErrors, [], 'browser should not report runtime errors');
    console.log('PASS: Source table rows scroll locally without widening the editor; visual modes keep the editable table.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
