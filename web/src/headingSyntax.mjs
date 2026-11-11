export const DEFAULT_HEADING_SYNTAX_SETTINGS = Object.freeze({
  enabled: true,
  wmdx: true,
  hash: true,
  setext: true,
  authoringSyntax: 'wmdx'
});

const HEADING_FLAVORS = ['wmdx', 'hash', 'setext'];
const AUTHORING_SYNTAXES = new Set(HEADING_FLAVORS);

export function normalizeHeadingSyntaxSettings(preferences = {}) {
  const settings = {
    enabled: preferences.pref_heading_syntax_enabled !== false,
    wmdx: preferences.pref_heading_syntax_wmdx_enabled !== false,
    hash: preferences.pref_heading_syntax_hash_enabled !== false,
    setext: preferences.pref_heading_syntax_setext_enabled !== false
  };
  const enabledFlavors = HEADING_FLAVORS.filter(flavor => settings[flavor]);
  const storedAuthoring = String(
    preferences.pref_heading_authoring_syntax ??
      DEFAULT_HEADING_SYNTAX_SETTINGS.authoringSyntax
  ).toLowerCase();
  settings.authoringSyntax = enabledFlavors.length === 1
    ? enabledFlavors[0]
    : AUTHORING_SYNTAXES.has(storedAuthoring) &&
        enabledFlavors.includes(storedAuthoring)
      ? storedAuthoring
      : enabledFlavors[0] ?? null;
  return settings;
}

export function isHeadingFlavorEnabled(settings, flavor) {
  return Boolean(
    settings?.enabled !== false &&
    HEADING_FLAVORS.includes(flavor) &&
    settings?.[flavor] !== false
  );
}

export function getHeadingFlavor(nodeName, source = '') {
  if (/^SetextHeading[12]$/.test(nodeName)) return 'setext';
  if (nodeName === 'WmdxHeadingMarker') return 'wmdx';
  if (nodeName === 'HeaderMark') {
    const marker = String(source).trim();
    if (/^#{1,6}$/.test(marker)) return 'hash';
    if (/^(?:=+|-+)$/.test(marker)) return 'setext';
  }
  if (/^ATXHeading[1-6]$/.test(nodeName)) {
    return /^\s*\.([1-6])(?:[ \t]|$)/.test(String(source))
      ? 'wmdx'
      : 'hash';
  }
  return null;
}

export function getHeadingLevel(nodeName) {
  const match = /^(?:ATXHeading([1-6])|SetextHeading([12]))$/.exec(nodeName);
  return match ? Number(match[1] ?? match[2]) : null;
}

export function isHeadingLevelAvailable(settings, level) {
  return Boolean(
    settings?.enabled !== false &&
    settings?.authoringSyntax &&
    Number.isInteger(level) &&
    level >= 1 &&
    level <= 6 &&
    (settings.authoringSyntax !== 'setext' || level <= 2)
  );
}

export function getHeadingPrefix(level, syntax) {
  if (!Number.isInteger(level) || level < 1 || level > 6) return null;
  if (syntax === 'wmdx') return `.${level} `;
  if (syntax === 'hash') return `${'#'.repeat(level)} `;
  if (syntax === 'setext' && level <= 2) {
    return level === 1 ? '=' : '-';
  }
  return null;
}
