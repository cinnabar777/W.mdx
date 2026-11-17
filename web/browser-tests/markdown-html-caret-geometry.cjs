const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');

async function startApp() {
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
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

    const source = '<H3>Heading</H3>';
    for (const scope of ['hidden', 'caret']) {
      await page.evaluate(async ({ source, scope }) => {
        await window.editorBridge.setEditorMode('rendered');
        await window.editorBridge.applyAllPreferences({
          pref_markdown_profile: 'commonmark',
          pref_markdown_syntax_exposure: scope
        });
        window.editorBridge.setMarkdown(source);
        window.editorBridge.setSelectionState({ anchor: 0, head: 0 });
        document.querySelector('.cm-content')?.focus();
      }, { source, scope });

      await page.keyboard.press('ArrowRight');
      let state = await page.evaluate(() => ({
        head: JSON.parse(window.editorBridge.getSelectionState()).head,
        text: document.querySelector('.cm-content')?.innerText,
        cursor: (() => {
          const cursor = document.querySelector('.cm-cursor-primary');
          const rect = cursor?.getBoundingClientRect();
          return {
            visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
              getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0,
            display: cursor ? getComputedStyle(cursor).display : 'missing',
            height: rect?.height ?? 0
          };
        })()
      }));
      assert.equal(state.head, 4, `${scope}: Right skips the hidden opening tag`);
      assert.equal(state.text.includes('<H3>'), false, `${scope}: opening tag remains hidden`);
      assert.ok(state.cursor.visible, `${scope}: caret is visible after the opening tag: ${JSON.stringify(state)}`);

      for (let i = 0; i < 'Heading'.length; i += 1) await page.keyboard.press('ArrowRight');
      state = await page.evaluate(() => ({
        head: JSON.parse(window.editorBridge.getSelectionState()).head,
        cursor: (() => {
          const cursor = document.querySelector('.cm-cursor-primary');
          const rect = cursor?.getBoundingClientRect();
          return {
            visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
              getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0,
            display: cursor ? getComputedStyle(cursor).display : 'missing',
            height: rect?.height ?? 0
          };
        })()
      }));
      assert.equal(state.head, 11, `${scope}: caret reaches the end of the visible heading text`);
      assert.ok(state.cursor.visible, `${scope}: caret remains visible before the closing tag`);

      await page.keyboard.press('ArrowRight');
      state = await page.evaluate(() => ({
        head: JSON.parse(window.editorBridge.getSelectionState()).head,
        text: document.querySelector('.cm-content')?.innerText,
        cursor: (() => {
          const cursor = document.querySelector('.cm-cursor-primary');
          const rect = cursor?.getBoundingClientRect();
          return {
            visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
              getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0,
            display: cursor ? getComputedStyle(cursor).display : 'missing',
            height: rect?.height ?? 0
          };
        })()
      }));
      assert.equal(state.head, source.length, `${scope}: Right skips the hidden closing tag`);
      assert.equal(state.text.includes('</H3>'), false, `${scope}: closing tag remains hidden`);
      assert.ok(state.cursor.visible, `${scope}: caret remains visible after the closing tag: ${JSON.stringify(state)}`);
    }

    await page.evaluate(() => {
      window.editorBridge.setMarkdownSyntaxExposure('caret');
      window.editorBridge.setSelectionState({ anchor: 1, head: 1 });
      document.querySelector('.cm-content')?.focus();
    });
    const exposedTag = await page.evaluate(() => ({
      text: document.querySelector('.cm-content')?.innerText,
      cursor: (() => {
        const cursor = document.querySelector('.cm-cursor-primary');
        const rect = cursor?.getBoundingClientRect();
        return {
          visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
            getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0,
          display: cursor ? getComputedStyle(cursor).display : 'missing',
          height: rect?.height ?? 0
        };
      })()
    }));
    assert.ok(exposedTag.text.includes('<H3>'), 'caret inside the opening tag exposes only its syntax');
    assert.equal(exposedTag.text.includes('</H3>'), false, 'the matching closing tag stays hidden');
    assert.ok(exposedTag.cursor.visible,
      `caret is visible inside the exposed opening tag: ${JSON.stringify(exposedTag)}`);
    assert.deepEqual(pageErrors, [], 'the editor must not report browser errors');
    console.log('HTML tag caret geometry checks passed for hidden and caret exposure.');
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
