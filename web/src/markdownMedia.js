const AUDIO_EXTENSIONS = new Set([
  'aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'webm'
]);
const VIDEO_EXTENSIONS = new Set([
  '3gp', 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ogv', 'webm', 'wmv'
]);

export function getMarkdownMediaType(url, label = '') {
  if (typeof url !== 'string') return null;
  const declaredType = /(?:[?&])wmdx_media_type=(audio|video)(?:[&#]|$)/i.exec(url)?.[1]
    ?.toLowerCase();
  if (declaredType) return declaredType;
  const path = url.trim().split(/[?#]/, 1)[0];
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ||
    /\.([a-z0-9]+)$/i.exec(String(label).trim())?.[1]?.toLowerCase();
  if (!extension) return null;
  const parentFolder = path.split('/').at(-2)?.toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) {
    if (parentFolder === 'audio') return 'audio';
    if (parentFolder === 'video') return 'video';
  }
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return null;
}

export function resolveArchiveMediaUrl(url, baseUrl) {
  if (
    !baseUrl ||
    typeof url !== 'string' ||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)
  ) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

export function parseMarkdownMediaLink(markdown) {
  if (typeof markdown !== 'string') return null;
  const match = markdown.match(
    /^\[((?:\\.|[^\]])*)\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)$/
  );
  if (!match) return null;

  const url = match[2] ?? match[3];
  const label = match[1].replace(/\\([\\[\]])/g, '$1');
  const type = getMarkdownMediaType(url, label);
  if (!type) return null;
  return {
    type,
    label,
    url
  };
}

export function formatMarkdownMediaLink(mediaType, url, label = '') {
  if (mediaType !== 'audio' && mediaType !== 'video') {
    throw new TypeError('Media type must be audio or video.');
  }
  const safeUrl = String(url)
    .replace(/ /g, '%20')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  const defaultLabel = mediaType === 'audio' ? 'Audio' : 'Video';
  const safeLabel = String(label || defaultLabel)
    .replace(/[\\[\]\r\n]/g, '')
    .trim() || defaultLabel;
  return `[${safeLabel}](<${safeUrl}>)`;
}
