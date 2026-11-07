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
      window.editorBridge.setMarkdown(
        '- Contextual marker with **bold text** and enough additional words to wrap across several lines without losing the list block alignment.'
      );
    });
    await page.waitForTimeout(100);
    await page.locator('.cm-line').last().click();
    await page.waitForFunction(() => {
      const lines = [...document.querySelectorAll('.cm-list-item')];
      return lines.length > 0 &&
        lines.every(line => line.style.getPropertyValue('--list-marker-gutter') !== '');
    });
    await page.waitForTimeout(20);
    const inactive = await page.locator('.cm-list-item').evaluate(line => ({
      text: line.textContent, depth: line.style.getPropertyValue('--list-depth-offset'),
      margin: getComputedStyle(line).marginLeft,
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
      })(),
      gutter: line.style.getPropertyValue('--list-marker-gutter'),
      visibleIndent: line.style.getPropertyValue('--layout-visible-indent'),
      paddingLeft: getComputedStyle(line).paddingLeft,
      textIndent: getComputedStyle(line).textIndent,
      startX: line.querySelector('.cm-layout-start')?.getBoundingClientRect().left,
      contentX: line.querySelector('.cm-layout-content')?.getBoundingClientRect().left
    }));
    assert.ok(inactive.rows.length >= 2, 'inactive list fixture should wrap');
    for (const x of inactive.rows.slice(1)) {
      assert.ok(Math.abs(x - inactive.rows[0]) < 1.5, `inactive wrapped list text drifted: ${JSON.stringify(inactive)}`);
    }
    await page.locator('.cm-list-item').click({ position: { x: 2, y: 8 } });
    await page.waitForTimeout(100);
    const active = await page.locator('.cm-list-item').evaluate(line => ({
      text: line.textContent, depth: line.style.getPropertyValue('--list-depth-offset'),
      margin: getComputedStyle(line).marginLeft,
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
    assert.ok(inactive.text.startsWith('•'), 'inactive Live Preview marker should be rendered');
    assert.ok(active.text.startsWith('-'), 'active Live Preview marker should reveal source syntax');
    assert.equal(active.depth, inactive.depth);
    assert.equal(active.margin, inactive.margin);
    assert.ok(active.rows.length >= 2, 'active list fixture should wrap');
    for (const x of active.rows.slice(1)) {
      assert.ok(Math.abs(x - active.rows[0]) < 1.5, `active wrapped list text drifted: ${active.rows}`);
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
        await page.locator('.cm-list-item').nth(activeIndex).click({ position: { x: 8, y: 8 } });
        await page.waitForTimeout(100);
        const current = await readListPositions();
        assert.equal(current.length, previous.length, `${mode}: cursor entry changed list recognition`);
        assert.ok(current.every(line => line.gutter !== ''),
          `${mode}: list marker measurement was lost after cursor entry: ${JSON.stringify(current)}`);
        assert.ok(current[activeIndex].rows.length >= 2,
          `${mode}: stress-test item should wrap: ${current[activeIndex].text}`);
        for (const x of current[activeIndex].rows.slice(1)) {
          assert.ok(Math.abs(x - current[activeIndex].rows[0]) < 1.5,
            `${mode}: wrapped text moved relative to its block: ${JSON.stringify(current[activeIndex])}`);
        }
        for (let index = 0; index < current.length; index++) {
          if (index === previousActive || index === activeIndex) continue;
          assert.equal(current[index].depth, previous[index].depth,
            `${mode}: cursor movement changed list depth for ${current[index].text}`);
          assert.ok(Math.abs(current[index].margin - previous[index].margin) < 1.5,
            `${mode}: cursor movement shifted another list block: ${current[index].text}`);
          assert.ok(Math.abs(current[index].contentX - previous[index].contentX) < 1.5,
            `${mode}: cursor movement shifted another list item's text: ${current[index].text}`);
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
        scroller.scrollLeft = scroller.scrollWidth;
        return {
          whiteSpace: style.whiteSpace,
          renderedTables: document.querySelectorAll('.cm-wp-table-container').length,
          horizontalOverflow: scroller.scrollWidth > scroller.clientWidth,
          horizontalScrollWorks: scroller.scrollLeft > 0
        };
      });
      if (mode === 'source') {
        assert.equal(tableLayout.whiteSpace, 'pre', 'Source table rows should not wrap');
        assert.ok(tableLayout.horizontalOverflow, 'Source table should use horizontal scrolling');
        assert.ok(tableLayout.horizontalScrollWorks, 'Source table horizontal scrolling should move the editor');
        assert.equal(tableLayout.renderedTables, 0, 'Source should retain raw table syntax');
      } else {
        assert.ok(tableLayout.renderedTables >= 1, `${mode}: table should remain rendered and editable`);
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
    assert.deepEqual(failures, [], 'uncaught browser exceptions');
    assert.deepEqual(await page.evaluate(() => window.layoutDiagnostics), [], 'editor diagnostics');
    console.log(`PASS: ${cases} real-browser list/mode/width/font/wrapping cases; mixed blocks and pending table edits.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
