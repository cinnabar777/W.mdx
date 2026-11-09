const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const toolbarSurfaceSelector =
  '#bottom-toolbar, #floating-selection-toolbar, #popup-toolbar-strip, #floating-toggle-btn, .floating-toggle-btn';

function createPointerEvent(windowRef, type, options = {}) {
  const event = new windowRef.Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: 100,
    clientY: 100,
    ...options
  })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

function dispatchTouchStart(windowRef, target) {
  const event = new windowRef.Event('touchstart', {
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

test('touch defaults are canceled only for toolbar actions, not editable controls', async () => {
  const { installToolbarTouchHandling } =
    await import('../src/toolbarTouchHandling.js');
  const dom = new JSDOM(`
    <div id="bottom-toolbar">
      <button id="toolbar-action" data-toolbar-key="undo">Undo</button>
      <button id="search-action"><input id="search-input"></button>
    </div>
    <button id="outside-action">Outside</button>
  `);
  const { document } = dom.window;
  const cleanup = installToolbarTouchHandling(document, toolbarSurfaceSelector);

  assert.equal(
    dispatchTouchStart(dom.window, document.querySelector('#toolbar-action')).defaultPrevented,
    true
  );
  assert.equal(
    dispatchTouchStart(dom.window, document.querySelector('#search-input')).defaultPrevented,
    false
  );
  assert.equal(
    dispatchTouchStart(dom.window, document.querySelector('#outside-action')).defaultPrevented,
    false
  );

  cleanup();
  dom.window.close();
});

test('scrollable toolbar surfaces keep pan gestures while preventing button focus', async () => {
  const { installToolbarTouchHandling } =
    await import('../src/toolbarTouchHandling.js');
  const dom = new JSDOM(`
    <div id="popup-toolbar-strip">
      <button id="popup-action" data-toolbar-key="bold">Bold</button>
    </div>
    <div id="floating-selection-toolbar">
      <button id="floating-action" data-toolbar-key="undo">Undo</button>
    </div>
  `);
  const { document } = dom.window;
  const cleanup = installToolbarTouchHandling(document, toolbarSurfaceSelector);

  for (const id of ['popup-action', 'floating-action']) {
    const button = document.querySelector(`#${id}`);
    assert.equal(
      dispatchTouchStart(dom.window, button).defaultPrevented,
      false,
      'touchstart must remain uncanceled so the surface can scroll'
    );
    const pointerDown = createPointerEvent(dom.window, 'pointerdown');
    button.dispatchEvent(pointerDown);
    assert.equal(
      pointerDown.defaultPrevented,
      true,
      'toolbar buttons still prevent focus changes'
    );
  }

  cleanup();
  dom.window.close();
});

test('toolbar tooltips are suppressed on touch pointers without losing accessible labels', async () => {
  const { setToolbarTooltip } = await import('../src/toolbarRenderer.js');
  const dom = new JSDOM('<button id="action" aria-label="Paste from Markdown dialect"></button>');
  const button = dom.window.document.querySelector('#action');
  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: query => ({ media: query, matches: false })
  });

  setToolbarTooltip(button, 'Paste from Markdown dialect');
  assert.equal(button.hasAttribute('title'), false);
  assert.equal(button.getAttribute('aria-label'), 'Paste from Markdown dialect');

  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: query => ({ media: query, matches: true })
  });
  setToolbarTooltip(button, 'Paste from Markdown dialect');
  assert.equal(button.title, 'Paste from Markdown dialect');

  Object.defineProperty(dom.window.navigator, 'maxTouchPoints', {
    configurable: true,
    value: 1
  });
  setToolbarTooltip(button, 'Paste from Markdown dialect');
  assert.equal(button.hasAttribute('title'), false,
    'touch-capable devices should not show native title popovers, even with a fine pointer');
  dom.window.close();
});

test('touch taps re-enter the existing click pipeline for each tap', async () => {
  const { installToolbarTouchHandling } =
    await import('../src/toolbarTouchHandling.js');
  const dom = new JSDOM(
    '<div id="bottom-toolbar"><button data-toolbar-key="undo">Undo</button></div>'
  );
  const { document } = dom.window;
  const button = document.querySelector('button');
  const clicks = [];
  button.addEventListener('click', () => clicks.push('tap'));
  const cleanup = installToolbarTouchHandling(document, toolbarSurfaceSelector);

  for (const pointerId of [1, 2]) {
    dispatchTouchStart(dom.window, button);
    button.dispatchEvent(createPointerEvent(dom.window, 'pointerdown', { pointerId }));
    button.dispatchEvent(createPointerEvent(dom.window, 'pointerup', { pointerId }));
  }

  assert.deepEqual(clicks, ['tap', 'tap']);
  cleanup();
  dom.window.close();
});

test('swipe gestures still run on pointerup without becoming taps', async () => {
  const { renderBottomToolbarKeys } = await import('../src/toolbarRenderer.js');
  const { installToolbarTouchHandling } =
    await import('../src/toolbarTouchHandling.js');
  const dom = new JSDOM('<div id="bottom-toolbar"></div>');
  const { document } = dom.window;
  const toolbar = document.querySelector('#bottom-toolbar');
  const gestures = [];
  let clicks = 0;
  const [button] = renderBottomToolbarKeys(toolbar, {
    order: ['undo'],
    styles: {
      undo: { gestureActions: { swipeLeft: 'bold' } }
    }
  }, {}, {
    onGesture: (_keyId, gestureId) => {
      gestures.push(gestureId);
      return true;
    }
  });
  button.addEventListener('click', () => clicks++);
  const cleanup = installToolbarTouchHandling(document, toolbarSurfaceSelector);

  dispatchTouchStart(dom.window, button);
  button.dispatchEvent(createPointerEvent(dom.window, 'pointerdown'));
  button.dispatchEvent(createPointerEvent(dom.window, 'pointerup', {
    clientX: 40,
    clientY: 100
  }));

  assert.deepEqual(gestures, ['swipeLeft']);
  assert.equal(clicks, 0);
  cleanup();
  dom.window.close();
});
