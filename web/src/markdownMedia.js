function unescapeMarkdown(value) {
  return value.replace(/\\([\\`*_{}\[\]()#+\-.!<>|])/g, '$1');
}

function markdownLinkParts(text) {
  const match = String(text).match(/^\[((?:\\.|[^\]])*)\]\(([\s\S]+)\)$/);
  if (!match) return null;

  let target = match[2].trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  } else {
    target = target.replace(/\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\([^)]*\))$/, '');
  }
  return {
    label: unescapeMarkdown(match[1]),
    url: unescapeMarkdown(target)
  };
}

export function parseMarkdownAudioLink(text) {
  const link = markdownLinkParts(text);
  if (!link) return null;
  let decodedPath = link.url.split(/[?#]/, 1)[0];
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    // Keep the encoded value; the native resolver validates and decodes it.
  }
  if (!decodedPath.toLowerCase().endsWith('.mp3')) return null;
  return link;
}

export function formatMarkdownAudioLink(label, url) {
  const safeLabel = String(label ?? 'audio')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]');
  const safeUrl = String(url ?? '').trim().split('/').map(segment =>
    encodeURIComponent(segment).replace(/[!'()*]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
  ).join('/');
  return `[${safeLabel}](${safeUrl})`;
}
