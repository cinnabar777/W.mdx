const CSS_WIDE_KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded'
]);

export function toCssFontFamily(value) {
  if (value == null) return null;
  const family = String(value).trim();
  if (!family || family === 'default') return null;
  if (
    CSS_WIDE_KEYWORDS.has(family.toLowerCase()) ||
    family.startsWith('var(') ||
    (family.startsWith('"') && family.endsWith('"')) ||
    (family.startsWith("'") && family.endsWith("'"))
  ) {
    return family;
  }
  return `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
