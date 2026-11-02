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

test('dragging a selection hides only after its range changes and returns after one second', () => {
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
  visibility.pointerDown({ clientX: 10, clientY: 10 });
  visibility.pointerMove({ clientX: 30, clientY: 30 });
  assert.deepEqual(events, [], 'pointer movement alone does not hide the toolbar');
  visibility.updateSelection(view, { from: 3, to: 8, empty: false });
  assert.equal(clock.timers.size, 0, 'the toolbar stays hidden during the drag');
  assert.equal(visibility.isSuppressed(), true);
  assert.deepEqual(events, ['hide']);

  visibility.pointerUp();
  assert.equal(clock.timers.size, 1);
  assert.equal(clock.runNext(), 1000);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, ['hide', 'show']);
});

test('a tap-created word selection shows the toolbar immediately', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });
  const view = {};

  visibility.pointerDown({ clientX: 10, clientY: 10 });
  visibility.pointerUp();
  visibility.updateSelection(view, { from: 1, to: 6, empty: false });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, []);
});

test('tapping an existing selection or collapsing it does not trigger drag hiding', () => {
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
  visibility.pointerDown({ clientX: 10, clientY: 10 });
  visibility.updateSelection(view, { from: 4, to: 4, empty: true });
  visibility.pointerUp({ clientX: 12, clientY: 11 });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, []);
});

test('pointer movement without a changed text selection does not hide the toolbar', () => {
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
  visibility.pointerDown({ clientX: 10, clientY: 10 });
  visibility.pointerMove({ clientX: 30, clientY: 30 });
  visibility.pointerUp({ clientX: 30, clientY: 30 });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, []);
});

test('pointer release coordinates recognize a drag if move events were missed', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  visibility.pointerDown({ clientX: 10, clientY: 10 });
  visibility.updateSelection({}, { from: 1, to: 6, empty: false });
  visibility.pointerUp({ clientX: 30, clientY: 30 });

  assert.equal(visibility.isSuppressed(), true);
  assert.deepEqual(events, ['hide']);
  assert.equal(clock.runNext(), 1000);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, ['hide', 'show']);
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

  visibility.setDelayMs(2500);
  visibility.updateSelection({}, { from: 1, to: 6, empty: false });
  visibility.pointerDown({ clientX: 10, clientY: 10 });
  visibility.pointerMove({ clientX: 30, clientY: 30 });
  visibility.updateSelection({}, { from: 2, to: 6, empty: false });
  visibility.pointerUp({ clientX: 30, clientY: 30 });

  assert.equal(clock.runNext(), 2500);
  assert.deepEqual(events, ['hide', 'show']);
});

test('small pointer movement does not classify a tap selection as a drag', () => {
  const events = [];
  const clock = createTimerHarness();
  const visibility = createFloatingSelectionToolbarVisibility({
    onHide: () => events.push('hide'),
    onResume: () => events.push('show'),
    schedule: clock.schedule,
    cancel: clock.cancel
  });

  visibility.pointerDown({ clientX: 10, clientY: 10 });
  visibility.pointerMove({ clientX: 13, clientY: 12 });
  visibility.updateSelection({}, { from: 1, to: 4, empty: false });
  visibility.pointerUp({ clientX: 13, clientY: 12 });

  assert.equal(clock.timers.size, 0);
  assert.equal(visibility.isSuppressed(), false);
  assert.deepEqual(events, []);
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
  assert.deepEqual(events, []);
});

test('toolbar actions can adjust selection without hiding the toolbar', () => {
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
  visibility.updateSelection(view, { from: 2, to: 7, empty: false });

  assert.equal(visibility.isSuppressed(), false);
  assert.equal(clock.timers.size, 0);
  assert.deepEqual(events, []);

  visibility.updateSelection(view, { from: 3, to: 7, empty: false });
  assert.equal(
    visibility.isSuppressed(),
    false,
    'selection changes outside a pointer drag stay visible'
  );
});
