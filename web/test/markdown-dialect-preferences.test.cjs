const assert = require('node:assert/strict');
const { test } = require('node:test');

test('each profile supplies defaults for supported syntax and authoring choices', async () => {
  const { applyMarkdownDialectProfile } =
    await import('../src/markdownDialectPreferences.mjs');
  const commonmark = applyMarkdownDialectProfile({
    pref_markdown_profile: 'commonmark'
  });
  const gfm = applyMarkdownDialectProfile({ pref_markdown_profile: 'gfm' });
  const obsidian = applyMarkdownDialectProfile({
    pref_markdown_profile: 'obsidian'
  });
  const wmdx = applyMarkdownDialectProfile({ pref_markdown_profile: 'wmdx' });

  assert.equal(commonmark.pref_heading_authoring_syntax, 'hash');
  assert.equal(commonmark.pref_list_authoring_syntax, 'markdown');
  assert.equal(commonmark.pref_gfm_extensions_enabled, false);
  assert.equal(commonmark.pref_callout_syntax_enabled, false);
  assert.equal(commonmark.pref_wmdx_subscript_enabled, false);
  assert.equal(commonmark.pref_wmdx_superscript_enabled, false);
  assert.equal(commonmark.pref_wmdx_color_syntax_enabled, false);
  assert.equal(commonmark.pref_obsidian_highlight_enabled, false);
  assert.equal(commonmark.pref_underline_use_wmdx_syntax, false);
  assert.equal(gfm.pref_list_syntax_gfm_tasks_enabled, true);
  assert.equal(gfm.pref_gfm_extensions_enabled, true);
  assert.equal(gfm.pref_wmdx_subscript_enabled, false);
  assert.equal(gfm.pref_wmdx_superscript_enabled, false);
  assert.equal(gfm.pref_wmdx_color_syntax_enabled, false);
  assert.equal(gfm.pref_obsidian_highlight_enabled, false);
  assert.equal(gfm.pref_callout_authoring_syntax, 'obsidian');
  assert.equal(obsidian.pref_links_authoring_syntax, 'obsidian');
  assert.equal(obsidian.pref_footnote_syntax_obsidian_inline_enabled, true);
  assert.equal(obsidian.pref_wmdx_subscript_enabled, false);
  assert.equal(obsidian.pref_wmdx_superscript_enabled, false);
  assert.equal(obsidian.pref_wmdx_color_syntax_enabled, false);
  assert.equal(obsidian.pref_obsidian_highlight_enabled, true);
  assert.equal(wmdx.pref_heading_authoring_syntax, 'wmdx');
  assert.equal(wmdx.pref_callout_syntax_wmdx_enabled, true);
  assert.equal(wmdx.pref_wmdx_subscript_enabled, true);
  assert.equal(wmdx.pref_wmdx_superscript_enabled, true);
  assert.equal(wmdx.pref_wmdx_color_syntax_enabled, true);
  assert.equal(wmdx.pref_obsidian_highlight_enabled, false);
});

test('explicitly saved feature choices override profile defaults', async () => {
  const { applyMarkdownDialectProfile } =
    await import('../src/markdownDialectPreferences.mjs');
  const resolved = applyMarkdownDialectProfile({
    pref_markdown_profile: 'commonmark',
    pref_heading_syntax_wmdx_enabled: true,
    pref_heading_authoring_syntax: 'wmdx',
    pref_callout_syntax_enabled: true,
    pref_wmdx_subscript_enabled: true,
    pref_wmdx_superscript_enabled: true,
    pref_wmdx_color_syntax_enabled: true,
    pref_obsidian_highlight_enabled: false
  });

  assert.equal(resolved.pref_heading_syntax_wmdx_enabled, true);
  assert.equal(resolved.pref_heading_authoring_syntax, 'wmdx');
  assert.equal(resolved.pref_callout_syntax_enabled, true);
  assert.equal(resolved.pref_wmdx_subscript_enabled, true);
  assert.equal(resolved.pref_wmdx_superscript_enabled, true);
  assert.equal(resolved.pref_wmdx_color_syntax_enabled, true);
  assert.equal(resolved.pref_obsidian_highlight_enabled, false);
  assert.equal(resolved.pref_links_wmdx_enabled, false);
});

test('unknown profile values fall back to the compatible Wmdx profile', async () => {
  const { applyMarkdownDialectProfile } =
    await import('../src/markdownDialectPreferences.mjs');
  const resolved = applyMarkdownDialectProfile({
    pref_markdown_profile: 'unknown'
  });
  assert.equal(resolved.pref_markdown_profile, 'wmdx');
  assert.equal(resolved.pref_list_authoring_syntax, 'wmdx');
});
