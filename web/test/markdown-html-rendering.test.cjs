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

test('raw HTML in Markdown renders safely in WYSIWYG modes and reveals source when tapped', async () => {
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

    for (const mode of ['wysiwyg', 'live_preview']) {
      window.editorBridge.setMarkdown(source);
      await new Promise(resolve => setTimeout(resolve, 20));
      await window.editorBridge.setEditorMode(mode);
      await new Promise(resolve => setTimeout(resolve, 20));
      const safeTextPosition = source.indexOf('Safe text after the HTML.');
      window.editorBridge.setSelectionState({ anchor: safeTextPosition, head: safeTextPosition });
      await new Promise(resolve => setTimeout(resolve, 20));
      const previews = [...window.document.querySelectorAll('.cm-markdown-html-preview')];
      assert.equal(previews.length, 3, mode + ' renders the block, inline, and inert script regions');
      assert.ok(previews.some(preview => preview.querySelector('.raw-html-block')),
        mode + ' renders HTML block elements: ' + previews.map(preview => preview.innerHTML).join(' || '));
      assert.ok(previews.some(preview => preview.querySelector('kbd')),
        mode + ' renders inline HTML elements: ' + previews.map(preview => preview.innerHTML).join(' || '));
      assert.equal(previews.some(preview => preview.querySelector('script')), false,
        mode + ' never inserts active script elements');
      assert.equal(window.__wmdxRawHtmlExecuted, undefined, mode + ' does not execute raw HTML scripts');
      assert.equal(window.editorBridge.getMarkdown(), source, mode + ' keeps Markdown unchanged');

      previews[0].dispatchEvent(new window.MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true
      }));
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(window.document.querySelectorAll('.cm-markdown-html-preview').length, 1,
        mode + ' reveals the tapped HTML source for editing');
      assert.equal(window.editorBridge.getMarkdown(), source, mode + ' source reveal does not mutate text');
    }

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
