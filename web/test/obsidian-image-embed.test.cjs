const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const mainSource = fs.readFileSync(
  path.join(projectRoot, 'web/src/main.js'),
  'utf8'
);

test('parses Obsidian local image embeds and optional pixel dimensions', async () => {
  const { parseObsidianImageEmbed } = await import('../src/markdownImages.js');

  assert.deepEqual(parseObsidianImageEmbed('![[assets/photo.png]]'), {
    alt: 'photo',
    url: 'assets/photo.png'
  });
  assert.deepEqual(
    parseObsidianImageEmbed('![[assets/My%20Photo.webp|320x180]]'),
    {
      alt: 'My Photo',
      url: 'assets/My%20Photo.webp',
      width: 320,
      height: 180
    }
  );
  assert.deepEqual(parseObsidianImageEmbed('![[assets/photo.png|320]]'), {
    alt: 'photo',
    url: 'assets/photo.png',
    width: 320
  });
});

test('rejects non-image, remote, absolute, and unsupported size forms', async () => {
  const { parseObsidianImageEmbed } = await import('../src/markdownImages.js');

  for (const source of [
    '![[assets/audio.mp3]]',
    '![[https://example.com/photo.png]]',
    '![[https%3A//example.com/photo.png]]',
    '![[/photos/photo.png]]',
    '![[assets/photo.png|alt text]]',
    '![[assets/photo.png|10001]]'
  ]) {
    assert.equal(parseObsidianImageEmbed(source), null, source);
  }
});

test('formats local image embeds without changing Obsidian syntax', async () => {
  const {
    formatObsidianImageEmbed,
    parseObsidianImageEmbed
  } = await import('../src/markdownImages.js');

  const formatted = formatObsidianImageEmbed(
    'assets/My Photo.png',
    320,
    180
  );
  assert.equal(formatted, '![[assets/My Photo.png|320x180]]');
  assert.deepEqual(parseObsidianImageEmbed(formatted), {
    alt: 'My Photo',
    url: 'assets/My Photo.png',
    width: 320,
    height: 180
  });
  assert.throws(
    () => formatObsidianImageEmbed('https://example.com/photo.png'),
    /relative image path/
  );
  assert.throws(
    () => formatObsidianImageEmbed('assets/not-an-image.txt'),
    /relative image path/
  );
});

test('Obsidian image syntax is parsed as an image and rendered in both visual modes', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { syntaxTree } = await import('@codemirror/language');
  const { markdown } = await import('@codemirror/lang-markdown');

  const source = '![[Documentation/Markdown-Phone-Test-Image.png|32]]';
  const state = EditorState.create({
    doc: source,
    extensions: [markdown()]
  });
  let imageNode = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'Image') {
        imageNode = state.doc.sliceString(node.from, node.to);
        return false;
      }
    }
  });
  assert.equal(imageNode, source);

  assert.equal((mainSource.match(/parseObsidianImageEmbed\(imgText\)/g) || []).length, 2);
  assert.match(mainSource, /formatObsidianImageEmbed\(newUrl, newWidth, newHeight\)/);
  assert.match(mainSource, /isObsidianEmbed\s*\?\s*formatObsidianImageEmbed/);
  assert.match(mainSource, /sourceFormat === 'obsidian'/);
});
