const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { marked } = require('marked');

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

test('MHTML-imported images, media, and attachments survive conversion to each Markdown flavor', async () => {
  const { convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const dom = new JSDOM('');
  const Parser = dom.window.DOMParser;
  const embeddedResources = {
    'https://example.test/docs/images/pixel.png': 'data:image/png;base64,AQIDBA==',
    'https://example.test/docs/audio/voice.ogg': 'data:audio/ogg;base64,BAUG',
    'https://example.test/docs/video/clip.mp4': 'data:video/mp4;base64,BwgJ',
    'https://example.test/docs/files/manual.pdf': 'data:application/pdf;base64,CgsM'
  };
  const imported = convertFromHtml(
    '<h1>Archive</h1><img src="images/pixel.png">' +
      '<audio controls src="audio/voice.ogg"></audio>' +
      '<video controls src="video/clip.mp4"></video>' +
      '<a href="files/manual.pdf" download>Manual PDF</a>',
    Parser,
    {
      baseLocation: 'https://example.test/docs/page.html',
      embeddedResources
    }
  );
  assert.deepEqual(imported.warnings, []);
  assert.match(imported.markdown, /\|pixel\.png\|\|/);
  assert.match(imported.markdown, /\[voice\.ogg\]\(data:audio\/ogg/);
  assert.match(imported.markdown, /\[clip\.mp4\]\(data:video\/mp4/);
  assert.match(imported.markdown, /\[Manual PDF\]\(data:application\/pdf/);

  for (const profile of ['commonmark', 'gfm', 'obsidian']) {
    const exported = exportMarkdown(imported.markdown, profile);
    const rendered = renderMarkdownHtml(exported.markdown, {
      profile,
      window: dom.window
    });
    const output = new Parser().parseFromString(rendered.html, 'text/html');
    assert.equal(output.querySelector('img')?.getAttribute('src'), embeddedResources[
      'https://example.test/docs/images/pixel.png'
    ], `${profile} image data`);
    assert.equal(output.querySelector('audio')?.getAttribute('src'), embeddedResources[
      'https://example.test/docs/audio/voice.ogg'
    ], `${profile} audio data`);
    assert.equal(output.querySelector('video')?.getAttribute('src'), embeddedResources[
      'https://example.test/docs/video/clip.mp4'
    ], `${profile} video data`);
    assert.equal(output.querySelector('a[title="wmdx-attachment"]')?.getAttribute('href'), embeddedResources[
      'https://example.test/docs/files/manual.pdf'
    ], `${profile} attachment data`);
    assert.equal(
      rendered.warnings.some(warning => warning.includes('local export resource could not be embedded')),
      false,
      `${profile} reported a missing MHTML resource`
    );
  }
});

test('shared Markdown semantics survive all nine CommonMark, GFM, and Obsidian conversions', async () => {
  const { convertFromMarkdown, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const profiles = ['commonmark', 'gfm', 'obsidian'];
  const source = [
    '# Shared syntax',
    '',
    'A **bold** and *italic* [link](https://example.test) with `code`.',
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

test('shared Markdown content survives each flavor → HTML → each target-flavor round trip', async () => {
  const { convertFromMarkdown, convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const profiles = ['commonmark', 'gfm', 'obsidian'];
  const source = [
    '# Round-trip audit',
    '',
    'A **bold** and *italic* [link](https://example.test) with `code`.',
    '',
    '- first item',
    '- second item',
    '',
    '> A quoted paragraph.'
  ].join('\n');
  const dom = new JSDOM('');
  const Parser = dom.window.DOMParser;
  const expected = canonicalizeHtml(renderCommonMark(source), dom.window.document);

  for (const sourceProfile of profiles) {
    const imported = convertFromMarkdown(source, sourceProfile);
    const html = renderMarkdownHtml(imported.markdown, {
      profile: 'wmdx',
      window: dom.window
    });
    const returned = convertFromHtml(html.html, Parser);

    assert.deepEqual(imported.warnings, [], `${sourceProfile} import warnings`);
    assert.deepEqual(html.warnings, [], `${sourceProfile} HTML export warnings`);
    assert.deepEqual(returned.warnings, [], `${sourceProfile} HTML re-import warnings`);

    for (const targetProfile of profiles) {
      const exported = exportMarkdown(returned.markdown, targetProfile);
      const targetHtml = renderMarkdownHtml(exported.markdown, {
        profile: targetProfile,
        window: dom.window
      });
      assert.deepEqual(exported.warnings, [], `${sourceProfile} → ${targetProfile} warnings`);
      assert.deepEqual(
        canonicalizeHtml(targetHtml.html, dom.window.document),
        expected,
        `${sourceProfile} → HTML → ${targetProfile} changed shared rendered meaning`
      );
    }
  }
});

test('GFM tasks, strike, and aligned tables survive HTML and Markdown round trips', async () => {
  const { convertFromMarkdown, convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const source = [
    '# GFM round trip',
    '',
    '- [x] Complete',
    '- [ ] Pending',
    '',
    '~~removed~~',
    '',
    '| Left | Right |',
    '| :--- | ---: |',
    '| A | 2 |'
  ].join('\n');
  const dom = new JSDOM('');
  const Parser = dom.window.DOMParser;
  const expected = canonicalizeHtml(marked.parse(source), dom.window.document);
  const imported = convertFromMarkdown(source, 'gfm');
  const html = renderMarkdownHtml(imported.markdown, {
    profile: 'wmdx',
    window: dom.window
  });
  const returned = convertFromHtml(html.html, Parser);

  assert.deepEqual(imported.warnings, []);
  assert.deepEqual(html.warnings, []);
  assert.deepEqual(returned.warnings, []);
  assert.match(returned.markdown, /\| :--- \| ---: \|/);

  const exported = exportMarkdown(returned.markdown, 'gfm');
  const finalHtml = renderMarkdownHtml(exported.markdown, {
    profile: 'gfm',
    window: dom.window
  });
  assert.deepEqual(exported.warnings, []);
  assert.deepEqual(
    canonicalizeHtml(finalHtml.html, dom.window.document),
    expected,
    'GFM task state, strike, or table alignment changed in the round trip'
  );

  const commonMark = exportMarkdown(returned.markdown, 'commonmark');
  assert.ok(commonMark.warnings.some(warning => warning.includes('Pipe tables')));
  assert.ok(commonMark.warnings.some(warning => warning.includes('task-list')));
  const commonMarkHtml = renderMarkdownHtml(commonMark.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const commonMarkDocument = new Parser().parseFromString(commonMarkHtml.html, 'text/html');
  assert.deepEqual(
    Array.from(commonMarkDocument.querySelectorAll('input[type="checkbox"]'))
      .map(input => input.checked),
    [true, false],
    'CommonMark export should preserve GFM checkbox state with disabled HTML inputs'
  );
});

test('Obsidian callout, wikilink, highlight, and footnote survive HTML round trip', async () => {
  const { convertFromMarkdown, convertFromHtml, exportMarkdown } =
    await import('../src/markdownConversion.mjs');
  const { renderMarkdownHtml } = await import('../src/htmlExport.mjs');
  const source = [
    '[[Project Notes#Setup|Read this]]',
    '',
    '> [!warning]- Attention',
    '> Be careful.',
    '',
    '==highlight==',
    '',
    'This has a footnote.[^source]',
    '',
    '[^source]: Definition.'
  ].join('\n');
  const dom = new JSDOM('');
  const Parser = dom.window.DOMParser;
  const imported = convertFromMarkdown(source, 'obsidian');
  const html = renderMarkdownHtml(imported.markdown, {
    profile: 'obsidian',
    window: dom.window
  });
  const returned = convertFromHtml(html.html, Parser);

  assert.deepEqual(imported.warnings, []);
  assert.deepEqual(html.warnings, []);
  assert.deepEqual(returned.warnings, []);
  assert.match(html.html, /data-wmdx-kind="wikilink"/);
  assert.match(html.html, /wmdx-callout-warning/);
  assert.match(returned.markdown, /^\[Project Notes#Setup\|Read this\|\|\]$/m);
  assert.match(returned.markdown, /^±warning- \*\*Attention\*\*$/m);
  assert.match(returned.markdown, /==highlight==/);
  assert.match(returned.markdown, /\[\^1\]: Definition\./);

  const obsidian = exportMarkdown(returned.markdown, 'obsidian');
  assert.deepEqual(obsidian.warnings, []);
  assert.match(obsidian.markdown, /^\[\[Project Notes#Setup\|Read this\]\]$/m);
  assert.match(obsidian.markdown, /^> \[!warning\]- \*\*Attention\*\*$/m);
  assert.match(obsidian.markdown, /^\[\^1\]: Definition\.$/m);

  const commonMark = exportMarkdown(returned.markdown, 'commonmark');
  assert.ok(commonMark.warnings.some(warning => warning.includes('callout')));
  assert.ok(commonMark.warnings.some(warning => warning.includes('footnote')));
  assert.match(commonMark.markdown, /\[\^1\]: Definition\./);
  assert.match(commonMark.markdown, /Definition\./);
});

test('MHTML TOC HTML imports into the selected Markdown flavor', async () => {
  const { convertHtmlToMarkdownProfile } = await import('../src/markdownPaste.mjs');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('');
  const root = 'https://appassets.androidplatform.net/assets/www/';
  const html = [
    '<nav><a href="https://appassets.androidplatform.net/assets/www/#heading-1">Project setup</a></nav>',
    '<h1 id="heading-1">Project Setup</h1>',
    '<p><a href="https://outside.example/#heading-1">External reference</a></p>'
  ].join('');

  const expected = {
    wmdx: /^\[#Project Setup\|Project setup\|\|\]$/m,
    commonmark: /\[Project setup\]\(#project-setup\)/,
    gfm: /\[Project setup\]\(#project-setup\)/,
    obsidian: /^\[\[#Project Setup\|Project setup\]\]$/m
  };

  for (const profile of ['wmdx', 'commonmark', 'gfm', 'obsidian']) {
    const converted = convertHtmlToMarkdownProfile(
      html,
      profile,
      dom.window.DOMParser,
      { baseLocation: root }
    );
    assert.deepEqual(converted.warnings, [], `${profile} warnings`);
    assert.match(converted.markdown, expected[profile], `${profile} TOC syntax`);
    assert.match(
      converted.markdown,
      /\[External reference\]\(https:\/\/outside\.example\/#heading-1\)/,
      `${profile} must leave a real external destination intact`
    );
    assert.doesNotMatch(
      converted.markdown,
      /appassets\.androidplatform\.net/,
      `${profile} must not leak the MHTML archive base into Markdown`
    );
  }
});
