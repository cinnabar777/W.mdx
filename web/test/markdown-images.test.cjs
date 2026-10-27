const test = require('node:test');
const assert = require('node:assert/strict');

test('image markdown edit preserves text and safely handles common URL characters', async () => {
  const { formatMarkdownImage, parseMarkdownImage } = await import('../src/markdownImages.js');

  const edited = formatMarkdownImage('A ] bracket', 'https://example.test/a b(photo).png');
  assert.equal(edited, '![A \\] bracket](https://example.test/a%20b(photo%29.png)');
  assert.deepEqual(parseMarkdownImage(edited), {
    alt: 'A ] bracket',
    url: 'https://example.test/a%20b(photo%29.png'
  });
});

test('image parser accepts angle-bracket destinations and optional titles', async () => {
  const { parseMarkdownImage } = await import('../src/markdownImages.js');

  assert.deepEqual(parseMarkdownImage('![diagram](<assets/diagram one.png>)'), {
    alt: 'diagram',
    url: 'assets/diagram one.png'
  });
  assert.deepEqual(parseMarkdownImage('![diagram](assets/diagram.png "title")'), {
    alt: 'diagram',
    url: 'assets/diagram.png'
  });
});

test('image width uses Obsidian size syntax and keeps the image proportional', async () => {
  const { formatMarkdownImage, parseMarkdownImage } = await import('../src/markdownImages.js');

  const markdown = formatMarkdownImage('diagram', 'images/diagram.png', 320);
  assert.equal(markdown, '![diagram|320](images/diagram.png)');
  assert.deepEqual(parseMarkdownImage(markdown), {
    alt: 'diagram',
    url: 'images/diagram.png',
    width: 320
  });
  assert.throws(() => formatMarkdownImage('diagram', 'image.png', 0), RangeError);
  assert.deepEqual(parseMarkdownImage('![literal\\|320](images/diagram.png)'), {
    alt: 'literal|320',
    url: 'images/diagram.png'
  });
});
