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
    assert.equal(wysiwygPreviews.length, 3, 'WYSIWYG renders block, inline, and inert script HTML');
    assert.ok(wysiwygPreviews.some(preview => preview.querySelector('.raw-html-block')),
      'WYSIWYG renders HTML block elements');
    assert.ok(wysiwygPreviews.some(preview => preview.querySelector('kbd')),
      'WYSIWYG renders inline HTML elements');
    assert.equal(wysiwygPreviews.some(preview => preview.querySelector('script')), false,
      'WYSIWYG never inserts active script elements');
    assert.equal(window.__wmdxRawHtmlExecuted, undefined, 'WYSIWYG does not execute raw HTML scripts');
    wysiwygPreviews.find(preview => preview.querySelector('.raw-html-block'))
      .dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(window.document.querySelectorAll('.cm-markdown-html-preview').length, 3,
      'tapping WYSIWYG HTML does not expose its source when syntax exposure is hidden');
    assert.equal(sourceText(window.document.querySelector('.cm-content')).includes('<div class="raw-html-block">'), false,
      'WYSIWYG keeps the block rendered at the caret');
    assert.equal(window.editorBridge.getMarkdown(), source, 'WYSIWYG interaction leaves Markdown unchanged');

    window.editorBridge.setMarkdownSyntaxExposure('caret');
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<div class="raw-html-block">'),
      'caret exposure reveals the raw HTML under the caret');
    assert.equal(window.editorBridge.getEditorMode(), 'rendered', 'syntax exposure does not create a second user-facing mode');
    assert.equal(window.editorBridge.getSyntaxExposureScope(), 'caret');
    assert.equal(window.document.querySelectorAll('.cm-markdown-html-preview').length, 2,
      'caret exposure reveals only the HTML region under the caret');

    const safeTextPosition = source.indexOf('Safe text after the HTML.');
    window.editorBridge.setSelectionState({ anchor: safeTextPosition, head: safeTextPosition });
    await waitForDomCondition(window,
      () => window.document.querySelectorAll('.cm-markdown-html-preview').length === 3,
      'the HTML previews render again after the caret leaves their source');
    const exposedSettingPreviews = [...window.document.querySelectorAll('.cm-markdown-html-preview')];
    assert.ok(exposedSettingPreviews.some(preview => preview.querySelector('.raw-html-block')),
      'HTML block rendering remains available with caret syntax exposure enabled');
    const blockPreview = exposedSettingPreviews.find(preview => preview.querySelector('.raw-html-block'));
    blockPreview.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await waitForDomCondition(window,
      () => sourceText(window.document.querySelector('.cm-content')).includes('<div class="raw-html-block">'),
      'moving the caret into the tapped region exposes source under the enabled setting');
    assert.equal(window.document.querySelectorAll('.cm-markdown-html-preview').length, 2,
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
