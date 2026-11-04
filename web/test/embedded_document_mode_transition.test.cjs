const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const projectRoot = path.resolve(__dirname, '../..');
const appAssets = path.join(projectRoot, 'app/src/main/assets/www');

test('embedded documents survive WYSIWYG, Live Preview, and Source transitions', async () => {
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
    getCurrentDocumentSessionId: () => 'mode-transition-test',
    onEditorReady: () => {},
    loadEmbeddedMarkdown: () => JSON.stringify({
      ok: true,
      markdown: '# Embedded document'
    }),
    saveEmbeddedMarkdown: () => true,
    resolveEmbeddedAssetUrl: () => '',
    getEmbeddedContentInteractionMode: () => 'checkboxes',
    canOpenAttachment: () => false,
    onContentChanged: () => {},
    onDirtyStateChanged: () => {},
    reportDiagnostic: (kind, detail) => errors.push(`${kind}: ${detail}`)
  };

  try {
    window.eval(bundle);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 20));
    await window.editorBridge.setEditorMode('wysiwyg');

    const markdown = [
      'before',
      '',
      '![[assets/notes.md|Project notes]]',
      '',
      'after'
    ].join('\n');
    window.editorBridge.setMarkdown(markdown);
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.equal(window.editorBridge.getMarkdown(), markdown);
    assert.ok(
      window.document.querySelector('.cm-embedded-document-shell'),
      'WYSIWYG should render the embedded document'
    );

    await window.editorBridge.setEditorMode('live_preview');
    assert.equal(window.editorBridge.getMarkdown(), markdown);
    assert.ok(
      window.document.querySelector('.cm-embedded-document-shell'),
      'Live Preview should render the embedded document'
    );

    await window.editorBridge.setEditorMode('source');
    assert.equal(window.editorBridge.getMarkdown(), markdown);
    assert.ok(
      window.document.querySelector('#editor .cm-content')
        ?.textContent.includes('![[assets/notes.md|Project notes]]'),
      'Source should show the original Obsidian embed syntax'
    );
    assert.deepEqual(errors, [], 'mode changes should not emit editor errors');
  } finally {
    dom.window.close();
  }
});
