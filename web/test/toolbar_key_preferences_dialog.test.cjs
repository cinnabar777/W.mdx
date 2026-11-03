const test = require('node:test');
const assert = require('node:assert/strict');

test('in-editor key preferences save through the caller callback', async () => {
  const { createToolbarKeyPreferencesSaveBridge } =
    await import('../src/toolbarKeyPreferencesDialog.js');
  const saved = [];
  const save = createToolbarKeyPreferencesSaveBridge(
    'floating',
    (surface, config) => {
      saved.push({ surface, config });
      return true;
    }
  );
  const config = {
    version: 10,
    order: ['undo'],
    styles: { undo: { gestureActions: { tap2: 'bold' } } }
  };

  assert.equal(save(JSON.stringify(config)), 'saved');
  assert.deepEqual(saved, [{ surface: 'floating', config }]);
});

test('in-editor key preference save reports invalid data and failed commits', async () => {
  const { createToolbarKeyPreferencesSaveBridge } =
    await import('../src/toolbarKeyPreferencesDialog.js');

  assert.equal(
    createToolbarKeyPreferencesSaveBridge('bottom', () => true)('{'),
    'invalid_config'
  );
  assert.equal(
    createToolbarKeyPreferencesSaveBridge('bottom', () => false)('{}'),
    'commit_failed'
  );
  assert.equal(
    createToolbarKeyPreferencesSaveBridge('bottom', () => {
      throw new Error('save failed');
    })('{}'),
    'bridge_error'
  );
});
