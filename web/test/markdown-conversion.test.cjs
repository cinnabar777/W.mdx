const test = require('node:test');
const assert = require('node:assert/strict');

test('CommonMark import converts headings and ordinary links without touching code', async () => {
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
  assert.match(result.markdown, /\[docs\/Project%20Notes\.md\|Project\|\|\]/);
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
    '<a href="files/notes.pdf" download>PDF attachment</a>' +
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
  assert.match(result.markdown, /\[PDF attachment\]\(files\/notes\.pdf "wmdx-attachment"\)/);
  assert.doesNotMatch(result.markdown, /alert\(1\)/);
  assert.ok(result.warnings.some(warning => warning.includes('script')));
  const comments = convertFromHtml('<p>Text</p><!-- hidden note -->', Parser);
  assert.ok(comments.warnings.some(warning => warning.includes('comments')));
});
