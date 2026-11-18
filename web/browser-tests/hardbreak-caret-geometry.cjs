const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');

async function startApp() {
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname
    );
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const contents = await fs.readFile(file);
      response.setHeader('Content-Type', file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html');
      response.end(contents);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function main() {
  const { server, url } = await startApp();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox'],
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    });
    const page = await browser.newPage({
      viewport: { width: 412, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
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
    await page.evaluate(async () => {
      await window.editorBridge.setEditorMode('rendered');
      await window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'commonmark',
        pref_markdown_syntax_exposure: 'hidden',
        pref_paragraph_hyphenate: true
      });
    });

    for (const scope of ['hidden', 'caret']) {
      const source = 'Line at end\nNext line';
      const lineEnd = 'Line at end'.length;
      await page.evaluate(async ({ scope, source, lineEnd }) => {
        await window.editorBridge.applyAllPreferences({
          pref_markdown_syntax_exposure: scope
        });
        window.editorBridge.setMarkdown(source);
        window.editorBridge.setSelectionState({
          anchor: lineEnd,
          head: lineEnd
        });
        document.querySelector('.cm-content')?.focus();
      }, { scope, source, lineEnd });

      for (const count of [1, 2]) {
        await page.keyboard.press('Space');
        const expected = `Line at end${' '.repeat(count)}\nNext line`;
        await page.waitForFunction(value =>
          window.editorBridge.getMarkdown() === value, expected);
        const state = await page.evaluate(() => ({
          source: window.editorBridge.getMarkdown(),
          head: JSON.parse(window.editorBridge.getSelectionState()).head,
          specialSpaceMarkup: document.querySelector('.cm-hardbreak-spaces')
        }));
        assert.equal(state.source, expected,
          `${scope}: pressing Space must insert an ordinary source space at line end`);
        assert.equal(state.head, lineEnd + count,
          `${scope}: caret must advance once for each inserted space`);
        assert.equal(state.specialSpaceMarkup, null,
          'hard-break spaces must not be wrapped or styled specially');
      }
    }
    assert.deepEqual(pageErrors, [], 'the editor must not report browser errors');
    console.log('Focused test passed: Space inserts ordinary trailing spaces in WYSIWYG.');
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
