const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createFloatingSelectionToolbarVisibility
} = require('../src/floatingSelectionToolbarVisibility.js');

function createTimerHarness() {
  let nextId = 1;
  const timers = new Map();
  return {
    timers,
    schedule(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    cancel(id) {
      timers.delete(id);
    },
    runNext() {
      const [id, timer] = timers.entries().next().value || [];
      if (!timer) return false;
      timers.delete(id);
      timer.callback();
      return timer.delay;
    }
  };
}

test('selection changes keep the floating toolbar hidden until one second of stillness', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });
  const view = {};

  visibility.updateSelection(view, { from: 2, to: 8, empty: false });
  const firstTimer = [...clock.timers.keys()][0];
  visibility.updateSelection(view, { from: 3, to: 8, empty: false });

  assert.equal(clock.timers.size, 1, 'each movement restarts the one-second delay');
  assert.equal(clock.timers.has(firstTimer), false, 'the prior delay is cancelled');
  assert.equal(visibility.isSuppressed(), true);
  assert.deepEqual(events, ['hide']);
  assert.equal(clock.runNext(), 1000);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, ['hide', 'show']);
});

test('an active pointer keeps the toolbar hidden until one second after release', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });
  const view = {};

  visibility.updateSelection(view, { from: 1, to: 6, empty: false });
  visibility.pointerDown();
  visibility.pointerMove();
  assert.equal(clock.timers.size, 0, 'the timer stays stopped during pointer movement');
  assert.equal(visibility.isSuppressed(), true);

  visibility.pointerUp();
  assert.equal(clock.runNext(), 1000);
  assert.deepEqual(events, ['hide', 'show']);
});

test('clearing the text selection cancels a pending toolbar return', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  visibility.updateSelection({}, { from: 1, to: 4, empty: false });
  visibility.updateSelection({}, { from: 4, to: 4, empty: true });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.equal(clock.runNext(), false);
  assert.deepEqual(events, ['hide']);
});
