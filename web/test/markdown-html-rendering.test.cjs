const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const projectRoot = path.resolve(__dirname, '../..');
const appAssets = path.join(projectRoot, 'app/src/main/assets/www');

function sourceText(content) {
  return [...content.querySelectorAll('.cm-line')]
    .map(line => line.textContent)
    .join('\n');
}

async function waitForDomCondition(window, predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), message);
}

test('raw HTML respects WYSIWYG syntax-exposure settings', async () => {
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
    x: 0, y: 0, width: 640, height: 2400,
    top: 0, right: 640, bottom: 2400, left: 0,
    toJSON() { return this; }
  });
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  window.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
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
      return { x: 0, y: 0, width: 640, height: 24, top: 0, right: 640, bottom: 24, left: 0,
        toJSON() { return this; } };
    }
    return rect();
  };
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return this.classList?.contains('cm-scroller') ? 2400 : 0; }
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return this.classList?.contains('cm-scroller') ? 640 : 0; }
  });
  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return this.classList?.contains('cm-scroller') ? 2400 : 0; }
  });
  window.Range.prototype.getBoundingClientRect = rect;
  window.Range.prototype.getClientRects = () => [];
  window.AndroidNative = {
    getCurrentDocumentSessionId: () => 'markdown-html-render-test',
    onEditorReady: () => {},
    onContentChanged: () => {},
    onDirtyStateChanged: () => {},
    reportDiagnostic: (kind, detail) => errors.push(kind + ': ' + detail)
  };

  try {
    window.eval(bundle);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await waitForDomCondition(window,
      () => Boolean(window.editorBridge && window.document.querySelector('.cm-content')),
      'the Markdown editor mounts');

    await window.editorBridge.setEditorMode('rendered');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(window.editorBridge.getEditorMode(), 'rendered', 'the user-facing editor mode is WYSIWYG');
    assert.equal(window.editorBridge.getSyntaxExposureScope(), 'hidden', 'syntax exposure starts hidden');
    const bookmarkSource =
      '<DL><p><DT><H3 ADD_DATE="1777481312" LAST_MODIFIED="0" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3><DL><p><DT><A HREF="https://example.test/">Example <STRONG>bookmark</STRONG></A></DL></DL>';
    window.editorBridge.setMarkdown(bookmarkSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    let content = window.document.querySelector('.cm-content');
    const bookmarkTextFrom = bookmarkSource.indexOf('Example ');
    const bookmarkLinkTextFrom = bookmarkSource.indexOf('bookmark</STRONG>');
    const headingTextFrom = bookmarkSource.indexOf('Bookmarks bar');
    const editableHtmlText = text =>
      [...content.querySelectorAll('.cm-raw-html-text')]
        .find(span => span.textContent.trim() === text);
    assert.ok(editableHtmlText('Bookmarks bar')?.classList.contains('cm-raw-html-h3'),
      'bookmark headings render with HTML styling while remaining editor text');
    assert.ok(editableHtmlText('Example')?.classList.contains('cm-raw-html-a'),
      'bookmark label text remains editable inside its link');
    assert.ok(editableHtmlText('bookmark')?.classList.contains('cm-raw-html-strong'),
      'nested bookmark text stays editable and retains its own HTML style');
    assert.equal(sourceText(content).includes('<DL>'), false,
      'WYSIWYG hides structural bookmark wrapper tags');
    assert.equal(sourceText(content).includes('<A HREF='), false,
      'WYSIWYG hides the anchor source while syntax exposure is off');
    window.editorBridge.setSelectionState({
      anchor: bookmarkTextFrom,
      head: bookmarkTextFrom
    });
    content.focus();
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, bookmarkTextFrom + 1,
      'the caret moves through bookmark label characters instead of jumping across an HTML widget');
    const beforeNestedTag = bookmarkTextFrom + 'Example '.length;
    window.editorBridge.setSelectionState({
      anchor: beforeNestedTag,
      head: beforeNestedTag
    });
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, bookmarkLinkTextFrom,
      'the caret skips a hidden nested HTML tag without skipping the first visible letter');
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, bookmarkLinkTextFrom + 1,
      'the first letter after hidden HTML syntax remains independently caret-addressable');
    assert.equal(window.editorBridge.getMarkdown(), bookmarkSource,
      'rendered HTML does not mutate source until the user edits text');

    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    window.editorBridge.setSelectionState({
      anchor: headingTextFrom + 2,
      head: headingTextFrom + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='),
      'caret exposure reveals the bookmark heading source under the caret');
    assert.equal(window.editorBridge.getEditorMode(), 'rendered', 'syntax exposure does not create a second user-facing mode');
    assert.equal(window.editorBridge.getSyntaxExposureScope(), 'caret');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='), false,
      'the sibling bookmark link remains rendered');
    window.editorBridge.setSelectionState({
      anchor: bookmarkLinkTextFrom + 2,
      head: bookmarkLinkTextFrom + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='),
      'caret exposure reveals only the selected bookmark link source');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='), false,
      'moving from the heading to the link hides the previous element source again');

    const structuredBookmarkSource = [
      '<DL><p>',
      '  <DT><H3>WMK</H3>',
      '  <DL><p>',
      '    <DT><A HREF="https://example.test/commit">Commit</A>',
      '    <DT><A HREF="https://example.test/commits">commits</A>',
      '  </DL><p>',
      '  <DT><A HREF="https://example.test/bm">BM</A>',
      '</DL><p>'
    ].join('\n');
    const firstBookmarkLabel = structuredBookmarkSource.indexOf('Commit');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    window.editorBridge.setMarkdown(structuredBookmarkSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent === 'Commit' && span.classList.contains('cm-raw-html-a')),
    'a nested bookmark list does not get absorbed into its preceding DT heading');
    assert.equal(sourceText(content).includes('</DL>'), false,
      'malformed bookmark closing tags stay hidden rather than becoming visible text');

    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    window.editorBridge.setSelectionState({
      anchor: firstBookmarkLabel + 2,
      head: firstBookmarkLabel + 2
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content'))
        .includes('<A HREF="https://example.test/commit">Commit</A>'),
      'caret exposure reveals only the bookmark element under the caret');
    let exposedBookmarkSource = sourceText(window.document.querySelector('.cm-content'));
    assert.equal(exposedBookmarkSource.includes('https://example.test/commits'), false,
      'caret exposure does not reveal a sibling bookmark');
    assert.equal(exposedBookmarkSource.includes('</DL>'), false,
      'caret exposure does not reveal a distant structural closing tag');

    window.editorBridge.setMarkdownSyntaxExposure('line');
    await new Promise(resolve => setTimeout(resolve, 20));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content'))
        .includes('<DT><A HREF="https://example.test/commit">Commit</A>'),
      'line exposure includes the complete source line containing the caret');
    exposedBookmarkSource = sourceText(window.document.querySelector('.cm-content'));
    assert.equal(exposedBookmarkSource.includes('https://example.test/commits'), false,
      'line exposure leaves the neighboring source line rendered');

    window.editorBridge.setMarkdownSyntaxExposure('block');
    await new Promise(resolve => setTimeout(resolve, 20));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content'))
        .includes('https://example.test/commits'),
      'block exposure reveals the complete raw HTML block');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('</DL>'), true,
      'block exposure includes structural closing tags within that HTML block');

    const quotedSource = [
      '> <DL><p><DT><H3>Quoted folder</H3>',
      '> <DL><DT><A HREF="https://quoted.example.test/">Quoted bookmark</A></DL></DL>'
    ].join('\n');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    window.editorBridge.setMarkdown(quotedSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent.trim() === 'Quoted bookmark' &&
        span.classList.contains('cm-raw-html-a')),
    'HTML text remains editable when nested in a Markdown blockquote');
    assert.equal(sourceText(content).includes('> <DL>'), false,
      'the blockquote marker stays hidden while its HTML content renders');

    const inlineSource = 'Inline HTML <kbd>Ctrl</kbd> and <mark>highlight</mark>.';
    window.editorBridge.setMarkdown(inlineSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent === 'Ctrl' && span.classList.contains('cm-raw-html-kbd')),
    'inline HTML remains character-editable with its styling');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent === 'highlight' && span.classList.contains('cm-raw-html-mark')),
    'adjacent inline HTML retains independent styling');

    const complexSource = [
      '<div class="raw-html-block"><p>Block HTML <strong>renders</strong>.</p></div>',
      '<script>window.__wmdxRawHtmlExecuted = true;</script>'
    ].join('\n');
    window.editorBridge.setMarkdown(complexSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.equal(content.querySelectorAll('.cm-markdown-html-preview script').length, 0,
      'WYSIWYG never inserts active script elements');
    assert.equal(window.__wmdxRawHtmlExecuted, undefined, 'WYSIWYG does not execute raw HTML scripts');
    assert.ok([...content.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent.trim() === 'renders' &&
        span.classList.contains('cm-raw-html-strong')),
    'nested text in a complex HTML block remains editable instead of becoming one block widget');
    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    const complexTextFrom = complexSource.indexOf('renders') + 2;
    window.editorBridge.setSelectionState({
      anchor: complexTextFrom,
      head: complexTextFrom
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<p>Block HTML'),
      'moving the caret into nested HTML text exposes its containing element source');
    assert.equal(window.editorBridge.getMarkdown(), complexSource, 'syntax exposure never mutates Markdown');
    const inlineTextPosition = inlineSource.indexOf('Ctrl') + 1;
    window.editorBridge.setMarkdown(inlineSource);
    window.editorBridge.setSelectionState({
      anchor: inlineTextPosition,
      head: inlineTextPosition
    });
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<kbd>Ctrl</kbd>'),
      'caret exposure reveals only the selected inline HTML element');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<mark>highlight</mark>'), false,
      'the neighboring inline HTML element remains rendered');
    assert.ok([...window.document.querySelectorAll('.cm-raw-html-text')]
      .some(span => span.textContent.trim() === 'highlight' &&
        span.classList.contains('cm-raw-html-mark')),
    'the neighboring inline element remains styled and editable');

    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    const markdownSource = '**bold**';
    window.editorBridge.setMarkdown(markdownSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    window.editorBridge.setSelectionState({ anchor: 0, head: 0 });
    content.focus();
    content.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, 2,
      'hidden Markdown delimiters are skipped without skipping the first formatted letter');

    const hardBreakSource = 'hard  \nbreak';
    window.editorBridge.setMarkdown(hardBreakSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    content = window.document.querySelector('.cm-content');
    assert.equal(content.querySelectorAll('.cm-hardbreak-syntax').length, 0,
      'two-space hard-break spelling remains ordinary visible whitespace in WYSIWYG');
    const hardBreakSpaces = content.querySelector('.cm-hardbreak-spaces');
    assert.equal(hardBreakSpaces?.textContent, '  ',
      'trailing hard-break spaces remain real, separately addressable text with preserved layout width');
    const hardBreakSpacesFrom = hardBreakSource.indexOf('hard') + 'hard'.length;
    window.editorBridge.setSelectionState({
      anchor: hardBreakSpacesFrom,
      head: hardBreakSpacesFrom
    });
    for (const expectedPosition of [hardBreakSpacesFrom + 1, hardBreakSpacesFrom + 2]) {
      content.dispatchEvent(new window.KeyboardEvent('keydown', {
        key: 'ArrowRight',
        keyCode: 39,
        which: 39,
        bubbles: true,
        cancelable: true
      }));
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(JSON.parse(window.editorBridge.getSelectionState()).head, expectedPosition,
        'the caret can stop on each literal hard-break space');
    }

    await window.editorBridge.setEditorMode('source');
    const sourceContent = window.document.querySelector('.cm-content');
    assert.equal(sourceText(sourceContent), hardBreakSource, 'Source displays the complete Markdown text');
    assert.equal(sourceContent.querySelectorAll('.cm-markdown-html-preview').length, 0,
      'Source mode does not render HTML previews');
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
