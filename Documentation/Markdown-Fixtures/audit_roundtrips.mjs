import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertFromMarkdown, exportMarkdown } from '../../web/src/markdownConversion.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = [
  ['CommonMark', 'CommonMark-Compatibility-Test.md', 'commonmark'],
  ['GFM', 'GitHub-Flavored-Markdown-Test.md', 'gfm'],
  ['Obsidian', 'Markdown-Reference-Test.md', 'obsidian'],
  ['Markdown-Syntax', 'Markdown-Syntax-Test.md', 'commonmark']
];
const profiles = ['commonmark', 'gfm', 'obsidian'];
const selected = new Set(process.argv.slice(2).filter(value => !value.startsWith('--')));
const showAll = process.argv.includes('--all') || selected.size === 0;

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

    console.log(`\n## ${name}: ${sourceProfile} → ${targetProfile} → ${sourceProfile}`);
    console.log(
      `Source lines: ${comparison.before.length}; returned lines: ${comparison.after.length}; ` +
      `changed/deleted/added line operations: ${changedOperations}.`
    );
    const warnings = warningsFor([
      ['source import', imported],
      ['target export', exported],
      ['target re-import', reimported],
      ['source export', returned]
    ]);
    console.log(`Unique conversion warnings: ${warnings.length}.`);
    console.log(warnings.length ? warnings.map(value => `- ${value}`).join('\n') : '- No conversion warnings.');
    console.log(comparison.hunks.length ? comparison.hunks.join('\n\n') : 'No source-line differences.');
  }
}
