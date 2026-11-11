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

test('Markdown linter reports dialect-specific syntax without flagging code samples', async () => {
  const { lintMarkdown } = await import('../src/markdownLinter.mjs');
  const source = [
    '.1 Wmdx heading',
    'A. Wmdx ordered item',
    'H~2~O and x^2^',
    '==₀colored== and =pen=',
    '==plain highlight==',
    '- [ ] GFM task',
    '~~GFM strike~~',
    '| A | B |',
    '| --- | --- |',
    '| one | two |',
    '',
    '```md',
    'H~2~O and ~~literal~~',
    '```'
  ].join('\n');

  const commonmark = lintMarkdown(source, { dialect: 'commonmark' });
  assert.ok(commonmark.some(item => item.code === 'unsupported-wmdx-syntax'));
  assert.ok(commonmark.some(item => item.code === 'unsupported-gfm-syntax'));
  assert.equal(
    commonmark.some(item => item.line === 13),
    false,
    'syntax-like text inside a code fence remains literal'
  );

  const obsidian = lintMarkdown(source, { dialect: 'obsidian' });
  const plainHighlight = obsidian.filter(item =>
    item.line === 5 && item.code === 'unsupported-wmdx-syntax'
  );
  assert.equal(plainHighlight.length, 0, 'Obsidian highlight syntax is supported');
});

test('Markdown linter reports Obsidian-only syntax for standard targets', async () => {
  const { lintMarkdown } = await import('../src/markdownLinter.mjs');
  const source = [
    '[[Daily Note]]',
    '![[photo.png]]',
    '^[inline footnote]',
    '%% hidden comment %%',
    '> [!note] Callout'
  ].join('\n');
  const commonmark = lintMarkdown(source, { dialect: 'commonmark' });
  assert.equal(
    commonmark.filter(item => item.code === 'unsupported-obsidian-syntax').length,
    5
  );

  const gfm = lintMarkdown(source, { dialect: 'gfm' });
  assert.equal(
    gfm.filter(item => item.code === 'unsupported-obsidian-syntax').length,
    4,
    'GFM alert syntax is not treated as an Obsidian-only feature'
  );
});
