const test = require('node:test');
const assert = require('node:assert/strict');

test('view callback waits until measurement returns and coalesces per frame', async () => {
  const { createDeferredViewCallback } =
    await import('../src/deferredViewCallback.js');
  const frames = [];
  const defer = createDeferredViewCallback(callback => {
    frames.push(callback);
    return frames.length;
  });

  let insideMeasureWrite = false;
  let dispatchCount = 0;
  const view = {
    destroyed: false,
    requestMeasure({ write }) {
      insideMeasureWrite = true;
      write(42);
      insideMeasureWrite = false;
    },
    dispatch() {
      assert.equal(insideMeasureWrite, false,
        'dispatch must not run from the measurement write callback');
      dispatchCount++;
    }
  };

  view.requestMeasure({
    write: () => {
      defer(view, activeView => activeView.dispatch());
      defer(view, activeView => activeView.dispatch());
      assert.equal(dispatchCount, 0);
    }
  });

  assert.equal(frames.length, 1, 'same-view refreshes are coalesced');
  assert.equal(dispatchCount, 0, 'refresh remains deferred after requestMeasure returns');
  frames.shift()();
  assert.equal(dispatchCount, 1, 'one refresh dispatch runs on the scheduled frame');
});

test('deferred callback skips a view destroyed before its frame runs', async () => {
  const { createDeferredViewCallback } =
    await import('../src/deferredViewCallback.js');
  const frames = [];
  const defer = createDeferredViewCallback(callback => frames.push(callback));
  let called = false;
  const view = { destroyed: false };

  defer(view, () => { called = true; });
  view.destroyed = true;
  frames.shift()();
  assert.equal(called, false);
});
