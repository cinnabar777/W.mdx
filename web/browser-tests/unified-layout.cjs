const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');
const modes = ['wysiwyg', 'live_preview', 'source'];
const text = 'Item text with **bold words** and enough ordinary words to wrap onto several rows at phone width, testing that every wrapped row starts underneath the content rather than underneath the marker. ';
const markers = ['-', '+', '*', '1.', '1)', 'a.', 'A.', 'i.', 'I.', '- [ ]', '- [x]', '[ ]'];

async function main() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const content = await fs.readFile(file);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' :
        file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  let cases = 0;
  try {
    browser = await chromium.launch({
      headless: true, args: ['--no-sandbox'],
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    });
    const page = await browser.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.addInitScript(() => {
      window.layoutDiagnostics = [];
      window.AndroidNative = {
        onHostReady() {}, onEditorReady() {}, onContentChanged() {},
        reportDiagnostic(name) {
          if (/decoration_error|syntax_parse_timeout/.test(name)) window.layoutDiagnostics.push(name);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.editorBridge);
    await page.evaluate(() => window.editorBridge.setEditorMode('wysiwyg'));

    for (const width of [390, 980]) {
      await page.setViewportSize({ width, height: 844 });
      for (const font of ['Arial', 'monospace']) {
        for (const hanging of [true, false]) {
          for (const marker of markers) {
            let firstModeGeometry;
            for (const mode of modes) {
              const markdown = `${marker} ${text}\n\nTail`;
              await page.evaluate(async ({ mode, markdown, hanging, font }) => {
                await window.editorBridge.setEditorMode(mode);
                window.editorBridge.applyAllPreferences(JSON.stringify({ pref_list_non_hanging: !hanging }));
                document.documentElement.style.setProperty('--list-font-family', font);
                window.editorBridge.setMarkdown(markdown);
              }, { mode, markdown, hanging, font });
              await page.waitForTimeout(90);
              await page.locator('.cm-line').last().click();
              await page.waitForTimeout(40);
              const geometry = await page.evaluate(() => {
                const line = document.querySelector('.cm-list-item');
                if (!line) return null;
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                const chars = [];
                let node;
                while ((node = walker.nextNode())) {
                  if (node.parentElement.closest('.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox')) continue;
                  for (let i = 0; i < node.length; i++) {
                    if (/\s/.test(node.data[i])) continue;
                    const range = document.createRange();
                    range.setStart(node, i); range.setEnd(node, i + 1);
                    const rect = range.getBoundingClientRect();
                    if (rect.width && rect.height) chars.push({ x: rect.left, y: rect.top });
                  }
                }
                const rows = new Map();
                for (const char of chars) {
                  const y = Math.round(char.y);
                  rows.set(y, Math.min(rows.get(y) ?? Infinity, char.x));
                }
                const style = getComputedStyle(line);
                return {
                  rows: [...rows.values()], left: line.getBoundingClientRect().left,
                  margin: style.marginLeft, fontSize: style.fontSize,
                  prefix: line.style.getPropertyValue('--list-marker-gutter'),
                  duplicateWrappers: line.querySelectorAll('.cm-list-block-text .cm-list-block-text').length,
                  markdown: window.editorBridge.getMarkdown()
                };
              });
              const label = `${width}/${font}/${hanging}/${marker}/${mode}`;
              assert.ok(geometry, `missing semantic list: ${label}`);
              assert.equal(geometry.markdown, markdown, `source changed: ${label}`);
              assert.equal(geometry.duplicateWrappers, 0, `duplicate wrappers: ${label}`);
              assert.ok(geometry.rows.length >= 2, `fixture must wrap: ${label}`);
              assert.notEqual(geometry.prefix, '', `prefix was not measured: ${label}`);
              if (hanging) {
                for (const x of geometry.rows.slice(1)) {
                  assert.ok(Math.abs(x - geometry.rows[0]) < 1.5,
                    `hanging rows drift: ${label}: ${JSON.stringify(geometry)}`);
                }
              } else {
                for (const x of geometry.rows.slice(1)) {
                  assert.ok(Math.abs(x - geometry.left) < 1.5,
                    `non-hanging rows drift: ${label}: ${JSON.stringify(geometry)}`);
                }
              }
              if (!firstModeGeometry) firstModeGeometry = geometry;
              assert.equal(geometry.margin, firstModeGeometry.margin, `block margin differs: ${label}`);
              assert.equal(geometry.fontSize, firstModeGeometry.fontSize, `list font differs: ${label}`);
              cases++;
            }
          }
        }
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    for (const marker of markers) {
      const native = /^(?:[A-Za-z]|\[)/.test(marker);
      const indent = ' '.repeat(native ? 1 : marker.includes('[') ? 2 : marker.length + 1);
      const continuationIndent = indent + (native ? ' ' : '  ');
      const nested = `${marker} Parent\n${indent}${marker} Child ${text}\n\n${continuationIndent}continued text\n\nTail`;
      let nesting;
      for (const mode of modes) {
        await page.evaluate(async ({ mode, nested }) => {
          await window.editorBridge.setEditorMode(mode);
          window.editorBridge.applyAllPreferences(JSON.stringify({ pref_list_non_hanging: false }));
          window.editorBridge.setMarkdown(nested);
        }, { mode, nested });
        await page.waitForTimeout(100);
        await page.locator('.cm-line').last().click();
        const result = await page.evaluate(() => {
          const child = [...document.querySelectorAll('.cm-list-item')].find(line => line.textContent.includes('Child'));
          const continuation = [...document.querySelectorAll('.cm-line')].find(line => line.textContent.includes('continued text'));
          if (!child) return null;
          const content = child.querySelector('.cm-layout-content');
          const prefixWidth = parseFloat(child.style.getPropertyValue('--list-marker-gutter')) || 0;
          return {
            depth: child.style.getPropertyValue('--list-depth-offset'),
            contentX: content?.getBoundingClientRect().left,
            markerX: content ? content.getBoundingClientRect().left - prefixWidth : null,
            continuation: continuation?.dataset.layoutKind
          };
        });
        assert.ok(result, `${marker}/${mode}: nested list not recognized`);
        assert.equal(result.continuation, 'list-continuation', `${marker}/${mode}: continuation ownership lost`);
        if (!nesting) nesting = result;
        assert.equal(result.depth, nesting.depth, `${marker}: mode-dependent semantic nesting`);
        // Raw indentation is visible Source text, not an extra block indent.
        // Its inline width is compensated by the same shared CSS rule.
        assert.ok(Number.isFinite(result.contentX), `${marker}/${mode}: missing content anchor`);
        cases++;
      }
    }

    await page.evaluate(async () => {
      await window.editorBridge.setEditorMode('live_preview');
      window.editorBridge.setMarkdown('- Contextual marker with **bold text**\n\nTail');
    });
    await page.waitForTimeout(100);
    await page.locator('.cm-line').last().click();
    const inactive = await page.locator('.cm-list-item').evaluate(line => ({
      text: line.textContent, depth: line.style.getPropertyValue('--list-depth-offset'),
      margin: getComputedStyle(line).marginLeft
    }));
    await page.locator('.cm-list-item').click({ position: { x: 2, y: 8 } });
    await page.waitForTimeout(100);
    const active = await page.locator('.cm-list-item').evaluate(line => ({
      text: line.textContent, depth: line.style.getPropertyValue('--list-depth-offset'),
      margin: getComputedStyle(line).marginLeft
    }));
    assert.ok(inactive.text.startsWith('•'), 'inactive Live Preview marker should be rendered');
    assert.ok(active.text.startsWith('-'), 'active Live Preview marker should reveal source syntax');
    assert.equal(active.depth, inactive.depth);
    assert.equal(active.margin, inactive.margin);

    const mixed = '# Heading\n\nParagraph.\n\n> Quote text that should retain the same border and typography.\n\n```js\n- not a list\n```\n\n    literal code\n\n| Head | Other |\n| --- | --- |\n| Cell | Value |\n\nTail';
    for (const mode of modes) {
      await page.evaluate(async ({ mode, mixed }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown(mixed);
      }, { mode, mixed });
      await page.waitForTimeout(120);
      const blocks = await page.evaluate(() => ({
        code: document.querySelectorAll('.cm-codeblock-line').length,
        codeLists: document.querySelectorAll('.cm-codeblock-line.cm-list-item').length,
        headings: document.querySelectorAll('.cm-line.cm-heading').length,
        quote: document.querySelectorAll('.cm-blockquote').length,
        tables: document.querySelectorAll('.cm-wp-table-container').length,
        markdown: window.editorBridge.getMarkdown()
      }));
      assert.ok(blocks.code >= 4, `${mode}: code styling missing`);
      assert.equal(blocks.codeLists, 0);
      assert.equal(blocks.headings, 1);
      assert.ok(blocks.quote >= 1);
      assert.equal(blocks.tables, mode === 'source' ? 0 : 1);
      assert.equal(blocks.markdown, mixed);
    }

    for (const mode of ['wysiwyg', 'live_preview']) {
      await page.evaluate(async mode => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown('| Head | Other |\n| --- | --- |\n| Cell | Value |');
      }, mode);
      const cell = page.locator('.cm-wp-table-container td').first();
      await cell.click();
      const editor = page.locator('.cm-wp-cell-editor');
      if (await editor.count() === 0) await cell.click();
      await editor.waitFor();
      await editor.fill('Cell edited\nsecond line');
      assert.equal(await page.locator('.cm-wp-table-container').count(), 1);
      await page.evaluate(() => window.editorBridge.setEditorMode('source'));
      const committed = await page.evaluate(() => window.editorBridge.getMarkdown());
      assert.match(committed, /Cell edited<br>second line/);
    }
    assert.deepEqual(failures, [], 'uncaught browser exceptions');
    assert.deepEqual(await page.evaluate(() => window.layoutDiagnostics), [], 'editor diagnostics');
    console.log(`PASS: ${cases} real-browser list/mode/width/font/wrapping cases; mixed blocks and pending table edits.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
