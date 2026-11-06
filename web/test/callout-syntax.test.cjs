const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');

test('callout syntax settings enable both flavors and default authoring to Wmdx', async () => {
  const {
    DEFAULT_CALLOUT_SYNTAX_SETTINGS,
    isCalloutFlavorEnabled,
    normalizeCalloutSyntaxSettings
  } = await import('../src/calloutSyntax.mjs');

  assert.deepEqual(normalizeCalloutSyntaxSettings(), {
    ...DEFAULT_CALLOUT_SYNTAX_SETTINGS
  });
  assert.deepEqual(
    normalizeCalloutSyntaxSettings({
      pref_callout_authoring_syntax: 'obsidian'
    }),
    {
      enabled: true,
      wmdx: true,
      obsidian: true,
      authoringSyntax: 'obsidian'
    }
  );
  assert.equal(
    normalizeCalloutSyntaxSettings({
      pref_callout_syntax_wmdx_enabled: false
    }).authoringSyntax,
    'obsidian'
  );
  assert.equal(
    normalizeCalloutSyntaxSettings({
      pref_callout_syntax_obsidian_enabled: false,
      pref_callout_authoring_syntax: 'obsidian'
    }).authoringSyntax,
    'wmdx'
  );

  const disabled = normalizeCalloutSyntaxSettings({
    pref_callout_syntax_enabled: false
  });
  assert.equal(isCalloutFlavorEnabled(disabled, 'wmdx'), false);
  assert.equal(isCalloutFlavorEnabled(disabled, 'obsidian'), false);
});

test('Obsidian toolbar insertion restores the prior quoted callout form', async () => {
  const { buildObsidianCalloutInsertion } =
    await import('../src/calloutSyntax.mjs');
  const source = 'First line\nSecond line';
  const result = buildObsidianCalloutInsertion(
    source,
    { from: 0, to: source.length },
    { type: 'warning', fold: '-', title: 'Safety note' }
  );

  assert.deepEqual(result, {
    from: 0,
    to: source.length,
    insert: '> [!warning]- Safety note\n> First line\n> Second line',
    cursor: '> [!warning]- Safety note\n> First line\n> Second line'.length
  });
});

test('Obsidian callout insertion preserves nested quote depth and literal greater-than text', async () => {
  const { buildObsidianCalloutInsertion } =
    await import('../src/calloutSyntax.mjs');
  const nestedSource = '> Existing quoted text';
  const nested = buildObsidianCalloutInsertion(
    nestedSource,
    { from: 0, to: nestedSource.length },
    { type: 'note', title: 'Nested' }
  );
  assert.equal(
    nested.insert,
    '> > [!note] Nested\n> > Existing quoted text'
  );

  const literalSource = 'A > sign';
  const literal = buildObsidianCalloutInsertion(
    literalSource,
    { from: 0, to: literalSource.length },
    { type: 'tip' }
  );
  assert.equal(literal.insert, '> [!tip]\n> A > sign');
});

test('callout settings and runtime gates cover both rendering and insertion', () => {
  const settingsXml = fs.readFileSync(
    path.join(root, 'app/src/main/res/xml/preferences_styling_blockquotes.xml'),
    'utf8'
  );
  const settingsActivity = fs.readFileSync(
    path.join(root, 'app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt'),
    'utf8'
  );
  const resetPreferences = fs.readFileSync(
    path.join(root, 'app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt'),
    'utf8'
  );
  const main = fs.readFileSync(path.join(root, 'web/src/main.js'), 'utf8');
  const calloutSyntax = fs.readFileSync(
    path.join(root, 'web/src/calloutSyntax.mjs'),
    'utf8'
  );
  const documentation = fs.readFileSync(
    path.join(root, 'Documentation/Wmdx-Syntax-Design.md'),
    'utf8'
  );

  for (const key of [
    'pref_callout_syntax_enabled',
    'pref_callout_syntax_wmdx_enabled',
    'pref_callout_syntax_obsidian_enabled',
    'pref_callout_authoring_syntax'
  ]) {
    assert.ok(settingsXml.includes(key), `settings define ${key}`);
  }
  assert.match(settingsActivity, /updateCalloutAuthoringPreference/);
  assert.match(resetPreferences, /pref_callout_authoring_syntax" -> "wmdx"/);
  assert.match(main, /isCalloutFlavorEnabledNow\('obsidian'\)/);
  assert.match(main, /if \(!isCalloutFlavorEnabledNow\('wmdx'\)\)/);
  assert.match(main, /buildObsidianCalloutInsertion/);
  assert.match(calloutSyntax, /pref_callout_authoring_syntax/);
  assert.match(documentation, /Callout syntax settings \(implemented\)/);
});
