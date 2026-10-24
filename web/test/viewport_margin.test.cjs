const test = require('node:test');
const assert = require('node:assert/strict');

test('render margin is finite and scales with viewport height', async () => {
  const { computeWysiwygViewportMargin } = await import('../src/viewportMargin.js');

  assert.equal(computeWysiwygViewportMargin(840), 6720);
  assert.equal(computeWysiwygViewportMargin(1200), 9600);
  assert.equal(computeWysiwygViewportMargin(400), 6000);
  assert.equal(computeWysiwygViewportMargin(0), 6400);
});

test('short rendered documents receive bounded overscan to avoid virtual gaps', async () => {
  const { computeWysiwygViewportMargin } = await import('../src/viewportMargin.js');

  assert.equal(computeWysiwygViewportMargin(840, 678, 14302, 'wysiwyg'), 32544);
  assert.equal(computeWysiwygViewportMargin(840, 678, 14302, 'live_preview'), 32544);
  assert.equal(computeWysiwygViewportMargin(840, 800, 25000, 'wysiwyg'), 50000);
});

test('source mode and longer documents keep the existing overscan margin', async () => {
  const { computeWysiwygViewportMargin } = await import('../src/viewportMargin.js');

  assert.equal(computeWysiwygViewportMargin(840, 678, 14302, 'source'), 6720);
  assert.equal(computeWysiwygViewportMargin(840, 801, 14302, 'wysiwyg'), 6720);
  assert.equal(computeWysiwygViewportMargin(840, 678, 25001, 'wysiwyg'), 6720);
});
