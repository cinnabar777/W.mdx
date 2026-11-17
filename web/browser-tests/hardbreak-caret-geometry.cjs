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
        pref_markdown_syntax_exposure: 'caret',
        pref_paragraph_hyphenate: true
      });
      window.editorBridge.setMarkdown('first line  \nintercontinentalization remains in this paragraph');
    });
    await page.waitForSelector('.cm-hardbreak-spaces');

    const geometry = await page.evaluate(() => {
      const span = document.querySelector('.cm-hardbreak-spaces');
      const paragraph = span.closest('.cm-paragraph');
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (!text || text.data !== '  ') return { error: 'hard-break spaces are not literal text' };

      const carets = [];
      const characterRects = [];
      for (let offset = 0; offset <= text.length; offset += 1) {
        const caret = document.createRange();
        caret.setStart(text, offset);
        caret.collapse(true);
        const rect = caret.getBoundingClientRect();
        carets.push({ x: rect.left, y: rect.top, height: rect.height });

        if (offset < text.length) {
          const character = document.createRange();
          character.setStart(text, offset);
          character.setEnd(text, offset + 1);
          const characterRect = character.getBoundingClientRect();
          characterRects.push({
            left: characterRect.left,
            right: characterRect.right,
            width: characterRect.width,
            height: characterRect.height
          });
        }
      }

      return {
        whiteSpace: getComputedStyle(span).whiteSpace,
        paragraphHyphens: getComputedStyle(paragraph).hyphens,
        carets,
        characterRects
      };
    });

    assert.equal(geometry.error, undefined, geometry.error);
    assert.equal(geometry.whiteSpace, 'break-spaces',
      'hard-break spaces must preserve their visual positions');
    assert.equal(geometry.paragraphHyphens, 'auto',
      'the paragraph keeps its configured hyphenation while the caret visits the break');
    assert.equal(geometry.characterRects.length, 2);
    assert.ok(geometry.characterRects.every(rect => rect.width > 0 && rect.height > 0),
      `both spaces need measurable layout: ${JSON.stringify(geometry)}`);
    assert.ok(
      geometry.carets[0].x < geometry.carets[1].x &&
      geometry.carets[1].x < geometry.carets[2].x,
      `each caret offset across the trailing spaces needs its own horizontal position: ${JSON.stringify(geometry)}`
    );
    await page.evaluate(head => {
      window.editorBridge.setSelectionState({ anchor: head, head });
      document.querySelector('.cm-content')?.focus();
    }, 'first line'.length);
    const hyphenationWhileMoving = [];
    for (const expectedHead of [11, 12, 13, 14]) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(20);
      const state = await page.evaluate(() => {
        const paragraph = document.querySelector('.cm-paragraph');
        const spaces = document.querySelector('.cm-hardbreak-spaces');
        return {
          head: JSON.parse(window.editorBridge.getSelectionState()).head,
          hyphens: getComputedStyle(paragraph).hyphens,
          whiteSpace: getComputedStyle(spaces).whiteSpace,
          hardBreakSpaces: spaces.textContent
        };
      });
      assert.equal(state.head, expectedHead, 'real Right-arrow movement reaches each expected hard-break offset');
      hyphenationWhileMoving.push(state);
    }
    assert.ok(hyphenationWhileMoving.every(state =>
      state.hyphens === 'auto' && state.whiteSpace === 'break-spaces' && state.hardBreakSpaces === '  '
    ), `hyphenation and hard-break spacing stay stable across caret movement: ${JSON.stringify(hyphenationWhileMoving)}`);
    assert.deepEqual(pageErrors, [], 'the editor must not report browser errors');
    console.log('1 focused hard-break caret geometry check passed.');
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
