const test = require('node:test');
const assert = require('node:assert/strict');

test('Markdown linter ignores code fences and accepts valid Wmdx resources and footnotes', async () => {
  const { lintMarkdown } = await import('../src/markdownLinter.mjs');
  const source = [
    'Text.[^source]',
    '',
    '[^source]: A defined note.',
    '',
    '![images/diagram.png|Diagram|640|><]',
    '',
    '```md',
    '[^missing] and <script>text</script>',
    '```'
  ].join('\n');
  assert.deepEqual(lintMarkdown(source), []);
});

test('Markdown linter reports broken references, table shape, Wmdx fields, and fences', async () => {
  const { lintMarkdown } = await import('../src/markdownLinter.mjs');
  const source = [
    'A note.[^missing]',
    '',
    '[Guide][missing]',
    '',
    '| A | B |',
    '| --- | --- |',
    '| One |',
    '',
    '![image.png|Picture|0|diagonal]',
    '```js'
  ].join('\n');
  const diagnostics = lintMarkdown(source);
  const codes = diagnostics.map(item => item.code);
  assert.ok(codes.includes('unresolved-footnote'));
  assert.ok(codes.includes('unresolved-reference-link'));
  assert.ok(codes.includes('table-cell-count'));
  assert.ok(codes.includes('invalid-wmdx-resource'));
  assert.ok(codes.includes('unclosed-code-fence'));
});

test('Obsidian linter warns about unsupported transclusion without rejecting supported embeds', async () => {
  const { lintMarkdown } = await import('../src/markdownLinter.mjs');
  const diagnostics = lintMarkdown(
    '![[Guide#Introduction]]\n\n![[image.png]]',
    { dialect: 'obsidian' }
  );
  assert.deepEqual(diagnostics.map(item => item.code), [
    'unsupported-obsidian-transclusion'
  ]);
});
