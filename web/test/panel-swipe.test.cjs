const test = require('node:test');
const assert = require('node:assert/strict');

const panelSwipePromise = import('../src/panelSwipe.js');

function createSwipeHarness() {
  const listeners = new Map();
  const calls = { open: 0, close: 0 };
  const makeElement = (insidePanel = false) => {
    const classes = new Set();
    return {
      style: {
        setProperty(name, value) { this[name] = value; },
        removeProperty(name) { delete this[name]; }
      },
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          if (force === undefined) {
            if (classes.has(name)) classes.delete(name);
            else classes.add(name);
          } else if (force) classes.add(name);
          else classes.delete(name);
          return classes.has(name);
        }
      },
      contains(target) { return insidePanel && target?.insidePanel === true; },
      getBoundingClientRect() { return { width: 200 }; }
    };
  };
  const panel = makeElement(true);
  const overlay = makeElement();
  const windowObject = {
    innerWidth: 400,
    getSelection: () => ({ toString: () => '' }),
    requestAnimationFrame(callback) { callback(); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); }
  };
  return {
    panel,
    overlay,
    calls,
    windowObject,
    start(clientX, insidePanel = false) {
      listeners.get('touchstart')({
        touches: [{ clientX, clientY: 30 }],
        target: { insidePanel, closest: () => null }
      });
    },
    move(clientX) {
      listeners.get('touchmove')({
        touches: [{ clientX, clientY: 30 }],
        preventDefault() {}
      });
    },
    end(clientX) {
      listeners.get('touchend')({
        changedTouches: [{ clientX, clientY: 30 }]
      });
    }
  };
}

test('left panel follows the opening swipe and dims proportionally', async () => {
  const { getPanelSwipeFrame } = await panelSwipePromise;
  assert.deepEqual(getPanelSwipeFrame('left', true, 120, 400), {
    progress: 0.3,
    transform: 'translateX(calc(-100% + 120px))'
  });
});

test('right panel follows its opening swipe from the right edge', async () => {
  const { getPanelSwipeFrame } = await panelSwipePromise;
  assert.deepEqual(getPanelSwipeFrame('right', true, -120, 400), {
    progress: 0.3,
    transform: 'translateX(calc(100% - 120px))'
  });
});

test('closing swipe progress reflects the panel area remaining onscreen', async () => {
  const { getPanelSwipeFrame } = await panelSwipePromise;
  assert.deepEqual(getPanelSwipeFrame('left', false, -160, 400), {
    progress: 0.6,
    transform: 'translateX(-160px)'
  });
  assert.deepEqual(getPanelSwipeFrame('right', false, 160, 400), {
    progress: 0.6,
    transform: 'translateX(160px)'
  });
});

test('swipe progress is clamped at the fully open edge', async () => {
  const { getPanelSwipeFrame } = await panelSwipePromise;
  assert.deepEqual(getPanelSwipeFrame('left', true, 600, 400), {
    progress: 1,
    transform: 'translateX(calc(-100% + 400px))'
  });
});

test('a partial opening swipe returns closed without invoking close side effects', async () => {
  const { setupPanelSwipe } = await panelSwipePromise;
  const harness = createSwipeHarness();
  setupPanelSwipe({
    ...harness,
    side: 'left',
    isOpen: () => harness.panel.classList.contains('open'),
    onOpen: () => harness.calls.open++,
    onClose: () => harness.calls.close++
  });
  harness.start(10);
  harness.move(75);
  harness.end(75);
  assert.deepEqual(harness.calls, { open: 0, close: 0 });
  assert.equal(harness.panel.classList.contains('open'), false);
});

test('a completed edge swipe opens the panel after following the finger', async () => {
  const { setupPanelSwipe } = await panelSwipePromise;
  const harness = createSwipeHarness();
  setupPanelSwipe({
    ...harness,
    side: 'left',
    isOpen: () => harness.panel.classList.contains('open'),
    onOpen: () => harness.calls.open++,
    onClose: () => harness.calls.close++
  });
  harness.start(10);
  harness.move(120);
  harness.end(120);
  assert.deepEqual(harness.calls, { open: 1, close: 0 });
  assert.equal(harness.panel.classList.contains('open'), true);
});

test('reversing the finger during a swipe moves the panel back with it', async () => {
  const { setupPanelSwipe } = await panelSwipePromise;
  const harness = createSwipeHarness();
  setupPanelSwipe({
    ...harness,
    side: 'left',
    isOpen: () => harness.panel.classList.contains('open'),
    onOpen: () => harness.calls.open++,
    onClose: () => harness.calls.close++
  });
  harness.start(10);
  harness.move(150);
  assert.equal(harness.panel.style.transform, 'translateX(calc(-100% + 140px))');
  harness.move(0);
  assert.equal(harness.panel.style.transform, 'translateX(calc(-100% + 0px))');
  harness.end(0);
  assert.deepEqual(harness.calls, { open: 0, close: 0 });
  assert.equal(harness.panel.classList.contains('open'), false);
});
