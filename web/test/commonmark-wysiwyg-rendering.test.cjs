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

function assertHardBreakRendering(lines, window) {
  assert.equal(lines[2].textContent, 'Hard break by spaces:  ');
  assert.equal(lines[2].querySelector('.cm-hardbreak-syntax'), null);

  const backslashMarker = lines[4].querySelector('.cm-hardbreak-syntax');
  assert.ok(backslashMarker, 'the backslash hard-break marker has a rendering decoration');
  assert.equal(backslashMarker.textContent, '\\');
  assert.equal(window.getComputedStyle(backslashMarker).display, 'none');
}

test('CommonMark inline syntax and hard breaks render without changing source', async () => {
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
    assert.deepEqual(renderedLines.slice(0, 6).map(renderedText), [
      'Entities: & © 🙂',
      'Escaped punctuation: *literal* &amp; |',
      'Hard break by spaces:  ',
      'continued after spaces',
      'Hard break by slash',
      'continued after slash'
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
    assert.deepEqual(livePreviewLines.slice(0, 6).map(renderedText), [
      'Entities: & © 🙂',
      'Escaped punctuation: *literal* &amp; |',
      'Hard break by spaces:  ',
      'continued after spaces',
      'Hard break by slash',
      'continued after slash'
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
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
