const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const projectRoot = path.resolve(__dirname, '../..');
const appAssets = path.join(projectRoot, 'app/src/main/assets/www');

test('CommonMark entities and escaped punctuation render without changing source', async () => {
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
  window.HTMLElement.prototype.getBoundingClientRect = rect;
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
      'Escaped punctuation: \\*literal\\* \\&amp; \\|'
    ].join('\n');
    window.editorBridge.setMarkdown(source);
    await new Promise(resolve => setTimeout(resolve, 20));

    const content = window.document.querySelector('.cm-content');
    assert.ok(content, 'the editor content is mounted');
    const renderedLines = [...content.querySelectorAll('.cm-line')];
    assert.equal(renderedLines[0].textContent, 'Entities: & © 🙂');
    assert.equal(renderedLines[1].textContent, 'Escaped punctuation: *literal* &amp; |');
    assert.equal(window.editorBridge.getMarkdown(), source);

    await window.editorBridge.setEditorMode('live_preview');
    const livePreviewContent = window.document.querySelector('.cm-content');
    const livePreviewLines = [...livePreviewContent.querySelectorAll('.cm-line')];
    assert.equal(livePreviewLines[0].textContent, 'Entities: & © 🙂');
    assert.equal(livePreviewLines[1].textContent, 'Escaped punctuation: *literal* &amp; |');
    assert.equal(window.editorBridge.getMarkdown(), source);

    await window.editorBridge.setEditorMode('source');
    const sourceContent = window.document.querySelector('.cm-content');
    assert.equal(window.editorBridge.getMarkdown(), source);
    assert.ok(sourceContent.textContent.includes('&amp; &copy; &#x1F642;'));
    assert.ok(sourceContent.textContent.includes('\\*literal\\* \\&amp; \\|'));
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
