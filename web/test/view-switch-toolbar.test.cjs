const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('toolbar view-switch actions explicitly cycle modes and report failures', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(
    source.includes("if (actionId === 'switchView') {"),
    'gesture-assigned and custom toolbar keys have a direct view-switch route'
  );
  assert.ok(
    source.includes("const modes = ['wysiwyg', 'live_preview', 'source'];"),
    'the view action cycles all supported editor modes'
  );
  assert.ok(
    source.includes(".catch(error => {\n      console.error('Could not switch editor view:', error);"),
    'a failed transition is logged and surfaced instead of silently doing nothing'
  );
  assert.doesNotMatch(
    source,
    /\bisSwiping\s*=/,
    'view teardown does not assign an undeclared swipe state and abort the mode change'
  );
});
