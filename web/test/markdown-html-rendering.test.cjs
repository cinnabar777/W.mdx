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
      '<DL><p><DT><H3 ADD_DATE="1777481312" LAST_MODIFIED="0" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3><DL><p><DT><A HREF="https://example.test/">Example bookmark</A></DL></DL>';
    window.editorBridge.setMarkdown(bookmarkSource);
    await new Promise(resolve => setTimeout(resolve, 20));
    let content = window.document.querySelector('.cm-content');
    const bookmarkTextFrom = bookmarkSource.indexOf('Example bookmark');
    const bookmarkLinkTextFrom = bookmarkTextFrom;
    const headingTextFrom = bookmarkSource.indexOf('Bookmarks bar');
    const editableHtmlText = text =>
      [...content.querySelectorAll('.cm-raw-html-text')]
        .find(span => span.textContent.trim() === text);
    assert.ok(editableHtmlText('Bookmarks bar')?.classList.contains('cm-raw-html-h3'),
      'bookmark headings render with HTML styling while remaining editor text');
    assert.ok(editableHtmlText('Example bookmark')?.classList.contains('cm-raw-html-a'),
      'bookmark labels render with link styling while remaining editor text');
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
    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    const blockPreview = window.document.querySelector('.cm-content .cm-markdown-html-preview .raw-html-block')
      ?.closest('.cm-markdown-html-preview');
    assert.ok(blockPreview, 'complex HTML blocks still use a sanitized rendered preview');
    blockPreview.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<p>Block HTML'),
      'moving the caret into the tapped child exposes only that element source');
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

    await window.editorBridge.setEditorMode('source');
    const sourceContent = window.document.querySelector('.cm-content');
    assert.equal(sourceText(sourceContent), inlineSource, 'Source displays the complete raw HTML Markdown');
    assert.equal(sourceContent.querySelectorAll('.cm-markdown-html-preview').length, 0,
      'Source mode does not render HTML previews');
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
