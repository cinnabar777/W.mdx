const test = require('node:test');
const assert = require('node:assert/strict');

test('WYSIWYG render margin is finite and scales with viewport height', async () => {
  const { computeWysiwygViewportMargin } = await import('../src/viewportMargin.js');

  assert.equal(computeWysiwygViewportMargin(840), 6720);
  assert.equal(computeWysiwygViewportMargin(1200), 9600);
  assert.equal(computeWysiwygViewportMargin(400), 6000);
  assert.equal(computeWysiwygViewportMargin(0), 6400);
});
