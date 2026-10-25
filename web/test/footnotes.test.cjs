const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('footnote parsing handles references, numbered definitions, and continued lines', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const markdown = 'A reference [^1].\n\n[^1]: First line\n    Second line';
  const parsed = parseFootnotes(markdown);

  assert.equal(parsed.references.length, 1);
  assert.equal(parsed.references[0].label, '1');
  assert.equal(parsed.definitions.length, 1);
  assert.equal(parsed.definitions[0].body, 'First line\nSecond line');
  assert.equal(
    markdown.slice(parsed.definitions[0].from, parsed.definitions[0].to),
    '[^1]: First line\n    Second line'
  );
});

test('footnote parser ignores references and definitions in code when given syntax ranges', async () => {
  const { parseFootnotes } = await import('../src/footnotes.js');
  const markdown = 'Text [^1]\n\n[^1]: note\n\n```md\n[^2]: code\n```\n`[^1]`';
  const fenceStart = markdown.indexOf('```md');
  const fenceEnd = markdown.indexOf('\n```', fenceStart) + 4;
  const inlineStart = markdown.lastIndexOf('`[^1]`');
  const parsed = parseFootnotes(markdown, position =>
    (position >= fenceStart && position < fenceEnd) ||
    (position >= inlineStart && position < inlineStart + 6)
  );

  assert.deepEqual(parsed.definitions.map(definition => definition.label), ['1']);
  assert.equal(parsed.references.length, 1);
  assert.equal(parsed.references[0].label, '1');
});

test('footnote labels remain unique and multiline definitions use Markdown continuation indentation', async () => {
  const { formatFootnoteDefinition, nextFootnoteLabel } = await import('../src/footnotes.js');

  assert.equal(nextFootnoteLabel('Text [^1]\n\n[^1]: note\n[^3]: other'), '4');
  assert.equal(formatFootnoteDefinition('4', 'First line\nSecond line'), '[^4]: First line\n    Second line');
});

test('toolbar insertion opens the footnote dialog and all footnote settings reach rendered styles', () => {
  assert.match(source, /title: 'Insert Footnote', action: \(\) => openFootnoteInsertionDialog\(\)/);
  assert.match(source, /function openFootnoteInsertionDialog/);
  assert.match(source, /footnoteStateField/);
  assert.match(source, /setCssVar\('--footnote-text-color', androidArgbToCss/);
  assert.match(source, /setCssVar\('--footnote-bg-color', androidArgbToCss/);
  assert.match(source, /setCssVar\('--footnote-ref-color', androidArgbToCss/);
  assert.match(source, /setCssVar\('--footnote-link-color', androidArgbToCss/);
  assert.match(source, /setCssVar\('--footnote-font-size'/);
  assert.match(html, /\.cm-footnote-reference/);
  assert.match(html, /\.cm-footnote-definition/);
});
