const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Markdown Flavors settings preference XML and arrays define presets and authoring flavors', () => {
  const xml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/xml/preferences_markdown_flavors.xml'),
    'utf8'
  );
  assert.ok(xml.includes('pref_markdown_flavor_preset'), 'contains preset list preference');
  assert.ok(xml.includes('pref_markdown_preferred_authoring_flavor'), 'contains preferred authoring flavor');
  assert.ok(xml.includes('pref_styling_page_headings'), 'contains link to headings syntax');
  assert.ok(xml.includes('pref_styling_page_lists'), 'contains link to lists syntax');
  assert.ok(xml.includes('pref_styling_page_inline'), 'contains link to inline/links syntax');

  const arraysXml = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/res/values/arrays.xml'),
    'utf8'
  );
  assert.ok(arraysXml.includes('pref_markdown_flavor_preset_entries'));
  assert.ok(arraysXml.includes('pref_markdown_flavor_preset_values'));
  assert.ok(arraysXml.includes('pref_markdown_preferred_authoring_flavor_entries'));
});

test('SettingsActivity wires MarkdownFlavorsSettingsFragment and presets', () => {
  const code = fs.readFileSync(
    path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'),
    'utf8'
  );
  assert.ok(code.includes('class MarkdownFlavorsSettingsFragment'), 'defines fragment');
  assert.ok(code.includes('pref_page_markdown_flavors'), 'navigates to fragment');
  assert.ok(code.includes('applyPreset'), 'has applyPreset logic');
  assert.ok(code.includes('"wmdx" ->'), 'has wmdx preset');
  assert.ok(code.includes('"obsidian" ->'), 'has obsidian preset');
  assert.ok(code.includes('"gfm" ->'), 'has gfm preset');
  assert.ok(code.includes('"commonmark" ->'), 'has commonmark preset');
});
