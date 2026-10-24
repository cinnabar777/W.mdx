const test = require('node:test');
const assert = require('node:assert/strict');

test('height-map refresh is skipped when a widget matches its estimate', async () => {
  const { shouldRefreshHeightMapForWidget } = await import(
    '../src/widgetHeightChange.js'
  );

  assert.equal(shouldRefreshHeightMapForWidget(undefined, 32, 32), false);
  assert.equal(shouldRefreshHeightMapForWidget(32, 32.5, 28), false);
});

test('height-map refresh runs when measured widget height changes layout', async () => {
  const { shouldRefreshHeightMapForWidget } = await import(
    '../src/widgetHeightChange.js'
  );

  assert.equal(shouldRefreshHeightMapForWidget(undefined, 35, 32), true);
  assert.equal(shouldRefreshHeightMapForWidget(32, 34, 28), true);
  assert.equal(shouldRefreshHeightMapForWidget(undefined, 32, undefined), true);
});
