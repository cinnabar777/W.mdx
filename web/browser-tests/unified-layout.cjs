const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');
const phoneFixture = path.resolve(__dirname, '../../Documentation/Markdown-Phone-Test.md');
const cheatSheetFixture = path.resolve(__dirname, '../../Documentation/Markdown.md');
const dialectGuideFixture = path.resolve(
  __dirname,
  '../../Documentation/Markdown-Dialects-and-File-Formats.md'
);
const modes = ['wysiwyg', 'live_preview', 'source'];
const text = 'Item text with **bold words** and enough ordinary words to wrap onto several rows at phone width, testing that every wrapped row starts underneath the content rather than underneath the marker. ';
const markers = ['-', '+', '*', '1.', '1)', 'a.', 'A.', 'i.', 'I.', '- [ ]', '- [x]', '[ ]'];

async function placeCursorInListText(page, index, options = {}) {
  const item = page.locator('.cm-list-item').nth(index);
  await item.scrollIntoViewIfNeeded();
  const point = await item.evaluate((element, { wrapped }) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const rows = new Map();
    let node;
    let fallback = null;
    let preferred = null;
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
          const y = Math.round(rect.top);
          if (!rows.has(y)) rows.set(y, point);
          if (boldOffset >= 0 && !preferred) preferred = point;
          fallback ??= point;
        }
      }
    }
    if (wrapped) {
      const lastRow = [...rows.entries()].sort((a, b) => a[0] - b[0]).at(-1);
      return lastRow?.[1] ?? fallback;
    }
    return preferred ?? fallback;
  }, { wrapped: options.wrapped === true });
  assert.ok(point, `list item ${index} should expose a text position`);
  if (options.touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function placeCursorInRawLineText(page, lineIndex, textOffset = 0) {
  const line = page.locator('.cm-line').nth(lineIndex);
  await line.scrollIntoViewIfNeeded();
  const point = await line.evaluate((element, offset) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (offset < node.length) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, Math.min(node.length, offset + 1));
        const rect = range.getBoundingClientRect();
        return rect.width && rect.height
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : null;
      }
      offset -= node.length;
    }
    return null;
  }, textOffset);
  assert.ok(point, `raw source line ${lineIndex} should expose a text position`);
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
      window.testClipboardHtml = '';
      window.markdownExportCapture = null;
      window.AndroidNative = {
        onHostReady() {}, onEditorReady() {}, onContentChanged() {},
        readClipboard() { return window.testClipboardText; },
        readClipboardPayload() {
          return JSON.stringify({
            text: window.testClipboardText,
            html: window.testClipboardHtml
          });
        },
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

    const softBreakDocument = [
      'First paragraph line one',
      'continues in the same paragraph.',
      '',
      '- List item first line',
      '  list continuation stays with its item.',
      '',
      '> Quote first line',
      '> quote continuation.',
      '',
      'Hard break first line  ',
      'hard break begins on the next rendered line.'
    ].join('\n');
    await page.evaluate(text => window.editorBridge.setMarkdown(text), softBreakDocument);
    const renderedSoftBreakText = await page.locator('.cm-content').innerText();
    assert.match(
      renderedSoftBreakText,
      /First paragraph line one continues in the same paragraph\./,
      'single Markdown newlines render as spaces inside a paragraph'
    );
    assert.match(
      renderedSoftBreakText,
      /• List item first line list continuation stays with its item\./,
      'list continuation source indentation is hidden while its text stays in the item'
    );
    assert.match(
      renderedSoftBreakText,
      /Quote first line quote continuation\./,
      'blockquote soft breaks remain in the same rendered paragraph'
    );
    assert.match(
      renderedSoftBreakText,
      /Hard break first line  \nhard break begins on the next rendered line\./,
      'explicit Markdown hard breaks remain line breaks'
    );
    await page.evaluate(() => window.editorBridge.setEditorMode('source'));
    await page.evaluate(text => window.editorBridge.setMarkdown(text), softBreakDocument);
    const rawSoftBreakText = await page.locator('.cm-content').innerText();
    assert.match(rawSoftBreakText, /First paragraph line one\ncontinues in the same paragraph\./);
    assert.match(rawSoftBreakText, /- List item first line\n  list continuation stays with its item\./);
    cases += 5;
    await page.evaluate(() => window.editorBridge.setEditorMode('wysiwyg'));

    const jsonDocuments = [
      ['chrono_backup.json', JSON.stringify({ payload: 'x'.repeat(6_000) })],
      [
        'Clock_backup.json',
        JSON.stringify(
          Object.fromEntries(Array.from({ length: 80 }, (_, index) => [
            `preference_${index}`,
            { enabled: index % 2 === 0, label: `Clock preference ${index}` }
          ])),
          null,
          2
        )
      ]
    ];
    for (const [fileName, jsonText] of jsonDocuments) {
      await page.evaluate(async ({ text, name }) => {
        await window.editorBridge.setMarkdown(text, name);
      }, { text: jsonText, name: fileName });
      assert.equal(
        await page.evaluate(() => window.editorBridge.getEditorMode()),
        'source',
        `${fileName}: non-Markdown files should open in Source/Code mode`
      );
      assert.equal(
        await page.evaluate(() => window.editorBridge.getMarkdown()),
        jsonText,
        `${fileName}: source loading must preserve the entire JSON document`
      );

      if (fileName === 'chrono_backup.json') {
        await page.locator('#grp-btn-menu').evaluate(button => button.click());
        const formatJsonButton = page.locator(
          '#popup-toolbar-strip [data-toolbar-style-id="formatJson"]'
        );
        await formatJsonButton.waitFor({ state: 'visible' });
        assert.equal(await formatJsonButton.isDisabled(), false);
        await formatJsonButton.evaluate(button => button.click());
        const formattedJson = await page.evaluate(() =>
          window.editorBridge.getMarkdown()
        );
        assert.ok(formattedJson.includes('\n  "payload": '));
        assert.equal(JSON.parse(formattedJson).payload.length, 6_000);
        await page.locator('#grp-btn-undo').evaluate(button => button.click());
        assert.equal(
          await page.evaluate(() => window.editorBridge.getMarkdown()),
          jsonText,
          'JSON formatting should be one undoable edit that restores the exact source'
        );

        const invalidJson = '{\n  "valid": true,\n  "broken": }\n';
        await page.evaluate(async text => {
          await window.editorBridge.setMarkdown(text, 'broken.json');
        }, invalidJson);
        await page.locator('#grp-btn-menu').evaluate(button => button.click());
        await page.locator(
          '#popup-toolbar-strip [data-toolbar-style-id="formatJson"]'
        ).evaluate(button => button.click());
        await page.locator('#json-format-error').waitFor({ state: 'visible' });
        assert.equal(
          await page.evaluate(() => window.editorBridge.getMarkdown()),
          invalidJson,
          'invalid JSON must remain untouched'
        );
        assert.match(
          await page.locator('#json-format-error').textContent(),
          /line 3, column/
        );
        await page.locator('#json-format-close').evaluate(button => button.click());
      }

      await page.evaluate(async () => {
        await window.editorBridge.setMarkdown('', 'Untitled.md');
      });
      assert.equal(
        await page.evaluate(() => window.editorBridge.getEditorMode()),
        'rendered',
        'a new Markdown tab should return to the saved rendered-mode preference'
      );
      assert.equal(
        await page.evaluate(() => window.editorBridge.getMarkdown()),
        '',
        'the JSON document must be cleared before returning to rendered Markdown'
      );
      const markdownAfterCode = `# Markdown after ${fileName}\n\nSafe to render.`;
      await page.evaluate(async ({ text, name }) => {
        await window.editorBridge.setMarkdown(text, name);
      }, { text: markdownAfterCode, name: `${fileName}.md` });
      assert.equal(
        await page.evaluate(() => window.editorBridge.getEditorMode()),
        'rendered',
        'Markdown files should return to the selected Markdown view'
      );
      assert.equal(
        await page.evaluate(() => window.editorBridge.getMarkdown()),
        markdownAfterCode,
        'Markdown loading after a JSON file should not retain JSON content'
      );
      cases++;
    }

    const cheatSheet = await fs.readFile(cheatSheetFixture, 'utf8');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of ['live_preview', 'wysiwyg', 'source']) {
      await page.evaluate(async ({ mode, markdown }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown(markdown);
      }, { mode, markdown: cheatSheet });
      await page.waitForTimeout(160);
      assert.equal(
        await page.evaluate(() => window.editorBridge.getMarkdown()),
        cheatSheet,
        `${mode}: the packaged Markdown cheat sheet must remain source-stable`
      );
      assert.deepEqual(
        await page.evaluate(() => window.layoutDiagnostics),
        [],
        `${mode}: cheat-sheet rendering must not fail and retain stale decorations`
      );
      cases++;
    }

    const dialectGuide = await fs.readFile(dialectGuideFixture, 'utf8');
    await page.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('wysiwyg');
      window.editorBridge.setMarkdown(markdown);
    }, dialectGuide);
    await page.waitForTimeout(160);
    await page.evaluate(offset => {
      window.editorBridge.setSelectionState({ anchor: offset, head: offset });
    }, dialectGuide.indexOf('The editor has explicit conversion actions'));
    await page.waitForTimeout(100);
    const guideFlow = await page.locator('.cm-paragraph')
      .filter({ hasText: "The editor has explicit conversion actions" })
      .innerText();
    assert.match(
      guideFlow,
      /Menu group\. They operate on the currently open document or clipboard; they are not a file picker\./,
      'source-wrapped guide prose must render as continuous Markdown paragraphs'
    );
    await page.evaluate(offset => {
      window.editorBridge.setSelectionState({ anchor: offset, head: offset });
    }, dialectGuide.indexOf('Parser-recognized ATX headings'));
    await page.waitForTimeout(100);
    const guideRule = await page.locator('.cm-list-item')
      .filter({ hasText: 'Parser-recognized ATX headings' })
      .innerText();
    assert.match(
      guideRule,
      /Wmdx decimal headings\. Setext headings inside lists or blockquotes/,
      'source-wrapped guide list items must remain one correctly indented item'
    );
    assert.equal(
      await page.evaluate(() => window.editorBridge.getMarkdown()),
      dialectGuide,
      'rendered soft-break layout must preserve the documentation source'
    );
    cases += 2;

    const touchContext = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
    const touchPage = await touchContext.newPage();
    await touchPage.goto(`http://127.0.0.1:${server.address().port}/`);
    await touchPage.waitForFunction(() => window.editorBridge);
    const floatingTouchAction = await touchPage.evaluate(() => {
      const button = document.querySelector(
        '#floating-selection-toolbar [data-toolbar-key]'
      );
      return {
        title: button?.getAttribute('title') ?? null,
        label: button?.getAttribute('aria-label') ?? null
      };
    });
    assert.equal(floatingTouchAction.title, null, 'touch toolbar must not show native title tooltips');
    assert.ok(floatingTouchAction.label, 'touch toolbar keeps its accessible action label');
    await touchPage.locator('#grp-btn-menu').evaluate(button => button.click());
    const pasteTooltipAction = touchPage.locator(
      '#popup-toolbar-strip [data-toolbar-style-id="pasteFromDialect"]'
    );
    await pasteTooltipAction.waitFor({ state: 'visible' });
    assert.equal(await pasteTooltipAction.getAttribute('title'), null);
    assert.equal(
      await pasteTooltipAction.getAttribute('aria-label'),
      'Paste from Markdown dialect'
    );

    const mobileListFixture = [
      '- First item wraps naturally in a phone-sized view.',
      '- Second **formatted** item has enough words to wrap onto multiple rows and reveal the cursor reflow bug when the caret enters the last visible line.',
      '  - A nested item also wraps independently beneath its own marker.',
      ''
    ].join('\n');
    await touchPage.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('live_preview');
      window.editorBridge.applyAllPreferences(JSON.stringify({ pref_list_non_hanging: false }));
      window.editorBridge.setMarkdown(markdown);
    }, mobileListFixture);
    await touchPage.waitForFunction(() => {
      const lines = [...document.querySelectorAll('.cm-list-item')];
      return lines.length === 3 &&
        lines.every(line => line.style.getPropertyValue('--list-marker-gutter') !== '');
    });
    const readMobileListGeometry = () => touchPage.evaluate(() => {
      const line = document.querySelectorAll('.cm-list-item')[1];
      const starts = new Map();
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
            if (!starts.has(y)) starts.set(y, rect.left);
          }
        }
      }
      return {
        markdown: window.editorBridge.getMarkdown(),
        active: line.classList.contains('cm-activeLine'),
        left: line.getBoundingClientRect().left,
        contentX: line.querySelector('.cm-layout-content')?.getBoundingClientRect().left,
        margin: getComputedStyle(line).marginLeft,
        rows: [...starts.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x)
      };
    });
    const mobileListBefore = await readMobileListGeometry();
    assert.ok(mobileListBefore.rows.length >= 2, 'mobile fixture must wrap before cursor entry');
    await placeCursorInListText(touchPage, 1, { touch: true, wrapped: true });
    await touchPage.waitForFunction(() =>
      document.querySelectorAll('.cm-list-item')[1]?.classList.contains('cm-activeLine')
    );
    const mobileListAfterTouch = await readMobileListGeometry();
    assert.equal(mobileListAfterTouch.markdown, mobileListFixture,
      'touching wrapped list text must not edit source');
    assert.equal(mobileListAfterTouch.active, true, 'touch should place the caret in the wrapped item');
    assert.ok(Math.abs(mobileListAfterTouch.left - mobileListBefore.left) < 1.5);
    assert.ok(Math.abs(mobileListAfterTouch.contentX - mobileListBefore.contentX) < 1.5);
    assert.equal(mobileListAfterTouch.rows.length, mobileListBefore.rows.length);
    for (let row = 1; row < mobileListBefore.rows.length; row++) {
      assert.ok(Math.abs(mobileListAfterTouch.rows[row] - mobileListAfterTouch.rows[0]) < 1.5,
        'wrapped list text should retain its alignment after touch cursor entry');
    }
    await touchPage.setViewportSize({ width: 412, height: 500 });
    await touchPage.waitForTimeout(100);
    await touchPage.setViewportSize({ width: 412, height: 915 });
    await touchPage.waitForTimeout(100);
    const mobileListAfterResize = await readMobileListGeometry();
    assert.equal(mobileListAfterResize.markdown, mobileListFixture,
      'simulated keyboard close must not edit list source');
    assert.equal(mobileListAfterResize.rows.length, mobileListBefore.rows.length);
    assert.ok(Math.abs(mobileListAfterResize.contentX - mobileListBefore.contentX) < 1.5);
    assert.ok(Math.abs(
      Number.parseFloat(mobileListAfterResize.margin) -
      Number.parseFloat(mobileListBefore.margin)
    ) < 1.5);

    for (const mode of modes) {
      await page.evaluate(async ({ mode }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown('Water is H~2~O; x^2^; ~~removed~~.');
      }, { mode });
      await page.waitForTimeout(90);
      const inline = await page.evaluate(() => {
        const subscript = document.querySelector('.cm-subscript');
        const superscript = document.querySelector('.cm-superscript');
        const strikethrough = document.querySelector('.cm-strikethrough');
        return {
          markdown: window.editorBridge.getMarkdown(),
          subscriptText: subscript?.textContent ?? null,
          subscriptCount: document.querySelectorAll('.cm-subscript').length,
          subscriptFontSize: subscript ? getComputedStyle(subscript).fontSize : null,
          superscriptText: superscript?.textContent ?? null,
          superscriptFontSize: superscript ? getComputedStyle(superscript).fontSize : null,
          baseFontSize: document.querySelector('.cm-content')
            ? getComputedStyle(document.querySelector('.cm-content')).fontSize
            : null,
          hasStrikethrough: Boolean(strikethrough),
          text: document.querySelector('.cm-content')?.textContent ?? ''
        };
      });
      assert.equal(inline.markdown, 'Water is H~2~O; x^2^; ~~removed~~.', `source changed: ${mode}`);
      if (mode === 'source') {
        assert.match(inline.text, /H~2~O/);
        assert.match(inline.text, /x\^2\^/);
        assert.equal(inline.subscriptCount, 0, 'Source does not apply rendered subscript styling');
        assert.equal(inline.hasStrikethrough, false, 'Source does not apply rendered strikethrough styling');
        cases++;
        continue;
      }
      assert.ok(inline.subscriptText, `subscript styling missing: ${mode}`);
      assert.equal(inline.subscriptCount, 1, `subscript renderer duplicated its mark: ${mode}`);
      assert.ok(inline.superscriptText, `superscript styling missing: ${mode}`);
      assert.ok(
        Number.parseFloat(inline.subscriptFontSize) < Number.parseFloat(inline.baseFontSize),
        `subscript size missing: ${mode}`
      );
      assert.ok(
        Number.parseFloat(inline.superscriptFontSize) < Number.parseFloat(inline.baseFontSize),
        `superscript size missing: ${mode}`
      );
      assert.ok(inline.hasStrikethrough, `double-tilde strikethrough missing: ${mode}`);
      assert.match(inline.text, /H2O/);
      assert.match(inline.text, /x2/);
      assert.doesNotMatch(inline.text, /H~2~O/);
      assert.doesNotMatch(inline.text, /x\^2\^/);
      cases++;
    }

    for (const width of [390, 980]) {
      await page.setViewportSize({ width, height: 844 });
      for (const font of ['Arial', 'monospace']) {
        for (const hanging of [true, false]) {
          for (const marker of markers) {
            let firstModeGeometry;
            for (const mode of ['wysiwyg', 'live_preview']) {
              const markdown = `${marker} ${text}\n\nTail`;
              await page.evaluate(async ({ mode, markdown, hanging, font }) => {
                await window.editorBridge.setEditorMode(mode);
                window.editorBridge.applyAllPreferences(JSON.stringify({ pref_list_non_hanging: !hanging }));
                document.documentElement.style.setProperty('--list-font-family', font);
                window.editorBridge.setMarkdown(markdown);
              }, { mode, markdown, hanging, font });
              await page.waitForTimeout(90);
              await page.locator('.cm-line').last().click();
              await page.waitForFunction(() => {
                const line = document.querySelector('.cm-list-item');
                return line?.style.getPropertyValue('--list-marker-gutter');
              }, null, { timeout: 2000 });
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
              assert.notEqual(
                geometry.prefix,
                '',
                `prefix was not measured: ${label}: ${JSON.stringify(geometry)}`
              );
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
      for (const mode of ['wysiwyg', 'live_preview']) {
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

    for (const mode of ['wysiwyg', 'live_preview']) {
      await page.evaluate(async mode => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.applyAllPreferences(JSON.stringify({
          pref_todo_hide_extra_bullet: true
        }));
        window.editorBridge.setMarkdown('- [ ] A task with enough text to wrap cleanly in this narrow editor view.');
      }, mode);
      await page.waitForTimeout(100);
      const taskMarker = await page.evaluate(() => {
        const line = document.querySelector('.cm-todo-list-item');
        const bullet = line?.querySelector('.cm-list-bullet');
        const separator = line?.querySelector('.cm-todo-bullet-separator');
        const checkbox = line?.querySelector('.cm-todo-checkbox');
        return {
          line: Boolean(line),
          separatorDisplay: separator ? getComputedStyle(separator).display : null,
          bulletDisplay: bullet ? getComputedStyle(bullet).display : null,
          checkboxMarginLeft: checkbox ? getComputedStyle(checkbox).marginLeft : null,
          checkboxMarginRight: checkbox ? getComputedStyle(checkbox).marginRight : null
        };
      });
      assert.equal(taskMarker.line, true, `${mode}: task item is rendered`);
      assert.equal(taskMarker.separatorDisplay, 'none', `${mode}: redundant marker separator is hidden`);
      assert.equal(taskMarker.bulletDisplay, 'none', `${mode}: extra list bullet is hidden`);
      if (taskMarker.checkboxMarginLeft !== null) {
        assert.equal(taskMarker.checkboxMarginLeft, '0px', `${mode}: checkbox begins at the marker column`);
        assert.equal(taskMarker.checkboxMarginRight, '0px', `${mode}: checkbox has no phantom bullet gap`);
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
      await placeCursorInRawLineText(page, 9, 0);
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
    for (const mode of ['wysiwyg', 'live_preview']) {
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
        assert.equal(
          await page.evaluate(() => window.editorBridge.getMarkdown()),
          cursorStressDoc,
          `${mode}: placing the cursor must not alter a list item's source text`
        );
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
      assert.equal(
        await page.evaluate(() => window.editorBridge.getMarkdown()),
        cursorStressDoc,
        `${mode}: closing the simulated keyboard must not alter list source text`
      );
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
      '| WMDX\\|001 | A deliberately long row with \\| escaped and `left | right` in code | Editor | 2026-11-06 | Open | Keep every pipe and separator intact |'
    ].join('\n');
    const wideSourceDocument = [
      'Text before the table stays at the normal editor width.',
      '',
      wideSourceTable,
      '',
      'Text after the table also stays at the normal editor width.'
    ].join('\n');
    for (const mode of modes) {
      await page.evaluate(async ({ mode, markdown }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown(markdown);
      }, { mode, markdown: wideSourceDocument });
      await page.waitForTimeout(100);
      const tableLayout = await page.evaluate(async () => {
        const outerScroller = document.querySelector('#editor > .cm-editor > .cm-scroller');
        const tableWidget = document.querySelector('.cm-source-table-widget');
        if (!outerScroller) return null;
        if (!tableWidget) return {
          renderedTables: document.querySelectorAll('.cm-wp-table-container').length
        };
        const tableScroller = tableWidget.querySelector('.cm-source-table-editor .cm-scroller');
        const rows = [...tableWidget.querySelectorAll('.cm-source-table-editor .cm-line')];
        const surroundingLines = [...document.querySelectorAll('#editor > .cm-editor > .cm-scroller > .cm-content > .cm-line')]
          .filter(line =>
            !line.closest('.cm-source-table-widget') &&
            (
              line.textContent.includes('Text before the table') ||
              line.textContent.includes('Text after the table')
            )
          );
        const beforeLefts = surroundingLines.map(line => line.getBoundingClientRect().left);
        const first = rows[0];
        const style = getComputedStyle(first);
        const beforeRowLefts = rows.map(row => row.getBoundingClientRect().left);
        tableScroller.scrollLeft = Math.min(180, tableScroller.scrollWidth - tableScroller.clientWidth);
        await new Promise(resolve => requestAnimationFrame(() =>
          requestAnimationFrame(resolve)
        ));
        const afterRowLefts = rows.map(row => row.getBoundingClientRect().left);
        const shifts = afterRowLefts.map((left, index) => left - beforeRowLefts[index]);
        const afterSurroundingLefts = surroundingLines.map(line => line.getBoundingClientRect().left);
        const pipeColumns = rows.map(row =>
          [...row.querySelectorAll('.cm-source-table-aligned-pipe')]
            .map(pipe => pipe.getBoundingClientRect().left)
        );
        const pipeBarsAligned = pipeColumns.every(columns =>
          columns.length === pipeColumns[0]?.length &&
          columns.every((left, index) => Math.abs(left - pipeColumns[0][index]) < 1)
        );
        return {
          whiteSpace: style.whiteSpace,
          renderedTables: document.querySelectorAll('.cm-wp-table-container').length,
          tableHorizontalOverflow: tableScroller.scrollWidth > tableScroller.clientWidth + 1,
          tableScrollWorks: tableScroller.scrollLeft > 0,
          outerHorizontalOverflow: outerScroller.scrollWidth > outerScroller.clientWidth + 1,
          pipeBarsAligned,
          pipeColumnCount: pipeColumns[0]?.length || 0,
          surroundingTextFixed: beforeLefts.every((left, index) =>
            Math.abs(left - afterSurroundingLefts[index]) < 1
          ),
          tableRowsMoveTogether: shifts.every(shift => Math.abs(shift - shifts[0]) < 1),
          tableWidth: tableWidget.getBoundingClientRect().width,
          viewportWidth: outerScroller.clientWidth,
          documentHorizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1,
          outerScrollLeft: outerScroller.scrollLeft,
          contentWidth: document.querySelector('#editor > .cm-editor > .cm-scroller > .cm-content')
            .getBoundingClientRect().width,
          rawSourcePreserved: window.editorBridge.getMarkdown().includes(
            '| WMDX\\|001 | A deliberately long row'
          ),
          childMarkdown: tableWidget.querySelector('.cm-source-table-editor')
            ._sourceTableEditor.state.doc.toString()
        };
      });
      if (mode === 'source') {
        assert.equal(tableLayout.whiteSpace, 'pre', 'Source table rows should not wrap');
        assert.ok(tableLayout.tableHorizontalOverflow,
          `Only the source table should overflow horizontally: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.tableScrollWorks,
          `The source table's own scroller must move: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.tableRowsMoveTogether,
          `Every row in the source table must move together: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.pipeColumnCount >= 5 && tableLayout.pipeBarsAligned,
          `Pipe delimiters should align into vertical columns: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.surroundingTextFixed,
          `Text above and below the table must not move horizontally: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.tableWidth <= tableLayout.viewportWidth + 1,
          `The source table widget must stay within the viewport: ${JSON.stringify(tableLayout)}`);
        assert.ok(!tableLayout.outerHorizontalOverflow,
          `The outer source editor must not become horizontally scrollable: ${JSON.stringify(tableLayout)}`);
        assert.equal(tableLayout.outerScrollLeft, 0,
          `The outer source editor must not scroll with the table: ${JSON.stringify(tableLayout)}`);
        assert.ok(!tableLayout.documentHorizontalOverflow,
          `Source table must not widen the document viewport: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.contentWidth <= tableLayout.viewportWidth + 1,
          `Source content should stay within the editor viewport: ${JSON.stringify(tableLayout)}`);
        assert.ok(tableLayout.rawSourcePreserved,
          'The parent document must retain the literal Markdown table text');
        assert.equal(tableLayout.childMarkdown, wideSourceTable,
          'The nested source editor must show the exact original Markdown table');
        assert.equal(tableLayout.renderedTables, 0, 'Source should retain raw table syntax');
        const editedTable = page.locator('.cm-source-table-editor .cm-content');
        await editedTable.click();
        await page.evaluate(() => {
          const view = document.querySelector('.cm-source-table-editor')._sourceTableEditor;
          view.dispatch({ selection: { anchor: view.state.doc.length } });
          view.focus();
        });
        await page.waitForFunction(() =>
          document.activeElement?.closest('.cm-source-table-editor') !== null
        );
        await page.keyboard.type(' | Edited', { delay: 20 });
        await page.waitForTimeout(250);
        const editedTableState = await page.evaluate(() => ({
          markdown: window.editorBridge.getMarkdown(),
          child: document.querySelector('.cm-source-table-editor')
            ?._sourceTableEditor?.state.doc.toString() ?? null
        }));
        assert.ok(
          editedTableState.markdown.includes(
            '| Keep every pipe and separator intact | | Edited'
          ),
          `Source table edits must reach the parent document: ${JSON.stringify(editedTableState)}`
        );
        await page.keyboard.press('Control+Z');
        await page.waitForFunction(markdown =>
          window.editorBridge.getMarkdown() === markdown
        , wideSourceDocument);
        const sourceToggle = await page.evaluate(() =>
          window.editorBridge.toggleTableScrolling()
        );
        assert.deepEqual(sourceToggle, {
          preferenceKey: 'pref_table_scroll_source_enabled',
          enabled: false
        });
        await page.waitForTimeout(100);
        const wrappedSourceTable = await page.evaluate(() => {
          const table = document.querySelector('.cm-source-table-widget');
          const line = table?.querySelector('.cm-source-table-editor .cm-line');
          const scroller = table?.querySelector('.cm-source-table-editor .cm-scroller');
          return {
            whiteSpace: line ? getComputedStyle(line).whiteSpace : null,
            inlineWhiteSpace: line?.style.whiteSpace ?? null,
            overflowX: scroller ? getComputedStyle(scroller).overflowX : null,
            inlineOverflowX: scroller?.style.overflowX ?? null,
            enabled: table?.dataset.horizontalScrollEnabled ?? null,
            outerOverflow: document.querySelector(
              '#editor > .cm-editor > .cm-scroller'
            ).scrollWidth > document.querySelector(
              '#editor > .cm-editor > .cm-scroller'
            ).clientWidth + 1
          };
        });
        assert.equal(wrappedSourceTable.whiteSpace, 'pre-wrap',
          `Disabling Source scrolling should wrap source lines: ${JSON.stringify(wrappedSourceTable)}`);
        assert.equal(wrappedSourceTable.overflowX, 'hidden',
          `Disabled Source scrolling should not keep a nested horizontal scroller: ${JSON.stringify(wrappedSourceTable)}`);
        assert.ok(!wrappedSourceTable.outerOverflow,
          `Wrapped Source tables must not widen the document: ${JSON.stringify(wrappedSourceTable)}`);
        const sourceRestore = await page.evaluate(() =>
          window.editorBridge.toggleTableScrolling()
        );
        assert.deepEqual(sourceRestore, {
          preferenceKey: 'pref_table_scroll_source_enabled',
          enabled: true
        });
      } else {
        assert.ok(tableLayout.renderedTables >= 1, `${mode}: table should remain rendered and editable`);
        if (mode === 'wysiwyg') {
          const renderedToggle = await page.evaluate(() =>
            window.editorBridge.toggleTableScrolling()
          );
          assert.deepEqual(renderedToggle, {
            preferenceKey: 'pref_table_scroll_wysiwyg_enabled',
            enabled: false
          });
          await page.waitForTimeout(100);
          const wrappedRenderedTable = await page.evaluate(() => {
            const container = document.querySelector('.cm-wp-table-container');
            const table = container?.querySelector('.cm-wp-table');
            const cell = container?.querySelector('td');
            return {
              enabled: container?.dataset.horizontalScrollEnabled,
              overflowX: container ? getComputedStyle(container).overflowX : null,
              tableWidth: table ? getComputedStyle(table).width : null,
              cellWrap: cell ? getComputedStyle(cell).overflowWrap : null
            };
          });
          assert.equal(wrappedRenderedTable.enabled, 'false',
            `Rendered table scrolling should be independently switchable: ${JSON.stringify(wrappedRenderedTable)}`);
          assert.equal(wrappedRenderedTable.overflowX, 'hidden');
          assert.equal(wrappedRenderedTable.cellWrap, 'anywhere');
          const renderedRestore = await page.evaluate(() =>
            window.editorBridge.toggleTableScrolling()
          );
          assert.deepEqual(renderedRestore, {
            preferenceKey: 'pref_table_scroll_wysiwyg_enabled',
            enabled: true
          });
        }
      }
      cases++;
    }

    const renderedCellDocument = [
      '| Name | Value |',
      '| --- | --- |',
      '| **Bold** tail | Plain |'
    ].join('\n');
    await page.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('wysiwyg');
      window.editorBridge.setMarkdown(markdown);
    }, renderedCellDocument);
    const renderedCell = page.locator(
      '.cm-wp-table-container tbody td[data-row="1"][data-col="0"]'
    );
    await renderedCell.waitFor();
    const renderedCellBox = await renderedCell.boundingBox();
    assert.ok(renderedCellBox, 'the WYSIWYG cell is visible for a real pointer tap');
    await page.mouse.click(
      renderedCellBox.x + Math.min(20, renderedCellBox.width / 2),
      renderedCellBox.y + renderedCellBox.height / 2
    );
    await page.locator('.cm-wp-cell-editor').waitFor();
    const renderedCellEditState = await page.evaluate(() => {
      const editor = document.querySelector('.cm-wp-cell-editor');
      const selection = window.getSelection();
      return {
        isContentEditable: editor?.isContentEditable,
        html: editor?.innerHTML,
        active: document.activeElement === editor,
        caretInsideEmphasis: Boolean(
          selection?.anchorNode?.parentElement?.closest('strong')
        ),
        caretOffset: selection?.anchorOffset,
        textLength: selection?.anchorNode?.textContent?.length
      };
    });
    assert.equal(renderedCellEditState.isContentEditable, true,
      `WYSIWYG table cells should remain rendered while editing: ${JSON.stringify(renderedCellEditState)}`);
    assert.equal(renderedCellEditState.html, '<strong>Bold</strong> tail');
    assert.ok(renderedCellEditState.active, 'the tapped cell editor receives focus');
    assert.ok(renderedCellEditState.caretInsideEmphasis,
      `The tap should position the caret within the rendered bold run: ${JSON.stringify(renderedCellEditState)}`);
    assert.ok(renderedCellEditState.caretOffset < renderedCellEditState.textLength,
      `The caret should not jump to the end of the cell: ${JSON.stringify(renderedCellEditState)}`);
    const renderedCellAfterEdit = await page.evaluate(() =>
      window.editorBridge.getMarkdown()
    );
    assert.ok(renderedCellAfterEdit.includes('| **Bold** tail | Plain |'),
      'Opening a rendered cell without editing must preserve the Markdown source');
    cases++;

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
        await new Promise(resolve => setTimeout(resolve, 200));
        const content = document.querySelector('.cm-content');
        const tableWidgets = [...document.querySelectorAll('.cm-source-table-widget')];
        const tableRows = tableWidgets.flatMap(widget =>
          [...widget.querySelectorAll('.cm-source-table-editor .cm-line')]
        );
        const nonTableOverflowingRows = [...document.querySelectorAll('.cm-line')]
          .filter(line =>
            !line.closest('.cm-source-table-widget') &&
            line.getBoundingClientRect().width > scroller.clientWidth + 1
          )
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
          documentWidth: document.documentElement.scrollWidth,
          contentWidth: Math.round(content.getBoundingClientRect().width),
          contentScrollWidth: content.scrollWidth,
          tableRowCount: tableRows.length,
          tableScrollers: tableWidgets.map(widget => {
            const tableScroller = widget.querySelector('.cm-source-table-editor .cm-scroller');
            return {
              width: tableScroller.clientWidth,
              scrollWidth: tableScroller.scrollWidth
            };
          }),
          nonTableOverflowingRows
        });
      }
      return layouts;
    });
    assert.ok(fullFixtureSourceLayouts.some(layout => layout.tableRowCount >= 3),
      `Phone fixture should expose raw source table rows: ${JSON.stringify(fullFixtureSourceLayouts)}`);
    assert.ok(fullFixtureSourceLayouts.every(layout =>
      layout.scrollerScrollWidth <= layout.scrollerWidth + 1 &&
      layout.documentWidth <= 390 + 1 &&
      layout.contentWidth <= layout.scrollerWidth + 1 &&
      layout.tableScrollers.every(table => table.width <= layout.scrollerWidth + 1) &&
      layout.nonTableOverflowingRows.length === 0
    ), `Source tables must scroll inside the editor without widening the app viewport: ${JSON.stringify(fullFixtureSourceLayouts)}`);
    assert.ok(fullFixtureSourceLayouts.some(layout =>
      layout.tableScrollers.some(table => table.scrollWidth > table.width + 1)
    ), `At least one phone-fixture table should scroll inside its own block: ${JSON.stringify(fullFixtureSourceLayouts)}`);
    cases++;

    const repeatedWmdxList = 'A. First item\nA. Second item\n\nTail';
    for (const mode of modes) {
      await page.evaluate(async ({ mode, markdown }) => {
        await window.editorBridge.setEditorMode(mode);
        window.editorBridge.setMarkdown(markdown);
      }, { mode, markdown: repeatedWmdxList });
      await page.waitForTimeout(100);
      await page.locator('.cm-line').last().click();
      const sourceLines = await page.locator('.cm-line').evaluateAll(lines =>
        lines.map(line => line.textContent)
      );
      assert.equal(
        sourceLines[1],
        mode === 'source' ? 'A. Second item' : 'B. Second item',
        `${mode}: rendered list numbering must not replace the authored source marker`
      );
      assert.equal(
        await page.evaluate(() => window.editorBridge.getMarkdown()),
        repeatedWmdxList,
        `${mode}: list marker rendering must not change the document source`
      );
      cases++;
    }

    const rawSourceFixture = [
      '# Raw ATX heading',
      'Paragraph **bold**, *italic*, ~~strike~~, `code`, ==highlight==, =pen=, and _underline_.',
      '',
      '> [!info] Callout title',
      '> Callout body with **formatting** and a [link](https://example.test).',
      '',
      '- [ ] Markdown task',
      '[ ] Wmdx task',
      'A. First ordered item',
      'A. Second ordered item',
      '',
      '[[notes/companion.md|Companion]] and [assets/guide.pdf|Guide||].',
      '![Image alt](assets/image.png)',
      '![assets/image.png|Caption|320|><]',
      '[^note] Reference.',
      '[^note]: Footnote definition.',
      '',
      '| Head | Tail |',
      '| --- | --- |',
      '| cell | value |',
      '',
      '```js',
      'const literal = "**not rendered**";',
      '```'
    ].join('\n');
    await page.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('source');
      window.editorBridge.setMarkdown(markdown);
    }, rawSourceFixture);
    await page.waitForTimeout(120);
    await page.locator('.cm-line').last().click();
    const visibleSourceLines = await page.locator('.cm-line').evaluateAll(lines =>
      lines.map(line => line.textContent)
    );
    assert.deepEqual(
      visibleSourceLines.slice(0, rawSourceFixture.split('\n').length),
      rawSourceFixture.split('\n'),
      'Source must show the literal characters where rendered views hide or replace syntax'
    );
    assert.equal(
      await page.evaluate(() => window.editorBridge.getMarkdown()),
      rawSourceFixture,
      'Source rendering must not rewrite the document'
    );
    cases++;

    const calloutFixture = [
      '# Callout source contract',
      '',
      '> [!info] Information callout',
      '> The title and body stay in one styled callout.',
      '> **Markdown formatting** remains available inside the body.',
      '> > [!tip] Nested callout',
      '> > The nested quote markers remain literal in Source.',
      '',
      '> [!question]- Foldable callout',
      '> Its collapsed body must remain visible in Source.'
    ].join('\n');
    await page.evaluate(async markdown => {
      await window.editorBridge.setEditorMode('source');
      window.editorBridge.setMarkdown(markdown);
    }, calloutFixture);
    await page.waitForTimeout(120);
    const sourceCallout = await page.evaluate(() => ({
      text: window.editorBridge.getMarkdown(),
      sourceText: [...document.querySelectorAll('.cm-line')]
        .map(line => line.textContent)
        .join('\n'),
      sourceModeClass: document.querySelector('#editor-container')
        ?.classList.contains('source-mode'),
      renderedMarkdownLines: document.querySelectorAll(
        '.cm-callout, .cm-blockquote, .cm-list-item, .cm-heading'
      ).length,
      titleWidgets: document.querySelectorAll('.cm-callout-title-container').length,
      calloutIcons: document.querySelectorAll('.cm-callout-icon').length,
      foldedPlaceholders: document.querySelectorAll('.cm-foldPlaceholder').length,
      collapsedBodyVisible: [...document.querySelectorAll('.cm-line')].some(line =>
        line.textContent.includes('Its collapsed body must remain visible in Source.')
      )
    }));
    assert.equal(sourceCallout.text, calloutFixture, 'Source must preserve the exact callout Markdown');
    assert.equal(sourceCallout.sourceText, calloutFixture,
      'Source editor lines must show the unmodified callout text');
    assert.equal(sourceCallout.sourceModeClass, true, 'Source editor mode must be active');
    assert.equal(sourceCallout.renderedMarkdownLines, 0,
      'Source must not apply Markdown block layout');
    assert.equal(sourceCallout.titleWidgets, 0, 'Source must not replace the callout title with a widget');
    assert.equal(sourceCallout.calloutIcons, 0, 'Source must not overlay a callout icon');
    assert.equal(sourceCallout.foldedPlaceholders, 0, 'Source must not fold callout text');
    assert.equal(sourceCallout.collapsedBodyVisible, true,
      'Source must expose the body of callouts collapsed in rendered modes');

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
      assert.ok(calloutGeometry.length >= 2, `${mode}: callout title and body should share the styled block`);
      assert.ok(calloutGeometry[0].text.includes('Information callout'),
        `${mode}: title should remain on the callout's first row`);
      assert.ok(calloutGeometry.slice(1).some(row =>
        row.text.includes('The title and body stay in one styled callout.')
      ), `${mode}: body paragraphs should remain inside the callout`);
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
    for (const mode of ['source', 'live_preview', 'wysiwyg']) {
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
      if (mode === 'source') {
        assert.equal(blocks.code, 0, 'Source should not apply Markdown code-block layout');
        assert.equal(blocks.headings, 0, 'Source should not apply rendered heading layout');
        assert.equal(blocks.quote, 0, 'Source should not apply rendered blockquote layout');
        assert.equal(blocks.tables, 0, 'Source should keep tables as raw source text');
      } else {
        assert.ok(blocks.code >= 4, `${mode}: code styling missing`);
        assert.equal(blocks.codeLists, 0);
        assert.equal(blocks.headings, 1);
        assert.ok(blocks.quote >= 1);
        assert.equal(blocks.tables, 1);
      }
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
    assert.equal(sourceColors.highlights, 0, 'Source should not apply rendered highlight styling');
    assert.equal(sourceColors.pens, 0, 'Source should not apply rendered pen styling');
    assert.equal(sourceColors.underlines, 0, 'Source should not apply rendered underline styling');
    assert.equal(sourceColors.syntaxVisible, true, 'Source should keep W.mdx delimiters visible');

    const scrollFixture = Array.from({ length: 140 }, (_, index) =>
      `- Anchor-${String(index).padStart(3, '0')} wrapped list text with **bold syntax** and enough words to exercise line wrapping across source and rendered modes.`
    ).join('\n');
    await page.evaluate(async scrollFixture => {
      await window.editorBridge.setEditorMode('rendered');
      window.editorBridge.setMarkdown(scrollFixture);
    }, scrollFixture);
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller');
      if (scroller) scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * 0.5;
    });
    await page.waitForTimeout(80);
    for (const mode of ['source', 'rendered', 'source', 'rendered']) {
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
      let anchoredAfter = null;
      let previousOffset = null;
      let stableFrames = 0;
      for (let attempt = 0; attempt < 120 && stableFrames < 3; attempt++) {
        await page.waitForTimeout(16);
        anchoredAfter = await page.evaluate(token => {
          const scroller = document.querySelector('.cm-scroller');
          const target = [...document.querySelectorAll('.cm-line')]
            .find(line => line.textContent.includes(token));
          return scroller && target
            ? target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
            : null;
        }, anchor.token);
        if (
          Number.isFinite(anchoredAfter) &&
          Math.abs(anchoredAfter - anchor.offset) < 4 &&
          previousOffset !== null &&
          Math.abs(anchoredAfter - previousOffset) < 0.5
        ) {
          stableFrames++;
        } else {
          stableFrames = 0;
        }
        previousOffset = anchoredAfter;
      }
      assert.ok(Number.isFinite(anchoredAfter), `missing scroll anchor after ${mode}`);
      assert.ok(stableFrames >= 3,
        `scroll anchor did not settle near its prior position after switching to ${mode}`);
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

    await page.evaluate(() => {
      window.editorBridge.applyAllPreferences({ pref_markdown_profile: 'gfm' });
    });
    await openMenuAction('Lint document');
    assert.equal(
      await page.locator('#markdown-lint-dialect').inputValue(),
      'gfm',
      'the linter defaults to the selected global dialect profile'
    );
    await page.locator('#markdown-lint-close').click();
    await page.evaluate(() => {
      window.editorBridge.applyAllPreferences({ pref_markdown_profile: 'wmdx' });
    });
    cases += 1;

    await page.evaluate(() => window.editorBridge.setMarkdown(
      '# Imported title\n\n[Project](docs/Project%20Notes.md)'
    ));
    await page.waitForTimeout(100);
    await openMenuAction('Convert from Markdown dialect');
    await page.locator('#markdown-conversion-format').selectOption('commonmark');
    await page.locator('#markdown-conversion-preview-button').click();
    const conversionPreview = await page.locator('#markdown-conversion-preview').inputValue();
    assert.match(conversionPreview, /^\.1 Imported title/m);
    assert.match(conversionPreview, /\[Project\]\(docs\/Project%20Notes\.md\)/);
    await page.locator('#markdown-conversion-apply').click();
    await page.waitForTimeout(80);
    const convertedDocument = await page.evaluate(() => window.editorBridge.getMarkdown());
    assert.match(convertedDocument, /^\.1 Imported title/m);
    assert.match(convertedDocument, /\[Project\]\(docs\/Project%20Notes\.md\)/);

    const longConversionSource =
      `# Beginning\n\n${'A paragraph in the middle of the complete document.\n\n'.repeat(180)}# Final heading`;
    await page.evaluate(source => window.editorBridge.setMarkdown(source), longConversionSource);
    await page.waitForTimeout(100);
    await openMenuAction('Convert from Markdown dialect');
    await page.locator('#markdown-conversion-format').selectOption('commonmark');
    await page.locator('#markdown-conversion-preview-button').click();
    const longConversionPreview =
      await page.locator('#markdown-conversion-preview').inputValue();
    assert.match(longConversionPreview, /\[Preview truncated\]/);
    assert.doesNotMatch(longConversionPreview, /Final heading/);
    await page.locator('#markdown-conversion-apply').click();
    await page.waitForTimeout(100);
    const wholeConvertedDocument =
      await page.evaluate(() => window.editorBridge.getMarkdown());
    assert.ok(wholeConvertedDocument.length > 6000);
    assert.match(wholeConvertedDocument, /\.1 Final heading$/);

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
    assert.match(pastedDocument, /\[Site\]\(https:\/\/example\.com\)/);

    await page.evaluate(() => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'commonmark',
        pref_markdown_auto_paste_enabled: true
      });
      window.editorBridge.setMarkdown('Replace with recognized Markdown');
    });
    await page.waitForTimeout(80);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+A');
    await page.locator('.cm-content').evaluate(element => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', '# Automatic heading\n\n[Site](https://example.com)');
      const event = new ClipboardEvent('paste', {
        clipboardData: transfer, bubbles: true, cancelable: true
      });
      element.dispatchEvent(event);
    });
    await page.waitForTimeout(80);
    const autoConvertedMarkdown = await page.evaluate(
      () => window.editorBridge.getMarkdown()
    );
    assert.match(autoConvertedMarkdown, /^# Automatic heading/m);
    assert.match(autoConvertedMarkdown, /\[Site\]\(https:\/\/example\.com\)/);

    await page.evaluate(() => {
      window.editorBridge.setMarkdown('Replace with Wmdx inline syntax');
    });
    await page.waitForTimeout(60);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+A');
    await page.locator('.cm-content').evaluate(element => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'H~2~O and x^2^');
      element.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: transfer, bubbles: true, cancelable: true
      }));
    });
    await page.waitForTimeout(80);
    assert.equal(
      await page.evaluate(() => window.editorBridge.getMarkdown()),
      'H<sub>2</sub>O and x<sup>2</sup>',
      'recognized Wmdx inline syntax is converted to the CommonMark profile'
    );
    cases += 1;

    await page.evaluate(() => {
      window.editorBridge.setMarkdown('Replace with rich HTML');
    });
    await page.waitForTimeout(60);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+A');
    await page.locator('.cm-content').evaluate(element => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'Rich title\nBold text');
      transfer.setData('text/html', '<h2>Rich title</h2><p><strong>Bold</strong> text</p>');
      element.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: transfer, bubbles: true, cancelable: true
      }));
    });
    await page.waitForTimeout(80);
    const autoConvertedHtml = await page.evaluate(
      () => window.editorBridge.getMarkdown()
    );
    assert.match(autoConvertedHtml, /^## Rich title/m);
    assert.match(autoConvertedHtml, /\*\*Bold\*\* text/);

    await page.evaluate(() => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'commonmark',
        pref_markdown_auto_paste_enabled: false
      });
      window.editorBridge.setMarkdown('Keep rich clipboard formatting');
    });
    await page.waitForTimeout(60);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+A');
    await page.locator('.cm-content').evaluate(element => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'Rich title\nBold text');
      transfer.setData('text/html', '<h2>Rich title</h2><p><strong>Bold</strong> text</p>');
      const event = new ClipboardEvent('paste', {
        clipboardData: transfer, bubbles: true, cancelable: true
      });
      element.dispatchEvent(event);
    });
    await page.waitForTimeout(80);
    const plainClipboardPaste = await page.evaluate(
      () => window.editorBridge.getMarkdown()
    );
    assert.equal(
      plainClipboardPaste,
      'Rich title\nBold text',
      'turning off automatic conversion pastes the clipboard plain text unchanged'
    );
    cases += 1;

    const tildeFixture =
      '~subscript~ ~~strike~~ ^superscript^ ==highlight== =pen=';
    await page.evaluate(markdown => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'wmdx'
      });
      window.editorBridge.setEditorMode('wysiwyg');
      window.editorBridge.setMarkdown(markdown);
    }, tildeFixture);
    await page.waitForTimeout(120);
    assert.ok(await page.locator('.cm-subscript').count() > 0,
      'Wmdx profile recognizes its single-tilde subscript');
    assert.ok(await page.locator('.cm-superscript').count() > 0,
      'Wmdx profile recognizes paired-caret superscript');
    assert.ok(await page.locator('.cm-wmdx-highlight-yellow').count() > 0);
    assert.ok(await page.locator('.cm-wmdx-pen-red').count() > 0);

    const gfmFixture =
      '| Name | Value |\n| --- | --- |\n| Item | 2 |\n\n~~removed~~\n\n~literal~ ^literal^ ==literal== =literal=';
    await page.evaluate(markdown => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'gfm'
      });
      window.editorBridge.setEditorMode('wysiwyg');
      window.editorBridge.setMarkdown(markdown);
    }, gfmFixture);
    await page.waitForTimeout(140);
    assert.equal(await page.locator('.cm-wp-table-container').count(), 1);
    assert.ok(await page.locator('.cm-strikethrough').count() > 0);
    assert.equal(
      await page.locator('.cm-subscript').count(),
      0,
      'GFM profile must leave Wmdx single-tilde subscript disabled'
    );
    assert.equal(
      await page.locator('.cm-superscript').count(),
      0,
      'GFM profile leaves Wmdx paired-caret superscript literal'
    );
    assert.equal(await page.locator('.cm-wmdx-highlight-yellow').count(), 0);
    assert.equal(await page.locator('.cm-wmdx-pen-red').count(), 0);

    await page.evaluate(markdown => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'commonmark'
      });
      window.editorBridge.setMarkdown(markdown);
    }, gfmFixture);
    await page.waitForTimeout(140);
    assert.equal(
      await page.locator('.cm-wp-table-container').count(),
      0,
      'CommonMark profile leaves GFM tables as source'
    );
    assert.equal(
      await page.locator('.cm-strikethrough').count(),
      0,
      'CommonMark profile does not recognize GFM strikethrough'
    );
    assert.equal(
      await page.locator('.cm-subscript').count(),
      0,
      'CommonMark profile leaves single tilde literal'
    );
    assert.equal(
      await page.locator('.cm-superscript').count(),
      0,
      'CommonMark profile leaves paired carets literal'
    );
    assert.equal(await page.locator('.cm-wmdx-highlight-yellow').count(), 0);
    assert.equal(await page.locator('.cm-wmdx-pen-red').count(), 0);

    await page.evaluate(() => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'obsidian'
      });
      window.editorBridge.setMarkdown('==highlight== ==₀literal== =pen=');
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator('.cm-wmdx-highlight-yellow').count(),
      1,
      'Obsidian profile recognizes only its uncolored ==highlight== form'
    );
    assert.equal(await page.locator('.cm-wmdx-pen-red').count(), 0);
    cases += 7;

    const exposureMarkdown =
      'First line has **bold** and *italic* formatting.\n' +
      'Second line has ~~strike~~ formatting.\n\n' +
      'Outside paragraph has **separate** formatting.';
    await page.evaluate(async markdown => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'gfm',
        pref_markdown_syntax_exposure: 'hidden'
      });
      window.editorBridge.setMarkdown(markdown);
      await window.editorBridge.setEditorMode('rendered');
    }, exposureMarkdown);
    await page.waitForTimeout(140);
    assert.equal(
      await page.evaluate(() => window.editorBridge.getEditorMode()),
      'rendered',
      'the user-facing rendered editor is a single mode'
    );
    assert.equal(
      (await page.locator('.cm-content').textContent()).includes('**bold**'),
      false,
      'hidden exposure keeps Markdown delimiters invisible'
    );

    await page.evaluate(() => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_syntax_exposure: 'line'
      });
    });
    await page.waitForTimeout(120);
    await page.locator('.cm-content .cm-line').filter({ hasText: 'First line has' })
      .first().click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(80);
    const lineExposureText = await page.locator('.cm-content').textContent();
    assert.ok(lineExposureText.includes('**bold**'), 'line exposure reveals syntax on the active line');
    assert.ok(!lineExposureText.includes('~~strike~~'), 'line exposure keeps other lines rendered');
    assert.ok(!lineExposureText.includes('**separate**'), 'line exposure keeps other blocks rendered');

    await page.evaluate(() => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_syntax_exposure: 'block'
      });
    });
    await page.waitForTimeout(100);
    const blockExposureText = await page.locator('.cm-content').textContent();
    assert.ok(blockExposureText.includes('**bold**'), 'block exposure retains syntax in the active block');
    assert.ok(blockExposureText.includes('~~strike~~'), 'block exposure spans soft-wrapped source lines');
    assert.ok(!blockExposureText.includes('**separate**'), 'block exposure does not reveal a neighboring paragraph');
    assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), exposureMarkdown);
    cases += 3;

    await page.setViewportSize({ width: 390, height: 844 });
    const exposedTable =
      '| Name | Description |\n' +
      '| --- | --- |\n' +
      '| WMDX-001 | A deliberately wide source cell that should remain grouped with every other row while scrolling. |';
    const exposureTableDocument = `Before table\n\n${exposedTable}\n\nAfter table`;
    await page.evaluate(async markdown => {
      window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'gfm',
        pref_markdown_syntax_exposure: 'caret'
      });
      window.editorBridge.setMarkdown(markdown);
      await window.editorBridge.setEditorMode('rendered');
    }, exposureTableDocument);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.cm-wp-table-container').count(), 1);
    const tableCursor = exposureTableDocument.indexOf('WMDX-001') + 2;
    await page.evaluate(position => {
      window.editorBridge.setSelectionState(
        JSON.stringify({ anchor: position, head: position })
      );
    }, tableCursor);
    await page.waitForFunction(() =>
      document.querySelectorAll('.cm-source-table-widget').length === 1
    );
    assert.equal(await page.locator('.cm-wp-table-container').count(), 0,
      'entering a table reveals the complete raw table instead of hiding its syntax');
    assert.equal(await page.locator('.cm-source-table-editor .cm-line').count(), 3);
    assert.equal(
      await page.evaluate(() => window.editorBridge.getMarkdown()),
      exposureTableDocument,
      'showing table syntax does not modify the document'
    );
    await page.evaluate(position => {
      window.editorBridge.setSelectionState(
        JSON.stringify({ anchor: position, head: position })
      );
    }, exposureTableDocument.indexOf('After table') + 2);
    await page.waitForFunction(() =>
      document.querySelectorAll('.cm-source-table-widget').length === 0 &&
      document.querySelectorAll('.cm-wp-table-container').length === 1
    );
    cases++;

    const firstSourceKey = 'browser-test://language/first';
    const secondSourceKey = 'browser-test://language/second';
    await page.evaluate(({ firstSourceKey, secondSourceKey }) => {
      localStorage.removeItem('wmdx.source-language-overrides.v1');
      window.editorBridge.setDocumentTitle('First code file', firstSourceKey, 'first.txt');
      window.editorBridge.setMarkdown('def greet(name):\n    return f"Hello, {name}"\n');
    }, { firstSourceKey, secondSourceKey });
    await page.evaluate(() => window.editorBridge.setEditorMode('source'));
    const openSourceLanguageDialog = async expected => {
      await page.evaluate(() => window.editorBridge.openSourceLanguageDialog());
      await page.waitForSelector('#source-language-override');
      assert.equal(
        await page.locator('#source-language-override').inputValue(),
        expected
      );
    };
    await openSourceLanguageDialog('auto');
    await page.locator('#source-language-override').selectOption('python');
    await page.locator('#source-language-apply').click();
    await page.waitForFunction(() =>
      document.querySelector('#editor-modal-overlay')?.classList.contains('open') === false
    );
    assert.ok(
      await page.evaluate(() => localStorage.getItem('wmdx.source-language-overrides.v1'))
        .then(value => value.includes(firstSourceKey) && value.includes('python')),
      'manual language selection is saved for the active document'
    );
    await page.evaluate(({ secondSourceKey }) => {
      window.editorBridge.setDocumentTitle('Second code file', secondSourceKey, 'second.txt');
    }, { secondSourceKey });
    await openSourceLanguageDialog('auto');
    await page.locator('#source-language-override').selectOption('sql');
    await page.locator('#source-language-apply').click();
    await page.waitForFunction(() =>
      document.querySelector('#editor-modal-overlay')?.classList.contains('open') === false
    );
    await page.evaluate(({ firstSourceKey }) => {
      window.editorBridge.setDocumentTitle('First code file', firstSourceKey, 'first.txt');
    }, { firstSourceKey });
    await openSourceLanguageDialog('python');
    await page.locator('#source-language-cancel').click();
    await page.evaluate(() => window.editorBridge.setEditorMode('rendered'));
    assert.equal(
      await page.locator('#source-language-override').count(),
      0,
      'the Source language dialog closes before returning to the rendered editor'
    );
    cases++;

    assert.deepEqual(failures, [], 'uncaught browser exceptions');
    assert.deepEqual(await page.evaluate(() => window.layoutDiagnostics), [], 'editor diagnostics');
    console.log(`PASS: ${cases} real-browser list/mode/width/font/wrapping cases; mixed blocks and pending table edits.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
