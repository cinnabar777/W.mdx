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
    await page.evaluate(async source => {
      await window.editorBridge.setEditorMode('rendered');
      await window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'commonmark',
        pref_markdown_syntax_exposure: 'hidden'
      });
      window.editorBridge.setMarkdown(source);
      window.editorBridge.setSelectionState({ anchor: 0, head: 0 });
      document.querySelector('.cm-content')?.focus();
    }, source);

    await page.waitForTimeout(40);
    const beforeHiddenTag = await page.evaluate(() => {
      const cursor = document.querySelector('.cm-cursor-primary');
      const rect = cursor?.getBoundingClientRect();
      return {
        head: JSON.parse(window.editorBridge.getSelectionState()).head,
        visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
          getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0
      };
    });
    assert.ok(beforeHiddenTag.visible,
      `caret at the start of hidden HTML must remain visible: ${JSON.stringify(beforeHiddenTag)}`);

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
    assert.equal(state.head, 4, 'hidden scope skips the opening tag');
    assert.equal(state.text.includes('<H3>'), false, 'hidden scope keeps the opening tag hidden');
    assert.ok(state.cursor.visible, `caret is visible after the opening tag: ${JSON.stringify(state)}`);

    for (let i = 0; i < 'Heading'.length; i += 1) await page.keyboard.press('ArrowRight');
    state = await page.evaluate(() => ({
      head: JSON.parse(window.editorBridge.getSelectionState()).head,
      cursor: (() => {
        const cursor = document.querySelector('.cm-cursor-primary');
        const rect = cursor?.getBoundingClientRect();
        return {
          visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
            getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0
        };
      })()
    }));
    assert.equal(state.head, 11, 'caret reaches the end of the visible heading text');
    assert.ok(state.cursor.visible, 'caret remains visible at the end of the heading text');

    await page.keyboard.press('ArrowRight');
    state = await page.evaluate(() => ({
      head: JSON.parse(window.editorBridge.getSelectionState()).head,
      text: document.querySelector('.cm-content')?.innerText,
      cursor: (() => {
        const cursor = document.querySelector('.cm-cursor-primary');
        const rect = cursor?.getBoundingClientRect();
        return {
          visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
            getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0
        };
      })()
    }));
    assert.equal(state.head, source.length, 'hidden scope skips the closing tag');
    assert.equal(state.text.includes('</H3>'), false, 'hidden scope keeps the closing tag hidden');
    assert.ok(state.cursor.visible, `caret remains visible after the closing tag: ${JSON.stringify(state)}`);

    await page.evaluate(async () => {
      window.editorBridge.setMarkdownSyntaxExposure('caret');
      await new Promise(resolve => setTimeout(resolve, 30));
      window.editorBridge.setSelectionState({ anchor: 0, head: 0 });
      document.querySelector('.cm-content')?.focus();
    });
    await page.waitForTimeout(40);
    const exposedTag = await page.evaluate(() => ({
      text: document.querySelector('.cm-content')?.innerText,
      cursor: (() => {
        const cursor = document.querySelector('.cm-cursor-primary');
        const rect = cursor?.getBoundingClientRect();
        return {
          visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
            getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0
        };
      })()
    }));
    assert.ok(exposedTag.text.includes('<H3>'),
      `caret at the opening delimiter exposes the tag, including its first character: ${JSON.stringify(exposedTag)}`);
    assert.equal(exposedTag.text.includes('</H3>'), false,
      'the matching closing tag stays hidden');
    assert.ok(exposedTag.cursor.visible,
      `caret is visible at the opening delimiter: ${JSON.stringify(exposedTag)}`);

    await page.evaluate(() => {
      window.editorBridge.setSelectionState({ anchor: 4, head: 4 });
    });
    await page.waitForTimeout(40);
    const afterOpeningTag = await page.evaluate(() => ({
      text: document.querySelector('.cm-content')?.innerText,
      cursor: (() => {
        const cursor = document.querySelector('.cm-cursor-primary');
        const rect = cursor?.getBoundingClientRect();
        return {
          visible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
            getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0
        };
      })()
    }));
    assert.equal(afterOpeningTag.text.includes('<H3>'), false,
      'caret immediately after the opening tag does not leave it exposed');
    assert.ok(afterOpeningTag.cursor.visible,
      `caret is visible at the first text character: ${JSON.stringify(afterOpeningTag)}`);

    await page.evaluate(() => {
      window.editorBridge.setSelectionState({ anchor: 11, head: 11 });
    });
    await page.waitForTimeout(40);
    const closingTag = await page.evaluate(() => {
      const cursor = document.querySelector('.cm-cursor-primary');
      const rect = cursor?.getBoundingClientRect();
      return {
        text: document.querySelector('.cm-content')?.innerText,
        cursorVisible: !!cursor && getComputedStyle(cursor).display !== 'none' &&
          getComputedStyle(cursor).visibility !== 'hidden' && rect.height > 0
      };
    });
    assert.ok(closingTag.text.includes('</H3>'),
      'caret at the closing-tag boundary exposes that tag instead of hiding the caret');
    assert.ok(closingTag.cursorVisible,
      `caret remains visible at the closing-tag boundary: ${JSON.stringify(closingTag)}`);

    await page.evaluate(() => {
      window.editorBridge.setSelectionState({
        anchor: '<H3>Heading</H3>'.length,
        head: '<H3>Heading</H3>'.length
      });
    });
    await page.waitForTimeout(40);
    const afterClosingTag = await page.evaluate(() => ({
      text: document.querySelector('.cm-content')?.innerText,
      cursor: document.querySelector('.cm-cursor-primary')?.getBoundingClientRect()
    }));
    assert.equal(afterClosingTag.text.includes('</H3>'), false,
      'caret after the closing tag hides that tag again');
    assert.ok(afterClosingTag.cursor?.height > 0,
      `caret remains visible after the closing tag: ${JSON.stringify(afterClosingTag)}`);
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
