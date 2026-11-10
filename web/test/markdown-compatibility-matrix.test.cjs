const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const { Parser: CommonMarkParser, HtmlRenderer } = require('commonmark');

function canonicalizeHtml(html, document) {
  const template = document.createElement('template');
  template.innerHTML = html;

  const serialize = node => {
    if (node.nodeType === 3) {
      const value = node.nodeValue.replace(/\s+/g, ' ');
      return value ? ['text', value] : null;
    }
    if (node.nodeType !== 1) return null;

    const tag = node.tagName.toLowerCase();
    const attributes = [...node.attributes]
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

  return JSON.stringify(
    [...template.content.childNodes]
      .map(serialize)
      .filter(child => child && !(child[0] === 'text' && !child[1].trim()))
  );
}

function renderCommonMark(markdown) {
  const parser = new CommonMarkParser();
  const renderer = new HtmlRenderer();
  return renderer.render(parser.parse(markdown));
}

test('HTML import → Wmdx → CommonMark export preserves rendered document meaning', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const document = new JSDOM('').window.document;
  const Parser = document.defaultView.DOMParser;
  const sourceHtml =
    '<h1>Guide</h1>' +
    '<p>Start with <strong>bold</strong> and a ' +
    '<a href="https://example.test/guide">link</a>.</p>' +
    '<ul><li>First</li><li>Second</li></ul>' +
    '<blockquote><p>A quoted paragraph.</p></blockquote>';

  const imported = convertFromHtml(sourceHtml, Parser);
  const exported = exportMarkdown(imported.markdown, 'commonmark');

  assert.deepEqual(imported.warnings, []);
  assert.deepEqual(exported.warnings, []);
  assert.equal(
    canonicalizeHtml(renderCommonMark(exported.markdown), document),
    canonicalizeHtml(sourceHtml, document),
    'HTML source, converted Markdown, and exported HTML have equivalent semantics'
  );
});

test('GFM import → Wmdx → GFM export preserves table, task, and strike syntax', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = [
    '# Status',
    '',
    '- [x] Done',
    '',
    '~~removed~~',
    '',
    '| Name | Count |',
    '| --- | ---: |',
    '| Item | 3 |'
  ].join('\n');

  const imported = convertFromMarkdown(source, 'gfm');
  const exported = exportMarkdown(imported.markdown, 'gfm');

  assert.deepEqual(imported.warnings, []);
  assert.deepEqual(exported.warnings, []);
  assert.equal(exported.markdown.trim(), source);
});

test('Obsidian import → Wmdx → Obsidian export retains curated native syntax', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const source = [
    '## Notes',
    '',
    '[[Project|Read]]',
    '',
    '> [!note] Details',
    '> Body **bold**',
    '',
    '==highlight=='
  ].join('\n');

  const imported = convertFromMarkdown(source, 'obsidian');
  const exported = exportMarkdown(imported.markdown, 'obsidian');

  assert.deepEqual(imported.warnings, []);
  assert.deepEqual(exported.warnings, []);
  assert.match(exported.markdown, /^## Notes$/m);
  assert.match(exported.markdown, /^\[\[Project\|Read\]\]$/m);
  assert.match(exported.markdown, /^> \[!note\] Details$/m);
  assert.match(exported.markdown, /^> Body \*\*bold\*\*$/m);
  assert.match(exported.markdown, /^==highlight==$/m);
});

test('HTML import to GFM processes the complete document including its tail', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const document = new JSDOM('').window.document;
  const Parser = document.defaultView.DOMParser;
  const repeated = '<p>Complete body content remains available.</p>'.repeat(180);
  const html = '<h1>Start</h1>' + repeated +
    '<ul><li><input type="checkbox" checked>Finished</li></ul>' +
    '<table><tr><th>Name</th><th>Count</th></tr><tr><td>Tail item</td><td>3</td></tr></table>' +
    '<h2>Final heading marker</h2>';

  assert.ok(html.length > 6_000);
  const imported = convertFromHtml(html, Parser);
  const exported = exportMarkdown(imported.markdown, 'gfm');

  assert.deepEqual(imported.warnings, []);
  assert.deepEqual(exported.warnings, []);
  assert.ok(exported.markdown.length > 6_000);
  assert.match(exported.markdown, /- \[x\] Finished/);
  assert.match(exported.markdown, /\| Tail item \| 3 \|/);
  assert.match(exported.markdown, /^## Final heading marker$/m);
});

test('MHTML related resources become self-contained embeds during HTML conversion', async () => {
  const { convertFromHtml } = await import('../src/markdownConversion.mjs');
  const document = new JSDOM('').window.document;
  const Parser = document.defaultView.DOMParser;
  const image = 'data:image/png;base64,AQIDBA==';
  const imported = convertFromHtml(
    '<h1>Archive</h1><p>Saved page.</p><img src="images/pixel.png" alt="Pixel">' +
      '<audio controls src="cid:voice"></audio>',
    Parser,
    {
      baseLocation: 'https://example.test/docs/page.html',
      embeddedResources: {
        'https://example.test/docs/images/pixel.png': image,
        'cid:voice': 'data:audio/ogg;base64,BAUG'
      }
    }
  );

  assert.deepEqual(imported.warnings, []);
  assert.match(imported.markdown, /data:image\/png;base64,AQIDBA==/);
  assert.match(imported.markdown, /data:audio\/ogg;base64,BAUG/);
});

test('MHTML resource handles load embedded bytes lazily and only once per part', async () => {
  const { convertFromHtml } = await import('../src/markdownConversion.mjs');
  const document = new JSDOM('').window.document;
  const Parser = document.defaultView.DOMParser;
  const image = 'data:image/png;base64,AQIDBA==';
  const resourceLoads = [];
  const imported = convertFromHtml(
    '<img src="images/pixel.png" alt="First">' +
      '<img src="images/pixel.png" alt="Second">',
    Parser,
    {
      baseLocation: 'https://example.test/docs/page.html',
      embeddedResources: {
        'https://example.test/docs/images/pixel.png': 'resource-1'
      },
      resolveEmbeddedResource: resourceId => {
        resourceLoads.push(resourceId);
        return image;
      }
    }
  );

  assert.deepEqual(imported.warnings, []);
  assert.equal(resourceLoads.length, 1);
  assert.equal(resourceLoads[0], 'resource-1');
  assert.equal((imported.markdown.match(/data:image\/png;base64,AQIDBA==/g) || []).length, 2);
});

test('shared Markdown semantics survive all nine CommonMark, GFM, and Obsidian conversions', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const profiles = ['commonmark', 'gfm', 'obsidian'];
  const source = [
    '# Shared syntax',
    '',
    'A **bold** and *italic* [link](https://example.test "title") with `code`.',
    '',
    '- first item',
    '- second item',
    '',
    '> A quoted paragraph.'
  ].join('\n');
  const document = new JSDOM('').window.document;
  const expected = canonicalizeHtml(renderCommonMark(source), document);

  for (const sourceProfile of profiles) {
    for (const targetProfile of profiles) {
      const imported = convertFromMarkdown(source, sourceProfile);
      const exported = exportMarkdown(imported.markdown, targetProfile);
      const reimported = convertFromMarkdown(exported.markdown, targetProfile);
      const normalized = exportMarkdown(reimported.markdown, 'commonmark');

      assert.deepEqual(imported.warnings, [], `${sourceProfile} import warnings`);
      assert.deepEqual(exported.warnings, [], `${sourceProfile} → ${targetProfile} warnings`);
      assert.deepEqual(reimported.warnings, [], `${targetProfile} re-import warnings`);
      assert.deepEqual(
        canonicalizeHtml(renderCommonMark(normalized.markdown), document),
        expected,
        `${sourceProfile} → Wmdx → ${targetProfile} → Wmdx changed shared Markdown meaning`
      );
    }
  }
});
