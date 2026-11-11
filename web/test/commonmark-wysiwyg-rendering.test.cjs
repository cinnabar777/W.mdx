const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const projectRoot = path.resolve(__dirname, '../..');
const appAssets = path.join(projectRoot, 'app/src/main/assets/www');

function renderedText(line) {
  const copy = line.cloneNode(true);
  copy.querySelectorAll('.cm-hardbreak-syntax').forEach(marker => marker.remove());
  return copy.textContent;
}

function sourceText(content) {
  return [...content.querySelectorAll('.cm-line')]
    .map(line => line.textContent)
    .join('\n');
}

function assertHardBreakRendering(lines, window) {
  assert.ok(lines[0].textContent.endsWith('Hard break by spaces:  '));
  assert.equal(lines[0].querySelector('.cm-hardbreak-syntax'), null);

  const backslashMarker = lines[1].querySelector('.cm-hardbreak-syntax');
  assert.ok(backslashMarker, 'the backslash hard-break marker has a rendering decoration');
  assert.equal(backslashMarker.textContent, '\\');
  assert.equal(window.getComputedStyle(backslashMarker).display, 'none');
}

async function waitForDomCondition(window, predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), message);
}

test('CommonMark inline syntax, hard breaks, and list indentation render without changing source', async () => {
  const html = fs.readFileSync(path.join(appAssets, 'index.html'), 'utf8');
  const bundle = fs.readFileSync(path.join(appAssets, 'bundle.js'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://wmdx.test/',
    virtualConsole
  });
  const window = dom.window;
  const rect = () => ({
    x: 0, y: 0, width: 640, height: 480,
    top: 0, right: 640, bottom: 480, left: 0,
    toJSON() { return this; }
  });
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function() {};
  window.HTMLElement.prototype.getBoundingClientRect = function() {
    if (this.classList?.contains('cm-line')) {
      return {
        x: 0, y: 0, width: 640, height: 24,
        top: 0, right: 640, bottom: 24, left: 0,
        toJSON() { return this; }
      };
    }
    return rect();
  };
  window.Range.prototype.getBoundingClientRect = rect;
  window.Range.prototype.getClientRects = () => [];
  window.AndroidNative = {
    getCurrentDocumentSessionId: () => 'commonmark-wysiwyg-test',
    onEditorReady: () => {},
    onContentChanged: () => {},
    onDirtyStateChanged: () => {},
    reportDiagnostic: (kind, detail) => errors.push(`${kind}: ${detail}`)
  };

  try {
    window.eval(bundle);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 20));

    const source = [
      'Entities: &amp; &copy; &#x1F642;',
      'Escaped punctuation: \\*literal\\* \\&amp; \\|',
      'Hard break by spaces:  ',
      'continued after spaces',
      'Hard break by slash\\',
      'continued after slash',
      'Code span edge spaces: `  foo  `',
      'Code span newline: `foo',
      'bar`',
      'Code span multiline spaces: ``',
      'foo',
      'bar  ',
      'baz',
      '``'
    ].join('\n');
    window.editorBridge.setMarkdown(source);
    await new Promise(resolve => setTimeout(resolve, 20));

    const content = window.document.querySelector('.cm-content');
    assert.ok(content, 'the editor content is mounted');
    const renderedLines = [...content.querySelectorAll('.cm-line')];
    assert.deepEqual(renderedLines.slice(0, 3).map(renderedText), [
      'Entities: & © 🙂 Escaped punctuation: *literal* &amp; | Hard break by spaces:  ',
      'continued after spaces Hard break by slash',
      'continued after slash Code span edge spaces:  foo  Code span newline: foo bar Code span multiline spaces: foo bar   baz'
    ], content.innerHTML);
    assertHardBreakRendering(renderedLines, window);
    assert.deepEqual(
      [...content.querySelectorAll('.cm-inline-code-normalized')].map(widget => widget.textContent),
      [' foo ', 'foo bar', 'foo bar   baz']
    );
    assert.equal(window.editorBridge.getMarkdown(), source);

    await window.editorBridge.setEditorMode('live_preview');
    const livePreviewContent = window.document.querySelector('.cm-content');
    const livePreviewLines = [...livePreviewContent.querySelectorAll('.cm-line')];
    assert.deepEqual(livePreviewLines.slice(0, 3).map(renderedText), [
      'Entities: & © 🙂 Escaped punctuation: *literal* &amp; | Hard break by spaces:  ',
      'continued after spaces Hard break by slash',
      'continued after slash Code span edge spaces:  foo  Code span newline: foo bar Code span multiline spaces: foo bar   baz'
    ]);
    assertHardBreakRendering(livePreviewLines, window);
    assert.deepEqual(
      [...livePreviewContent.querySelectorAll('.cm-inline-code-normalized')].map(widget => widget.textContent),
      [' foo ', 'foo bar', 'foo bar   baz']
    );
    assert.equal(window.editorBridge.getMarkdown(), source);

    await window.editorBridge.setEditorMode('source');
    const sourceContent = window.document.querySelector('.cm-content');
    assert.equal(window.editorBridge.getMarkdown(), source);
    assert.ok(sourceContent.textContent.includes('&amp; &copy; &#x1F642;'));
    assert.ok(sourceContent.textContent.includes('\\*literal\\* \\&amp; \\|'));
    assert.ok(sourceContent.textContent.includes('Hard break by spaces:  '));
    assert.ok(sourceContent.textContent.includes('Hard break by slash\\'));

    const inlineFormattingSource = '**bold** *italic* ~~strike~~ H~2~O `code`';
    window.editorBridge.setMarkdown(inlineFormattingSource);
    await window.editorBridge.setEditorMode('source');
    const rawFormattingContent = window.document.querySelector('.cm-content');
    assert.equal(rawFormattingContent.textContent, inlineFormattingSource);
    for (const className of [
      'cm-bold', 'cm-italic', 'cm-strikethrough', 'cm-subscript', 'cm-inline-code'
    ]) {
      assert.equal(
        rawFormattingContent.querySelectorAll(`.${className}`).length,
        0,
        `Source does not apply rendered ${className} styling`
      );
    }
    for (const mode of ['live_preview', 'wysiwyg']) {
      await window.editorBridge.setEditorMode(mode);
      const modeContent = window.document.querySelector('.cm-content');
      for (const className of [
        'cm-bold', 'cm-italic', 'cm-strikethrough', 'cm-subscript', 'cm-inline-code'
      ]) {
        assert.equal(
          modeContent.querySelectorAll(`.${className}`).length,
          1,
          `${mode} applies ${className} exactly once`
        );
      }
      assert.equal(window.editorBridge.getMarkdown(), inlineFormattingSource);
    }

    const sourceCallout = '> [!warning]- Source title\n> Source body';
    window.editorBridge.setMarkdown(sourceCallout);
    await window.editorBridge.setEditorMode('source');
    const sourceCalloutContent = window.document.querySelector('.cm-content');
    assert.equal(sourceText(sourceCalloutContent), sourceCallout);
    assert.equal(sourceCalloutContent.querySelectorAll('.cm-callout').length, 0);
    assert.equal(sourceCalloutContent.querySelectorAll('.cm-blockquote').length, 0);
    assert.equal(
      window.document.querySelector('.cm-callout-title-container'),
      null,
      'Source does not insert a rendered callout header over the source markers'
    );
    assert.equal(
      window.document.querySelector('.cm-foldPlaceholder'),
      null,
      'Source does not fold callout bodies'
    );
    assert.equal(window.editorBridge.getMarkdown(), sourceCallout);

    const tableSource = [
      '| Left | Center | Right |',
      '| :--- | :---: | ---: |',
      '| Bold | centered | right |',
      '| A | B | C |'
    ].join('\n');
    window.editorBridge.setMarkdown(tableSource);
    for (const mode of ['live_preview', 'wysiwyg']) {
      await window.editorBridge.setEditorMode(mode);
      const renderedTableContent = window.document.querySelector('.cm-content');
      assert.ok(
        renderedTableContent.querySelector('.cm-wp-table-container'),
        `${mode} keeps the table rendered and editable`
      );
      assert.equal(
        renderedTableContent.textContent.includes('|'),
        false,
        `${mode} does not expose table pipe syntax while editing its cells`
      );
      assert.equal(window.editorBridge.getMarkdown(), tableSource);
    }

    await window.editorBridge.setEditorMode('source');
    const sourceTableContent = window.document.querySelector('.cm-content');
    assert.equal(
      sourceTableContent.querySelector('.cm-wp-table-container'),
      null,
      'Source keeps the table as Markdown text'
    );
    assert.ok(sourceTableContent.textContent.includes('| Left | Center | Right |'));
    assert.equal(window.editorBridge.getMarkdown(), tableSource);

    const sharedLayoutSource = [
      '> a quoted paragraph',
      '> > a nested quoted paragraph',
      '> - a list item inside a quote',
      '',
      '1. a list item',
      '  its continuation',
      '',
      'a regular paragraph'
    ].join('\n');
    window.editorBridge.setMarkdown(sharedLayoutSource);
    for (const mode of ['source', 'live_preview', 'wysiwyg']) {
      await window.editorBridge.setEditorMode(mode);
      await new Promise(resolve => setTimeout(resolve, 20));
      const modeContent = window.document.querySelector('.cm-content');
      if (mode === 'source') {
        assert.equal(sourceText(modeContent), sharedLayoutSource);
        assert.equal(modeContent.querySelectorAll('.cm-blockquote').length, 0);
        assert.equal(modeContent.querySelectorAll('.cm-list-item').length, 0);
        assert.equal(modeContent.querySelectorAll('.cm-list-continuation').length, 0);
        assert.equal(modeContent.querySelectorAll('.cm-paragraph').length, 0);
        assert.equal(window.editorBridge.getMarkdown(), sharedLayoutSource);
        continue;
      }
      assert.ok(
        modeContent.querySelector('.cm-line.cm-blockquote'),
        `${mode} applies shared blockquote layout`
      );
      assert.ok(
        modeContent.querySelector('.cm-line.cm-list-item'),
        `${mode} applies shared list-item layout`
      );
      const continuedItem = [...modeContent.querySelectorAll('.cm-line.cm-list-item')]
        .find(line => line.textContent.includes('its continuation'));
      assert.ok(
        continuedItem?.textContent.includes('a list item'),
        `${mode} joins a soft-wrapped list continuation to its item`
      );
      assert.equal(
        modeContent.querySelector('.cm-line.cm-list-continuation'),
        null,
        `${mode} does not retain a separate visual line for a soft break`
      );
      assert.ok(
        modeContent.querySelector('.cm-line.cm-paragraph'),
        `${mode} applies shared paragraph layout`
      );
      assert.equal(window.editorBridge.getMarkdown(), sharedLayoutSource);
    }
    await window.editorBridge.setEditorMode('live_preview');
    await new Promise(resolve => setTimeout(resolve, 20));
    const nestedQuote = [...window.document.querySelectorAll('.cm-line.cm-blockquote')]
      .find(line => line.textContent.includes('nested quoted paragraph'));
    assert.ok(nestedQuote, 'nested quote content keeps shared quote styling');
    assert.equal(nestedQuote.dataset.blockquoteDepth, '2');
    assert.equal(
      nestedQuote.style.getPropertyValue('--blockquote-depth-offset'),
      '12px'
    );
    const quotedListItem = [...window.document.querySelectorAll('.cm-line.cm-list-item')]
      .find(line => line.textContent.includes('a list item inside a quote'));
    assert.ok(quotedListItem, 'a list inside a quote keeps its list marker');
    assert.ok(quotedListItem.classList.contains('cm-blockquote'));
    assert.ok(quotedListItem.textContent.startsWith('• '));
    assert.equal(
      quotedListItem.style.getPropertyValue('--list-quote-inset'),
      'var(--list-left-indent, 24px)'
    );

    const listSource = [
      'CommonMark list indentation example:',
      '- a',
      ' - b',
      '  - c',
      '   - d',
      '  - e',
      ' - f',
      '- g',
      '',
      '- foo',
      '  - bar',
      '    - baz',
      '',
      '> - quoted item',
      '- [ ] task parent',
      '  - [ ] nested task',
      '',
      '1. Numbered parent',
      '   2. Numbered child',
      '   3. Next child',
      '      4. Grandchild',
      '      5. Next grandchild',
      '   6. Third child',
      '7. Next parent',
      '',
      'A. Native alphabetic parent',
      '  B. Native alphabetic child with a long line to wrap and verify nested marker alignment.',
      'I. Native ordered parent',
      '  I. Native ordered child with a long line to wrap and verify nested marker alignment.'
    ].join('\n');
    window.editorBridge.applyAllPreferences(JSON.stringify({
      pref_list_non_hanging: false
    }));
    assert.equal(
      window.document.body.classList.contains('list-wrap-under-text'),
      true,
      'hanging item-text alignment is the default'
    );
    window.editorBridge.setMarkdown(listSource);
    await window.editorBridge.setEditorMode('wysiwyg');
    const expectedListItems = [
      '• a', '• b', '• c', '• d', '• e', '• f', '• g',
      '• foo', '• bar', '• baz', '• quoted item',
      '• task parent', '• nested task',
      '1. Numbered parent',
      '1. Numbered child',
      '2. Next child',
      '1. Grandchild',
      '2. Next grandchild',
      '3. Third child',
      '2. Next parent',
      'A. Native alphabetic parent',
      'A. Native alphabetic child with a long line to wrap and verify nested marker alignment.',
      'I. Native ordered parent',
      'I. Native ordered child with a long line to wrap and verify nested marker alignment.'
    ];
    await waitForDomCondition(
      window,
      () => window.document.querySelectorAll('.cm-line.cm-list-item').length ===
        expectedListItems.length,
      'all CommonMark list items are rendered before asserting their structure'
    );
    const wysiwygListItems = [...window.document.querySelectorAll('.cm-line.cm-list-item')];
    const normalizedListText = line =>
      line.textContent.replace(/\s{2,}/g, ' ');
    assert.deepEqual(wysiwygListItems.map(normalizedListText), expectedListItems);
    const listLine = text =>
      wysiwygListItems.find(line => line.textContent === text);
    assert.equal(
      listLine('• foo').style.getPropertyValue('--list-depth-offset'),
      '0px'
    );
    assert.equal(
      listLine('• bar').style.getPropertyValue('--list-depth-offset'),
      '2ch'
    );
    assert.equal(
      listLine('• baz').style.getPropertyValue('--list-depth-offset'),
      '4ch'
    );
    assert.equal(
      listLine('1. Numbered child').style.getPropertyValue('--list-depth-offset'),
      '3ch',
      'rendered ordered items use the same source-column indentation'
    );
    assert.equal(
      wysiwygListItems
        .find(line => line.textContent.includes('nested task'))
        .style.getPropertyValue('--list-depth-offset'),
      '2ch'
    );
    assert.equal(
      listLine(
        'I. Native ordered child with a long line to wrap and verify nested marker alignment.'
      ).style.getPropertyValue('--list-depth-offset'),
      '2ch'
    );
    const nativeRomanChild = listLine(
      'I. Native ordered child with a long line to wrap and verify nested marker alignment.'
    );
    assert.ok(
      nativeRomanChild.querySelector('.cm-layout-content'),
      `the ordered item has a semantic content anchor separate from its marker: ${nativeRomanChild.outerHTML}`
    );
    assert.equal(
      listLine(
        'A. Native alphabetic child with a long line to wrap and verify nested marker alignment.'
      ).style.getPropertyValue('--list-depth-offset'),
      '2ch'
    );
    assert.ok(
      listLine(
        'A. Native alphabetic child with a long line to wrap and verify nested marker alignment.'
      ).querySelector('.cm-layout-content'),
      'alphabetic item text uses the same semantic content role'
    );
    assert.equal(
      window.getComputedStyle(
        listLine(
          'A. Native alphabetic child with a long line to wrap and verify nested marker alignment.'
        )
      ).display,
      'block',
      'the default text-hanging layout is active for ordered list markers'
    );
    window.editorBridge.applyAllPreferences(JSON.stringify({
      pref_list_non_hanging: true
    }));
    assert.equal(
      window.document.body.classList.contains('list-wrap-under-text'),
      false,
      'the optional non-hanging setting disables text-column alignment'
    );
    assert.equal(
      window.getComputedStyle(
        listLine(
          'A. Native alphabetic child with a long line to wrap and verify nested marker alignment.'
        )
      ).display,
      'block',
      'non-hanging items retain the shared inline layout; only wrapping alignment changes'
    );
    window.editorBridge.applyAllPreferences(JSON.stringify({
      pref_list_non_hanging: false
    }));
    assert.equal(
      window.getComputedStyle(
        listLine(
          'A. Native alphabetic child with a long line to wrap and verify nested marker alignment.'
        )
      ).display,
      'block',
      'the default hanging layout is restored after switching back'
    );
    assert.ok(
      wysiwygListItems
        .find(line => line.textContent.includes('nested task'))
        .querySelector('.cm-layout-content'),
      'task text has a content anchor separate from the checkbox'
    );
    assert.equal(window.editorBridge.getMarkdown(), listSource);

    await window.editorBridge.setEditorMode('live_preview');
    const livePreviewListItems = [...window.document.querySelectorAll('.cm-line.cm-list-item')];
    assert.deepEqual(livePreviewListItems.map(normalizedListText), [
      '• a', '• b', '• c', '• d', '• e', '• f', '• g',
      '• foo', '• bar', '• baz', '• quoted item',
      '• task parent', '• nested task',
      '1. Numbered parent',
      '1. Numbered child',
      '2. Next child',
      '1. Grandchild',
      '2. Next grandchild',
      '3. Third child',
      '2. Next parent',
      'A. Native alphabetic parent',
      'A. Native alphabetic child with a long line to wrap and verify nested marker alignment.',
      'I. Native ordered parent',
      'I. Native ordered child with a long line to wrap and verify nested marker alignment.'
    ]);
    const liveNestedItem = livePreviewListItems.find(
      line => line.textContent === '• bar'
    );
    assert.equal(
      liveNestedItem.style.getPropertyValue('--list-depth-offset'),
      '2ch'
    );
    assert.ok(
      liveNestedItem.querySelector('.cm-layout-content'),
      'Live Preview keeps a semantic content anchor for nested item text'
    );
    assert.ok(
      livePreviewListItems
        .find(line => line.textContent.includes('nested task'))
        .querySelector('.cm-layout-content'),
      'Live Preview keeps task text separate from its checkbox marker'
    );
    assert.ok(
      livePreviewListItems
        .find(line => line.textContent.includes('Native alphabetic child'))
        .querySelector('.cm-layout-content'),
      'Live Preview uses the same wrapping block for alphabetic items'
    );
    assert.equal(window.editorBridge.getMarkdown(), listSource);

    await window.editorBridge.setEditorMode('source');
    const sourceListContent = window.document.querySelector('.cm-content');
    assert.equal(sourceText(sourceListContent), listSource,
      'Source keeps every list marker and authored indent as literal text');
    assert.equal(sourceListContent.querySelectorAll('.cm-list-item').length, 0,
      'Source does not apply rendered list layout');
    assert.equal(sourceListContent.querySelectorAll('.cm-layout-content').length, 0,
      'Source does not insert semantic list wrappers');
    assert.equal(window.editorBridge.getMarkdown(), listSource);

    const orderedStyleSource = [
      'A. Upper alpha marker with enough text to wrap beneath the item text.',
      'B. Another upper alpha marker with enough text to wrap beneath the item text.',
      '',
      'a. Lower alpha marker with enough text to wrap beneath the item text.',
      'b. Another lower alpha marker with enough text to wrap beneath the item text.',
      '',
      'IV. Upper Roman marker with enough text to wrap beneath the item text.',
      'V. Another upper Roman marker with enough text to wrap beneath the item text.',
      '',
      'iv. Lower Roman marker with enough text to wrap beneath the item text.',
      'v. Another lower Roman marker with enough text to wrap beneath the item text.'
    ].join('\n');
    window.editorBridge.setMarkdown(orderedStyleSource);
    await new Promise(resolve => setTimeout(resolve, 20));

    for (const mode of ['wysiwyg', 'live_preview']) {
      await window.editorBridge.setEditorMode(mode);
      const orderedLines = [
        ...window.document.querySelectorAll('.cm-line.cm-list-item')
      ];
      assert.equal(orderedLines.length, 8, `${mode} renders all ordered styles`);
      for (const line of orderedLines) {
        assert.ok(line.querySelector('.cm-layout-content'), `${mode} identifies content separately from syntax`);
        assert.equal(line.querySelectorAll('.cm-list-block-text').length, 0,
          `${mode} does not duplicate content wrappers`);
        assert.equal(
          window.getComputedStyle(line).display,
          'block',
          `${mode} applies hanging layout to every ordered style`
        );
      }
    }

    await window.editorBridge.setEditorMode('source');
    const sourceOrderedContent = window.document.querySelector('.cm-content');
    assert.equal(sourceText(sourceOrderedContent), orderedStyleSource,
      'Source preserves every authored ordered-list marker literally');
    assert.equal(sourceOrderedContent.querySelectorAll('.cm-list-item').length, 0,
      'Source does not apply rendered ordered-list layout');
    assert.equal(window.editorBridge.getMarkdown(), orderedStyleSource);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
