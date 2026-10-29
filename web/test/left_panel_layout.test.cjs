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

test('dropping a tab on another tab creates a saved group without changing file identity', async () => {
  const { applyTabDrop } = await layoutPromise;
  const tabs = [
    { id: 'file-a', name: 'A.md', uri: 'uri-a', groupId: null },
    { id: 'file-b', name: 'B.md', uri: 'uri-b', groupId: null },
    { id: 'file-c', name: 'C.md', uri: 'uri-c', groupId: null }
  ];
  const groups = [];

  assert.equal(
    applyTabDrop(
      tabs,
      groups,
      { kind: 'tab', id: 'file-a' },
      { kind: 'tab', id: 'file-b' },
      'group'
    ),
    true
  );

  assert.equal(groups.length, 1);
  assert.equal(tabs.find((tab) => tab.id === 'file-a').uri, 'uri-a');
  assert.equal(tabs.find((tab) => tab.id === 'file-a').groupId, groups[0].id);
  assert.equal(tabs.find((tab) => tab.id === 'file-b').groupId, groups[0].id);
  assert.equal(tabs.find((tab) => tab.id === 'file-c').groupId, null);
});

test('groups can be moved as a block and deleted without deleting their tabs', async () => {
  const { applyTabDrop, dissolveTabGroup } = await layoutPromise;
  const group = { id: 'group-a', name: 'Notes', collapsed: true };
  const tabs = [
    { id: 'tab-a', uri: 'uri-a', groupId: group.id },
    { id: 'tab-b', uri: 'uri-b', groupId: null },
    { id: 'tab-c', uri: 'uri-c', groupId: group.id }
  ];
  const groups = [group];

  assert.equal(
    applyTabDrop(
      tabs,
      groups,
      { kind: 'group', id: group.id },
      { kind: 'tab', id: 'tab-b' },
      'after'
    ),
    true
  );
  assert.deepEqual(tabs.map((tab) => tab.id), ['tab-b', 'tab-a', 'tab-c']);
  assert.equal(group.collapsed, true);

  assert.equal(dissolveTabGroup(tabs, groups, group.id), true);
  assert.equal(groups.length, 0);
  assert.deepEqual(tabs.map((tab) => tab.uri), ['uri-b', 'uri-a', 'uri-c']);
  assert.ok(tabs.every((tab) => tab.groupId === null));
});

test('moving a tab outside its group preserves the remaining group and removes empty groups', async () => {
  const { applyTabDrop } = await layoutPromise;
  const group = { id: 'group-a', name: 'Notes', collapsed: false };
  const tabs = [
    { id: 'tab-a', uri: 'uri-a', groupId: group.id },
    { id: 'tab-b', uri: 'uri-b', groupId: group.id },
    { id: 'tab-c', uri: 'uri-c', groupId: null }
  ];
  const groups = [group];

  applyTabDrop(
    tabs,
    groups,
    { kind: 'tab', id: 'tab-a' },
    { kind: 'tab', id: 'tab-c' },
    'after'
  );
  assert.equal(groups.length, 1);
  assert.equal(tabs.find((tab) => tab.id === 'tab-a').groupId, null);
  assert.equal(tabs.find((tab) => tab.id === 'tab-b').groupId, group.id);

  applyTabDrop(
    tabs,
    groups,
    { kind: 'tab', id: 'tab-b' },
    { kind: 'tab', id: 'tab-a' },
    'after'
  );
  assert.equal(groups.length, 0);
  assert.ok(tabs.every((tab) => tab.groupId === null));
});
