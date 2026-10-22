const test = require('node:test');
const assert = require('node:assert/strict');

test('WYSIWYG render margin is finite and scales with viewport height', async () => {
  const { computeWysiwygViewportMargin } = await import('../src/viewportMargin.js');

  assert.equal(computeWysiwygViewportMargin(840), 1680);
  assert.equal(computeWysiwygViewportMargin(1200), 2400);
  assert.equal(computeWysiwygViewportMargin(400), 1000);
  assert.equal(computeWysiwygViewportMargin(0), 1600);
});
