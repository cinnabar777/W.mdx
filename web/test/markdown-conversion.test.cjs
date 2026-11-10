const test = require('node:test');
const assert = require('node:assert/strict');

test('CommonMark import converts headings and preserves ordinary links and code', async () => {
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const source = [
    '# Main title',
    '',
    'Section title',
    '=============',
    '',
    '[Project](docs/Project%20Notes.md)',
    '',
    '```md',
    '# literal heading',
    '[literal](https://example.com)',
    '```'
  ].join('\n');

  const result = convertFromMarkdown(source, 'commonmark');
  assert.match(result.markdown, /^\.1 Main title/m);
  assert.match(result.markdown, /^\.1 Section title/m);
  assert.match(result.markdown, /^\[Project\]\(docs\/Project%20Notes\.md\)$/m);
  assert.match(result.markdown, /# literal heading/);
  assert.match(result.markdown, /\[literal\]\(https:\/\/example\.com\)/);
  assert.deepEqual(result.warnings, []);
});

test('subscript converts between Wmdx tilde syntax and portable HTML', async () => {
  const { convertFromMarkdown, exportMarkdown } = await import('../src/markdownConversion.mjs');
  const importedMarkdown = convertFromMarkdown('H<sub>2</sub>O', 'commonmark');
  assert.equal(importedMarkdown.markdown, 'H~2~O');

  for (const dialect of ['commonmark', 'gfm', 'obsidian']) {
    const exported = exportMarkdown('H~2~O', dialect);
    assert.equal(exported.markdown, 'H<sub>2</sub>O');
  }
});

test('raw HTML inline emphasis converts semantically while code and active blocks stay literal', async () => {
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const source =
    'HTML <strong class="lead">bold</strong>, <em>italic</em>, ' +
    '<b>bold too</b>, and <i>italic too</i>. ' +
    'Raw <a href="/link">HTML link</a>. ' +
    'Escaped \\<br/> is not a hard break; escaped \\<img src="/literal.png"> is not an image. ' +
    '`<strong>code</strong>`\n\n' +
    '<div><strong>raw block content</strong></div>\n\n' +
    '<div>\n<strong>multiline raw block</strong>\n</div>\n\n' +
    '<!--\n<strong>comment content</strong>\n-->\n\n' +
    '<script><strong>not active</strong></script>\n\n' +
    '<script>\n<strong>multiline script content</strong>\n</script>';
  const result = convertFromMarkdown(source, 'commonmark');

  assert.equal(
    result.markdown,
    'HTML **bold**, *italic*, **bold too**, and *italic too*. ' +
      'Raw <a href="/link">HTML link</a>. ' +
      'Escaped \\<br/> is not a hard break; escaped \\<img src="/literal.png"> is not an image. ' +
      '`<strong>code</strong>`\n\n' +
      '<div><strong>raw block content</strong></div>\n\n' +
      '<div>\n<strong>multiline raw block</strong>\n</div>\n\n' +
      '<!--\n<strong>comment content</strong>\n-->\n\n' +
      '<script><strong>not active</strong></script>\n\n' +
      '<script>\n<strong>multiline script content</strong>\n</script>'
  );
  assert.deepEqual(result.warnings, [
    'Raw HTML was preserved during Markdown conversion; unconverted tags may not render like the source dialect.'
  ]);
});

test('top-level raw HTML blocks in Markdown use semantic HTML import without touching code', async () => {
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const { JSDOM } = require('jsdom');
  const DOMParser = new JSDOM('').window.DOMParser;
  const source = [
    'Before.',
    '',
    '<div><p>A <strong>bold</strong> paragraph.</p></div>',
    '',
    '<table><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>2</td></tr></table>',
    '',
    '<p>1. This is a paragraph, not a list.</p>',
    '',
    '```html',
    '<div>literal code</div>',
    '```',
    '',
    'After.'
  ].join('\n');
  for (const format of ['commonmark', 'gfm', 'obsidian']) {
    const result = convertFromMarkdown(source, format, { DOMParser });
    assert.match(result.markdown, /A \*\*bold\*\* paragraph\./, format);
    assert.match(result.markdown, /^\| A \| B \|$/m, format);
    assert.match(result.markdown, /^\| x \| 2 \|$/m, format);
    assert.match(result.markdown, /\\\. This is a paragraph, not a list\./, format);
    assert.match(result.markdown, /```html\n<div>literal code<\/div>\n```/, format);
    assert.match(result.markdown, /After\.$/, format);
    assert.doesNotMatch(result.markdown, /<div><p>A/, format);
    assert.deepEqual(result.warnings, [], format);

    const inline = convertFromMarkdown(
      'Caption <img src="/photo.png" alt="Sunset"> then line<br>break.',
      format,
      { DOMParser }
    );
    assert.match(inline.markdown, /!\[\/photo\.png\|Sunset\|\|\]/, format);
    assert.match(inline.markdown, /then line  \nbreak\./, format);
  }

  const nested = convertFromMarkdown(
    '- item\n\n  <div>\n    <p>nested HTML block</p>\n  </div>',
    'commonmark',
    { DOMParser }
  );
  assert.match(nested.markdown, /<div>\n    <p>nested HTML block<\/p>\n  <\/div>/);
  assert.ok(nested.warnings.some(warning => warning.includes('Raw HTML was preserved')));

  const markerCollision = convertFromMarkdown(
    '\uE020MDXHTMLBLOCK0\uE021\n\n<div>converted block</div>',
    'commonmark',
    { DOMParser }
  );
  assert.match(markerCollision.markdown, /\uE020MDXHTMLBLOCK0\uE021/);
  assert.match(markerCollision.markdown, /converted block/);

  const emptyBlock = convertFromMarkdown(
    'Before.\n\n<div id="empty"></div>\n\nAfter.',
    'commonmark',
    { DOMParser }
  );
  assert.match(emptyBlock.markdown, /<div id="empty"><\/div>/);
  assert.match(emptyBlock.markdown, /Before\.[\s\S]*After\./);
  assert.ok(emptyBlock.warnings.some(warning => warning.includes('preserved unchanged')));

  const activeBlock = convertFromMarkdown(
    '<script>runUnsafeCode()</script>\n\nSafe paragraph.',
    'commonmark',
    { DOMParser }
  );
  assert.doesNotMatch(activeBlock.markdown, /<script|runUnsafeCode/);
  assert.match(activeBlock.markdown, /Safe paragraph\./);
  assert.ok(activeBlock.warnings.some(warning => warning.includes('Active HTML element <script>')));
});

test('superscript imports and exports through semantic HTML without reinterpreting literals', async () => {
  const { convertFromMarkdown, convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { JSDOM } = require('jsdom');
  const Parser = new JSDOM('').window.DOMParser;
  assert.equal(convertFromMarkdown('x^2^', 'gfm').markdown, 'x\\^2\\^');
  assert.equal(convertFromMarkdown('x<sup>2</sup>', 'commonmark').markdown, 'x^2^');
  assert.equal(convertFromHtml('<p>x<sup>2</sup></p>', Parser).markdown, 'x^2^');

  for (const dialect of ['commonmark', 'gfm', 'obsidian']) {
    assert.equal(exportMarkdown('x^2^', dialect).markdown, 'x<sup>2</sup>');
  }
});

test('dialect conversion preserves literal tildes and exports CommonMark strike as HTML', async () => {
  const { convertFromMarkdown, exportMarkdown } = await import('../src/markdownConversion.mjs');
  const gfm = convertFromMarkdown(
    '~~Hi~~ Hello, ~there~ world! `~code~`',
    'gfm'
  );
  assert.equal(gfm.markdown, '~~Hi~~ Hello, \\~there\\~ world! `~code~`');

  const commonmark = convertFromMarkdown(
    '~literal~ ~~also literal~~ `~~code~~`',
    'commonmark'
  );
  assert.equal(
    commonmark.markdown,
    '\\~literal\\~ \\~\\~also literal\\~\\~ `~~code~~`'
  );
  assert.equal(exportMarkdown('~~removed~~', 'commonmark').markdown, '<del>removed</del>');
});

test('CommonMark import converts parsed headings without consuming nearby rules or blocks', async () => {
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const source = [
    'Paragraph before.',
    '# Heading within the flow',
    'Paragraph after.',
    '',
    '> Quoted paragraph.',
    '---',
    '',
    '- List item.',
    '---',
    '',
    '---',
    '---',
    '',
    '    Indented code.',
    '---',
    '',
    'Setext heading.',
    '================'
  ].join('\n');

  const result = convertFromMarkdown(source, 'commonmark');
  assert.match(result.markdown, /Paragraph before\.\n\.1 Heading within the flow\nParagraph after\./);
  assert.match(result.markdown, /> Quoted paragraph\.\n---/);
  assert.match(result.markdown, /- List item\.\n---/);
  assert.match(result.markdown, /\n---\n---/);
  assert.match(result.markdown, /    Indented code\.\n---/);
  assert.match(result.markdown, /\.1 Setext heading\./);
});

test('CommonMark underscore emphasis and thematic breaks avoid Wmdx underline collisions', async () => {
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const source = [
    '_italic_ and __bold__',
    '',
    '____',
    '',
    'foo _*_',
    'foo __*__',
    '*_foo_*',
    '*foo __bar *baz bim__ bam*'
  ].join('\n');
  const result = convertFromMarkdown(source, 'commonmark');

  assert.match(result.markdown, /^\*italic\* and \*\*bold\*\*$/m);
  assert.match(result.markdown, /^---$/m);
  assert.match(result.markdown, /^foo \*\\\*\*$/m);
  assert.match(result.markdown, /^foo \*\*\\\*\*\*$/m);
  assert.match(result.markdown, /^\*foo\*$/m);
  assert.match(result.markdown, /^\*foo \*\*bar \\\*baz bim\*\* bam\*$/m);
});

test('only Obsidian import treats double equals as highlight syntax', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const standard = convertFromMarkdown(
    'Literal ==equals== and =pen= markers.',
    'commonmark'
  );
  assert.equal(exportMarkdown(standard.markdown, 'commonmark').markdown,
    'Literal \\=\\=equals\\=\\= and \\=pen\\= markers.');

  const obsidian = convertFromMarkdown('==highlight==', 'obsidian');
  assert.equal(obsidian.markdown, '==highlight==');
  assert.equal(exportMarkdown(obsidian.markdown, 'obsidian').markdown, '==highlight==');
});

test('Obsidian and GFM callouts become native Wmdx callouts with indented bodies', async () => {
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const obsidian = convertFromMarkdown([
    '> [!warning]- Careful',
    '> First paragraph.',
    '>',
    '> Second paragraph.',
    '',
    '[[Project Notes|Project]] and %%private%%.'
  ].join('\n'), 'obsidian');
  assert.match(obsidian.markdown, /^±warning- Careful/m);
  assert.match(obsidian.markdown, /^  First paragraph\.$/m);
  assert.match(obsidian.markdown, /^  Second paragraph\.$/m);
  assert.match(obsidian.markdown, /\[Project Notes\|Project\|\|\]/);
  assert.match(obsidian.markdown, /%%private%%/);
  assert.ok(obsidian.warnings.some(warning => warning.includes('comments')));

  const gfm = convertFromMarkdown([
    '> [!TIP] Heading',
    '> Useful detail.'
  ].join('\n'), 'gfm');
  assert.match(gfm.markdown, /^±tip Heading$/m);
  assert.match(gfm.markdown, /^  Useful detail\.$/m);

  const unsupportedGfmAlert = convertFromMarkdown([
    '> [!custom] This is an ordinary quote',
    '> It is not a GitHub alert type.'
  ].join('\n'), 'gfm');
  assert.equal(
    unsupportedGfmAlert.markdown,
    '> [!custom] This is an ordinary quote\n> It is not a GitHub alert type.'
  );

  const customObsidianCallout = convertFromMarkdown([
    '> [!custom] Custom Obsidian type',
    '> Its body is retained.'
  ].join('\n'), 'obsidian');
  assert.match(customObsidianCallout.markdown, /^±custom Custom Obsidian type$/m);
  assert.match(customObsidianCallout.markdown, /^  Its body is retained\.$/m);
});

test('Obsidian wikilinks and media embeds import to Wmdx resources outside code', async () => {
  const { convertFromMarkdown } = await import('../src/markdownConversion.mjs');
  const result = convertFromMarkdown([
    '[[Project Notes#Setup|Read this]] and `[[literal]]`.',
    '',
    '![[assets/diagram.png|640]]',
    '![[manual.pdf]]',
    '![[Another Note]]'
  ].join('\n'), 'obsidian');

  assert.match(
    result.markdown,
    /^\[Project Notes#Setup\|Read this\|\|\] and `\[\[literal\]\]`\.$/m
  );
  assert.match(result.markdown, /^!\[assets\/diagram\.png\|\|640\|\]$/m);
  assert.match(result.markdown, /^!?\[manual\.pdf\|\|\|\]$/m);
  assert.match(result.markdown, /^!\[\[Another Note\]\]$/m);
  assert.ok(result.warnings.some(warning => warning.includes('transclusion')));
});

test('Markdown export uses media elements and attachment links for embedded resources', async () => {
  const { exportMarkdown } = await import('../src/markdownConversion.mjs');
  const result = exportMarkdown([
    '![audio/voice note.mp3|||]',
    '![video/clip.mp4|||]',
    '![docs/manual.pdf|||]'
  ].join('\n'), 'gfm');

  assert.match(result.markdown, /<audio controls src="audio\/voice%20note\.mp3"/);
  assert.match(result.markdown, /<video controls src="video\/clip\.mp4"/);
  assert.match(result.markdown, /\[manual\.pdf\]\(docs\/manual\.pdf "wmdx-attachment"\)/);
  assert.equal(
    result.warnings.some(warning => /Audio size|Video alignment|Attachment size/.test(warning)),
    false
  );
});

test('Obsidian inline footnotes warn when exported to a dialect without footnotes', async () => {
  const { exportMarkdown } = await import('../src/markdownConversion.mjs');
  const source = 'A note^[inline detail] remains attached to its sentence.';
  const commonmark = exportMarkdown(source, 'commonmark');
  const obsidian = exportMarkdown(source, 'obsidian');

  assert.equal(commonmark.markdown, source);
  assert.ok(commonmark.warnings.some(warning => warning.includes('inline footnotes')));
  assert.deepEqual(obsidian.warnings, []);
});

test('YAML frontmatter stays byte-for-byte intact across Markdown conversion', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const frontmatter = [
    '---',
    'title: _A_filename_with_underscores_',
    'tags:',
    '  - ==literal==',
    'description: ~not Wmdx subscript~',
    'heading: "# Metadata, not a heading"',
    '---'
  ].join('\r\n');
  const source = `${frontmatter}\r\n\r\n# Actual heading\r\n`;
  const imported = convertFromMarkdown(source, 'obsidian');
  const expectedWmdx = `${frontmatter}\r\n\r\n.1 Actual heading\r\n`;

  assert.equal(imported.markdown, expectedWmdx);
  assert.ok(imported.warnings.some(warning => warning.includes('frontmatter')));

  const exported = exportMarkdown(imported.markdown, 'commonmark');
  assert.equal(exported.markdown, `${frontmatter}\r\n\r\n# Actual heading\r\n`);
  assert.ok(exported.warnings.some(warning => warning.includes('frontmatter')));

  const obsidianExport = exportMarkdown(imported.markdown, 'obsidian');
  assert.equal(obsidianExport.markdown, `${frontmatter}\r\n\r\n# Actual heading\r\n`);
  assert.deepEqual(obsidianExport.warnings, []);
});

test('Markdown export maps Wmdx headings, links, tables, and callout states by target', async () => {
  const { exportMarkdown } = await import('../src/markdownConversion.mjs');
  const source = [
    '.1 Overview',
    '',
    '[docs/Project.md|Project||]',
    '',
    '| Name | Count |',
    '| --- | ---: |',
    '| Item | 3 |',
    '',
    'A. Alpha item',
    'B. Next alpha item',
    '',
    'I. Roman item',
    'II. Next Roman item',
    '',
    '[x] Complete a task',
    '',
    'H~2~O and ~~removed~~.',
    '',
    '±warning- Read carefully',
    '  This body is folded.'
  ].join('\n');

  const commonmark = exportMarkdown(source, 'commonmark');
  assert.match(commonmark.markdown, /^# Overview/m);
  assert.match(commonmark.markdown, /\[Project\]\(docs\/Project\.md\)/);
  assert.match(commonmark.markdown, /\| Name \| Count \|/);
  assert.match(commonmark.markdown, /1\. Alpha item/);
  assert.match(commonmark.markdown, /2\. Next alpha item/);
  assert.match(commonmark.markdown, /1\. Roman item/);
  assert.match(commonmark.markdown, /2\. Next Roman item/);
  assert.match(commonmark.markdown, /- <input type="checkbox" disabled checked> Complete a task/);
  assert.match(commonmark.markdown, /H<sub>2<\/sub>O and <del>removed<\/del>\./);
  assert.match(commonmark.markdown, /> \*\*Read carefully\*\*/);
  assert.ok(commonmark.warnings.some(warning => warning.includes('Pipe tables')));
  assert.ok(commonmark.warnings.some(warning => warning.includes('alphabetic and Roman')));
  assert.ok(commonmark.warnings.some(warning => warning.includes('CommonMark has no task-list')));
  assert.ok(commonmark.warnings.some(warning => warning.includes('callout')));

  const obsidian = exportMarkdown(source, 'obsidian');
  assert.match(obsidian.markdown, /^\[\[docs\/Project\.md\|Project\]\]/m);
  assert.match(obsidian.markdown, /^- \[x\] Complete a task/m);
  assert.match(obsidian.markdown, /^> \[!warning\]- Read carefully/m);

  const inline = exportMarkdown('`==literal== and _code_` plus ==highlight==, =₁pen=, and _₃wave_.', 'commonmark');
  assert.match(inline.markdown, /`==literal== and _code_`/);
  assert.match(inline.markdown, /<mark>highlight<\/mark>/);
  assert.match(inline.markdown, /pen/);
  assert.doesNotMatch(inline.markdown, /=₁pen=/);
  assert.match(inline.markdown, /<u>wave<\/u>/);
  assert.ok(inline.warnings.some(warning => warning.includes('Colored or styled underline')));
});

test('HTML import converts semantic content and omits active elements', async () => {
  const { JSDOM } = require('jsdom');
  const { convertFromHtml } = await import('../src/markdownConversion.mjs');
  const Parser = new JSDOM('').window.DOMParser;
  const result = convertFromHtml(
    '<h1>Title</h1><p><strong>Bold</strong> and <u>underlined</u> with H<sub>2</sub>O.</p>' +
    '<ul><li>One<ul><li>Nested</li></ul></li><li><input type="checkbox" checked>Done</li></ul>' +
    '<div align="center"><p>Centered</p></div>' +
    '<figure style="text-align:center"><img src="images/photo.png" alt="Photo" width="120" height="60">' +
    '<figcaption>Caption</figcaption></figure>' +
    '<a href="files/notes (1).pdf" download>PDF attachment</a>' +
    '<script>alert(1)</script>',
    Parser
  );
  assert.match(result.markdown, /^\.1 Title/m);
  assert.match(result.markdown, /\*\*Bold\*\*/);
  assert.match(result.markdown, /<u>underlined<\/u>/);
  assert.match(result.markdown, /H~2~O/);
  assert.match(result.markdown, /- One\n  - Nested/);
  assert.match(result.markdown, /- \[x\] Done/);
  assert.match(result.markdown, /^><\nCentered$/m);
  assert.match(result.markdown, /!\[images\/photo\.png\|Caption\|120x60\|><\]/);
  assert.match(
    result.markdown,
    /\[PDF attachment\]\(files\/notes%20\\\(1\\\)\.pdf "wmdx-attachment"\)/
  );
  assert.doesNotMatch(result.markdown, /alert\(1\)/);
  assert.ok(result.warnings.some(warning => warning.includes('script')));
  const comments = convertFromHtml('<p>Text</p><!-- hidden note -->', Parser);
  assert.ok(comments.warnings.some(warning => warning.includes('comments')));
});

test('HTML import preserves ordered-list marker styles, starts, and nested task state', async () => {
  const { JSDOM } = require('jsdom');
  const { convertFromHtml } = await import('../src/markdownConversion.mjs');
  const Parser = new JSDOM('').window.DOMParser;
  const result = convertFromHtml(
    '<ol type="a" start="3"><li>Third</li><li value="7">Seventh</li><li>Next</li></ol>' +
    '<ol type="I" start="4"><li>Fourth</li><li>Fifth</li></ol>' +
    '<ul><li><p><input type="checkbox" checked>Done</p></li></ul>',
    Parser
  );

  assert.match(result.markdown, /^c\. Third\ng\. Seventh\nh\. Next$/m);
  assert.match(result.markdown, /^IV\. Fourth\nV\. Fifth$/m);
  assert.match(result.markdown, /^- \[x\] Done$/m);
  assert.ok(result.warnings.some(warning => warning.includes('Custom ordered-list item values')));
});

test('HTML import preserves list paragraphs and table formatting plus merged-cell markers', async () => {
  const { JSDOM } = require('jsdom');
  const { convertFromHtml } = await import('../src/markdownConversion.mjs');
  const { TableModel } = await import('../src/tableModule.js');
  const Parser = new JSDOM('').window.DOMParser;
  const result = convertFromHtml(
    '<ul><li><p>First paragraph</p><p>Second paragraph</p>' +
    '<ul><li>Nested item</li></ul></li></ul>' +
    '<table><thead><tr><th colspan="2">Summary</th></tr></thead><tbody>' +
    '<tr><td rowspan="2">Keep <strong>rich</strong></td><td><a href="/a">A|B</a></td></tr>' +
    '<tr><td>Second row</td></tr></tbody></table>',
    Parser
  );

  assert.match(result.markdown, /- First paragraph\n\n  Second paragraph\n  - Nested item/);
  assert.match(result.markdown, /\| Summary \| < \|\n\| --- \| --- \|/);
  assert.match(result.markdown, /\| Keep \*\*rich\*\* \| \[A\\\|B\]\(\/a\) \|/);
  assert.match(result.markdown, /\| \^ \| Second row \|/);
  assert.equal(result.warnings.length, 0);

  const tableSource = result.markdown.slice(result.markdown.indexOf('| Summary'));
  const matrix = TableModel.parse(tableSource).getRenderMatrix();
  assert.equal(matrix[0][0].colSpan, 2);
  assert.equal(matrix[1][0].rowSpan, 2);
  assert.equal(matrix[2][0].isCovered, true);
});

test('Markdown import and export process the complete document beyond the preview limit', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const longBody = 'A paragraph that remains part of this complete document.\n\n'.repeat(150);
  const source = `# First heading\n\n${longBody}# Final heading`;

  assert.ok(source.length > 6000);
  for (const dialect of ['commonmark', 'gfm', 'obsidian']) {
    const result = convertFromMarkdown(source, dialect);
    assert.ok(result.markdown.length > 6000, `${dialect} import retains the full source`);
    assert.match(result.markdown, /\.1 Final heading$/, `${dialect} import converts the tail`);
  }

  const exported = exportMarkdown(`.1 First heading\n\n${longBody}.2 Final heading`, 'gfm');
  assert.ok(exported.markdown.length > 6000);
  assert.match(exported.markdown, /^## Final heading$/m);
});
