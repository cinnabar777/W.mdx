const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');
const findReplacePreferences = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/res/xml/preferences_styling_findreplace.xml'),
  'utf8'
);
const settingsActivity = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'),
  'utf8'
);

test('main.js contains @codemirror/search imports and setup', () => {
  assert.ok(source.includes("@codemirror/search"), 'Missing @codemirror/search import');
  assert.ok(source.includes("SearchQuery"), 'Missing SearchQuery reference');
  assert.ok(source.includes("setSearchQuery"), 'Missing setSearchQuery reference');
  assert.ok(source.includes("findNext"), 'Missing findNext reference');
  assert.ok(source.includes("findPrevious"), 'Missing findPrevious reference');
  assert.ok(source.includes("replaceNext"), 'Missing replaceNext reference');
  assert.ok(source.includes("replaceAll"), 'Missing replaceAll reference');
});

test('regex history and sanitization functions are present in main.js', () => {
  assert.ok(source.includes("wmdx_regex_history_v1"), 'Missing regex history storage key');
  assert.ok(source.includes("saveRegexPattern"), 'Missing saveRegexPattern function');
  assert.ok(source.includes("clearRegexHistory"), 'Missing clearRegexHistory function');
  assert.ok(source.includes("sanitizeSvg"), 'Missing sanitizeSvg function');
});

test('applyAllPreferences maps --findreplace CSS variables', () => {
  assert.ok(source.includes("--findreplace-panel-bg"), 'Missing --findreplace-panel-bg mapping');
  assert.ok(source.includes("--findreplace-field-find-border"), 'Missing --findreplace-field-find-border mapping');
  assert.ok(source.includes("--findreplace-counter-color"), 'Missing --findreplace-counter-color mapping');
  assert.ok(source.includes("--findreplace-counter-bg"), 'Missing --findreplace-counter-bg mapping');
  assert.ok(source.includes("--findreplace-match-bg"), 'Missing --findreplace-match-bg mapping');
  assert.ok(source.includes("--findreplace-current-match-bg"), 'Missing --findreplace-current-match-bg mapping');
});

test('Find & Replace exposes the requested sizing and counter colors without a tall empty tray', () => {
  assert.ok(findReplacePreferences.includes('app:title="Search Field Height (px)"'));
  assert.ok(findReplacePreferences.includes('app:key="pref_findreplace_counter_color"'));
  assert.ok(findReplacePreferences.includes('app:key="pref_findreplace_counter_bg"'));
  assert.equal((findReplacePreferences.match(/app:title="Icon Width \(px\)"/g) || []).length, 9);
  assert.ok(settingsActivity.includes('listView?.post { listView?.scrollToPosition(0) }'));
  assert.ok(settingsActivity.includes('if (hiddenSet.isEmpty()) 24 else 120'));
  assert.ok(settingsActivity.includes('ACTION_DRAG_LOCATION'));
});

test('literal search vs regex search pattern logic', () => {
  const literalText = 'cat.dog';
  const literalQuery = 'cat.dog';
  const regexPattern = literalQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const literalRegExp = new RegExp(regexPattern);

  assert.ok(literalRegExp.test('cat.dog'), 'Literal pattern matches exact period');
  assert.ok(!literalRegExp.test('catxdog'), 'Literal pattern does not match wildcard dot');

  const regexQuery = 'cat.dog';
  const activeRegExp = new RegExp(regexQuery);
  assert.ok(activeRegExp.test('catxdog'), 'Regex pattern matches wildcard dot');
});
