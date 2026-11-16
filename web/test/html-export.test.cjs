const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { convertFromHtml, exportMarkdown } = require('../src/markdownConversion.mjs');
const { renderMarkdownHtml } = require('../src/htmlExport.mjs');

function render(source, profile = 'wmdx') {
  const dom = new JSDOM('');
  return {
    dom,
    result: renderMarkdownHtml(source, { profile, window: dom.window })
  };
}

test('HTML export renders Wmdx structures as semantic, complete document HTML', () => {
  const tail = 'final document marker';
  const source = [
    '.2 Export heading',
    'Alpha **bold** omega and ==highlighted==.',
    '',
    '[x] Checked item',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| A | B |',
    '',
    '±tip+ Quick note',
    '  Callout body.',
    '',
    `<audio controls src="data:audio/ogg;base64,BAUG"></audio>`,
    '',
    `${'Long content. '.repeat(550)}${tail}`
  ].join('\n');
  const { dom, result } = render(source);
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(result.warnings.length, 0);
  assert.equal(document.querySelector('h2')?.textContent, 'Export heading');
  assert.equal(document.querySelector('p strong')?.textContent, 'bold');
  assert.equal(document.querySelector('mark')?.textContent, 'highlighted');
  assert.equal(document.querySelector('table tbody tr td')?.textContent, 'A');
  assert.equal(document.querySelector('input[type="checkbox"]')?.checked, true);
  assert.equal(document.querySelector('details.wmdx-callout')?.open, true);
  assert.equal(document.querySelector('.wmdx-callout-body')?.textContent.trim(), 'Callout body.');
  assert.ok(document.querySelector('audio[src="data:audio/ogg;base64,BAUG"]'));
  assert.ok(result.html.includes(tail));
  assert.doesNotMatch(result.html, /cm-content|cm-line|cm-editor/);
});

test('HTML export converts Obsidian links and folded callouts to readable HTML', () => {
  const source = [
    '# Notes',
    'Read [[Guide|the guide]].',
    '',
    '> [!warning]- Important',
    '> Keep this collapsed.'
  ].join('\n');
  const { dom, result } = render(source, 'obsidian');
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(document.querySelector('a')?.textContent, 'the guide');
  assert.equal(document.querySelector('details.wmdx-callout')?.open, false);
  assert.equal(document.querySelector('.wmdx-callout-title')?.textContent, 'Important');
  assert.match(document.body.textContent, /Keep this collapsed/);
});

test('Obsidian math delimiters stay literal instead of becoming Markdown emphasis', () => {
  const source = [
    '**OTHER OPTIONS**',
    '',
    '100m$_2$ = 100m$_2$',
    '100m$^2$ = 100m $^2$',
    '_`H$_2$O`_ = H $*2$ O',
    'Word$^{label}$ = Word$^{label}$',
    'Word$_{label}$ = Word$_{label}$'
  ].join('\n');
  const { dom, result } = render(source, 'obsidian');
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
  const paragraph = document.querySelectorAll('p')[1];

  assert.equal(
    paragraph.textContent,
    [
      '100m$_2$ = 100m$_2$',
      '100m$^2$ = 100m $^2$',
      'H$_2$O = H $*2$ O',
      'Word$^{label}$ = Word$^{label}$',
      'Word$_{label}$ = Word$_{label}$'
    ].join('\n')
  );
  assert.equal(paragraph.querySelectorAll('em').length, 1);
  assert.equal(paragraph.querySelector('em code')?.textContent, 'H$_2$O');

  const imported = convertFromHtml(result.html, dom.window.DOMParser);
  const exported = exportMarkdown(imported.markdown, 'obsidian');
  const returned = renderMarkdownHtml(exported.markdown, {
    profile: 'obsidian',
    window: dom.window
  });
  const returnedDocument = new dom.window.DOMParser()
    .parseFromString(returned.html, 'text/html');
  const returnedParagraph = returnedDocument.querySelectorAll('p')[1];

  assert.match(imported.markdown, /100m\$_2\$ \\?= 100m\$_2\$/);
  assert.match(imported.markdown, /100m\$\\?\^2\$ = 100m \$\\?\^2\$/);
  assert.equal(returnedParagraph.textContent, paragraph.textContent);
  assert.equal(returnedParagraph.querySelectorAll('em').length, 1);
});

test('strict CommonMark HTML export preserves tables using valid raw HTML', () => {
  const { dom, result } = render(
    '| A | B |\n| --- | --- |\n| 1 | 2 |',
    'commonmark'
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(document.querySelector('table tbody tr td')?.textContent, '1');
  assert.equal(document.querySelector('table thead tr th')?.textContent, 'A');
  assert.deepEqual(result.warnings, []);
});

test('HTML export keeps script markup inert and removes event-handler attributes', () => {
  const { dom, result } = render(
    '<script>window.compromised = true</script>\n' +
    '<img src="https://example.test/pixel.png" onerror="alert(1)">'
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(document.querySelector('script'), null);
  assert.equal(document.querySelector('[onerror]'), null);
  assert.match(document.body.textContent, /<script>window\.compromised = true<\/script>/);
  assert.equal(document.querySelector('img')?.getAttribute('src'), 'https://example.test/pixel.png');
});

test('GFM HTML export applies the specification tagfilter to raw HTML', () => {
  for (const tag of [
    'title', 'textarea', 'style', 'xmp', 'iframe',
    'noembed', 'noframes', 'script', 'plaintext'
  ]) {
    const { dom, result } = render(`<${tag}>filtered</${tag}>`, 'gfm');
    const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
    assert.equal(document.querySelector(tag), null, `${tag} must not become an active element`);
    assert.ok(
      document.body.textContent.includes(`<${tag}>filtered</${tag}>`),
      `${tag} remains visible as escaped source`
    );
  }

  const { dom, result } = render('```html\n<script>literal code</script>\n```', 'gfm');
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
  assert.match(document.querySelector('pre code')?.textContent ?? '', /<script>literal code<\/script>/);
});

test('HTML export preserves safe embedded document attachments but rejects active data links', () => {
  const { dom, result } = render(
    '[PDF](data:application/pdf;base64,AQID "wmdx-attachment")\n\n' +
      '[Unsafe](data:text/html;base64,PGgxPk5vPC9oMT4=)'
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
  const pdf = document.querySelector('a');
  const unsafe = [...document.querySelectorAll('a')].find(link =>
    link.textContent === 'Unsafe'
  );

  assert.equal(pdf?.getAttribute('href'), 'data:application/pdf;base64,AQID');
  assert.equal(unsafe?.hasAttribute('href'), false);
});

test('Obsidian wiki-link annotation does not replace embedded attachment URLs', () => {
  const dom = new JSDOM('');
  const dataUri = 'data:application/pdf;base64,AQID';
  const result = renderMarkdownHtml('![[Document.pdf]]', {
    profile: 'obsidian',
    window: dom.window,
    resolveAssetDataUri: reference =>
      reference === 'Document.pdf' ? dataUri : null
  });
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
  const attachment = document.querySelector('a');

  assert.equal(attachment?.getAttribute('href'), dataUri);
  assert.equal(attachment?.getAttribute('title'), 'wmdx-attachment');
  assert.notEqual(attachment?.getAttribute('data-wmdx-kind'), 'wikilink');
  const imported = convertFromHtml(result.html, dom.window.DOMParser);
  assert.match(
    imported.markdown,
    /\(data:application\/pdf;base64,AQID "wmdx-attachment"\)/
  );
});

test('HTML export preserves Obsidian open links without allowing arbitrary app schemes', () => {
  const { dom, result } = render(
    '[Note](obsidian://open?vault=MainVault&file=Note.md)\n\n' +
      '[Unsafe](custom-app://launch?target=external)',
    'obsidian'
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
  const links = [...document.querySelectorAll('a')];

  assert.equal(
    links.find(link => link.textContent === 'Note')?.getAttribute('href'),
    'obsidian://open?vault=MainVault&file=Note.md'
  );
  assert.equal(
    links.find(link => link.textContent === 'Unsafe')?.hasAttribute('href'),
    false
  );
});

test('Raw HTML keeps safe raster data images and rejects active MIME data', () => {
  const { dom, result } = render(
    '<figure><img alt="Safe image" src="data:image/png;base64,AQIDBA=="></figure>\n\n' +
      '<img alt="Unsafe image" src="data:text/html;base64,PGgxPk5vPC9oMT4=">'
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
  const images = [...document.querySelectorAll('img')];

  assert.equal(images[0]?.getAttribute('src'), 'data:image/png;base64,AQIDBA==');
  assert.equal(images[1]?.hasAttribute('src'), false);
});

test('HTML export embeds app-local resources and reports resources it cannot inline', () => {
  const dom = new JSDOM('');
  const image = 'data:image/png;base64,AQIDBA==';
  const result = renderMarkdownHtml(
    '<img src="assets/pixel.png" alt="Pixel"><audio controls src="assets/voice.ogg"></audio>',
    {
      window: dom.window,
      resolveAssetDataUri: reference =>
        reference === 'assets/pixel.png' ? image : ''
    }
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(document.querySelector('img')?.getAttribute('src'), image);
  assert.ok(result.warnings.some(warning => warning.includes('assets/voice.ogg')));
});

test('MHTML-imported data URI images remain images in semantic HTML export', () => {
  const dom = new JSDOM('');
  const source = convertFromHtml(
    '<img src="data:image/png;base64,AQIDBA==" alt="Pixel">',
    dom.window.DOMParser
  ).markdown;
  const result = renderMarkdownHtml(source, { window: dom.window });
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(
    document.querySelector('img')?.getAttribute('src'),
    'data:image/png;base64,AQIDBA=='
  );
  assert.equal(document.querySelector('img')?.getAttribute('alt'), 'Pixel');
});

test('HTML import preserves an empty Markdown image destination', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<p>Before</p><img src="" alt=""><p>After</p>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'commonmark');

  assert.match(imported.markdown, /!\[\]\(\)/);
  assert.match(exported.markdown, /!\[\]\(\)/);
});

test('HTML import preserves an empty Markdown link destination', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<p><a href=""></a></p>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'commonmark');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');

  assert.equal(imported.markdown, '[]()');
  assert.equal(document.querySelector('a')?.getAttribute('href'), '');
});

test('HTML import preserves keyboard-key semantics through Markdown export', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<p>Press <kbd>Ctrl</kbd> + <kbd>S</kbd>.</p>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'commonmark');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');

  assert.deepEqual(
    [...document.querySelectorAll('kbd')].map(key => key.textContent),
    ['Ctrl', 'S']
  );
});

test('HTML import escapes underscore runs that collide with Wmdx underline syntax', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<p>Empty-looking delimiters: **** and ____</p>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'commonmark');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');

  assert.match(imported.markdown, /\\_\\_\\_\\_/);
  assert.equal(
    document.querySelector('p')?.textContent,
    'Empty-looking delimiters: **** and ____'
  );
});

test('Markdown image tooltip titles survive the semantic HTML round trip', () => {
  const dom = new JSDOM('');
  const before = renderMarkdownHtml(
    '![Remote image](https://example.test/photo.png "Remote image title")',
    { profile: 'commonmark', window: dom.window }
  );
  const imported = convertFromHtml(before.html, dom.window.DOMParser);
  const exported = exportMarkdown(imported.markdown, 'commonmark');
  const after = renderMarkdownHtml(exported.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(after.html, 'text/html');

  assert.equal(
    document.querySelector('p > img')?.getAttribute('title'),
    'Remote image title'
  );
});

test('HTML image dimensions do not turn alternative text into a visible caption', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<img src="https://example.test/photo.png" alt="Accessible description" width="320" height="168">',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'commonmark');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
  const image = document.querySelector('img');

  assert.equal(image?.getAttribute('alt'), 'Accessible description');
  assert.equal(image?.getAttribute('width'), '320');
  assert.equal(image?.getAttribute('height'), '168');
  assert.equal(document.querySelector('figcaption'), null);
});

test('HTML-imported list links stay inline and keep each list item intact', async () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<ol><li>First <a href="#first">link</a></li>' +
      '<li>Second <a href="#second">link</a></li></ol>',
    dom.window.DOMParser
  );

  assert.equal(
    imported.markdown,
    '1. First [link](#first)\n2. Second [link](#second)'
  );
  for (const profile of ['commonmark', 'gfm', 'obsidian']) {
    const exported = exportMarkdown(imported.markdown, profile);
    const rendered = renderMarkdownHtml(exported.markdown, {
      profile,
      window: dom.window
    });
    const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
    const items = [...document.querySelectorAll('ol > li')];

    assert.deepEqual(exported.warnings, [], `${profile} export warnings`);
    assert.equal(items.length, 2, `${profile} list item count`);
    assert.equal(items[0].textContent.replace(/\s+/g, ' ').trim(), 'First link');
    assert.equal(items[1].textContent.replace(/\s+/g, ' ').trim(), 'Second link');
    assert.equal(items[0].querySelector('a')?.getAttribute('href'), '#first');
    assert.equal(items[1].querySelector('a')?.getAttribute('href'), '#second');
  }
});

test('HTML import keeps adjacent unordered list blocks distinct', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<ul><li>First list</li></ul><ul><li>Second list</li></ul>',
    dom.window.DOMParser
  );
  const markers = imported.markdown.match(/^[*+-]\s/gm) ?? [];

  assert.equal(markers.length, 2);
  assert.notEqual(markers[0][0], markers[1][0]);
  for (const profile of ['commonmark', 'gfm', 'obsidian']) {
    const exported = exportMarkdown(imported.markdown, profile);
    const rendered = renderMarkdownHtml(exported.markdown, {
      profile,
      window: dom.window
    });
    const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');

    assert.equal(document.querySelectorAll('ul').length, 2, `${profile} list block count`);
    assert.equal(document.querySelectorAll('ul > li').length, 2, `${profile} list item count`);
  }
});

test('HTML import keeps nested list items tight when the source is tight', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<ul><li>Item 1<ol><li>Hello</li><li>World</li></ol></li></ul>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'gfm');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'gfm',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
  const parentItem = [...document.querySelectorAll('li')]
    .find(item => item.textContent.includes('Hello') && item.textContent.includes('World'));

  assert.equal(parentItem?.querySelector(':scope > p'), null);
  assert.equal(parentItem?.querySelectorAll(':scope > ol > li').length, 2);
});

test('HTML import indents nested lists to each ordered or task marker content column', () => {
  const dom = new JSDOM('');
  const cases = [
    {
      html: '<ol start="2"><li>Parent<ol><li>Child</li></ol></li></ol>',
      expected: /^2\. Parent\n   1\. Child$/m
    },
    {
      html: '<ul><li><input type="checkbox">Task<ul><li>Child</li></ul></li></ul>',
      expected: /^- \[ \] Task\n  [*+-] Child$/m
    }
  ];

  for (const { html, expected } of cases) {
    const imported = convertFromHtml(html, dom.window.DOMParser);
    assert.match(imported.markdown, expected);
    const exported = exportMarkdown(imported.markdown, 'gfm');
    const rendered = renderMarkdownHtml(exported.markdown, {
      profile: 'gfm',
      window: dom.window
    });
    const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');

    assert.equal(document.querySelectorAll('li > ol > li').length +
      document.querySelectorAll('li > ul > li').length, 1);
  }
});

test('HTML import keeps lists inside nested blockquotes as lists, not code', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<blockquote><blockquote><ul><li>Nested quote list</li>' +
      '<li>Second item</li></ul></blockquote></blockquote>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'commonmark');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');

  assert.match(imported.markdown, /^> > [*+-] Nested quote list$/m);
  assert.equal(document.querySelectorAll('blockquote blockquote ul > li').length, 2);
  assert.equal(document.querySelector('blockquote blockquote pre'), null);
});

test('HTML import keeps loose-list paragraphs in the list structure', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<ul><li><p>First item</p></li>' +
      '<li><p>Second item</p><p>Continuation paragraph</p></li></ul>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'commonmark');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'commonmark',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
  const list = document.querySelector('ul');

  assert.equal(list?.querySelectorAll(':scope > li > p').length, 3);
  assert.equal(list?.querySelectorAll(':scope > li').length, 2);
});

test('HTML import preserves pipe characters inside code spans in table cells', () => {
  const dom = new JSDOM('');
  const imported = convertFromHtml(
    '<table><thead><tr><th>Value</th></tr></thead>' +
      '<tbody><tr><td><code>A | B</code></td></tr></tbody></table>',
    dom.window.DOMParser
  );
  const exported = exportMarkdown(imported.markdown, 'gfm');
  const rendered = renderMarkdownHtml(exported.markdown, {
    profile: 'gfm',
    window: dom.window
  });
  const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');

  assert.equal(document.querySelector('td code')?.textContent, 'A | B');
  assert.equal(document.querySelectorAll('table tr').length, 2);
});

test('HTML text alignment survives Markdown export without becoming a blockquote', () => {
  const dom = new JSDOM('');
  for (const alignment of ['left', 'center', 'right', 'justify']) {
    const imported = convertFromHtml(
      `<div align="${alignment}">Centered <strong>text</strong></div>`,
      dom.window.DOMParser
    );

    for (const profile of ['commonmark', 'gfm', 'obsidian']) {
      const exported = exportMarkdown(imported.markdown, profile);
      const rendered = renderMarkdownHtml(exported.markdown, {
        profile,
        window: dom.window
      });
      const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
      const aligned = document.querySelector(`div[align="${alignment}"]`);

      assert.ok(aligned, `${profile} ${alignment} alignment wrapper`);
      assert.equal(aligned.textContent.replace(/\s+/g, ' ').trim(), 'Centered text');
      assert.ok(aligned.querySelector('strong'));
      assert.equal(document.querySelector('blockquote'), null);
    }
  }
});

test('HTML details retain summary content and open state across Markdown flavors', () => {
  const dom = new JSDOM('');
  for (const open of [false, true]) {
    const source = `<details${open ? ' open' : ''}>` +
      '<summary>More <strong>details</strong></summary>' +
      '<p>Hidden body with <em>formatting</em>.</p></details>';
    const imported = convertFromHtml(source, dom.window.DOMParser);

    for (const profile of ['commonmark', 'gfm', 'obsidian']) {
      const exported = exportMarkdown(imported.markdown, profile);
      const rendered = renderMarkdownHtml(exported.markdown, {
        profile,
        window: dom.window
      });
      const document = new dom.window.DOMParser().parseFromString(rendered.html, 'text/html');
      const details = document.querySelector('details');

      assert.ok(details, `${profile} details element`);
      assert.equal(details.hasAttribute('open'), open, `${profile} expanded state`);
      assert.equal(details.querySelector('summary')?.textContent.replace(/\s+/g, ' ').trim(),
        'More details');
      assert.ok(details.querySelector('summary strong'));
      assert.equal(details.querySelector('em')?.textContent, 'formatting');
    }
  }
});

test('HTML-imported audio and video references export as playable media elements', () => {
  const dom = new JSDOM('');
  const source = convertFromHtml(
    '<audio controls src="data:audio/ogg;base64,BAUG" aria-label="Voice"></audio>' +
      '<video controls src="data:video/mp4;base64,AQID" aria-label="Clip"></video>',
    dom.window.DOMParser
  ).markdown;
  const result = renderMarkdownHtml(source, { window: dom.window });
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.ok(document.querySelector('audio[controls][src="data:audio/ogg;base64,BAUG"]'));
  assert.ok(document.querySelector('video[controls][src="data:video/mp4;base64,AQID"]'));
});

test('HTML export renders Markdown, Wmdx, and Obsidian footnotes without touching code', () => {
  const source = [
    'A numbered reference[^a] and a reuse[^a].',
    'An inline note^[Inline **detail**].',
    'A native note^.',
    '',
    '[^a]: Definition **body**.',
    '',
    '^ Native definition.',
    '',
    '```md',
    'Literal [^code] and ^[not a note].',
    '```',
    '`inline [^literal]`'
  ].join('\n');
  const { dom, result } = render(source, 'obsidian');
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');
  const footnotes = document.querySelector('.wmdx-footnotes');

  assert.ok(footnotes);
  assert.equal(document.querySelectorAll('.wmdx-footnote-reference').length, 4);
  assert.match(footnotes.textContent, /Definition body/);
  assert.match(footnotes.textContent, /Inline detail/);
  assert.match(footnotes.textContent, /Native definition/);
  assert.match(document.body.textContent, /Literal \[\^code\] and \^\[not a note\]/);
  assert.match(document.body.textContent, /inline \[\^literal\]/);
});
