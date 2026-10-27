const test = require('node:test');
const assert = require('node:assert/strict');

test('a shortcut combination matches, but a second shortcut is rejected', async () => {
  const { parseAndMatchHotkey } = await import('../src/hotkeys.js');
  const event = { key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
  assert.equal(parseAndMatchHotkey(event, 'ctrl+shift+k'), true);
  assert.equal(parseAndMatchHotkey(event, 'ctrl+shift+k alt+k'), false);
  assert.equal(parseAndMatchHotkey(event, 'ctrl+shift+k ctrl+alt+k'), false);
  assert.equal(parseAndMatchHotkey(event, 'ctrl+k'), false);
});
