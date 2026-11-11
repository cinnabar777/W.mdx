export const DEFAULT_FOOTNOTE_SYNTAX_SETTINGS = Object.freeze({
  enabled: true,
  wmdx: true,
  markdown: true,
  obsidian_inline: true,
  authoringSyntax: 'wmdx'
});

const FOOTNOTE_FLAVORS = ['wmdx', 'markdown', 'obsidian_inline'];
const AUTHORING_SYNTAXES = new Set(FOOTNOTE_FLAVORS);

export function normalizeFootnoteSyntaxSettings(preferences = {}) {
  const settings = {
    enabled: preferences.pref_footnote_syntax_enabled !== false,
    wmdx: preferences.pref_footnote_syntax_wmdx_enabled !== false,
    markdown: preferences.pref_footnote_syntax_markdown_enabled !== false,
    obsidian_inline:
      preferences.pref_footnote_syntax_obsidian_inline_enabled !== false
  };
  const enabledFlavors = FOOTNOTE_FLAVORS.filter(flavor => settings[flavor]);
  const storedAuthoring = String(
    preferences.pref_footnote_authoring_syntax ??
      DEFAULT_FOOTNOTE_SYNTAX_SETTINGS.authoringSyntax
  ).toLowerCase();
  settings.authoringSyntax = enabledFlavors.length === 1
    ? enabledFlavors[0]
    : AUTHORING_SYNTAXES.has(storedAuthoring) &&
        enabledFlavors.includes(storedAuthoring)
      ? storedAuthoring
      : enabledFlavors[0] ?? null;
  return settings;
}

export function isFootnoteFlavorEnabled(settings, flavor) {
  return Boolean(
    settings?.enabled !== false &&
    FOOTNOTE_FLAVORS.includes(flavor) &&
    settings?.[flavor] !== false
  );
}

export function isFootnoteAuthoringAvailable(settings) {
  return Boolean(settings?.enabled && settings?.authoringSyntax);
}
