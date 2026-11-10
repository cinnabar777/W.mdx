const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { convertFromHtml } = require('../src/markdownConversion.mjs');
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

test('strict CommonMark HTML export does not silently render pipe tables as GFM', () => {
  const { dom, result } = render(
    '| A | B |\n| --- | --- |\n| 1 | 2 |',
    'commonmark'
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(document.querySelector('table'), null);
  assert.ok(result.warnings.some(warning => warning.includes('not CommonMark')));
});

test('HTML export removes active script content and event-handler attributes', () => {
  const { dom, result } = render(
    '<script>window.compromised = true</script>\n' +
    '<img src="https://example.test/pixel.png" onerror="alert(1)">'
  );
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(document.querySelector('script'), null);
  assert.equal(document.querySelector('[onerror]'), null);
  assert.equal(document.querySelector('img')?.getAttribute('src'), 'https://example.test/pixel.png');
});

test('GFM HTML export applies the specification tagfilter to raw HTML', () => {
  const source = [
    '<script>alert(1)</script>',
    '',
    '<textarea>text</textarea>',
    '',
    '<div><iframe src="https://example.test"></iframe></div>',
    '',
    '```html',
    '<script>literal code</script>',
    '```'
  ].join('\n');
  const { dom, result } = render(source, 'gfm');
  const document = new dom.window.DOMParser().parseFromString(result.html, 'text/html');

  assert.equal(document.querySelector('script, textarea, iframe'), null);
  assert.match(document.body.textContent, /<script>alert\(1\)<\/script>/);
  assert.match(document.body.textContent, /<textarea>text<\/textarea>/);
  assert.match(document.body.textContent, /<iframe src="https:\/\/example\.test"><\/iframe>/);
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
