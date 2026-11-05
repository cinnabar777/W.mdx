const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

test('a shortcut combination matches, but a second shortcut is rejected', async () => {
  const { parseAndMatchHotkey } = await import('../src/hotkeys.js');
  const event = { key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
  assert.equal(parseAndMatchHotkey(event, 'ctrl+shift+k'), true);
  assert.equal(parseAndMatchHotkey(event, 'ctrl+shift+k alt+k'), false);
  assert.equal(parseAndMatchHotkey(event, 'ctrl+shift+k ctrl+alt+k'), false);
  assert.equal(parseAndMatchHotkey(event, 'ctrl+k'), false);
});

test('up and down shortcut names match arrow keys', async () => {
  const { parseAndMatchHotkey } = await import('../src/hotkeys.js');
  assert.equal(parseAndMatchHotkey({
    key: 'ArrowUp',
    code: 'ArrowUp',
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false
  }, 'ctrl+alt+up'), true);
  assert.equal(parseAndMatchHotkey({
    key: 'ArrowDown',
    code: 'ArrowDown',
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false
  }, 'ctrl+alt+down'), true);
});

test('undo and redo shortcuts match their standard key combinations', async () => {
  const { parseAndMatchHotkey } = await import('../src/hotkeys.js');
  const event = key => ({
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false
  });
  assert.equal(parseAndMatchHotkey(event('z'), 'ctrl+z'), true);
  assert.equal(parseAndMatchHotkey(event('y'), 'ctrl+y'), true);
});

test('editing actions have editable shortcuts with matching reset defaults', () => {
  const shortcuts = [
    ['moveLineUp', 'moveLineUp', 'ctrl+alt+up'],
    ['moveLineDown', 'moveLineDown', 'ctrl+alt+down'],
    ['deleteLine', 'deleteLine', 'ctrl+shift+k'],
    ['cycleListType', 'cycleListType', 'ctrl+alt+shift+l'],
    ['undo', 'undo', 'ctrl+z'],
    ['redo', 'redo', 'ctrl+y'],
    ['save_as_mdzip', 'save_as_mdzip', 'ctrl+shift+alt+m'],
    ['attachment', 'attachment', 'ctrl+shift+a'],
    ['link', 'link', '']
  ];
  const hotkeysXml = fs.readFileSync(
    path.join(root, 'app/src/main/res/xml/preferences_hotkeys.xml'),
    'utf8'
  );
  const mainActivity = fs.readFileSync(
    path.join(root, 'app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'),
    'utf8'
  );
  const resetPreferences = fs.readFileSync(
    path.join(root, 'app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
    'utf8'
  );
  const main = fs.readFileSync(path.join(root, 'web/src/main.js'), 'utf8');

  for (const [actionId, preferenceName, defaultValue] of shortcuts) {
    const preferenceKey = `pref_hotkey_${preferenceName}`;
    assert.ok(hotkeysXml.includes(`app:key="${preferenceKey}"`));
    assert.ok(hotkeysXml.includes(`app:defaultValue="${defaultValue}"`));
    assert.ok(resetPreferences.includes(
      `key == "${preferenceKey}" -> "${defaultValue}"`
    ));
    assert.ok(mainActivity.includes(
      `"${actionId}" to prefs.getString("${preferenceKey}", "${defaultValue}")`
    ));
    assert.ok(main.includes(`customHotkeys.${actionId}`));
  }
});
