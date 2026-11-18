export function getTableScrollSurface({ mode, syntaxExposed = false } = {}) {
  return mode === 'source' || syntaxExposed ? 'source' : 'wysiwyg';
}

export function getTableScrollPreferenceKey(surface) {
  return surface === 'source'
    ? 'pref_table_scroll_source_enabled'
    : 'pref_table_scroll_wysiwyg_enabled';
}
