import { escapeMarkdownField } from './markdownEscaping.js';

export function parseMarkdownImage(text) {
  const match = String(text).match(/^!\[((?:\\.|[^\]])*)\]\(([\s\S]+)\)$/);
  if (!match) return null;

  let target = match[2].trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  } else {
    target = target.replace(/\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\([^)]*\))$/, '');
  }
  const unescapeMarkdown = value => value.replace(/\\([\\`*_{}\[\]()#+\-.!<>|])/g, '$1');
  const sizeMatch = /^(.*?)(?<!\\)\|([1-9]\d*)$/.exec(match[1]);
  const width = sizeMatch ? Number(sizeMatch[2]) : null;
  const altSource = width && width <= 10000 ? sizeMatch[1] : match[1];
  const image = {
    alt: unescapeMarkdown(altSource),
    url: unescapeMarkdown(target)
  };
  if (width && width <= 10000) image.width = width;
  return image;
}

export function parseObsidianImageEmbed(text) {
  const match = String(text).trim().match(/^!\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]$/);
  if (!match) return null;

  const url = match[1].trim();
  if (!url || url.includes('#') || url.includes('?')) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\\\)/i.test(url)) return null;

  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // Keep the original path; the file resolver performs final validation.
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\\\)/i.test(decodedUrl)) return null;
  const imagePath = decodedUrl.split(/[?#]/, 1)[0];
  if (!/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(imagePath)) return null;

  const dimensionText = match[2]?.trim() ?? '';
  let width = null;
  let height = null;
  if (dimensionText) {
    const dimensions = dimensionText.match(/^([1-9]\d{0,4})(?:x([1-9]\d{0,4}))?$/i);
    if (!dimensions) return null;
    width = Number(dimensions[1]);
    height = dimensions[2] ? Number(dimensions[2]) : null;
    if (width > 10000 || (height !== null && height > 10000)) return null;
  }

  const basename = imagePath.split('/').at(-1) || 'image';
  const image = {
    alt: basename.replace(/\.[^.]+$/, '') || basename,
    url
  };
  if (width !== null) image.width = width;
  if (height !== null) image.height = height;
  return image;
}

export function formatMarkdownImage(alt, url, width = null) {
  let safeAlt = escapeMarkdownField(alt, { escapeCharacters: ']' });
  if (width != null && String(width).trim() !== '') {
    const parsedWidth = Number(width);
    if (!Number.isInteger(parsedWidth) || parsedWidth < 1 || parsedWidth > 10000) {
      throw new RangeError('Image width must be a whole number from 1 to 10000 pixels.');
    }
    safeAlt += `|${parsedWidth}`;
  }
  const safeUrl = String(url ?? '').trim().replace(/\s/g, '%20').replace(/\)/g, '%29');
  return `![${safeAlt}](${safeUrl})`;
}

export function formatObsidianImageEmbed(url, width = null, height = null) {
  const rawUrl = String(url ?? '').trim();
  if (
    !rawUrl ||
    rawUrl.includes('#') ||
    rawUrl.includes('?') ||
    /^(?:[a-z][a-z0-9+.-]*:|\/|\\\\)/i.test(rawUrl)
  ) {
    throw new TypeError('An Obsidian image embed needs a relative image path.');
  }
  let decodedUrl = rawUrl;
  try {
    decodedUrl = decodeURIComponent(rawUrl);
  } catch {
    // Keep malformed percent signs literal for extension validation.
  }
  if (
    /^(?:[a-z][a-z0-9+.-]*:|\/|\\\\)/i.test(decodedUrl) ||
    !/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(decodedUrl)
  ) {
    throw new TypeError('An Obsidian image embed needs a relative image path.');
  }

  const safeUrl = rawUrl.split('/').map(segment => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Treat malformed percent signs as literal filename characters.
    }
    return encodeURIComponent(decoded).replace(/%20/g, ' ');
  }).join('/');

  let size = '';
  if (width != null && String(width).trim() !== '') {
    const parsedWidth = Number(width);
    if (!Number.isInteger(parsedWidth) || parsedWidth < 1 || parsedWidth > 10000) {
      throw new RangeError('Image width must be a whole number from 1 to 10000 pixels.');
    }
    size = `|${parsedWidth}`;
    if (height != null && String(height).trim() !== '') {
      const parsedHeight = Number(height);
      if (!Number.isInteger(parsedHeight) || parsedHeight < 1 || parsedHeight > 10000) {
        throw new RangeError('Image height must be a whole number from 1 to 10000 pixels.');
      }
      size += `x${parsedHeight}`;
    }
  } else if (height != null && String(height).trim() !== '') {
    throw new TypeError('An image height requires a width.');
  }
  return `![[${safeUrl}${size}]]`;
}
