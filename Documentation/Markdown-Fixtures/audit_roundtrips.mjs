import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderMarkdownHtml } from '../../web/src/htmlExport.mjs';
import { convertFromMarkdown, exportMarkdown } from '../../web/src/markdownConversion.mjs';

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
      const value = node.nodeValue.replace(/\s+/g, ' ');
      return value ? ['text', value] : null;
    }
    if (node.nodeType !== 1) return null;

    const tag = node.tagName.toLowerCase();
    const attributes = [...node.attributes]
      .filter(attribute => !attribute.name.startsWith('data-wmdx-'))
      .map(attribute => [attribute.name, attribute.value])
      .sort(([left], [right]) => left.localeCompare(right));
    let children = [...node.childNodes].map(serialize).filter(Boolean);
    if (['blockquote', 'li', 'ol', 'p', 'ul'].includes(tag)) {
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
}
