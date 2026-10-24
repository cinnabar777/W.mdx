const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('adds one CodeMirror scroll snapshot after the supplied effects', async () => {
  const { withScrollSnapshot } = await import('../src/scrollSnapshot.js');
  const refresh = { type: 'height-refresh' };
  const typography = { type: 'typography-refresh' };
  const snapshot = { type: 'scroll-snapshot' };
  const view = { scrollSnapshot: () => snapshot };

  assert.deepEqual(withScrollSnapshot(view, refresh), [refresh, snapshot]);
  assert.deepEqual(withScrollSnapshot(view, [refresh, typography]), [
    refresh,
    typography,
    snapshot,
  ]);
});

test('all geometry refresh dispatches carry a scroll snapshot', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(source, /function dispatchWithScrollSnapshot\(view, effects\)/);
  assert.match(source, /withScrollSnapshot\(view, effects\)/);
  assert.match(source, /dispatchWithScrollSnapshot\(\s*activeView,\s*heightMapRefreshEffect\.of\(null\)\s*\)/);
  assert.match(source, /dispatchWithScrollSnapshot\(\s*view,\s*tableHeightEstimatesChanged\.of\(measuredCount\)\s*\)/);
  assert.match(source, /dispatchWithScrollSnapshot\(\s*activeAdapter\.view,\s*typographySettingsEffect\.of\(Date\.now\(\)\)\s*\)/);
  assert.match(source, /dispatchWithScrollSnapshot\(\s*this\.view,\s*heightMapRefreshEffect\.of\(null\)\s*\)/);
});

test('mode switches capture before destroy and pass both values to the new view', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf('async function setEditorMode(mode) {');
  const end = source.indexOf('function setupGroupedControlBar', start);
  assert.ok(start >= 0 && end > start, 'setEditorMode function exists');
  const modeSwitch = source.slice(start, end);

  const capture = modeSwitch.indexOf('activeAdapter.view.scrollSnapshot()');
  const destroy = modeSwitch.indexOf('activeAdapter.destroy()');
  const init = modeSwitch.indexOf('await adapter.init(containerEl, existingText, modeSnapshot)');
  assert.ok(capture >= 0 && capture < destroy, 'snapshot is captured before destroying the old adapter');
  assert.ok(init > destroy, 'the new adapter receives the saved state');

  assert.match(source, /scrollTo: modeSnapshot\?\.scroll/);
  assert.match(source, /mapSelectionOutsideHiddenSyntax/);
  assert.match(source, /currentEditorMode === 'wysiwyg'/);
});

test('scroll persistence bridges to AndroidNative.onScrollChanged on scrollDOM events', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.match(source, /persistScrollPosition\(\)/);
  assert.match(source, /queueScrollPositionSave\(\)/);
  assert.match(source, /bridge\.onScrollChanged/);
  assert.match(source, /this\.view\.scrollDOM\.addEventListener\(\s*'scroll'/);
  assert.match(source, /this\.view\.scrollDOM\.removeEventListener\(\s*'scroll'/);
  assert.match(source, /setScrollPosition: function/);
});
