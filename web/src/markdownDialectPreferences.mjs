export const MARKDOWN_DIALECT_PROFILES = Object.freeze([
  'wmdx',
  'commonmark',
  'gfm',
  'obsidian'
]);

const BASE_FEATURE_DEFAULTS = Object.freeze({
  pref_gfm_extensions_enabled: true,
  pref_heading_syntax_enabled: true,
  pref_heading_syntax_hash_enabled: true,
  pref_heading_syntax_setext_enabled: true,
  pref_list_syntax_enabled: true,
  pref_list_syntax_markdown_enabled: true,
  pref_links_enabled: true,
  pref_links_commonmark_enabled: true,
  pref_links_reference_enabled: true,
  pref_footnote_syntax_enabled: true,
  pref_footnote_syntax_markdown_enabled: true,
  pref_wmdx_color_syntax_enabled: true,
  pref_obsidian_highlight_enabled: false,
  pref_wmdx_subscript_enabled: true,
  pref_wmdx_superscript_enabled: true,
  pref_underline_use_wmdx_syntax: true
});

const PROFILE_DEFAULTS = Object.freeze({
  wmdx: Object.freeze({
    ...BASE_FEATURE_DEFAULTS,
    pref_heading_syntax_wmdx_enabled: true,
    pref_heading_authoring_syntax: 'wmdx',
    pref_list_syntax_gfm_tasks_enabled: true,
    pref_list_syntax_wmdx_enabled: true,
    pref_list_authoring_syntax: 'wmdx',
    pref_links_obsidian_enabled: true,
    pref_links_wmdx_enabled: true,
    pref_links_authoring_syntax: 'wmdx',
    pref_callout_syntax_enabled: true,
    pref_callout_syntax_wmdx_enabled: true,
    pref_callout_syntax_obsidian_enabled: true,
    pref_callout_authoring_syntax: 'wmdx',
    pref_footnote_syntax_wmdx_enabled: true,
    pref_footnote_syntax_obsidian_inline_enabled: true,
    pref_footnote_authoring_syntax: 'wmdx'
  }),
  commonmark: Object.freeze({
    ...BASE_FEATURE_DEFAULTS,
    pref_gfm_extensions_enabled: false,
    pref_heading_syntax_wmdx_enabled: false,
    pref_heading_authoring_syntax: 'hash',
    pref_list_syntax_gfm_tasks_enabled: false,
    pref_list_syntax_wmdx_enabled: false,
    pref_list_authoring_syntax: 'markdown',
    pref_links_obsidian_enabled: false,
    pref_links_wmdx_enabled: false,
    pref_links_authoring_syntax: 'commonmark',
    pref_callout_syntax_enabled: false,
    pref_callout_syntax_wmdx_enabled: false,
    pref_callout_syntax_obsidian_enabled: false,
    pref_callout_authoring_syntax: 'wmdx',
    pref_footnote_syntax_wmdx_enabled: false,
    pref_footnote_syntax_obsidian_inline_enabled: false,
    pref_footnote_authoring_syntax: 'markdown',
    pref_wmdx_color_syntax_enabled: false,
    pref_obsidian_highlight_enabled: false,
    pref_wmdx_subscript_enabled: false,
    pref_wmdx_superscript_enabled: false,
    pref_underline_use_wmdx_syntax: false
  }),
  gfm: Object.freeze({
    ...BASE_FEATURE_DEFAULTS,
    pref_heading_syntax_wmdx_enabled: false,
    pref_heading_authoring_syntax: 'hash',
    pref_list_syntax_gfm_tasks_enabled: true,
    pref_list_syntax_wmdx_enabled: false,
    pref_list_authoring_syntax: 'markdown',
    pref_links_obsidian_enabled: false,
    pref_links_wmdx_enabled: false,
    pref_links_authoring_syntax: 'commonmark',
    pref_callout_syntax_enabled: true,
    pref_callout_syntax_wmdx_enabled: false,
    pref_callout_syntax_obsidian_enabled: true,
    pref_callout_authoring_syntax: 'obsidian',
    pref_footnote_syntax_wmdx_enabled: false,
    pref_footnote_syntax_obsidian_inline_enabled: false,
    pref_footnote_authoring_syntax: 'markdown',
    pref_wmdx_color_syntax_enabled: false,
    pref_obsidian_highlight_enabled: false,
    pref_wmdx_subscript_enabled: false,
    pref_wmdx_superscript_enabled: false,
    pref_underline_use_wmdx_syntax: false
  }),
  obsidian: Object.freeze({
    ...BASE_FEATURE_DEFAULTS,
    pref_heading_syntax_wmdx_enabled: false,
    pref_heading_authoring_syntax: 'hash',
    pref_list_syntax_gfm_tasks_enabled: true,
    pref_list_syntax_wmdx_enabled: false,
    pref_list_authoring_syntax: 'markdown',
    pref_links_obsidian_enabled: true,
    pref_links_wmdx_enabled: false,
    pref_links_authoring_syntax: 'obsidian',
    pref_callout_syntax_enabled: true,
    pref_callout_syntax_wmdx_enabled: false,
    pref_callout_syntax_obsidian_enabled: true,
    pref_callout_authoring_syntax: 'obsidian',
    pref_footnote_syntax_wmdx_enabled: false,
    pref_footnote_syntax_obsidian_inline_enabled: true,
    pref_footnote_authoring_syntax: 'markdown',
    pref_wmdx_color_syntax_enabled: false,
    pref_obsidian_highlight_enabled: true,
    pref_wmdx_subscript_enabled: false,
    pref_wmdx_superscript_enabled: false,
    pref_underline_use_wmdx_syntax: false
  })
});

export function normalizeMarkdownDialectProfile(value) {
  const profile = String(value ?? '').trim().toLowerCase();
  return MARKDOWN_DIALECT_PROFILES.includes(profile) ? profile : 'wmdx';
}

/**
 * Resolve profile defaults while preserving every explicitly saved feature
 * preference. This keeps the profile useful as a starting point without
 * changing existing syntax choices or rewriting document source.
 */
export function applyMarkdownDialectProfile(preferences = {}) {
  const profile = normalizeMarkdownDialectProfile(
    preferences.pref_markdown_profile
  );
  const resolved = { ...preferences, pref_markdown_profile: profile };
  for (const [key, value] of Object.entries(PROFILE_DEFAULTS[profile])) {
    if (!Object.prototype.hasOwnProperty.call(preferences, key)) {
      resolved[key] = value;
    }
  }
  return resolved;
}

