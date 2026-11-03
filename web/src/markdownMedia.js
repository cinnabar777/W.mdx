function unescapeMarkdown(value) {
  return value.replace(/\\([\\`*_{}\[\]()#+\-.!<>|])/g, '$1');
}

function markdownLinkParts(text) {
  const match = String(text).match(/^\[((?:\\.|[^\]])*)\]\(([\s\S]+)\)$/);
  if (!match) return null;

  let target = match[2].trim();
  let title = null;
  const titleMatch = target.match(
    /\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\(((?:[^)\\]|\\.)*)\))$/
  );
  if (titleMatch) {
    title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? '';
    target = target.slice(0, titleMatch.index).trim();
  }
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  } else {
    target = target.replace(/\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\([^)]*\))$/, '');
  }
  return {
    label: unescapeMarkdown(match[1]),
    url: unescapeMarkdown(target),
    title
  };
}

function parseAudioLayoutTitle(title) {
  if (!title?.startsWith('wmdx-audio:')) return null;
  const values = Object.fromEntries(
    title.slice('wmdx-audio:'.length).split(';').map(pair => {
      const separator = pair.indexOf('=');
      return separator === -1
        ? [pair, '']
        : [pair.slice(0, separator), pair.slice(separator + 1)];
    })
  );
  const width = Number(values.width);
  if (
    !Number.isInteger(width) ||
    width < 40 ||
    width > 100 ||
    !['left', 'center', 'right'].includes(values.align)
  ) {
    return null;
  }
  return { width, alignment: values.align };
}

function parseVideoLayoutTitle(title) {
  if (!title?.startsWith('wmdx-video:')) return null;
  const values = Object.fromEntries(
    title.slice('wmdx-video:'.length).split(';').map(pair => {
      const separator = pair.indexOf('=');
      return separator === -1
        ? [pair, '']
        : [pair.slice(0, separator), pair.slice(separator + 1)];
    })
  );
  const width = Number(values.width);
  if (
    !Number.isInteger(width) ||
    width < 40 ||
    width > 100 ||
    !['left', 'center', 'right'].includes(values.align)
  ) {
    return null;
  }
  return { width, alignment: values.align };
}

function parseAttachmentLayoutTitle(title) {
  if (!title?.startsWith('wmdx-attachment:')) return null;
  const values = Object.fromEntries(
    title.slice('wmdx-attachment:'.length).split(';').map(pair => {
      const separator = pair.indexOf('=');
      return separator === -1
        ? [pair, '']
        : [pair.slice(0, separator), pair.slice(separator + 1)];
    })
  );
  const width = Number(values.width);
  if (
    !Number.isInteger(width) ||
    width < 40 ||
    width > 100 ||
    !['left', 'center', 'right'].includes(values.align)
  ) {
    return null;
  }
  return { width, alignment: values.align };
}

const PLAYABLE_VIDEO_EXTENSIONS = new Set([
  'mp4', 'm4v', 'webm', '3gp', 'mov', 'mkv'
]);

export function parseMarkdownAudioLink(text) {
  const link = markdownLinkParts(text);
  if (!link) return null;
  let decodedPath = link.url.split(/[?#]/, 1)[0];
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    // Keep the encoded value; the native resolver validates and decodes it.
  }
  if (!/\.(?:mp3|aac|m4a|wav|flac|opus|ogg|oga)$/i.test(decodedPath)) return null;
  const parsed = { label: link.label, url: link.url };
  const layout = parseAudioLayoutTitle(link.title);
  if (layout) parsed.layout = layout;
  return parsed;
}

export function parseMarkdownVideoLink(text) {
  const link = markdownLinkParts(text);
  if (!link) return null;
  let decodedPath = link.url.split(/[?#]/, 1)[0];
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    // Keep the encoded value; the native resolver validates and decodes it.
  }
  const extension = decodedPath.match(/\.([^.\/]+)$/)?.[1]?.toLowerCase();
  if (!extension || !/^(?:mp4|m4v|webm|3gp|mov|mkv|avi|mpeg|mpg|ogv|wmv)$/.test(extension)) {
    return null;
  }
  const parsed = { label: link.label, url: link.url };
  if (!PLAYABLE_VIDEO_EXTENSIONS.has(extension)) parsed.unsupported = true;
  const layout = parseVideoLayoutTitle(link.title);
  if (layout) parsed.layout = layout;
  return parsed;
}

export function parseMarkdownAttachmentLink(text) {
  const link = markdownLinkParts(text);
  if (!link) return null;

  let decodedPath = link.url.split(/[?#]/, 1)[0];
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    // The native resolver performs the final safe-path validation.
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\\\)/i.test(decodedPath)) return null;
  const packagePath = decodedPath.replace(/^(?:\.\.\/)+/, '');
  const hasAttachmentMarker =
    link.title === 'wmdx-attachment' ||
    link.title?.startsWith('wmdx-attachment:');
  if (!packagePath.startsWith('attachments/') && !hasAttachmentMarker) return null;
  const parsed = { label: link.label, url: link.url };
  const layout = parseAttachmentLayoutTitle(link.title);
  if (layout) parsed.layout = layout;
  return parsed;
}

export function parseMarkdownEmbeddedDocumentLink(text) {
  const link = markdownLinkParts(text);
  if (!link || !/^wmdx-embed(?:[;:]|$)/.test(link.title ?? '')) return null;
  let decodedUrl = link.url;
  try {
    decodedUrl = decodeURIComponent(link.url);
  } catch {
    // Native URI and package path resolution performs final validation.
  }
  const isContentUri = /^content:\/\//i.test(decodedUrl);
  if (
    !isContentUri &&
    (
      /^(?:[a-z][a-z0-9+.-]*:|\/|\\\\)/i.test(decodedUrl) ||
      !/\.(?:md|mdz)$/i.test(decodedUrl.split(/[?#]/, 1)[0])
    )
  ) {
    return null;
  }
  let mediaBaseUrl = null;
  const mediaBaseMatch = link.title.match(/(?:^|;)base=([^;]+)/);
  if (mediaBaseMatch) {
    try {
      mediaBaseUrl = decodeURIComponent(mediaBaseMatch[1]);
    } catch {
      mediaBaseUrl = null;
    }
  }
  return {
    label: link.label || 'Embedded document',
    url: link.url,
    mediaBaseUrl
  };
}

function markdownCodeRanges(text) {
  const ranges = [];
  const lines = text.split('\n');
  let offset = 0;
  let openFence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineEnd = offset + line.length + (index < lines.length - 1 ? 1 : 0);
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (openFence) {
      const close = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === openFence.character && close[1].length >= openFence.length) {
        ranges.push({ from: openFence.from, to: lineEnd });
        openFence = null;
      }
    } else if (fence) {
      openFence = {
        from: offset,
        character: fence[1][0],
        length: fence[1].length
      };
    } else if (/^(?: {4}|\t)/.test(line)) {
      ranges.push({ from: offset, to: lineEnd });
    }
    offset = lineEnd;
  }
  if (openFence) ranges.push({ from: openFence.from, to: text.length });

  const ticks = /(`+)/g;
  const openTicks = new Map();
  let tick;
  while ((tick = ticks.exec(text))) {
    let precedingBackslashes = 0;
    for (let index = tick.index - 1; index >= 0 && text[index] === '\\'; index -= 1) {
      precedingBackslashes += 1;
    }
    const escaped = precedingBackslashes % 2 === 1;
    const insideExistingCode = ranges.some(
      range => tick.index >= range.from && tick.index < range.to
    );
    if (escaped || insideExistingCode) continue;

    const length = tick[1].length;
    if (openTicks.has(length)) {
      ranges.push({ from: openTicks.get(length), to: ticks.lastIndex });
      openTicks.delete(length);
    } else {
      openTicks.set(length, tick.index);
    }
  }

  return ranges;
}

function extractMarkdownLinks(markdown, parser) {
  const text = String(markdown ?? '');
  const codeRanges = markdownCodeRanges(text);
  const links = [];
  const pattern = /\[((?:\\.|[^\]])*)\]\(((?:\\.|[^)])*)\)/g;
  let match;

  while ((match = pattern.exec(text))) {
    const from = match.index;
    const to = pattern.lastIndex;
    if (from > 0 && text[from - 1] === '!') continue;
    if (codeRanges.some(range => from < range.to && to > range.from)) continue;

    const parsed = parser(match[0]);
    if (parsed) links.push({ ...parsed, from, to });
  }

  return links;
}

export function extractMarkdownAudioLinks(markdown) {
  return extractMarkdownLinks(markdown, parseMarkdownAudioLink);
}

export function extractMarkdownVideoLinks(markdown) {
  return extractMarkdownLinks(markdown, parseMarkdownVideoLink);
}

export function formatMarkdownAudioLink(label, url, layout = null) {
  const safeLabel = String(label ?? 'audio')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]');
  const rawUrl = String(url ?? '').trim();
  const queryIndex = rawUrl.indexOf('?');
  const fragmentIndex = rawUrl.indexOf('#');
  const suffixCandidates = [
    queryIndex >= 0 && /\.(?:mp3|aac|m4a|wav|flac|opus|ogg|oga)$/i.test(rawUrl.slice(0, queryIndex))
      ? queryIndex
      : -1,
    fragmentIndex >= 0 &&
    /\.(?:mp3|aac|m4a|wav|flac|opus|ogg|oga)$/i.test(rawUrl.slice(0, fragmentIndex))
      ? fragmentIndex
      : -1
  ].filter(index => index >= 0);
  const suffixIndex = suffixCandidates.length ? Math.min(...suffixCandidates) : -1;
  const path = suffixIndex === -1 ? rawUrl : rawUrl.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : rawUrl.slice(suffixIndex);
  const safePath = path.split('/').map(segment => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Encode any malformed percent signs as literal filename characters.
    }
    return encodeURIComponent(decoded).replace(/[!'()*]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }).join('/');

  if (layout == null) return `[${safeLabel}](${safePath}${suffix})`;

  const width = Number(layout.width ?? 100);
  const alignment = layout.alignment ?? 'left';
  if (!Number.isInteger(width) || width < 40 || width > 100) {
    throw new RangeError('Audio width must be a whole-number percentage from 40 to 100.');
  }
  if (!['left', 'center', 'right'].includes(alignment)) {
    throw new RangeError('Audio alignment must be left, center, or right.');
  }
  const title = width === 100 && alignment === 'left'
    ? ''
    : ` "wmdx-audio:width=${width};align=${alignment}"`;
  return `[${safeLabel}](${safePath}${suffix}${title})`;
}

export function formatMarkdownVideoLink(label, url, layout = null) {
  const safeLabel = String(label ?? 'video')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]');
  const rawUrl = String(url ?? '').trim();
  const suffixIndices = ['?', '#']
    .map(character => rawUrl.indexOf(character))
    .filter(index =>
      index >= 0 &&
      /\.(?:mp4|m4v|webm|3gp|mov|mkv|avi|mpeg|mpg|ogv|wmv)$/i.test(rawUrl.slice(0, index))
    );
  const suffixIndex = suffixIndices.length ? Math.min(...suffixIndices) : -1;
  const path = suffixIndex === -1 ? rawUrl : rawUrl.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : rawUrl.slice(suffixIndex);
  const safePath = path.split('/').map(segment => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Encode malformed percent signs as literal filename characters.
    }
    return encodeURIComponent(decoded).replace(/[!'()*]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }).join('/');

  if (layout == null) return `[${safeLabel}](${safePath}${suffix})`;

  const width = Number(layout.width ?? 100);
  const alignment = layout.alignment ?? 'left';
  if (!Number.isInteger(width) || width < 40 || width > 100) {
    throw new RangeError('Video width must be a whole-number percentage from 40 to 100.');
  }
  if (!['left', 'center', 'right'].includes(alignment)) {
    throw new RangeError('Video alignment must be left, center, or right.');
  }
  const title = width === 100 && alignment === 'left'
    ? ''
    : ` "wmdx-video:width=${width};align=${alignment}"`;
  return `[${safeLabel}](${safePath}${suffix}${title})`;
}

export function formatMarkdownAttachmentLink(label, url, layout = null) {
  const safeLabel = String(label ?? 'attachment')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]');
  const safePath = String(url ?? '').trim().split('/').map(segment => {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Encode malformed percent signs as literal filename characters.
    }
    return encodeURIComponent(decoded).replace(/[!'()*]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }).join('/');
  if (layout == null) return `[${safeLabel}](${safePath} "wmdx-attachment")`;

  const width = Number(layout.width ?? 100);
  const alignment = layout.alignment ?? 'left';
  if (!Number.isInteger(width) || width < 40 || width > 100) {
    throw new RangeError('Attachment width must be a whole-number percentage from 40 to 100.');
  }
  if (!['left', 'center', 'right'].includes(alignment)) {
    throw new RangeError('Attachment alignment must be left, center, or right.');
  }
  const title = width === 100 && alignment === 'left'
    ? ''
    : ` "wmdx-attachment:width=${width};align=${alignment}"`;
  return `[${safeLabel}](${safePath}${title})`;
}

export function formatMarkdownEmbeddedDocumentLink(label, url, mediaBaseUrl = null) {
  const safeLabel = String(label ?? 'Embedded document')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]');
  const rawUrl = String(url ?? '').trim();
  if (!rawUrl) throw new TypeError('An embedded document needs a file path.');
  const safeUrl = /^content:\/\//i.test(rawUrl)
    ? encodeURIComponent(rawUrl)
    : rawUrl.split('/').map(segment => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Encode malformed percent signs as literal filename characters.
      }
      return encodeURIComponent(decoded).replace(/[!'()*]/g, character =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
      );
    }).join('/');
  const title = mediaBaseUrl
    ? `wmdx-embed;base=${encodeURIComponent(String(mediaBaseUrl))}`
    : 'wmdx-embed';
  return `[${safeLabel}](${safeUrl} "${title}")`;
}
