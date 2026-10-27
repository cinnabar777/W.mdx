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

export function formatMarkdownImage(alt, url, width = null) {
  let safeAlt = String(alt ?? '').replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
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
