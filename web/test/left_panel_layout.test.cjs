const test = require('node:test');
const assert = require('node:assert/strict');

const layoutPromise = import('../src/leftPanel.js');

test('an active long section gets available space without collapsing other open sections', async () => {
  const { allocatePanelBodyHeights } = await layoutPromise;
  const sections = [
    { id: 'search', expanded: true, contentHeight: 900, compactHeight: 96 },
    { id: 'folders', expanded: true, contentHeight: 480, compactHeight: 48 },
    { id: 'tabs', expanded: true, contentHeight: 300, compactHeight: 56 }
  ];

  const heights = allocatePanelBodyHeights(260, sections, 'search');

  assert.deepEqual(heights, { search: 156, folders: 48, tabs: 56 });
  assert.ok(heights.folders > 0);
  assert.ok(heights.tabs > 0);
  assert.equal(Object.values(heights).reduce((sum, height) => sum + height, 0), 260);
});

test('clearing search removes its priority and restores space to other sections', async () => {
  const { allocatePanelBodyHeights } = await layoutPromise;
  const sections = [
    { id: 'search', expanded: true, contentHeight: 72, compactHeight: 96 },
    { id: 'folders', expanded: true, contentHeight: 240, compactHeight: 48 },
    { id: 'tabs', expanded: true, contentHeight: 180, compactHeight: 56 }
  ];

  const heights = allocatePanelBodyHeights(360, sections, null);

  assert.equal(heights.search, 72);
  assert.equal(heights.folders + heights.tabs, 288);
  assert.ok(heights.folders > 48);
  assert.ok(heights.tabs > 56);
});

test('expanded sections share constrained height when no operation needs priority', async () => {
  const { allocatePanelBodyHeights } = await layoutPromise;
  const sections = [
    { id: 'search', expanded: true, contentHeight: 900, compactHeight: 96 },
    { id: 'folders', expanded: true, contentHeight: 480, compactHeight: 48 },
    { id: 'tabs', expanded: true, contentHeight: 300, compactHeight: 56 }
  ];
  const heights = allocatePanelBodyHeights(260, sections, null);

  assert.equal(Object.values(heights).reduce((sum, height) => sum + height, 0), 260);
  assert.ok(heights.search > 96);
  assert.ok(heights.folders > 48);
  assert.ok(heights.tabs > 56);
});

test('all three sections start open while a saved user collapse is respected', async () => {
  const { allocatePanelBodyHeights, createPanelExpandedState } = await layoutPromise;
  const sections = [
    { id: 'search', expanded: false, contentHeight: 90, compactHeight: 96 },
    { id: 'folders', expanded: false, contentHeight: 200, compactHeight: 48 },
    { id: 'tabs', expanded: true, contentHeight: 52, compactHeight: 56 }
  ];
  const fresh = createPanelExpandedState({});
  const saved = createPanelExpandedState({
    expanded: { search: false, folders: true, tabs: false },
    tabsManuallyCollapsed: true
  });
  const heights = allocatePanelBodyHeights(500, sections, null);

  assert.deepEqual(fresh.expanded, { search: true, folders: true, tabs: true });
  assert.deepEqual(saved.expanded, { search: false, folders: true, tabs: false });
  assert.deepEqual(heights, { search: 0, folders: 0, tabs: 52 });
});
