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

test('Return exits Obsidian callout quote levels one at a time', async () => {
  const { getObsidianCalloutEnterEdit } =
    await import('../src/calloutSyntax.mjs');
  const source = [
    '> [!note] Outer',
    '> > [!faq] Nested',
    '> > Inner body',
    '> > '
  ].join('\n');
  const selection = {
    empty: true,
    from: source.length,
    head: source.length,
    to: source.length
  };

  const nestedExit = getObsidianCalloutEnterEdit(source, selection);
  assert.equal(nestedExit.from, source.lastIndexOf('\n') + 1);
  assert.equal(nestedExit.to, source.length);
  assert.equal(nestedExit.insert, '> ');
  assert.equal(nestedExit.exitsCurrentCallout, true);

  const afterNestedExit =
    source.slice(0, nestedExit.from) +
    nestedExit.insert +
    source.slice(nestedExit.to);
  const outerExit = getObsidianCalloutEnterEdit(afterNestedExit, {
    empty: true,
    from: nestedExit.cursor,
    head: nestedExit.cursor,
    to: nestedExit.cursor
  });
  assert.equal(outerExit.insert, '');
  assert.equal(outerExit.exitsCurrentCallout, true);
  assert.equal(
    afterNestedExit.slice(0, outerExit.from) +
      outerExit.insert +
      afterNestedExit.slice(outerExit.to),
    '> [!note] Outer\n> > [!faq] Nested\n> > Inner body\n'
  );
});

test('Obsidian Return leaves ordinary quotes and interior blank paragraphs alone', async () => {
  const { getObsidianCalloutEnterEdit } =
    await import('../src/calloutSyntax.mjs');
  const ordinaryQuote = '> A regular quote\n> ';
  const interiorBlank = '> [!note] Title\n> First paragraph\n> \n> Second paragraph';
  const blankPosition = interiorBlank.indexOf('> \n') + 2;

  assert.equal(
    getObsidianCalloutEnterEdit(ordinaryQuote, {
      empty: true,
      from: ordinaryQuote.length,
      head: ordinaryQuote.length,
      to: ordinaryQuote.length
    }),
    null
  );
  assert.equal(
    getObsidianCalloutEnterEdit(interiorBlank, {
      empty: true,
      from: blankPosition,
      head: blankPosition,
      to: blankPosition
    }),
    null
  );
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
  assert.match(main, /isCalloutFlavorEnabledNow\('wmdx'\)[\s\S]*?getWmdxCalloutEnterEdit/);
  assert.match(main, /getObsidianCalloutEnterEdit/);
  assert.match(main, /buildObsidianCalloutInsertion/);
  assert.match(calloutSyntax, /pref_callout_authoring_syntax/);
  assert.match(documentation, /Callout syntax settings \(implemented\)/);
});
