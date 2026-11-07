const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');
const phoneFixture = path.resolve(__dirname, '../../Documentation/Markdown-Phone-Test.md');
const modes = ['wysiwyg', 'live_preview', 'source'];
const text = 'Item text with **bold words** and enough ordinary words to wrap onto several rows at phone width, testing that every wrapped row starts underneath the content rather than underneath the marker. ';
const markers = ['-', '+', '*', '1.', '1)', 'a.', 'A.', 'i.', 'I.', '- [ ]', '- [x]', '[ ]'];

async function placeCursorInListText(page, index) {
  const item = page.locator('.cm-list-item').nth(index);
  await item.scrollIntoViewIfNeeded();
  const point = await item.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    let fallback = null;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest(
        '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
      )) continue;
      const boldOffset = node.data.indexOf('bold');
      const startOffset = boldOffset >= 0 ? boldOffset + 1 : 0;
      for (let offset = startOffset; offset < node.length; offset++) {
        if (/\s/.test(node.data[offset])) continue;
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width && rect.height) {
          const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          if (boldOffset >= 0) return point;
          fallback ??= point;
          break;
        }
      }
    }
    return fallback;
  });
  assert.ok(point, `list item ${index} should expose a text position`);
  await page.mouse.click(point.x, point.y);
}

async function placeCursorInListMarker(page, index) {
  const item = page.locator('.cm-list-item').nth(index);
  await item.scrollIntoViewIfNeeded();
  const point = await item.evaluate(element => {
    const marker = element.querySelector('.cm-list-bullet, .cm-list-number');
    if (!marker) return null;
    const rect = marker.getBoundingClientRect();
    return rect.width && rect.height
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : null;
  });
  assert.ok(point, `list item ${index} should expose a marker position`);
  await page.mouse.click(point.x, point.y);
}

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
      window.testClipboardText = '';
      window.markdownExportCapture = null;
      window.AndroidNative = {
        onHostReady() {}, onEditorReady() {}, onContentChanged() {},
        readClipboard() { return window.testClipboardText; },
        saveMarkdownExport(dialect, markdown, warnings) {
          window.markdownExportCapture = { dialect, markdown, warnings };
        },
        reportDiagnostic(name, detail) {
          if (/decoration_error|syntax_parse_timeout/.test(name)) {
            window.layoutDiagnostics.push({ name, detail });
          }
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
        await placeCursorInListText(page, 1);
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

    for (const nonHanging of [false, true]) {
    await page.evaluate(async ({ nonHanging }) => {
      await window.editorBridge.setEditorMode('live_preview');
      window.editorBridge.applyAllPreferences(JSON.stringify({
        pref_list_non_hanging: nonHanging
      }));
      window.editorBridge.setMarkdown(
        '- Contextual marker with **bold text** and enough additional words to wrap across several lines without losing the list block alignment.\n\nTail'
      );
    }, { nonHanging });
    await page.waitForTimeout(100);
    await page.locator('.cm-line').last().click();
    await page.waitForFunction(() => {
      const lines = [...document.querySelectorAll('.cm-list-item')];
      return lines.length > 0 &&
        lines.every(line => line.style.getPropertyValue('--list-marker-gutter') !== '');
    });
    await page.waitForTimeout(20);
    const readMarkerTransition = () => page.locator('.cm-list-item').evaluate(line => ({
      text: line.textContent,
      depth: line.style.getPropertyValue('--list-depth-offset'),
      margin: getComputedStyle(line).marginLeft,
      lineLeft: line.getBoundingClientRect().left,
      contentX: line.querySelector('.cm-layout-content')?.getBoundingClientRect().left,
      gutter: line.style.getPropertyValue('--list-marker-gutter'),
      activeLine: line.classList.contains('cm-activeLine'),
      markerIsRendered: line.querySelector('.cm-list-bullet, .cm-list-number')
        ?.getAttribute('aria-hidden') === 'true',
      rows: (() => {
        const rows = new Map();
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement.closest('.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox')) continue;
          for (let index = 0; index < node.length; index++) {
            if (/\s/.test(node.data[index])) continue;
            const range = document.createRange();
            range.setStart(node, index); range.setEnd(node, index + 1);
            const rect = range.getBoundingClientRect();
            if (rect.width && rect.height) rows.set(Math.round(rect.top), Math.min(rows.get(Math.round(rect.top)) ?? Infinity, rect.left));
          }
        }
        return [...rows.values()];
      })()
    }));
    const inactive = await readMarkerTransition();
    assert.equal(inactive.activeLine, false, 'cursor should start outside the list');
    assert.ok(inactive.rows.length >= 2, 'inactive list fixture should wrap');
    const expectedWrapX = nonHanging ? inactive.lineLeft : inactive.rows[0];
    for (const x of inactive.rows.slice(1)) {
      assert.ok(Math.abs(x - expectedWrapX) < 1.5,
        `inactive wrapped list text drifted: ${JSON.stringify(inactive)}`);
    }
    assert.equal(inactive.markerIsRendered, true, 'inactive Live Preview marker should be rendered');
    await page.locator('.cm-list-item .cm-list-bullet[aria-hidden="true"], .cm-list-item .cm-list-number[aria-hidden="true"]').click();
    await page.waitForTimeout(100);
    const active = await readMarkerTransition();
    assert.equal(active.activeLine, true, 'marker tap should place the cursor in the list item');
    assert.equal(active.markerIsRendered, false, 'active Live Preview marker should reveal source syntax');
    assert.ok(active.text.startsWith('-'), 'active Live Preview marker should reveal source syntax');
    assert.equal(active.depth, inactive.depth);
    assert.equal(active.margin, inactive.margin);
    assert.ok(Math.abs(active.lineLeft - inactive.lineLeft) < 1.5,
      `cursor on marker moved the list block: ${JSON.stringify({ inactive, active })}`);
    assert.ok(Math.abs(active.contentX - inactive.contentX) < 1.5,
      `cursor on marker moved the list text start: ${JSON.stringify({ inactive, active })}`);
    assert.ok(Math.abs(parseFloat(active.gutter) - parseFloat(inactive.gutter)) < 1.5,
      `cursor on marker changed the reserved list gutter: ${JSON.stringify({ inactive, active })}`);
    assert.equal(active.rows.length, inactive.rows.length,
      `cursor on marker changed list wrapping: ${JSON.stringify({ inactive, active })}`);
    assert.ok(active.rows.length >= 2, 'active list fixture should wrap');
    for (const x of active.rows.slice(1)) {
      assert.ok(Math.abs(x - expectedWrapX) < 1.5,
        `active wrapped list text drifted: ${JSON.stringify(active)}`);
    }
    for (let row = 0; row < inactive.rows.length; row++) {
      assert.ok(Math.abs(active.rows[row] - inactive.rows[row]) < 1.5,
        `revealing list syntax moved wrapped text: ${JSON.stringify({ inactive, active })}`);
    }
    await page.setViewportSize({ width: 390, height: 480 });
    await page.waitForTimeout(80);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const afterKeyboardCycle = await readMarkerTransition();
    assert.equal(afterKeyboardCycle.activeLine, true,
      'keyboard close should preserve the active list item');
    assert.ok(Math.abs(parseFloat(afterKeyboardCycle.gutter) - parseFloat(active.gutter)) < 1.5,
      'keyboard close should preserve the marker gutter');
    assert.equal(afterKeyboardCycle.rows.length, active.rows.length,
      'keyboard close should preserve wrapped row count');
    for (let row = 0; row < active.rows.length; row++) {
      assert.ok(Math.abs(afterKeyboardCycle.rows[row] - active.rows[row]) < 1.5,
        'keyboard close shifted wrapped list text');
    }
    cases++;
    }

    const orderedMarkerDoc = [
      ...Array.from({ length: 10 }, (_, index) =>
        `1. Ordered item ${index + 1} with **formatted text** and enough additional words to wrap across several rows in a narrow phone editor without shifting its list block.`
      ),
      '',
      'Tail'
    ].join('\n');
    for (const nonHanging of [false, true]) {
      await page.evaluate(async ({ markdown, nonHanging }) => {
        await window.editorBridge.setEditorMode('live_preview');
        window.editorBridge.applyAllPreferences(JSON.stringify({
          pref_list_non_hanging: nonHanging
        }));
        window.editorBridge.setMarkdown(markdown);
      }, { markdown: orderedMarkerDoc, nonHanging });
      await page.waitForTimeout(140);
      await page.locator('.cm-line').last().click();
      await page.waitForTimeout(40);
      const readTenthItem = () => page.locator('.cm-list-item').nth(9).evaluate(line => {
        const rows = new Map();
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement.closest(
            '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
          )) continue;
          for (let offset = 0; offset < node.length; offset++) {
            if (/\s/.test(node.data[offset])) continue;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const rect = range.getBoundingClientRect();
            if (rect.width && rect.height) {
              const y = Math.round(rect.top);
              rows.set(y, Math.min(rows.get(y) ?? Infinity, rect.left));
            }
          }
        }
        return {
          text: line.textContent,
          active: line.classList.contains('cm-activeLine'),
          markerIsRendered: line.querySelector('.cm-list-number')
            ?.getAttribute('aria-hidden') === 'true',
          contentX: line.querySelector('.cm-layout-content')?.getBoundingClientRect().left,
          lineLeft: line.getBoundingClientRect().left,
          gutter: line.style.getPropertyValue('--list-marker-gutter'),
          rows: [...rows.values()]
        };
      });
      const inactive = await readTenthItem();
      assert.ok(inactive.text.startsWith('10.'),
        `ordered display marker should number the tenth item: ${inactive.text}`);
      assert.equal(inactive.active, false, 'ordered list should start unfocused');
      assert.equal(inactive.markerIsRendered, true, 'ordered list marker should start rendered');
      await page.evaluate(() => window.editorBridge.setEditorMode('source'));
      await page.waitForTimeout(100);
      await placeCursorInListMarker(page, 9);
      await page.evaluate(() => window.editorBridge.setEditorMode('live_preview'));
      await page.waitForTimeout(80);
      const active = await readTenthItem();
      assert.ok(active.text.startsWith('1.'),
        `active ordered marker should reveal the original source number: ${active.text}`);
      assert.equal(active.active, true, 'ordered marker tap should focus the tenth item');
      assert.equal(active.markerIsRendered, false, 'active ordered marker should show source syntax');
      assert.ok(Math.abs(active.lineLeft - inactive.lineLeft) < 1.5,
        `ordered marker state changed the block margin: ${JSON.stringify({ inactive, active })}`);
      assert.ok(active.rows.length >= 2, 'the active ordered item should still wrap');
      for (const x of active.rows.slice(1)) {
        const expected = nonHanging ? active.lineLeft : active.rows[0];
        assert.ok(Math.abs(x - expected) < 1.5,
          `active ordered-item wrapping is misaligned: ${JSON.stringify({ inactive, active, nonHanging })}`);
      }
      cases++;
    }

    const cursorStressText =
      'Long wrapped text keeps this list item readable while the caret moves between siblings and nested levels.';
    const cursorStressDoc = [
      `- Root alpha ${cursorStressText}`,
      `- Root beta ${cursorStressText}`,
      `  - Nested alpha ${cursorStressText}`,
      `  - Nested beta ${cursorStressText}`,
      '',
      `1. Numbered alpha ${cursorStressText}`,
      `2. Numbered beta ${cursorStressText}`,
      `   1. Numbered child ${cursorStressText}`,
      '',
      'Tail'
    ].join('\n');
    for (const mode of modes) {
      await page.evaluate(async ({ mode, markdown }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.applyAllPreferences(JSON.stringify({ pref_list_non_hanging: false }));
        window.editorBridge.setMarkdown(markdown);
      }, { mode, markdown: cursorStressDoc });
      await page.waitForTimeout(120);
      await page.waitForFunction(() => {
        const lines = [...document.querySelectorAll('.cm-list-item')];
        return lines.length === 7 &&
          lines.every(line => line.style.getPropertyValue('--list-marker-gutter') !== '');
      });
      const readListPositions = () => page.evaluate(() =>
        [...document.querySelectorAll('.cm-list-item')].map(line => {
          const rows = new Map();
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (node.parentElement.closest(
              '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
            )) continue;
            for (let index = 0; index < node.length; index++) {
              if (/\s/.test(node.data[index])) continue;
              const range = document.createRange();
              range.setStart(node, index);
              range.setEnd(node, index + 1);
              const rect = range.getBoundingClientRect();
              if (rect.width && rect.height) {
                const y = Math.round(rect.top);
                rows.set(y, Math.min(rows.get(y) ?? Infinity, rect.left));
              }
            }
          }
          return {
            text: line.textContent.replace(/\s+/g, ' ').trim(),
            activeLine: line.classList.contains('cm-activeLine'),
            depth: line.style.getPropertyValue('--list-depth-offset'),
            margin: parseFloat(getComputedStyle(line).marginLeft),
            lineLeft: line.getBoundingClientRect().left,
            contentX: line.querySelector('.cm-layout-content')?.getBoundingClientRect().left,
            startX: line.querySelector('.cm-layout-start')?.getBoundingClientRect().left,
            gutter: line.style.getPropertyValue('--list-marker-gutter'),
            paddingLeft: getComputedStyle(line).paddingLeft,
            textIndent: getComputedStyle(line).textIndent,
            rows: [...rows.values()]
          };
        })
      );
      let previous = await readListPositions();
      assert.equal(previous.length, 7, `${mode}: all stress-test list items should be laid out`);
      assert.notEqual(previous[2].depth, previous[0].depth, `${mode}: nested bullet lost its semantic depth`);
      assert.notEqual(previous[6].depth, previous[5].depth, `${mode}: nested ordered item lost its semantic depth`);
      let previousActive = -1;
      for (const activeIndex of [0, 2, 5, 6, 1, 4]) {
        await placeCursorInListText(page, activeIndex);
        await page.waitForTimeout(100);
        const current = await readListPositions();
        assert.equal(current.length, previous.length, `${mode}: cursor entry changed list recognition`);
        assert.equal(current[activeIndex].activeLine, true,
          `${mode}: test cursor must be inside the selected list item`);
        if (previousActive >= 0 && previousActive !== activeIndex) {
          assert.equal(current[previousActive].activeLine, false,
            `${mode}: leaving an item should move the active line`);
        }
        assert.ok(current.every(line => line.gutter !== ''),
          `${mode}: list marker measurement was lost after cursor entry: ${JSON.stringify(current)}`);
        assert.ok(current[activeIndex].rows.length >= 2,
          `${mode}: stress-test item should wrap: ${current[activeIndex].text}`);
        for (const x of current[activeIndex].rows.slice(1)) {
          assert.ok(Math.abs(x - current[activeIndex].rows[0]) < 1.5,
            `${mode}: wrapped text moved relative to its block: ${JSON.stringify(current[activeIndex])}`);
        }
        for (let index = 0; index < current.length; index++) {
          assert.ok(Math.abs(current[index].margin - previous[index].margin) < 1.5,
            `${mode}: focus changed a list block's indentation: ${current[index].text}`);
          assert.ok(Math.abs(current[index].lineLeft - previous[index].lineLeft) < 1.5,
            `${mode}: focus moved a list block to another column: ${current[index].text}`);
          assert.ok(Math.abs(current[index].contentX - previous[index].contentX) < 1.5,
            `${mode}: entering/leaving a list changed its text start: ${current[index].text}`);
          assert.equal(current[index].rows.length, previous[index].rows.length,
            `${mode}: entering/leaving a list changed wrapped rows: ${current[index].text}`);
          if (index === previousActive || index === activeIndex) continue;
          assert.equal(current[index].depth, previous[index].depth,
            `${mode}: cursor movement changed list depth for ${current[index].text}`);
          assert.ok(Math.abs(current[index].contentX - previous[index].contentX) < 1.5,
            `${mode}: cursor movement shifted another list item's text: ${current[index].text}`);
          const currentGutter = Number.parseFloat(current[index].gutter) || 0;
          const previousGutter = Number.parseFloat(previous[index].gutter) || 0;
          assert.ok(Math.abs(currentGutter - previousGutter) < 1.5,
            `${mode}: cursor movement changed another list marker gutter: ${current[index].text}`);
        }
        previous = current;
        previousActive = activeIndex;
        cases++;
      }

      await page.setViewportSize({ width: 390, height: 480 });
      await page.waitForTimeout(80);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(100);
      const afterKeyboardCycle = await readListPositions();
      assert.equal(afterKeyboardCycle.length, previous.length, `${mode}: viewport resize hid list items`);
      assert.ok(afterKeyboardCycle.every(line => line.gutter !== ''),
        `${mode}: list marker measurement was lost on keyboard close: ${JSON.stringify(afterKeyboardCycle)}`);
      for (let index = 0; index < previous.length; index++) {
        assert.equal(afterKeyboardCycle[index].depth, previous[index].depth,
          `${mode}: keyboard-sized viewport changed list depth`);
        assert.ok(Math.abs(afterKeyboardCycle[index].margin - previous[index].margin) < 1.5,
          `${mode}: keyboard-sized viewport moved list block ${afterKeyboardCycle[index].text}`);
        assert.ok(Math.abs(afterKeyboardCycle[index].contentX - previous[index].contentX) < 1.5,
          `${mode}: keyboard close shifted list text ${afterKeyboardCycle[index].text}`);
        assert.ok(Math.abs(
          (Number.parseFloat(afterKeyboardCycle[index].gutter) || 0) -
          (Number.parseFloat(previous[index].gutter) || 0)
        ) < 1.5,
        `${mode}: keyboard close changed marker width for ${afterKeyboardCycle[index].text}`);
        assert.equal(afterKeyboardCycle[index].rows.length, previous[index].rows.length,
          `${mode}: keyboard close changed wrapped rows for ${afterKeyboardCycle[index].text}`);
        for (let row = 0; row < previous[index].rows.length; row++) {
          assert.ok(Math.abs(afterKeyboardCycle[index].rows[row] - previous[index].rows[row]) < 1.5,
            `${mode}: keyboard close moved a wrapped row for ${afterKeyboardCycle[index].text}`);
        }
      }
    }

    const wideSourceTable = [
      '| Identifier | Description | Owner | Updated | State | Notes |',
      '| :--- | :--- | :--- | ---: | :---: | :--- |',
      '| WMDX-001 | A deliberately long table row that should remain on one source line | Editor | 2026-11-06 | Open | Keep every pipe and separator intact |'
    ].join('\n');
    for (const mode of modes) {
      await page.evaluate(async ({ mode, markdown }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown(markdown);
      }, { mode, markdown: wideSourceTable });
      await page.waitForTimeout(100);
      const tableLayout = await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller');
        const line = document.querySelector('.cm-table-source-line');
        if (!scroller) return null;
        if (!line) return { renderedTables: document.querySelectorAll('.cm-wp-table-container').length };
        const style = getComputedStyle(line);
        line.scrollLeft = line.scrollWidth;
        return {
          whiteSpace: style.whiteSpace,
          renderedTables: document.querySelectorAll('.cm-wp-table-container').length,
          editorHorizontalOverflow: scroller.scrollWidth > scroller.clientWidth + 1,
          rowHorizontalOverflow: line.scrollWidth > line.clientWidth + 1,
          rowScrollWorks: line.scrollLeft > 0,
          rowWidth: line.clientWidth,
          viewportWidth: scroller.clientWidth
        };
      });
      if (mode === 'source') {
        assert.equal(tableLayout.whiteSpace, 'pre', 'Source table rows should not wrap');
        assert.ok(tableLayout.rowHorizontalOverflow, 'Source table row should overflow locally');
        assert.ok(tableLayout.rowScrollWorks, 'Source table row should scroll horizontally');
        assert.ok(!tableLayout.editorHorizontalOverflow,
          `Source table must not widen the document: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.rowWidth <= tableLayout.viewportWidth + 1,
          `Source table scroller should stay within the editor: ${JSON.stringify(tableLayout)}`);
        assert.equal(tableLayout.renderedTables, 0, 'Source should retain raw table syntax');
      } else {
        assert.ok(tableLayout.renderedTables >= 1, `${mode}: table should remain rendered and editable`);
      }
      cases++;
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const phoneMarkdown = await fs.readFile(phoneFixture, 'utf8');
    await page.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('source');
      window.editorBridge.setMarkdown(markdown);
    }, phoneMarkdown);
    await page.waitForFunction(() => window.editorBridge.getMarkdown().includes('WMDX-001'));
    const fullFixtureSourceLayouts = await page.evaluate(async () => {
      const scroller = document.querySelector('.cm-scroller');
      const layouts = [];
      for (const position of [0, 0.4, 0.65, 1]) {
        scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight) * position;
        await new Promise(resolve => setTimeout(resolve, 80));
        const content = document.querySelector('.cm-content');
        const tableRows = [...document.querySelectorAll('.cm-table-source-line')];
        const overflowingRows = [...document.querySelectorAll('.cm-line')]
          .filter(line => line.getBoundingClientRect().width > scroller.clientWidth + 1)
          .slice(0, 8)
          .map(line => ({
            className: line.className,
            width: Math.round(line.getBoundingClientRect().width),
            text: line.textContent.slice(0, 100)
          }));
        layouts.push({
          position,
          scrollerWidth: scroller.clientWidth,
          scrollerScrollWidth: scroller.scrollWidth,
          contentWidth: Math.round(content.getBoundingClientRect().width),
          contentScrollWidth: content.scrollWidth,
          tableRowCount: tableRows.length,
          overflowingRows
        });
      }
      return layouts;
    });
    assert.ok(fullFixtureSourceLayouts.some(layout => layout.tableRowCount >= 3),
      `Phone fixture should expose raw source table rows: ${JSON.stringify(fullFixtureSourceLayouts)}`);
    assert.ok(fullFixtureSourceLayouts.every(layout =>
      layout.scrollerScrollWidth <= layout.scrollerWidth + 1 &&
      layout.contentWidth <= layout.scrollerWidth + 1 &&
      layout.contentScrollWidth <= layout.scrollerWidth + 1 &&
      layout.overflowingRows.length === 0
    ), `Full phone fixture must not widen the Source editor: ${JSON.stringify(fullFixtureSourceLayouts)}`);
    cases++;

    const calloutFixture = [
      '# Callout source contract',
      '',
      '> [!info] Information callout',
      '> The title and body stay in one styled callout.',
      '> **Markdown formatting** remains available inside the body.',
      '',
      '> [!question]+ Foldable callout',
      '> Its source title must remain intact.'
    ].join('\n');
    await page.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('source');
      window.editorBridge.setMarkdown(markdown);
    }, calloutFixture);
    await page.waitForTimeout(120);
    const sourceCallout = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.cm-line.cm-callout')];
      const title = lines.find(line => line.classList.contains('cm-callout-title'));
      let markerNode = null;
      if (title) {
        const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent.includes('>')) {
            markerNode = node;
            break;
          }
        }
      }
      let markerX = null;
      if (markerNode) {
        const offset = markerNode.textContent.indexOf('>');
        const range = document.createRange();
        range.setStart(markerNode, offset);
        range.setEnd(markerNode, offset + 1);
        markerX = range.getBoundingClientRect().left;
      }
      return {
        text: window.editorBridge.getMarkdown(),
        titleWidgets: document.querySelectorAll('.cm-callout-title-container').length,
        renderedTitleRows: document.querySelectorAll('.cm-callout-title-rendered').length,
        calloutRows: lines.length,
        titleText: title?.textContent ?? '',
        markerX,
        lineX: title?.getBoundingClientRect().left ?? null,
        expectedMarkerX: title
          ? title.getBoundingClientRect().left +
            parseFloat(getComputedStyle(title).borderLeftWidth || '0') +
            parseFloat(getComputedStyle(title).paddingLeft || '0') -
            parseFloat(title.style.getPropertyValue('--list-marker-gutter') || '0')
          : null
      };
    });
    assert.equal(sourceCallout.text, calloutFixture, 'Source must preserve the exact callout Markdown');
    assert.equal(sourceCallout.titleWidgets, 0, 'Source must not replace the callout title with a widget');
    assert.equal(sourceCallout.renderedTitleRows, 0, 'Source must not claim a rendered callout title row');
    assert.ok(sourceCallout.calloutRows >= 5, 'Source should retain semantic callout styling on each quote line');
    assert.match(sourceCallout.titleText, /^>\s*\[!info\]\s+Information callout/,
      'Source callout title syntax must stay on its original top row');
    assert.ok(Number.isFinite(sourceCallout.markerX) &&
      Math.abs(sourceCallout.markerX - sourceCallout.expectedMarkerX) < 2,
    `Source quote marker should stay at the callout content edge: ${JSON.stringify(sourceCallout)}`);

    for (const mode of ['live_preview', 'wysiwyg']) {
      await page.evaluate(async ({ mode, markdown }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown(markdown);
      }, { mode, markdown: calloutFixture });
      await page.waitForTimeout(120);
      assert.ok(await page.locator('.cm-callout-title-container').count() >= 1,
        `${mode}: rendered callout should have a title widget`);
      assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), calloutFixture,
        `${mode}: rendering callouts must not alter Markdown`);
      const calloutGeometry = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(
          '.cm-line.cm-callout[data-callout-type="info"]'
        )];
        return rows.map(line => {
          const rect = line.getBoundingClientRect();
          const style = getComputedStyle(line);
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            background: style.backgroundColor,
            borderLeft: style.borderLeftWidth,
            text: line.textContent.replace(/\s+/g, ' ').trim()
          };
        });
      });
      assert.ok(calloutGeometry.length >= 3, `${mode}: callout title and body should share the styled block`);
      assert.ok(calloutGeometry[0].text.includes('Information callout'),
        `${mode}: title should remain on the callout's first row`);
      assert.ok(calloutGeometry.every(row => row.borderLeft !== '0px'),
        `${mode}: the callout border should continue across title and body rows`);
      for (let index = 1; index < calloutGeometry.length; index++) {
        const gap = calloutGeometry[index].top - calloutGeometry[index - 1].bottom;
        assert.ok(gap <= 2,
          `${mode}: callout rows should form one continuous styled block: ${JSON.stringify(calloutGeometry)}`);
      }
      cases++;
    }

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

    const colorFixture = 'Highlighter slots: ==highlight 1==, ==₀highlight 2==, ==₁highlight 3==, ==₂highlight 4==.\n\nPen slots: =pen 1=, =₀pen 2=, =₁pen 3=, =₂pen 4=.\n\nSolid _underline_.';
    await page.evaluate(async colorFixture => {
      await window.editorBridge.setEditorMode('wysiwyg');
      window.editorBridge.setMarkdown(colorFixture);
    }, colorFixture);
    await page.waitForTimeout(120);
    const renderedColors = await page.evaluate(() => ({
      highlight: [...document.querySelectorAll('[class*="cm-wmdx-highlight-"]')]
        .map(element => element.className),
      pen: [...document.querySelectorAll('[class*="cm-wmdx-pen-"]')]
        .map(element => element.className),
      underlines: document.querySelectorAll('.cm-underline').length,
      delimitersVisible: document.querySelector('.cm-content')?.textContent.includes('==') ||
        document.querySelector('.cm-content')?.textContent.includes('=pen')
    }));
    assert.equal(renderedColors.highlight.length, 4, 'all highlight color slots should render');
    assert.equal(renderedColors.pen.length, 4, 'all pen color slots should render');
    assert.ok(renderedColors.underlines >= 1, 'WYSIWYG should style W.mdx underline');
    assert.equal(renderedColors.delimitersVisible, false, 'WYSIWYG should hide valid color syntax');
    await page.evaluate(() => window.editorBridge.setEditorMode('source'));
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), colorFixture);
    const sourceColors = await page.evaluate(() => ({
      highlights: document.querySelectorAll('[class*="cm-wmdx-highlight-"]').length,
      pens: document.querySelectorAll('[class*="cm-wmdx-pen-"]').length,
      underlines: document.querySelectorAll('.cm-underline').length,
      syntaxVisible: document.querySelector('.cm-content')?.textContent.includes('==₀highlight') &&
        document.querySelector('.cm-content')?.textContent.includes('=₀pen')
    }));
    assert.equal(sourceColors.highlights, 4, 'Source should style all highlights');
    assert.equal(sourceColors.pens, 4, 'Source should style all pen colors');
    assert.ok(sourceColors.underlines >= 1, 'Source should style W.mdx underline');
    assert.equal(sourceColors.syntaxVisible, true, 'Source should keep W.mdx delimiters visible');

    const scrollFixture = Array.from({ length: 140 }, (_, index) =>
      `- Anchor-${String(index).padStart(3, '0')} wrapped list text with **bold syntax** and enough words to exercise line wrapping across source and rendered modes.`
    ).join('\n');
    await page.evaluate(async scrollFixture => {
      await window.editorBridge.setEditorMode('wysiwyg');
      window.editorBridge.setMarkdown(scrollFixture);
    }, scrollFixture);
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller');
      if (scroller) scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * 0.5;
    });
    await page.waitForTimeout(80);
    for (const mode of ['source', 'live_preview', 'wysiwyg', 'source']) {
      const anchor = await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller');
        if (!scroller) return null;
        const bounds = scroller.getBoundingClientRect();
        const target = [...document.querySelectorAll('.cm-line')].find(line => {
          const rect = line.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom &&
            /\bAnchor-\d{3}\b/.test(line.textContent);
        });
        if (!target) return null;
        const token = /\bAnchor-\d{3}\b/.exec(target.textContent)?.[0];
        if (!token) return null;
        const targetBounds = target.getBoundingClientRect();
        const desiredOffset = Math.round(scroller.clientHeight * 0.35);
        scroller.scrollTop += targetBounds.top - bounds.top - desiredOffset;
        return new Promise(resolve => requestAnimationFrame(() => {
          const nextBounds = scroller.getBoundingClientRect();
          const nextTarget = [...document.querySelectorAll('.cm-line')]
            .find(line => line.textContent.includes(token));
          resolve(nextTarget ? {
            token,
            offset: nextTarget.getBoundingClientRect().top - nextBounds.top
          } : null);
        }));
      });
      assert.ok(anchor && Number.isFinite(anchor.offset), `missing scroll anchor before ${mode}`);
      await page.evaluate(async mode => {
        await window.editorBridge.setEditorMode(mode);
      }, mode);
      await page.waitForTimeout(240);
      const anchoredAfter = await page.evaluate(token => {
        const scroller = document.querySelector('.cm-scroller');
        const target = [...document.querySelectorAll('.cm-line')]
          .find(line => line.textContent.includes(token));
        return scroller && target
          ? target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
          : null;
      }, anchor.token);
      assert.ok(Number.isFinite(anchoredAfter), `missing scroll anchor after ${mode}`);
      assert.ok(Math.abs(anchoredAfter - anchor.offset) < 4,
        `mode switch moved the visible document position: ${mode} (${anchor.offset}px -> ${anchoredAfter}px)`);
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

    const openMenuAction = async title => {
      await page.evaluate(() => document.querySelector('#bottom-toolbar #grp-btn-menu')?.click());
      const action = page.locator('#popup-toolbar-strip .popup-strip-btn')
        .filter({ hasText: title }).first();
      await action.waitFor({ state: 'attached' });
      await action.evaluate(button => button.click());
    };

    await page.evaluate(() => window.editorBridge.setMarkdown(
      '# Imported title\n\n[Project](docs/Project%20Notes.md)'
    ));
    await page.waitForTimeout(100);
    await openMenuAction('Convert from Markdown dialect');
    await page.locator('#markdown-conversion-format').selectOption('commonmark');
    await page.locator('#markdown-conversion-preview-button').click();
    const conversionPreview = await page.locator('#markdown-conversion-preview').inputValue();
    assert.match(conversionPreview, /^\.1 Imported title/m);
    assert.match(conversionPreview, /\[docs\/Project%20Notes\.md\|Project\|\|\]/);
    await page.locator('#markdown-conversion-apply').click();
    await page.waitForTimeout(80);
    const convertedDocument = await page.evaluate(() => window.editorBridge.getMarkdown());
    assert.match(convertedDocument, /^\.1 Imported title/m);
    assert.match(convertedDocument, /\[docs\/Project%20Notes\.md\|Project\|\|\]/);

    await page.evaluate(() => window.editorBridge.setMarkdown('Note.[^missing]'));
    await page.waitForTimeout(60);
    await openMenuAction('Lint document');
    await page.locator('.markdown-lint-item').waitFor();
    assert.match(await page.locator('.markdown-lint-item').first().textContent(), /Footnote reference/);
    await page.locator('.markdown-lint-line').first().click();
    await page.waitForTimeout(40);
    assert.match(await page.locator('.cm-activeLine').first().textContent(), /Note/);

    await page.evaluate(() => window.editorBridge.setMarkdown(
      '.1 Export title\n\n[docs/Guide.md|Guide||]'
    ));
    await page.waitForTimeout(80);
    await openMenuAction('Export Markdown dialect');
    await page.locator('#markdown-conversion-format').selectOption('obsidian');
    await page.locator('#markdown-conversion-preview-button').click();
    const exportPreview = await page.locator('#markdown-conversion-preview').inputValue();
    assert.match(exportPreview, /^# Export title/m);
    assert.match(exportPreview, /^\[\[docs\/Guide\.md\|Guide\]\]/m);
    await page.locator('#markdown-conversion-apply').click();
    const exportCapture = await page.evaluate(() => window.markdownExportCapture);
    assert.equal(exportCapture.dialect, 'obsidian');
    assert.match(exportCapture.markdown, /^\[\[docs\/Guide\.md\|Guide\]\]/m);

    await page.evaluate(() => {
      window.testClipboardText = '# Pasted heading\n\n[Site](https://example.com)';
      window.editorBridge.setMarkdown('Replace this document');
    });
    await page.waitForTimeout(80);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+A');
    await openMenuAction('Paste from Markdown dialect');
    await page.locator('#markdown-conversion-format').selectOption('commonmark');
    await page.locator('#markdown-conversion-preview-button').click();
    await page.locator('#markdown-conversion-apply').click();
    await page.waitForTimeout(80);
    const pastedDocument = await page.evaluate(() => window.editorBridge.getMarkdown());
    assert.match(pastedDocument, /^\.1 Pasted heading/m);
    assert.match(pastedDocument, /\[https:\/\/example\.com\|Site\|\|\]/);

    assert.deepEqual(failures, [], 'uncaught browser exceptions');
    assert.deepEqual(await page.evaluate(() => window.layoutDiagnostics), [], 'editor diagnostics');
    console.log(`PASS: ${cases} real-browser list/mode/width/font/wrapping cases; mixed blocks and pending table edits.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
