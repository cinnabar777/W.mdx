const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('caret anchor reserves a small geometry box without being visible or interactive', async () => {
  const { createCaretGeometryAnchorElement } = await import('../src/caretGeometryAnchor.js');
  const dom = new JSDOM('');
  const anchor = createCaretGeometryAnchorElement(dom.window.document);
  assert.equal(anchor.className, 'cm-caret-geometry-anchor');
  assert.equal(anchor.getAttribute('aria-hidden'), 'true');
  assert.equal(anchor.getAttribute('contenteditable'), 'false');
  assert.equal(anchor.style.width, '1px');
  assert.equal(anchor.style.height, '1em');
  assert.equal(anchor.style.opacity, '0');
  assert.equal(anchor.style.pointerEvents, 'none');
  dom.window.close();
});
