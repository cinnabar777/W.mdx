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
    x: 0, y: 0, width: 640, height: 480,
    top: 0, right: 640, bottom: 480, left: 0,
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

    const source = [
      '<div class="raw-html-block"><p>Block HTML <strong>renders</strong>.</p></div>',
      '',
      '<DL><p>',
      '    <DT><H3 ADD_DATE="1777481312" LAST_MODIFIED="0" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>',
      '    <DL><p>',
      '        <DT><A HREF="https://example.test/">Example bookmark</A>',
      '    </DL><p>',
      '</DL><p>',
      '',
      'Inline HTML <kbd>Ctrl</kbd> and <mark>highlight</mark>.',
      '',
      '<script>window.__wmdxRawHtmlExecuted = true;</script>',
      '',
      'Safe text after the HTML.'
    ].join('\n');

    window.editorBridge.setMarkdown(source);
    await new Promise(resolve => setTimeout(resolve, 20));
    await window.editorBridge.setEditorMode('rendered');
    window.editorBridge.setMarkdownSyntaxExposure('hidden');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(window.editorBridge.getEditorMode(), 'rendered', 'the user-facing editor mode is WYSIWYG');
    assert.equal(window.editorBridge.getSyntaxExposureScope(), 'hidden', 'syntax exposure starts hidden');
    const wysiwygPreviews = [...window.document.querySelectorAll('.cm-markdown-html-preview')];
    assert.ok(wysiwygPreviews.length >= 4,
      'WYSIWYG renders independent HTML children, inline HTML, and the regular block');
    assert.ok(wysiwygPreviews.some(preview => preview.querySelector('.raw-html-block')),
      'WYSIWYG renders HTML block elements');
    assert.ok(wysiwygPreviews.some(preview => preview.querySelector('kbd')),
      'WYSIWYG renders inline HTML elements');
    assert.ok(wysiwygPreviews.some(preview =>
      preview.querySelector('h3')?.textContent.trim() === 'Bookmarks bar'
    ), 'WYSIWYG renders the bookmark folder heading independently');
    assert.ok(wysiwygPreviews.some(preview =>
      preview.querySelector('a[href="https://example.test/"]')?.textContent.trim() === 'Example bookmark'
    ), 'WYSIWYG renders the bookmark link independently');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<DL>'), false,
      'WYSIWYG hides the structural bookmark wrapper tags');
    assert.equal(wysiwygPreviews.some(preview => preview.querySelector('script')), false,
      'WYSIWYG never inserts active script elements');
    assert.equal(window.__wmdxRawHtmlExecuted, undefined, 'WYSIWYG does not execute raw HTML scripts');
    wysiwygPreviews.find(preview => preview.querySelector('h3'))
      .dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(window.document.querySelectorAll('.cm-markdown-html-preview').length, wysiwygPreviews.length,
      'tapping WYSIWYG HTML does not expose its source when syntax exposure is hidden');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='), false,
      'WYSIWYG keeps the bookmark heading rendered at the caret');
    assert.equal(window.editorBridge.getMarkdown(), source, 'WYSIWYG interaction leaves Markdown unchanged');

    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await new Promise(resolve => setTimeout(resolve, 20));
    window.document.querySelector('.cm-markdown-html-preview h3')
      .closest('.cm-markdown-html-preview')
      .dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='),
      'caret exposure reveals the bookmark heading source under the caret');
    assert.equal(window.editorBridge.getEditorMode(), 'rendered', 'syntax exposure does not create a second user-facing mode');
    assert.equal(window.editorBridge.getSyntaxExposureScope(), 'caret');
    assert.equal(window.document.querySelectorAll('.cm-markdown-html-preview').length, wysiwygPreviews.length - 1,
      'caret exposure reveals only the selected bookmark element');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='), false,
      'the sibling bookmark link remains rendered');
    assert.ok([...window.document.querySelectorAll('.cm-markdown-html-preview')]
      .some(preview => preview.querySelector('a[href="https://example.test/"]')),
    'the bookmark link remains an independent rendered element');

    window.document.querySelector('.cm-markdown-html-preview a[href="https://example.test/"]')
      .dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<A HREF='),
      'tapping a bookmark link with exposure enabled edits its own HTML source');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<H3 ADD_DATE='), false,
      'moving from the heading to the link hides the previous element source again');

    const safeTextPosition = source.indexOf('Safe text after the HTML.');
    window.editorBridge.setSelectionState({ anchor: safeTextPosition, head: safeTextPosition });
    await waitForDomCondition(window,
      () => window.document.querySelectorAll('.cm-markdown-html-preview').length === wysiwygPreviews.length,
      'the HTML previews render again after the caret leaves their source');
    const exposedSettingPreviews = [...window.document.querySelectorAll('.cm-markdown-html-preview')];
    assert.ok(exposedSettingPreviews.some(preview => preview.querySelector('.raw-html-block')),
      'HTML block rendering remains available with caret syntax exposure enabled');
    const blockPreview = exposedSettingPreviews.find(preview => preview.querySelector('.raw-html-block'));
    blockPreview.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<p>Block HTML'),
      'moving the caret into the tapped child exposes only that element source');
    assert.equal(window.document.querySelectorAll('.cm-markdown-html-preview').length, wysiwygPreviews.length - 1,
      'other HTML regions remain rendered while the selected region exposes syntax');
    assert.equal(window.editorBridge.getMarkdown(), source, 'syntax exposure never mutates Markdown');

    await window.editorBridge.setEditorMode('source');
    const content = window.document.querySelector('.cm-content');
    assert.equal(sourceText(content), source, 'Source displays the complete raw HTML Markdown');
    assert.equal(content.querySelectorAll('.cm-markdown-html-preview').length, 0,
      'Source mode does not render HTML previews');
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
