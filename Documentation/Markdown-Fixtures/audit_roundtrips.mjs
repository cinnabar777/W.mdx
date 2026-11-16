import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderMarkdownHtml } from '../../web/src/htmlExport.mjs';
import {
  convertFromHtml,
  convertFromMarkdown,
  exportMarkdown
} from '../../web/src/markdownConversion.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = [
  ['CommonMark', 'CommonMark-Compatibility-Test.md', 'commonmark'],
  ['GFM', 'GitHub-Flavored-Markdown-Test.md', 'gfm'],
  ['Obsidian', 'Markdown-Reference-Test.md', 'obsidian'],
  ['Markdown-Syntax', 'Markdown-Syntax-Test.md', 'commonmark']
];
const profiles = ['commonmark', 'gfm', 'obsidian'];
const dom = new JSDOM('');
const selected = new Set(process.argv.slice(2).filter(value => !value.startsWith('--')));
const showAll = process.argv.includes('--all') || selected.size === 0;

function canonicalizeHtml(html) {
  const template = dom.window.document.createElement('template');
  template.innerHTML = html;

  const serialize = node => {
    if (node.nodeType === 3) {
      let source = node.nodeValue;
      const parentTag = node.parentElement?.tagName.toLowerCase();
      if (['blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'li', 'p', 'pre', 'summary', 'td', 'th'].includes(parentTag)) {
        if (node === node.parentElement.firstChild) source = source.trimStart();
        if (node === node.parentElement.lastChild) source = source.trimEnd();
      }
      if (
        node.nextSibling?.nodeType === 1 &&
        ['div', 'span'].includes(node.nextSibling.tagName.toLowerCase()) &&
        node.nextSibling.childNodes.length === 0
      ) {
        source = source.trimEnd();
      }
      const value = source.replace(/\s+/g, ' ');
      if (
        !value.trim() &&
        ['b', 'del', 'em', 'i', 'kbd', 'mark', 's', 'span', 'strong', 'u']
          .includes(parentTag)
      ) {
        return null;
      }
      return value ? ['text', value] : null;
    }
    if (node.nodeType !== 1) return null;

    const tag = node.tagName.toLowerCase();
    if (
      node.childNodes.length === 0 &&
      (
        ['b', 'del', 'em', 'i', 'kbd', 'mark', 's', 'span', 'strong', 'u']
          .includes(tag) ||
        (tag === 'div' &&
          (!node.hasAttribute('align') || node.getAttribute('align') === ''))
      )
    ) {
      return null;
    }
    const attributes = [...node.attributes]
      .filter(attribute => !attribute.name.startsWith('data-wmdx-'))
      .map(attribute => [attribute.name, attribute.value])
      .sort(([left], [right]) => left.localeCompare(right));
    const plainPreCode = tag === 'pre' &&
      node.childNodes.length === 1 &&
      node.firstChild.nodeType === 1 &&
      node.firstChild.tagName.toLowerCase() === 'code' &&
      !node.firstChild.hasAttribute('class');
    const tableRows = tag === 'table'
      ? [...node.children].flatMap(child =>
        ['thead', 'tbody', 'tfoot'].includes(child.tagName.toLowerCase())
          ? [...child.children]
          : [child]
      )
      : null;
    let children = (plainPreCode
      ? [...node.firstChild.childNodes]
      : tableRows ?? [...node.childNodes]).map(serialize).filter(Boolean);
    if (
      ['b', 'del', 'em', 'i', 'kbd', 'mark', 's', 'span', 'strong', 'u'].includes(tag) &&
      children.length === 0
    ) {
      return null;
    }
    if (tag === 'pre' && plainPreCode) {
      children = children.map(child =>
        Array.isArray(child) && child[0] === 'text'
          ? ['text', child[1].trimEnd()]
          : child
      ).filter(child => child?.[1]);
    }
    if ([
      'blockquote', 'details', 'div', 'figure', 'li', 'ol',
      'p', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
    ].includes(tag)) {
      children = children.filter(child =>
        child[0] !== 'text' || child[1].trim()
      );
    }
    return [tag, attributes, children];
  };

  return [...template.content.childNodes]
    .map(serialize)
    .filter(child => child && !(child[0] === 'text' && !child[1].trim()));
}

function summarizeNode(value) {
  const visibleText = node => {
    if (!Array.isArray(node)) return '';
    if (node[0] === 'text') return node[1];
    return (node[2] ?? []).map(visibleText).join('');
  };
  return {
    tag: Array.isArray(value) ? value[0] : typeof value,
    text: visibleText(value).replace(/\s+/g, ' ').trim().slice(0, 180)
  };
}

function firstDifference(before, after, pathName = 'document', parent = null) {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return { path: pathName, before, after, within: parent };
  }
  const currentParent = before.length === 3 &&
    after.length === 3 &&
    typeof before[0] === 'string' &&
    typeof after[0] === 'string' &&
    Array.isArray(before[1]) &&
    Array.isArray(after[1]) &&
    Array.isArray(before[2]) &&
    Array.isArray(after[2])
    ? { before: summarizeNode(before), after: summarizeNode(after) }
    : parent;
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= before.length || index >= after.length) {
      return {
        path: `${pathName}[${index}]`,
        before: before[index] ?? '(missing)',
        after: after[index] ?? '(missing)',
        within: currentParent
      };
    }
    if (JSON.stringify(before[index]) !== JSON.stringify(after[index])) {
      return firstDifference(
        before[index],
        after[index],
        `${pathName}[${index}]`,
        currentParent
      );
    }
  }
  return null;
}

function lineDiff(beforeText, afterText) {
  const before = beforeText.replace(/\r\n/g, '\n').split('\n');
  const after = afterText.replace(/\r\n/g, '\n').split('\n');
  const width = after.length + 1;
  const lcs = Array.from(
    { length: before.length + 1 },
    () => new Uint16Array(width)
  );

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = before[i] === after[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      operations.push({ type: ' ', text: before[i++] });
      j += 1;
    } else if (
      i < before.length &&
      (j >= after.length || lcs[i + 1][j] >= lcs[i][j + 1])
    ) {
      operations.push({ type: '-', text: before[i++] });
    } else {
      operations.push({ type: '+', text: after[j++] });
    }
  }

  const changed = operations.flatMap((operation, index) =>
    operation.type === ' ' ? [] : [index]
  );
  if (!changed.length) return { before, after, operations, hunks: [] };

  const ranges = [];
  for (const index of changed) {
    const start = Math.max(0, index - 3);
    const end = Math.min(operations.length, index + 4);
    const last = ranges.at(-1);
    if (last && start <= last.end) last.end = end;
    else ranges.push({ start, end });
  }

  let oldLine = 1;
  let newLine = 1;
  const positions = operations.map(operation => {
    const position = { oldLine, newLine };
    if (operation.type !== '+') oldLine += 1;
    if (operation.type !== '-') newLine += 1;
    return position;
  });

  const hunks = ranges.map(({ start, end }) => {
    const oldStart = positions[start]?.oldLine ?? before.length;
    const newStart = positions[start]?.newLine ?? after.length;
    const selectedOperations = operations.slice(start, end);
    const oldCount = selectedOperations.filter(op => op.type !== '+').length;
    const newCount = selectedOperations.filter(op => op.type !== '-').length;
    return [
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      ...selectedOperations.map(operation => `${operation.type}${operation.text}`)
    ].join('\n');
  });
  return { before, after, operations, hunks };
}

function warningsFor(route) {
  const warnings = [];
  for (const [stage, result] of route) {
    for (const warning of result.warnings ?? []) {
      warnings.push(`${stage}: ${warning}`);
    }
  }
  return [...new Set(warnings)];
}

const fixtureAssetMimeTypes = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp']
]);
const structuralSelectors = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ol', 'ul', 'li', 'blockquote', 'table', 'tr',
  'img', 'audio', 'video', 'pre', 'a'
];

function resolveFixtureAssetDataUri(fixtureName, reference) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(reference ?? '').split(/[?#]/, 1)[0]);
  } catch {
    return null;
  }
  const fixtureDirectory = path.join(root, fixtureName);
  const filePath = path.resolve(fixtureDirectory, decoded);
  if (
    !filePath.startsWith(`${fixtureDirectory}${path.sep}`) ||
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    return null;
  }
  const mimeType = fixtureAssetMimeTypes.get(path.extname(filePath).toLowerCase());
  if (!mimeType) return null;
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function structureCounts(html) {
  const document = new dom.window.DOMParser().parseFromString(html, 'text/html');
  return Object.fromEntries(
    structuralSelectors.map(selector => [selector, document.querySelectorAll(selector).length])
  );
}

function missingImageAltCounts(beforeHtml, afterHtml) {
  const countAlts = html => {
    const document = new dom.window.DOMParser().parseFromString(html, 'text/html');
    const counts = new Map();
    for (const image of document.querySelectorAll('img')) {
      const alt = image.hasAttribute('alt') ? image.getAttribute('alt') : '(alt missing)';
      counts.set(alt, (counts.get(alt) ?? 0) + 1);
    }
    return counts;
  };
  const before = countAlts(beforeHtml);
  const after = countAlts(afterHtml);
  return [...before]
    .flatMap(([alt, count]) =>
      Array.from({ length: Math.max(0, count - (after.get(alt) ?? 0)) }, () => alt)
    );
}

for (const [name, entry, sourceProfile] of fixtures) {
  if (!showAll && !selected.has(name)) continue;
  const original = fs.readFileSync(path.join(root, name, entry), 'utf8');
  for (const targetProfile of profiles.filter(profile => profile !== sourceProfile)) {
    const imported = convertFromMarkdown(original, sourceProfile);
    const exported = exportMarkdown(imported.markdown, targetProfile);
    const reimported = convertFromMarkdown(exported.markdown, targetProfile);
    const returned = exportMarkdown(reimported.markdown, sourceProfile);
    const comparison = lineDiff(original, returned.markdown);
    const changedOperations = comparison.operations.filter(op => op.type !== ' ').length;
    const beforeHtml = renderMarkdownHtml(original, {
      profile: sourceProfile,
      window: dom.window
    });
    const afterHtml = renderMarkdownHtml(returned.markdown, {
      profile: sourceProfile,
      window: dom.window
    });
    const beforeMeaning = canonicalizeHtml(beforeHtml.html);
    const afterMeaning = canonicalizeHtml(afterHtml.html);
    const meaningMatches = JSON.stringify(beforeMeaning) === JSON.stringify(afterMeaning);

    console.log(`\n## ${name}: ${sourceProfile} → ${targetProfile} → ${sourceProfile}`);
    console.log(
      `Source lines: ${comparison.before.length}; returned lines: ${comparison.after.length}; ` +
      `changed/deleted/added line operations: ${changedOperations}.`
    );
    const warnings = warningsFor([
      ['source import', imported],
      ['target export', exported],
      ['target re-import', reimported],
      ['source export', returned],
      ['source HTML render', beforeHtml],
      ['returned HTML render', afterHtml]
    ]);
    console.log(`Rendered HTML meaning: ${meaningMatches ? 'same' : 'DIFFERENT'}.`);
    if (!meaningMatches) {
      console.log(`First rendered divergence: ${JSON.stringify(firstDifference(beforeMeaning, afterMeaning))}`);
    }
    console.log(`Unique conversion warnings: ${warnings.length}.`);
    console.log(warnings.length ? warnings.map(value => `- ${value}`).join('\n') : '- No conversion warnings.');
    console.log(comparison.hunks.length ? comparison.hunks.join('\n\n') : 'No source-line differences.');
  }

  const htmlBefore = renderMarkdownHtml(original, {
    profile: sourceProfile,
    window: dom.window,
    resolveAssetDataUri: reference => resolveFixtureAssetDataUri(name, reference)
  });
  const htmlImport = convertFromHtml(htmlBefore.html, dom.window.DOMParser, {
    baseLocation: `https://fixture.test/${name}/${entry}`
  });
  const htmlExport = exportMarkdown(htmlImport.markdown, sourceProfile);
  const htmlAfter = renderMarkdownHtml(htmlExport.markdown, {
    profile: sourceProfile,
    window: dom.window,
    resolveAssetDataUri: reference => resolveFixtureAssetDataUri(name, reference)
  });
  const htmlComparison = firstDifference(
    canonicalizeHtml(htmlBefore.html),
    canonicalizeHtml(htmlAfter.html)
  );
  const beforeCounts = structureCounts(htmlBefore.html);
  const afterCounts = structureCounts(htmlAfter.html);
  const structuralChanges = Object.entries(beforeCounts)
    .filter(([element, count]) => count !== afterCounts[element])
    .map(([element, count]) => `${element} ${count}→${afterCounts[element]}`);
  const missingAlts = missingImageAltCounts(htmlBefore.html, htmlAfter.html);
  const htmlWarnings = warningsFor([
    ['source HTML render', htmlBefore],
    ['HTML import', htmlImport],
    ['Markdown export', htmlExport],
    ['returned HTML render', htmlAfter]
  ]);

  console.log(`\n## ${name}: ${sourceProfile} → semantic HTML → ${sourceProfile}`);
  console.log(`Rendered HTML meaning: ${htmlComparison ? 'DIFFERENT' : 'same'}.`);
  if (htmlComparison) {
    console.log(`First HTML difference: ${JSON.stringify(htmlComparison)}`);
  }
  console.log(
    structuralChanges.length
      ? `Structural count changes: ${structuralChanges.join(', ')}.`
      : 'Structural counts match for the tracked element types.'
  );
  console.log(
    missingAlts.length
      ? `Missing image alt entries: ${JSON.stringify(missingAlts)}.`
      : 'No image alt entries were lost.'
  );
  console.log(`Unique conversion warnings: ${htmlWarnings.length}.`);
  console.log(htmlWarnings.length
    ? htmlWarnings.map(value => `- ${value}`).join('\n')
    : '- No conversion warnings.');
}
