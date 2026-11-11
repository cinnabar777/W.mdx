const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getResourceLinkActionTop
} = require('../src/resourceLinkMenuPosition.js');

const base = {
  menuHeight: 48,
  menuLeft: 30,
  menuWidth: 160,
  viewportTop: 0,
  viewportBottom: 700
};

test('link actions sit below selection handles when there is room', () => {
  assert.equal(
    getResourceLinkActionTop({
      ...base,
      targetRect: { left: 80, right: 180, top: 120, bottom: 140 }
    }),
    184
  );
});

test('link actions move above the selection when the lower screen is crowded', () => {
  assert.equal(
    getResourceLinkActionTop({
      ...base,
      targetRect: { left: 80, right: 180, top: 590, bottom: 620 },
      viewportBottom: 700
    }),
    470
  );
});

test('link actions avoid visible editor toolbars as well as selection handles', () => {
  assert.equal(
    getResourceLinkActionTop({
      ...base,
      targetRect: { left: 80, right: 180, top: 120, bottom: 140 },
      avoidRects: [
        { left: 0, right: 220, top: 170, bottom: 230, width: 220, height: 60 }
      ]
    }),
    238
  );
});
