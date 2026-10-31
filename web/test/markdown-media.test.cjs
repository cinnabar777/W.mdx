const test = require('node:test');
const assert = require('node:assert/strict');
const { markdown } = require('@codemirror/lang-markdown');
const { EditorState } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');

test('media link formatter and parser preserve package-relative destinations', async () => {
  const {
    formatMarkdownMediaLink,
    getMarkdownMediaType,
    parseMarkdownMediaLink
  } = await import('../src/markdownMedia.js');

  const markdown = formatMarkdownMediaLink(
    'audio',
    '../audio/voice%20note.mp3',
    'Voice [take] 1'
  );
  assert.equal(markdown, '[Voice take 1](<../audio/voice%20note.mp3>)');
  assert.deepEqual(parseMarkdownMediaLink(markdown), {
    type: 'audio',
    label: 'Voice take 1',
    url: '../audio/voice%20note.mp3'
  });
  assert.equal(getMarkdownMediaType('video/demo.MP4?download=1'), 'video');
  assert.equal(getMarkdownMediaType('audio/voice.ogg#chapter=2'), 'audio');
  assert.equal(getMarkdownMediaType('../audio/voice.webm'), 'audio');
  assert.equal(getMarkdownMediaType('../video/clip.webm'), 'video');
  assert.equal(getMarkdownMediaType('images/cover.png'), null);
});

test('generated audio and video references are recognized as complete Markdown links', async () => {
  const { formatMarkdownMediaLink } = await import('../src/markdownMedia.js');

  for (const [type, destination] of [
    ['audio', '../audio/voice.mp3'],
    ['video', '../video/clip.webm']
  ]) {
    const markdownText = formatMarkdownMediaLink(type, destination, 'sample media');
    const state = EditorState.create({
      doc: markdownText,
      extensions: [markdown()]
    });
    const links = [];
    syntaxTree(state).iterate({
      enter(node) {
        if (node.name === 'Link') {
          links.push(state.doc.sliceString(node.from, node.to));
        }
      }
    });
    assert.deepEqual(links, [markdownText]);
  }
});

test('media link parsing leaves non-media and malformed references alone', async () => {
  const { formatMarkdownMediaLink, parseMarkdownMediaLink } =
    await import('../src/markdownMedia.js');

  assert.equal(parseMarkdownMediaLink('[Guide](docs/guide.md)'), null);
  assert.equal(parseMarkdownMediaLink('[Audio](audio/clip.mp3'), null);
  assert.equal(
    parseMarkdownMediaLink('[Movie](<video/movie.webm> "preview")').type,
    'video'
  );
  assert.throws(() => formatMarkdownMediaLink('image', 'file.mp3'), TypeError);
});
