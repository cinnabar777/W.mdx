const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

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

test('clearing a short active search returns room to the other expanded sections', async () => {
  const { allocatePanelBodyHeights } = await layoutPromise;
  const sections = [
    { id: 'search', expanded: true, contentHeight: 72, compactHeight: 96 },
    { id: 'folders', expanded: true, contentHeight: 240, compactHeight: 48 },
    { id: 'tabs', expanded: true, contentHeight: 180, compactHeight: 56 }
  ];

  const heights = allocatePanelBodyHeights(360, sections, 'search');

  assert.equal(heights.search, 72);
  assert.equal(heights.folders + heights.tabs, 288);
  assert.ok(heights.folders > 48);
  assert.ok(heights.tabs > 56);
});

test('collapsed sections stay collapsed and the launcher tabs section defaults open', async () => {
  const { allocatePanelBodyHeights } = await layoutPromise;
  const sections = [
    { id: 'search', expanded: false, contentHeight: 90, compactHeight: 96 },
    { id: 'folders', expanded: false, contentHeight: 200, compactHeight: 48 },
    { id: 'tabs', expanded: true, contentHeight: 52, compactHeight: 56 }
  ];
  const heights = allocatePanelBodyHeights(500, sections, 'tabs');
  const source = readFileSync(path.join(__dirname, '../src/leftPanel.js'), 'utf8');

  assert.deepEqual(heights, { search: 0, folders: 0, tabs: 52 });
  assert.match(source, /section === 'tabs'/);
  assert.match(source, /tabsManuallyCollapsed/);
  assert.match(source, /const expanded = wantedExpanded\[id\]/);
});
