const test = require('node:test');
const assert = require('node:assert/strict');

test('WYSIWYG render margin is finite and scales with viewport height', async () => {
  const { computeWysiwygViewportMargin } = await import('../src/viewportMargin.js');

  assert.equal(computeWysiwygViewportMargin(840), 20000);
  assert.equal(computeWysiwygViewportMargin(1200), 24000);
  assert.equal(computeWysiwygViewportMargin(400), 20000);
  assert.equal(computeWysiwygViewportMargin(0), 20000);
});
