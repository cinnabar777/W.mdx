const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('parses a text link with fixed empty slots and standalone alignment', async () => {
  const { parseWmdxResourceSyntax } = await import('../src/wmdxResources.js');

  assert.deepEqual(
    parseWmdxResourceSyntax('[example.com| Visit site ||>]'),
    {
      embed: false,
      source: 'example.com',
      title: 'Visit site',
      displayTitle: 'Visit site',
      sizeText: '',
      size: { width: null, height: null, unit: null },
      alignment: 'right',
      alignmentMarker: '>'
    }
  );
  assert.equal(
    parseWmdxResourceSyntax('[https://example.com|Visit site||->]').alignment,
    'right',
    'older resource links using -> remain readable'
  );
});

test('parses embedded pixel and percentage dimensions without stretching metadata', async () => {
  const { parseWmdxResourceSyntax } = await import('../src/wmdxResources.js');

  assert.deepEqual(
    parseWmdxResourceSyntax('![images/sunset.png| Sunset |320x240|><]'),
    {
      embed: true,
      source: 'images/sunset.png',
      title: 'Sunset',
      displayTitle: 'Sunset',
      sizeText: '320x240',
      size: { width: 320, height: 240, unit: 'px' },
      alignment: 'center',
      alignmentMarker: '><'
    }
  );
  assert.deepEqual(
    parseWmdxResourceSyntax('![https://example.com/sunset.png||80%|<>]').size,
    { width: 80, height: null, unit: '%' }
  );
});

test('uses the source filename when the title field is empty', async () => {
  const { parseWmdxResourceSyntax } = await import('../src/wmdxResources.js');

  assert.equal(
    parseWmdxResourceSyntax('![assets/Golden%20hour.jpg|||<]').displayTitle,
    'Golden hour.jpg'
  );
  assert.equal(
    parseWmdxResourceSyntax('[https://example.com|||]').displayTitle,
    'example.com'
  );
});

test('escapes literal pipes and backslashes inside resource fields', async () => {
  const { formatWmdxResourceSyntax, parseWmdxResourceSyntax } =
    await import('../src/wmdxResources.js');
  const input = {
    embed: true,
    source: 'assets/one|two\\photo.png',
    title: 'Rain | shine',
    size: '80%',
    alignment: 'center'
  };

  const syntax = formatWmdxResourceSyntax(input);
  assert.equal(
    syntax,
    '![assets/one\\|two\\\\photo.png|Rain \\| shine|80%|><]'
  );
  const parsed = parseWmdxResourceSyntax(syntax);
  assert.equal(parsed.source, input.source);
  assert.equal(parsed.title, input.title);
  assert.equal(parsed.sizeText, input.size);
  assert.equal(parsed.alignment, 'center');
});

test('formats alignment names as keyboard-friendly markers', async () => {
  const { formatWmdxResourceSyntax } = await import('../src/wmdxResources.js');

  assert.equal(
    formatWmdxResourceSyntax({
      source: 'https://example.com',
      title: 'Visit site',
      alignment: 'justify'
    }),
    '[https://example.com|Visit site||<>]'
  );
  assert.equal(
    formatWmdxResourceSyntax({
      source: 'example.com',
      title: 'Visit site',
      alignment: 'right'
    }),
    '[example.com|Visit site||>]'
  );
  assert.equal(
    formatWmdxResourceSyntax({ embed: true, source: 'image.png' }),
    '![image.png|||]'
  );
});

test('adds HTTPS when opening bare web domains, not for local paths or schemes', async () => {
  const { resolveWmdxResourceTarget } = await import('../src/wmdxResources.js');

  assert.equal(resolveWmdxResourceTarget('example.com'), 'https://example.com/');
  assert.equal(
    resolveWmdxResourceTarget('example.com/page?q=1'),
    'https://example.com/page?q=1'
  );
  assert.equal(resolveWmdxResourceTarget('ftp://example.com/file.zip'), 'ftp://example.com/file.zip');
  assert.equal(resolveWmdxResourceTarget('mailto:user@example.com'), 'mailto:user@example.com');
  assert.equal(resolveWmdxResourceTarget('notes/guide.md'), 'notes/guide.md');
  assert.equal(resolveWmdxResourceTarget('#section'), '#section');
});

test('finds the visible title range while ignoring escaped field pipes', async () => {
  const {
    getWmdxResourceTitleEscapeRanges,
    getWmdxResourceTitleRange,
    parseWmdxResourceSyntax
  } = await import('../src/wmdxResources.js');
  const syntax = '[https://example.com|Rain \\| shine||]';
  const range = getWmdxResourceTitleRange(syntax);

  assert.equal(
    syntax.slice(range.from, range.to),
    'Rain \\| shine'
  );
  assert.deepEqual(getWmdxResourceTitleEscapeRanges(syntax), [
    { from: syntax.indexOf('\\|'), to: syntax.indexOf('\\|') + 1 }
  ]);
  assert.equal(parseWmdxResourceSyntax(syntax).title, 'Rain | shine');
});

test('link insertion and visual rendering use native resource syntax', () => {
  const main = fs.readFileSync(
    path.join(__dirname, '../src/main.js'),
    'utf8'
  );
  assert.match(main, /node\.name === 'WmdxResource'/);
  assert.match(main, /data-wmdx-link-target/);
  assert.match(main, /formatWmdxResourceSyntax\(\{\s*source: url/);
  assert.match(main, /modal-link-alignment/);
  assert.match(main, /placeholder="example\.com" value=""/);
});

test('rejects malformed fields, invalid sizes, and sized text links', async () => {
  const { formatWmdxResourceSyntax, parseWmdxResourceSyntax } =
    await import('../src/wmdxResources.js');

  assert.equal(parseWmdxResourceSyntax('[file.png|title|80%|]'), null);
  assert.equal(parseWmdxResourceSyntax('![file.png|title|80%x20|]'), null);
  assert.equal(parseWmdxResourceSyntax('![file.png|title|101%|]'), null);
  assert.equal(parseWmdxResourceSyntax('![file.png|title|10|left]'), null);
  assert.equal(parseWmdxResourceSyntax('[file.png|title||left|extra]'), null);
  assert.equal(parseWmdxResourceSyntax('[|||]'), null);

  assert.throws(
    () => formatWmdxResourceSyntax({ source: 'site', size: '50%' }),
    /Text links cannot have a size/
  );
  assert.throws(
    () => formatWmdxResourceSyntax({ source: 'image.png', embed: true, size: '0' }),
    RangeError
  );
  assert.throws(
    () => formatWmdxResourceSyntax({ source: 'image.png', alignment: 'middle' }),
    /alignment/
  );
});
