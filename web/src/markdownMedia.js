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

export function parseMarkdownAudioLink(text) {
  const link = markdownLinkParts(text);
  if (!link) return null;
  let decodedPath = link.url.split(/[?#]/, 1)[0];
  try {
    decodedPath = decodeURIComponent(decodedPath);
  } catch {
    // Keep the encoded value; the native resolver validates and decodes it.
  }
  if (!/\.(?:mp3|m4a|flac)$/i.test(decodedPath)) return null;
  const parsed = { label: link.label, url: link.url };
  const layout = parseAudioLayoutTitle(link.title);
  if (layout) parsed.layout = layout;
  return parsed;
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

export function extractMarkdownAudioLinks(markdown) {
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

    const parsed = parseMarkdownAudioLink(match[0]);
    if (parsed) links.push({ ...parsed, from, to });
  }

  return links;
}

export function formatMarkdownAudioLink(label, url, layout = null) {
  const safeLabel = String(label ?? 'audio')
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]');
  const rawUrl = String(url ?? '').trim();
  const queryIndex = rawUrl.indexOf('?');
  const fragmentIndex = rawUrl.indexOf('#');
  const suffixCandidates = [
    queryIndex >= 0 && /\.(?:mp3|m4a|flac)$/i.test(rawUrl.slice(0, queryIndex))
      ? queryIndex
      : -1,
    fragmentIndex >= 0 &&
    /\.(?:mp3|m4a|flac)$/i.test(rawUrl.slice(0, fragmentIndex))
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
