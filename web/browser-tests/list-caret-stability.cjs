const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');
const documentText = [
  'Before the lists.',
  '',
  '- Root bullet content wraps across several lines so cursor entry must not move the text away from its hanging indent.',
  '  - Nested bullet content wraps across several lines and must remain aligned with its own marker.',
  '    1. Deep ordered content wraps across several lines and keeps the same text start while its syntax is exposed.',
  '',
  '> - Blockquote list content wraps across several lines while remaining inside the quote.',
  '>   - Nested blockquote list content wraps across several lines and keeps its child indentation.',
  '',
  '> [!NOTE]',
  '> - Callout list content wraps across several lines without moving when the caret enters.',
  '>   - Nested callout list content wraps across several lines and remains aligned with its marker.',
  '',
  '```markdown',
  '- This is literal code, not a rendered list item.',
  '```',
  '',
  'After the lists.'
].join('\n');

const listPhrases = [
  'Root bullet content',
  'Nested bullet content',
  'Deep ordered content',
  'Blockquote list content',
  'Nested blockquote list content',
  'Callout list content',
  'Nested callout list content'
];
const syntaxScopes = ['hidden', 'caret', 'line', 'block'];

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

async function clickPhrase(page, phrase) {
  await page.locator('.cm-line')
    .filter({ hasText: phrase })
    .first()
    .scrollIntoViewIfNeeded();
  const point = await page.locator('.cm-content').evaluate((content, text) => {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.indexOf(text) < 0) continue;
      const start = node.nodeValue.indexOf(text) + Math.floor(text.length / 2);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  }, phrase);
  assert.ok(point, `Could not locate visible text ${JSON.stringify(phrase)}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(40);
}

async function listRowStarts(page, phrase) {
  await page.locator('.cm-line')
    .filter({ hasText: phrase })
    .first()
    .scrollIntoViewIfNeeded();
  const geometry = await page.locator('.cm-content').evaluate((content, text) => {
    const block = [...content.querySelectorAll('.cm-list-block-text')]
      .find(element => element.textContent.includes(text));
    if (!block) return null;
    const range = document.createRange();
    range.selectNodeContents(block);
    const rows = new Map();
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const top = Math.round(rect.top * 2) / 2;
      const row = rows.get(top) || { top, left: rect.left };
      row.left = Math.min(row.left, rect.left);
      rows.set(top, row);
    }
    return {
      display: content.ownerDocument.defaultView.getComputedStyle(block).display,
      lineDisplay: content.ownerDocument.defaultView
        .getComputedStyle(block.closest('.cm-line')).display,
      rows: [...rows.values()]
    };
  }, phrase);
  assert.ok(geometry, `No rendered list text block found for ${JSON.stringify(phrase)}`);
  assert.equal(geometry.display, 'block');
  assert.equal(geometry.lineDisplay, 'flex');
  assert.ok(geometry.rows.length >= 2, `${JSON.stringify(phrase)} did not wrap`);
  const starts = geometry.rows.map(row => row.left);
  const drift = Math.max(...starts) - Math.min(...starts);
  assert.ok(
    drift <= 2.5,
    `${JSON.stringify(phrase)} wrapped rows do not share a hanging indent: ${starts.join(', ')}`
  );
  return geometry;
}

async function setDocument(page, scope) {
  await page.evaluate(async ({ markdown, syntaxScope }) => {
    await window.editorBridge.setEditorMode('rendered');
    window.editorBridge.applyAllPreferences({
      pref_markdown_profile: 'obsidian',
      pref_markdown_syntax_exposure: syntaxScope,
      pref_list_non_hanging: false,
      pref_list_inherit_body_typography: false,
      pref_list_left_indent: 24,
      pref_list_right_margin: 0,
      pref_list_font_size: 16,
      pref_line_wrap: true
    });
    window.editorBridge.setMarkdown(markdown);
  }, { markdown: documentText, syntaxScope: scope });
  await page.waitForFunction(
    markdown => window.editorBridge?.getMarkdown() === markdown &&
      document.querySelector('.cm-content'),
    documentText,
    { timeout: 10000 }
  );
  await page.waitForTimeout(80);
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

    for (const scope of syntaxScopes) {
      await setDocument(page, scope);
      await clickPhrase(page, 'Before the lists.');
      const before = new Map();
      for (const phrase of listPhrases) {
        before.set(phrase, await listRowStarts(page, phrase));
      }

      for (const phrase of listPhrases) {
        await clickPhrase(page, phrase);
        const after = await listRowStarts(page, phrase);
        const beforeLeft = before.get(phrase).rows[0].left;
        const afterLeft = after.rows[0].left;
        if (scope === 'hidden') {
          assert.ok(
            Math.abs(afterLeft - beforeLeft) <= 2.5,
            `${scope}/${phrase}: first text row moved ${afterLeft - beforeLeft}px when the caret entered`
          );
        }
      }
    }

    await setDocument(page, 'hidden');
    const renderedListBlocks = await page.locator('.cm-list-block-text')
      .evaluateAll(elements => elements.map(element => element.textContent));
    assert.ok(
      !renderedListBlocks.some(text => text.includes('This is literal code')),
      'List syntax inside a fenced code block must remain literal'
    );

    await page.setViewportSize({ width: 360, height: 420 });
    await clickPhrase(page, 'Nested callout list content');
    await listRowStarts(page, 'Nested callout list content');
    await page.setViewportSize({ width: 360, height: 720 });
    await clickPhrase(page, 'Nested callout list content');
    await listRowStarts(page, 'Nested callout list content');

    await clickPhrase(page, 'Root bullet content');
    const original = await page.evaluate(() => window.editorBridge.getMarkdown());
    await page.keyboard.type('X');
    await page.waitForFunction(text => window.editorBridge.getMarkdown() !== text, original);
    await page.keyboard.press('Control+z');
    await page.waitForFunction(text => window.editorBridge.getMarkdown() === text, original);

    await page.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('source');
      window.editorBridge.setMarkdown(markdown);
    }, documentText);
    await page.waitForFunction(
      markdown => window.editorBridge?.getMarkdown() === markdown,
      documentText,
      { timeout: 10000 }
    );
    const sourceCursor = documentText.indexOf('Root bullet content') + 6;
    await page.evaluate(position => {
      window.editorBridge.setSelectionState({ anchor: position, head: position }, 0);
    }, sourceCursor);
    const sourceSelection = await page.evaluate(() =>
      JSON.parse(window.editorBridge.getSelectionState())
    );
    assert.deepEqual(
      sourceSelection,
      { anchor: sourceCursor, head: sourceCursor },
      'Source/Code view must accept caret movement into the list text'
    );
    assert.equal(
      await page.evaluate(() => window.editorBridge.getMarkdown()),
      documentText,
      'Moving the Source/Code caret must not alter Markdown'
    );
    console.log('Focused list caret/wrapping regression passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
