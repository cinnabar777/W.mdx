const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div id="editor-container"><div id="editor"></div></div><div id="toc-overlay"></div><div id="toc-panel"><div class="toc-header"><button id="toc-global-toggle"></button></div><div id="toc-content"></div></div></body></html>',
  {
    pretendToBeVisual: true,
    url: 'https://wmdx.test/',
    beforeParse(window) {
      window.AndroidNative = {
        onHostReady: () => {},
        onEditorReady: () => {},
        reportDiagnostic: () => {}
      };
    }
  }
);

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: dom.window.navigator
});
global.MutationObserver = dom.window.MutationObserver;
global.Window = dom.window.constructor;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.Range = dom.window.Range;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = id => clearTimeout(id);

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = MockResizeObserver;
dom.window.ResizeObserver = MockResizeObserver;

require('../src/main.js');

test('TOC follows Markdown headings and refreshes while open without losing collapse state', async () => {
  await window.editorBridge.setEditorMode('wysiwyg');

  const panel = document.querySelector('#toc-panel');
  const contents = document.querySelector('#toc-content');
  window.editorBridge.setMarkdown([
    '# Overview',
    '',
    '## First child',
    '',
    '```md',
    '# Not a heading',
    '```',
    '',
    'Setext section',
    '--------------'
  ].join('\n'));

  const dispatchTouch = (type, property, point) => {
    const event = new dom.window.Event(type, { bubbles: true });
    Object.defineProperty(event, property, { value: [point] });
    document.body.dispatchEvent(event);
  };
  const swipeStartX = window.innerWidth - 2;
  dispatchTouch('touchstart', 'touches', { clientX: swipeStartX, clientY: 100 });
  dispatchTouch('touchend', 'changedTouches', { clientX: swipeStartX - 100, clientY: 100 });

  assert.ok(panel.classList.contains('open'), 'right-edge swipe opens the TOC panel');
  const titles = () => Array.from(contents.querySelectorAll('.toc-text'), item => item.textContent);
  assert.deepEqual(titles(), ['Overview', 'First child', 'Setext section']);

  const firstHeadingToggle = contents.querySelector('.toc-item.level-1 .toc-toggle');
  firstHeadingToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(contents.querySelectorAll('.toc-item')[1].style.display, 'none');

  window.editorBridge.setMarkdown([
    '# Overview',
    '',
    '## First child',
    '',
    '## Added child',
    '',
    '```md',
    '# Still not a heading',
    '```',
    '',
    'Setext section',
    '--------------'
  ].join('\n'));
  await new Promise(resolve => setTimeout(resolve, 150));

  assert.deepEqual(titles(), ['Overview', 'First child', 'Added child', 'Setext section']);
  assert.equal(
    contents.querySelectorAll('.toc-item')[2].style.display,
    'none',
    'refresh retains the collapsed parent for newly added child headings'
  );

  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }
  dom.window.close();
});
