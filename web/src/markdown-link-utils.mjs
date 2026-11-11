function unescapeMarkdown(value) {
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
}

export function normalizeMarkdownReferenceLabel(label) {
  return unescapeMarkdown(label)
    .trim()
    .replace(/[\t\n\r ]+/g, ' ')
    .toLocaleLowerCase('en-US');
}

export function collectMarkdownReferenceTargets(doc, tree) {
  const targets = new Map();
  tree.iterate({
    enter(node) {
      if (node.name !== 'LinkReference') return;
      const raw = doc.sliceString(node.from, node.to);
      const definition = raw.match(
        /^\s{0,3}\[([\s\S]+?)\]:[ \t]*(?:<([^>\n]+)>|(\S+))/
      );
      if (!definition) return;
      const target = unescapeMarkdown((definition[2] || definition[3] || '').trim());
      const normalizedLabel = normalizeMarkdownReferenceLabel(definition[1]);
      if (normalizedLabel && target && !targets.has(normalizedLabel)) {
        targets.set(normalizedLabel, target);
      }
    }
  });
  return targets;
}

function findLabelEnd(raw) {
  if (raw[0] !== '[') return -1;
  let depth = 1;
  for (let index = 1; index < raw.length; index++) {
    if (raw[index] === '\\') {
      index++;
      continue;
    }
    if (raw[index] === '[') depth++;
    else if (raw[index] === ']' && --depth === 0) return index;
  }
  return -1;
}

function normalizeAutolinkTarget(target) {
  const value = unescapeMarkdown(target.trim());
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return `mailto:${value}`;
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

function normalizeSupportedTarget(target) {
  const value = normalizeAutolinkTarget(target);
  if (/^(?:https?:|ftp:\/\/|mailto:)/i.test(value) || value.startsWith('#')) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return null;
  return value;
}

function referenceTargetForLink(raw, labelEnd, referenceTargets) {
  const suffix = raw.slice(labelEnd + 1);
  if (suffix.startsWith('(')) {
    const contents = suffix.slice(1, -1).trim();
    if (!contents) return null;
    if (contents.startsWith('<')) {
      const close = contents.indexOf('>');
      return close > 1 ? unescapeMarkdown(contents.slice(1, close)) : null;
    }
    return unescapeMarkdown(
      contents.split(/\s+(?=["'(])/)[0].trim()
    ) || null;
  }

  let referenceLabel = raw.slice(1, labelEnd);
  if (suffix.startsWith('[')) {
    const referenceEnd = findLabelEnd(suffix);
    if (referenceEnd < 0) return null;
    referenceLabel = suffix.slice(1, referenceEnd) || referenceLabel;
  }
  return referenceTargets.get(normalizeMarkdownReferenceLabel(referenceLabel)) || null;
}

export function getMarkdownReferenceDefinitionInfo(node, doc) {
  if (!node || node.name !== 'LinkReference' || !doc) return null;
  const raw = doc.sliceString(node.from, node.to);
  let cursor = 0;
  while (cursor < raw.length && raw[cursor] === ' ' && cursor < 3) cursor += 1;
  const labelEnd = findLabelEnd(raw.slice(cursor));
  if (labelEnd < 1) return null;
  const labelFrom = cursor + 1;
  const labelTo = cursor + labelEnd;
  cursor += labelEnd + 1;
  if (raw[cursor] !== ':') return null;
  cursor += 1;
  while (raw[cursor] === ' ' || raw[cursor] === '\t') cursor += 1;

  const wrappedInAngles = raw[cursor] === '<';
  let targetFrom = cursor + (wrappedInAngles ? 1 : 0);
  let targetTo = targetFrom;
  if (wrappedInAngles) {
    while (targetTo < raw.length && raw[targetTo] !== '>') targetTo += 1;
  } else {
    while (targetTo < raw.length && !/[\s]/.test(raw[targetTo])) targetTo += 1;
  }
  if (targetTo <= targetFrom) return null;

  const rawLabel = raw.slice(labelFrom, labelTo);
  const rawTarget = raw.slice(targetFrom, targetTo);
  return {
    raw,
    label: unescapeMarkdown(rawLabel),
    normalizedLabel: normalizeMarkdownReferenceLabel(rawLabel),
    target: unescapeMarkdown(rawTarget),
    targetFrom: node.from + targetFrom,
    targetTo: node.from + targetTo,
    wrappedInAngles
  };
}

export function getMarkdownLinkInfo(node, doc, referenceTargets = new Map()) {
  if (!node) return null;

  const raw = doc.sliceString(node.from, node.to);
  if (node.name === 'Autolink') {
    const target = normalizeSupportedTarget(raw.replace(/^<|>$/g, ''));
    return node.to - node.from > 2
      ? target
        ? { target, labelFrom: node.from + 1, labelTo: node.to - 1 }
        : null
      : null;
  }

  if (node.name === 'URL') {
    const target = normalizeSupportedTarget(raw);
    if (!target) return null;
    return {
      target,
      labelFrom: node.from,
      labelTo: node.to
    };
  }

  if (node.name !== 'Link') return null;
  const labelEnd = findLabelEnd(raw);
  if (labelEnd <= 1) return null;

  const labelFrom = node.from + 1;
  const labelTo = node.from + labelEnd;
  const target = normalizeSupportedTarget(
    referenceTargetForLink(raw, labelEnd, referenceTargets) || ''
  );
  return target ? { target, labelFrom, labelTo } : null;
}
