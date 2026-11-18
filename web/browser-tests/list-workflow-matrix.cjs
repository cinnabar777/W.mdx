const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../app/src/main/assets/www');
const artifactRoot = path.resolve(__dirname, '../artifacts/list-workflow');
const profiles = ['commonmark', 'gfm', 'obsidian', 'wmdx'];
const renderedScopes = ['hidden', 'caret', 'line', 'block'];
const views = [
  ...renderedScopes.map(scope => ({ mode: 'rendered', scope })),
  { mode: 'source', scope: 'hidden' }
];

function startApp() {
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
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })
    );
  });
}

async function setDocument(page, markdown, {
  mode = 'rendered',
  scope = 'hidden',
  profile = 'gfm',
  preferences = {}
} = {}) {
  await page.evaluate(async ({ markdown, mode, scope, profile, preferences }) => {
    await window.editorBridge.setEditorMode(mode);
    window.editorBridge.applyAllPreferences({
      pref_markdown_profile: profile,
      pref_markdown_syntax_exposure: scope,
      pref_list_non_hanging: false,
      pref_list_inherit_body_typography: false,
      pref_list_left_indent: 12,
      pref_list_item_spacing: 4,
      pref_soft_breaks_as_spaces: false,
      ...preferences
    });
    window.editorBridge.setMarkdown(markdown);
  }, { markdown, mode, scope, profile, preferences });
  await page.waitForFunction(
    expected => document.querySelector('.cm-content') &&
      window.editorBridge.getMarkdown() === expected,
    markdown,
    { timeout: 10000 }
  );
  await page.waitForTimeout(100);
}

async function pointForPhrase(page, phrase, edge = 'middle') {
  await page.locator('.cm-line')
    .filter({ hasText: phrase })
    .first()
    .scrollIntoViewIfNeeded();
  const point = await page.locator('.cm-content').evaluate((rootElement, options) => {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest(
        '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
      )) continue;
      const offset = node.nodeValue.indexOf(options.phrase);
      if (offset < 0) continue;
      const index = options.edge === 'start'
        ? offset
        : options.edge === 'end'
          ? offset + options.phrase.length - 1
          : offset + Math.floor(options.phrase.length / 2);
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return null;
  }, { phrase, edge });
  assert.ok(point, `Could not find visible phrase ${JSON.stringify(phrase)}`);
  return point;
}

async function dragSelectPhrase(page, phrase) {
  await page.locator('.cm-line')
    .filter({ hasText: phrase })
    .first()
    .scrollIntoViewIfNeeded();
  const points = await page.locator('.cm-content').evaluate((rootElement, text) => {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest(
        '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
      )) continue;
      const offset = node.nodeValue.indexOf(text);
      if (offset < 0) continue;
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + text.length);
      const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height);
      if (!rects.length) continue;
      const first = rects[0];
      const last = rects[rects.length - 1];
      return {
        start: { x: first.left + 0.5, y: first.top + first.height / 2 },
        end: { x: last.right - 0.5, y: last.top + last.height / 2 }
      };
    }
    return null;
  }, phrase);
  assert.ok(points, `Could not calculate selection coordinates for ${JSON.stringify(phrase)}`);
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 8 });
  await page.mouse.up();
  const selection = await page.evaluate(() => {
    const state = JSON.parse(window.editorBridge.getSelectionState());
    const markdown = window.editorBridge.getMarkdown();
    return {
      from: Math.min(state.anchor, state.head),
      to: Math.max(state.anchor, state.head),
      selected: markdown.slice(
        Math.min(state.anchor, state.head),
        Math.max(state.anchor, state.head)
      )
    };
  });
  assert.equal(selection.selected, phrase,
    `The visible drag must select the exact words, got ${JSON.stringify(selection)}`);
}

async function readWrappedRows(page, phrase) {
  return page.locator('.cm-line.cm-list-item')
    .filter({ hasText: phrase })
    .first()
    .evaluate((element, target) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement.closest(
          '.cm-layout-prefix, .cm-list-bullet, .cm-list-number, .cm-todo-checkbox'
        )) continue;
        const offset = node.nodeValue.indexOf(target);
        if (offset < 0) continue;
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, node.length);
        const rows = new Map();
        for (const rect of range.getClientRects()) {
          if (rect.width && rect.height) {
            const top = Math.round(rect.top);
            if (!rows.has(top)) rows.set(top, rect.left);
          }
        }
        return [...rows.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([top, left]) => ({ top, left }));
      }
      return [];
    }, phrase);
}

async function waitForMarkdown(page, markdown) {
  await page.waitForFunction(
    expected => window.editorBridge.getMarkdown() === expected,
    markdown,
    { timeout: 10000 }
  );
}

async function clickListAction(page, action) {
  const group = page.locator('#bottom-toolbar [data-toolbar-key="lists"]:visible').first();
  await group.click();
  const button = page.locator(`[data-toolbar-key="${action}"]:visible`).last();
  await button.waitFor({ state: 'visible', timeout: 3000 });
  if (await button.isDisabled()) return false;
  await button.click();
  return true;
}

async function seedSelection(page, markdown, from = 0, to = markdown.length) {
  await page.evaluate(({ anchor, head }) => {
    window.editorBridge.setSelectionState(JSON.stringify({ anchor, head }));
  }, { anchor: from, head: to });
}

async function saveScreenshot(page, name) {
  await page.screenshot({
    path: path.join(artifactRoot, `${name}.png`),
    fullPage: true,
    animations: 'disabled'
  });
}

async function main() {
  await fs.rm(artifactRoot, { recursive: true, force: true });
  await fs.mkdir(artifactRoot, { recursive: true });
  const { server, url } = await startApp();
  let browser;
  let context;
  const failures = [];
  const pageErrors = [];

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox'],
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    });
    context = await browser.newContext({
      viewport: { width: 412, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
    const page = await context.newPage();
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

    const rootTarget = 'replace these four words';
    const nestedTarget = 'nested words need editing';
    const rootReplacement = 'replace these four words with a longer phrase';
    const nestedReplacement = 'nested words now have a real edit';
    const complexList = [
      'Opening paragraph before the lists.',
      '',
      '- ROOT-EDIT-01 This long item starts with words we can change: replace these four words and then continues with enough text to wrap several times on a narrow phone display. ROOT-END-01',
      '  - NESTED-EDIT-01 This nested item includes nested words need editing and continues with enough text to wrap across multiple visual rows without moving the marker or changing its indentation. NESTED-END-01',
      '    This continuation paragraph belongs to the nested item and must remain aligned with the item text after edits.',
      '  - [ ] TASK-EDIT-01 A task item stays intact while nearby text is edited.',
      '1. ORDER-EDIT-01 A numbered item mixed into the same list.',
      '',
      'Closing paragraph after the lists.'
    ].join('\n');

    for (const profile of profiles) {
      for (const view of views) {
        const target = view.mode === 'source' ||
          view.scope === 'caret' || view.scope === 'block'
          ? nestedTarget
          : rootTarget;
        const replacement = target === rootTarget ? rootReplacement : nestedReplacement;
        const scenario = `${profile}-${view.mode}-${view.scope}-${target === rootTarget ? 'root' : 'nested'}`;
        try {
          await setDocument(page, complexList, { ...view, profile });
          const original = await page.evaluate(() => window.editorBridge.getMarkdown());
          const rowsBefore = await readWrappedRows(page, target);
          assert.ok(rowsBefore.length >= 2,
            `${scenario}: list text should wrap on the mobile viewport: ${JSON.stringify(rowsBefore)}`);
          const rowStart = rowsBefore[0].left;
          for (const row of rowsBefore.slice(1)) {
            assert.ok(Math.abs(row.left - rowStart) < 3,
              `${scenario}: wrapped text shifted horizontally: ${JSON.stringify(rowsBefore)}`);
          }

          await dragSelectPhrase(page, target);
          await page.keyboard.type(replacement);
          const edited = original.replace(target, replacement);
          await waitForMarkdown(page, edited);
          assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), edited,
            `${scenario}: a multiword selection replacement must change exact Markdown`);

          await page.keyboard.press('Control+z');
          await waitForMarkdown(page, original);
          await page.keyboard.press('Control+y');
          await waitForMarkdown(page, edited);

          await setDocument(page, edited, { ...view, profile });
          assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), edited,
            `${scenario}: serialized Markdown must survive editor reload`);
          await saveScreenshot(page, scenario);
        } catch (error) {
          try {
            await saveScreenshot(page, `${scenario}-failed`);
          } catch {}
          failures.push(`${scenario}: ${error.stack || error.message}`);
        }
      }
    }

    for (const profile of profiles) {
      for (const mode of ['rendered', 'source']) {
        const view = { mode, scope: 'hidden' };
        const markdown = [
          'Before the list.',
          '',
          '- FIRST-ITEM-01 Existing words end here: END-FIRST-01',
          '- SECOND-ITEM-02 This neighboring item must not be damaged.'
        ].join('\n');
        const scenario = `return-backspace-${profile}-${mode}`;
        try {
          await setDocument(page, markdown, { ...view, profile });
          const point = await pointForPhrase(page, 'END-FIRST-01', 'end');
          await page.touchscreen.tap(point.x, point.y);
          await page.keyboard.press('End');
          await page.keyboard.press('Enter');
          const addedText = 'ADDED-ITEM-01 with several real words';
          await page.keyboard.type(addedText);
          const afterTyping = [
            'Before the list.',
            '',
            '- FIRST-ITEM-01 Existing words end here: END-FIRST-01',
            `- ${addedText}`,
            '- SECOND-ITEM-02 This neighboring item must not be damaged.'
          ].join('\n');
          await waitForMarkdown(page, afterTyping);

          await page.keyboard.press('Enter');
          const afterEmptyReturn = afterTyping.replace(
            `- ${addedText}\n- SECOND-ITEM-02`,
            `- ${addedText}\n- \n- SECOND-ITEM-02`
          );
          await waitForMarkdown(page, afterEmptyReturn);
          await page.keyboard.press('Backspace');
          const afterBackspace = await page.evaluate(() => window.editorBridge.getMarkdown());
          assert.notEqual(afterBackspace, afterEmptyReturn,
            `${scenario}: Backspace on a new empty list item must change the document`);
          assert.ok(afterBackspace.includes('END-FIRST-01'));
          assert.ok(afterBackspace.includes(addedText));
          assert.ok(afterBackspace.includes('SECOND-ITEM-02'));
          assert.doesNotMatch(afterBackspace, /END-FIRST-01\n-\s*\n- SECOND-ITEM-02/,
            `${scenario}: Backspace must not leave an empty list item between its neighbors`);
          await page.keyboard.press('Control+z');
          await waitForMarkdown(page, afterEmptyReturn);
          await saveScreenshot(page, scenario);
        } catch (error) {
          try {
            await saveScreenshot(page, `${scenario}-failed`);
          } catch {}
          failures.push(`${scenario}: ${error.stack || error.message}`);
        }
      }
    }

    for (const profile of profiles) {
      const blockFixtures = [
        {
          kind: 'blockquote',
          source: '> - QUOTE-EDIT-01 quoted words to replace remain inside this long blockquote list item after the real edit.',
          target: 'quoted words to replace',
          replacement: 'quoted words now changed'
        },
        ...(profile === 'obsidian' || profile === 'wmdx'
          ? [{
              kind: 'callout',
              source: '> [!note] List edit\n> - CALLOUT-EDIT-01 callout words to replace remain inside the callout list item after the real edit.',
              target: 'callout words to replace',
              replacement: 'callout words now changed'
            }]
          : [])
      ];
      for (const fixture of blockFixtures) {
        const scenario = `${fixture.kind}-list-${profile}`;
        try {
          await setDocument(page, fixture.source, { profile, mode: 'rendered', scope: 'hidden' });
          await dragSelectPhrase(page, fixture.target);
          await page.keyboard.type(fixture.replacement);
          const expected = fixture.source.replace(fixture.target, fixture.replacement);
          await waitForMarkdown(page, expected);
          assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), expected,
            `${scenario}: edited list text must remain in its parent block`);
          await saveScreenshot(page, scenario);
        } catch (error) {
          try {
            await saveScreenshot(page, `${scenario}-failed`);
          } catch {}
          failures.push(`${scenario}: ${error.stack || error.message}`);
        }
      }
    }

    for (const profile of profiles) {
      for (const scope of renderedScopes) {
        const markdown = 'Action item with several words.\nSecond paragraph remains separate.';
        const scenario = `toolbar-${profile}-${scope}`;
        try {
          await setDocument(page, markdown, { profile, scope });
          const firstLineEnd = markdown.indexOf('\n');
          await seedSelection(page, markdown, 0, firstLineEnd);

          assert.equal(await clickListAction(page, 'bulletedList'), true);
          const bulleted = '- Action item with several words.\nSecond paragraph remains separate.';
          await waitForMarkdown(page, bulleted);

          await seedSelection(page, bulleted, 0, bulleted.indexOf('\n'));
          assert.equal(await clickListAction(page, 'indent'), true);
          const indented = await page.evaluate(() => window.editorBridge.getMarkdown());
          assert.notEqual(indented, bulleted, `${scenario}: Indent must alter the selected list item`);
          assert.match(indented, /Action item with several words/);

          await seedSelection(page, indented, 0, indented.indexOf('\n'));
          assert.equal(await clickListAction(page, 'outdent'), true);
          await waitForMarkdown(page, bulleted);

          await setDocument(page, markdown, { profile, scope });
          await seedSelection(page, markdown, 0, firstLineEnd);
          assert.equal(await clickListAction(page, 'numberedList'), true);
          await waitForMarkdown(
            page,
            '1. Action item with several words.\nSecond paragraph remains separate.'
          );

          await setDocument(page, markdown, { profile, scope });
          await seedSelection(page, markdown, 0, firstLineEnd);
          const todoActionEnabled = await clickListAction(page, 'todoList');
          const taskResult = await page.evaluate(() => window.editorBridge.getMarkdown());
          if (profile === 'commonmark') {
            assert.equal(todoActionEnabled, false,
              `${scenario}: a CommonMark profile must not enable non-standard task authoring`);
            assert.equal(taskResult, markdown,
              `${scenario}: CommonMark must not silently author a non-CommonMark task marker`);
          } else {
            assert.equal(todoActionEnabled, true);
            assert.match(taskResult, /^-\s+\[ \]\s+Action item with several words\./,
              `${scenario}: Todo List menu action did not create a task`);
          }
          await saveScreenshot(page, scenario);
        } catch (error) {
          try {
            await saveScreenshot(page, `${scenario}-failed`);
          } catch {}
          failures.push(`${scenario}: ${error.stack || error.message}`);
        }
      }
    }

    for (const profile of profiles) {
      for (const scope of renderedScopes) {
        const source = '- [ ] TASK-CLICK-01 Toggle this task with a real tap.';
        const scenario = `task-toggle-${profile}-${scope}`;
        try {
          await setDocument(page, source, { profile, scope });
          const checkbox = page.locator('.cm-todo-checkbox:visible').first();
          if (profile === 'commonmark') {
            assert.equal(await checkbox.count(), 0,
              `${scenario}: CommonMark task syntax should remain literal`);
            assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), source);
          } else {
            await checkbox.click();
            await page.waitForFunction(
              () => /-\s+\[[xX]\]\s+TASK-CLICK-01/.test(window.editorBridge.getMarkdown()),
              null,
              { timeout: 5000 }
            );
            assert.match(
              await page.evaluate(() => window.editorBridge.getMarkdown()),
              /-\s+\[[xX]\]\s+TASK-CLICK-01/
            );
          }
          await saveScreenshot(page, scenario);
        } catch (error) {
          try {
            await saveScreenshot(page, `${scenario}-failed`);
          } catch {}
          failures.push(`${scenario}: ${error.stack || error.message}`);
        }
      }
    }

    const preferencesFixture = [
      '- PREF-LST-01 Preference changes must affect this wrapped list item on screen and keep continuation text aligned beneath the words.',
      '- PREF-LST-02 Second item for spacing comparison.'
    ].join('\n');
    try {
      await setDocument(page, preferencesFixture, {
        profile: 'gfm',
        scope: 'hidden',
        preferences: {
          pref_list_non_hanging: false,
          pref_list_left_indent: 12,
          pref_list_item_spacing: 4,
          pref_list_font_size: 16,
          pref_list_font_weight: 300
        }
      });
      const before = await page.locator('.cm-line.cm-list-item')
        .filter({ hasText: 'PREF-LST-01' })
        .first()
        .evaluate(element => {
          const style = getComputedStyle(element);
          return {
            marginLeft: parseFloat(style.marginLeft),
            paddingBottom: parseFloat(style.paddingBottom),
            fontSize: parseFloat(style.fontSize),
            fontWeight: parseInt(style.fontWeight, 10),
            hanging: document.body.classList.contains('list-wrap-under-text')
          };
        });
      await page.evaluate(() => window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'gfm',
        pref_markdown_syntax_exposure: 'hidden',
        pref_list_non_hanging: true,
        pref_list_left_indent: 40,
        pref_list_item_spacing: 12,
        pref_list_font_size: 20,
        pref_list_font_weight: 600
      }));
      await page.waitForFunction(() => !document.body.classList.contains('list-wrap-under-text'));
      const after = await page.locator('.cm-line.cm-list-item')
        .filter({ hasText: 'PREF-LST-01' })
        .first()
        .evaluate(element => {
          const style = getComputedStyle(element);
          return {
            marginLeft: parseFloat(style.marginLeft),
            paddingBottom: parseFloat(style.paddingBottom),
            fontSize: parseFloat(style.fontSize),
            fontWeight: parseInt(style.fontWeight, 10),
            hanging: document.body.classList.contains('list-wrap-under-text')
          };
        });
      assert.ok(after.marginLeft > before.marginLeft,
        `List indent setting should change the visible margin: ${JSON.stringify({ before, after })}`);
      assert.ok(after.paddingBottom > before.paddingBottom,
        `List spacing setting should change visible item spacing: ${JSON.stringify({ before, after })}`);
      assert.ok(after.fontSize > before.fontSize,
        `List font-size setting should change rendered text: ${JSON.stringify({ before, after })}`);
      assert.notEqual(after.fontWeight, before.fontWeight,
        `List font-weight setting should change rendered text: ${JSON.stringify({ before, after })}`);
      assert.equal(before.hanging, true);
      assert.equal(after.hanging, false);
      await saveScreenshot(page, 'list-settings-effects');
    } catch (error) {
      try {
        await saveScreenshot(page, 'list-settings-effects-failed');
      } catch {}
      failures.push(`list-settings-effects: ${error.stack || error.message}`);
    }

    const softBreakSource = 'SOFT-LINE-01 first paragraph line\nSOFT-LINE-02 second line\nHARD-LINE-01 explicit break  \nHARD-LINE-02 must stay below.';
    try {
      await setDocument(page, softBreakSource, {
        profile: 'gfm',
        scope: 'hidden',
        preferences: { pref_soft_breaks_as_spaces: false }
      });
      const separateLines = await page.locator('.cm-content').evaluate(rootElement => {
        const findRect = text => {
          const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const offset = node.nodeValue.indexOf(text);
            if (offset < 0) continue;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + text.length);
            const rect = range.getBoundingClientRect();
            if (rect.width && rect.height) return { left: rect.left, top: rect.top };
          }
          return null;
        };
        return {
          first: findRect('SOFT-LINE-01'),
          second: findRect('SOFT-LINE-02'),
          hardFirst: findRect('HARD-LINE-01'),
          hardSecond: findRect('HARD-LINE-02')
        };
      });
      assert.ok(separateLines.second.top > separateLines.first.top + 5,
        `A disabled soft-break setting should keep the source newline visible: ${JSON.stringify(separateLines)}`);
      await page.evaluate(() => window.editorBridge.applyAllPreferences({
        pref_markdown_profile: 'gfm',
        pref_markdown_syntax_exposure: 'hidden',
        pref_soft_breaks_as_spaces: true
      }));
      await page.waitForFunction(() => window.editorBridge.getMarkdown().includes('HARD-LINE-02'));
      const joinedLines = await page.locator('.cm-content').evaluate(rootElement => {
        const findRect = text => {
          const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const offset = node.nodeValue.indexOf(text);
            if (offset < 0) continue;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + text.length);
            const rect = range.getBoundingClientRect();
            if (rect.width && rect.height) return { left: rect.left, top: rect.top };
          }
          return null;
        };
        return {
          first: findRect('SOFT-LINE-01'),
          second: findRect('SOFT-LINE-02'),
          hardFirst: findRect('HARD-LINE-01'),
          hardSecond: findRect('HARD-LINE-02'),
          hardLineText: [...rootElement.querySelectorAll('.cm-line')]
            .find(line => line.textContent.includes('HARD-LINE-01'))
            ?.textContent ?? null
        };
      });
      assert.equal(joinedLines.second.top, joinedLines.first.top,
        `An enabled soft-break setting should join a single newline visually: ${JSON.stringify(joinedLines)}`);
      assert.ok(joinedLines.hardSecond.top > joinedLines.hardFirst.top + 5,
        `Two trailing spaces must keep the explicit hard break visible: ${JSON.stringify(joinedLines)}`);
      assert.ok(joinedLines.hardLineText?.endsWith('  '),
        `The explicit two-space marker must remain present in the visible line: ${JSON.stringify(joinedLines)}`);
      assert.equal(await page.evaluate(() => window.editorBridge.getMarkdown()), softBreakSource,
        'Soft-break display preferences must not rewrite the Markdown source');
      await saveScreenshot(page, 'soft-break-setting-effects');

      await setDocument(page, softBreakSource, {
        mode: 'source',
        profile: 'gfm',
        scope: 'hidden',
        preferences: { pref_soft_breaks_as_spaces: true }
      });
      const sourceLines = await page.locator('.cm-content').evaluate(rootElement => {
        const findTop = text => {
          const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const offset = node.nodeValue.indexOf(text);
            if (offset < 0) continue;
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + text.length);
            return range.getBoundingClientRect().top;
          }
          return null;
        };
        return [findTop('SOFT-LINE-01'), findTop('SOFT-LINE-02')];
      });
      assert.ok(sourceLines[1] > sourceLines[0] + 5,
        'Source mode must show the original single newline even when soft breaks are joined in WYSIWYG');
      await saveScreenshot(page, 'soft-break-setting-source');
    } catch (error) {
      try {
        await saveScreenshot(page, 'soft-break-setting-effects-failed');
      } catch {}
      failures.push(`soft-break-setting-effects: ${error.stack || error.message}`);
    }

    if (pageErrors.length) failures.push(`browser page errors: ${pageErrors.join('; ')}`);
    if (failures.length) {
      throw new Error(`${failures.length} list workflow failure(s):\n${failures.join('\n\n')}`);
    }
    console.log('PASS: 20 profile/view edit cases, 8 Return/Backspace cases, 6 block-context edits, 16 toolbar cases, 16 task cases, plus settings and soft-break effects.');
    console.log(`Screenshots saved under ${artifactRoot}`);
  } finally {
    await context?.close();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
