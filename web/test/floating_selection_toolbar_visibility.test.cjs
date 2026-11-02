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

test('a changed existing selection hides the toolbar until the range stops changing', () => {
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
  assert.deepEqual(events, []);
  visibility.updateSelection(view, { from: 3, to: 8, empty: false });
  assert.equal(visibility.isSuppressed(), true);
  assert.equal(clock.timers.size, 1);
  assert.deepEqual(events, ['hide']);

  visibility.updateSelection(view, { from: 4, to: 8, empty: false });
  assert.equal(clock.timers.size, 1, 'each range change restarts the return delay');
  assert.equal(clock.runNext(), 1000);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, ['hide', 'show']);
});

test('creating or clearing a selection does not count as moving its handles', () => {
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
  visibility.updateSelection(view, { from: 4, to: 4, empty: true });
  visibility.updateSelection(view, { from: 5, to: 9, empty: false });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, []);
});

test('an unchanged selection or a selection in a new editor view does not hide the toolbar', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  visibility.updateSelection({}, { from: 1, to: 6, empty: false });
  visibility.updateSelection({}, { from: 1, to: 6, empty: false });
  visibility.updateSelection({ otherEditor: true }, { from: 20, to: 24, empty: false });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, []);
});

test('toolbar actions can adjust selection without triggering drag hiding', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });
  const view = {};

  visibility.updateSelection(view, { from: 1, to: 5, empty: false });
  visibility.updateSelection(
    view,
    { from: 2, to: 7, empty: false },
    { ignoreRangeChange: true }
  );

  assert.equal(visibility.isSuppressed(), false);
  assert.equal(clock.timers.size, 0);
  assert.deepEqual(events, []);

  visibility.updateSelection(view, { from: 3, to: 7, empty: false });
  assert.equal(visibility.isSuppressed(), true);
  assert.deepEqual(events, ['hide']);
});

test('the toolbar return delay can be changed', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });
  const view = {};

  visibility.setDelayMs(2500);
  visibility.updateSelection(view, { from: 1, to: 6, empty: false });
  visibility.updateSelection(view, { from: 2, to: 6, empty: false });

  assert.equal(clock.runNext(), 2500);
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
  const view = {};

  visibility.updateSelection(view, { from: 1, to: 4, empty: false });
  visibility.updateSelection(view, { from: 2, to: 4, empty: false });
  visibility.updateSelection(view, { from: 4, to: 4, empty: true });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.equal(clock.runNext(), false);
  assert.deepEqual(events, ['hide']);
});
