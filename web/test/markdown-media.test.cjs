const test = require('node:test');
const assert = require('node:assert/strict');
const { markdown } = require('@codemirror/lang-markdown');
const { EditorState } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');
const { JSDOM } = require('jsdom');

test('media link formatter and parser preserve package-relative destinations', async () => {
  const {
    formatMarkdownMediaLink,
    getMarkdownMediaType,
    parseMarkdownMediaLink,
    resolveArchiveMediaUrl
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
  assert.equal(
    getMarkdownMediaType('../audio/voice.unknown?wmdx_media_type=audio&wmdx_media_mime=audio%2Fx-flac'),
    'audio'
  );
  assert.equal(
    getMarkdownMediaType('../video/clip.unknown?wmdx_media_type=video&wmdx_media_mime=video%2Fx-custom'),
    'video'
  );
  assert.equal(getMarkdownMediaType('content://provider/document/123', 'voice.mp3'), 'audio');
  assert.equal(
    parseMarkdownMediaLink('[voice.mp3](<content://provider/document/123>)')?.type,
    'audio'
  );
  assert.equal(
    parseMarkdownMediaLink(
      '[clip.webm](<content://provider/document/456?wmdx_media_type=video>)'
    )?.type,
    'video'
  );
  assert.equal(getMarkdownMediaType('images/cover.png'), null);
  assert.equal(
    resolveArchiveMediaUrl('../audio/voice%20note.mp3', 'https://appassets.androidplatform.net/mdzip-assets/session/docs/'),
    'https://appassets.androidplatform.net/mdzip-assets/session/audio/voice%20note.mp3'
  );
  assert.equal(
    resolveArchiveMediaUrl('https://media.example/clip.webm', 'https://appassets.androidplatform.net/mdzip-assets/session/'),
    'https://media.example/clip.webm'
  );
});

test('custom audio and video players point to the resolved packaged media URL', async () => {
  const { resolveArchiveMediaUrl } = await import('../src/markdownMedia.js');
  const { createMediaPreviewElement } = await import('../src/mediaPreview.js');
  const document = new JSDOM('').window.document;
  const baseUrl = 'https://appassets.androidplatform.net/mdzip-assets/reopened/docs/';

  for (const [type, relativePath, expectedPath, label] of [
    ['audio', '../audio/imported.ogg', '/mdzip-assets/reopened/audio/imported.ogg', 'Voice memo'],
    ['video', '../video/imported.webm', '/mdzip-assets/reopened/video/imported.webm', 'Reference clip']
  ]) {
    const src = resolveArchiveMediaUrl(relativePath, baseUrl);
    const media = createMediaPreviewElement(document, type, src, label);

    assert.equal(media.classList.contains('wmdx-media-player'), true);
    assert.equal(media.mediaElement.tagName.toLowerCase(), type);
    assert.equal(media.mediaElement.controls, false);
    assert.equal(media.mediaElement.preload, 'metadata');
    assert.equal(media.getAttribute('aria-label'), label);
    assert.equal(new URL(media.mediaElement.src).pathname, expectedPath);
    assert.ok(media.querySelector('.wmdx-media-speed'), 'playback speed uses Wmdx controls');
  }
});

test('player tries formats even when canPlayType reports no support', async () => {
  const { createMediaPreviewElement } = await import('../src/mediaPreview.js');
  const document = new JSDOM('', { url: 'https://wmdx.test/' }).window.document;
  const createElement = document.createElement.bind(document);
  document.createElement = tagName => {
    const element = createElement(tagName);
    if (tagName === 'audio' || tagName === 'video') {
      element.canPlayType = () => '';
    }
    return element;
  };
  const player = createMediaPreviewElement(
    document,
    'audio',
    'content://provider/document/789?wmdx_media_type=audio&wmdx_media_mime=audio%2Fx-flac',
    'recording.flac',
    'content://provider/document/789?wmdx_media_type=audio&wmdx_media_mime=audio%2Fx-flac'
  );

  const error = player.querySelector('.wmdx-media-error');
  assert.equal(error.hidden, true, 'do not reject before attempting playback');
  assert.equal(
    player.mediaElement.getAttribute('src'),
    'content://provider/document/789?wmdx_media_type=audio&wmdx_media_mime=audio%2Fx-flac'
  );

  player.mediaElement.dispatchEvent(new document.defaultView.Event('error'));
  assert.equal(error.hidden, false, 'show an error only after the media element fails');
  assert.equal(error.getAttribute('role'), 'alert');
  assert.match(error.textContent, /content:\/\/provider\/document\/789/);
  assert.ok(
    [...player.querySelectorAll('.wmdx-media-controls button, .wmdx-media-controls input')]
      .every(control => control.disabled)
  );
});

test('audio and video load errors announce the media reference without removing the player', async () => {
  const { createMediaPreviewElement } = await import('../src/mediaPreview.js');
  const document = new JSDOM('', { url: 'https://wmdx.test/' }).window.document;

  for (const [type, src, reference, label] of [
    ['audio', 'https://wmdx.test/assets/voice.ogg', '../audio/voice note.ogg', 'Voice memo'],
    ['video', 'https://wmdx.test/assets/reference.webm', '../video/reference.webm', 'Reference clip']
  ]) {
    const player = createMediaPreviewElement(document, type, src, label, reference);
    document.body.appendChild(player);
    player.mediaElement.dispatchEvent(new document.defaultView.Event('error'));

    const error = player.querySelector('.wmdx-media-error');
    assert.equal(error.hidden, false);
    assert.equal(error.getAttribute('role'), 'alert');
    assert.equal(error.getAttribute('aria-live'), 'assertive');
    assert.ok(error.textContent.includes(label));
    assert.ok(error.textContent.includes(reference));
    assert.match(error.textContent, /missing, unreadable, or unsupported/);
    assert.equal(player.mediaElement.isConnected, true);
    assert.equal(player.mediaElement.getAttribute('src'), src);
  }
});

test('playback speed persists and the menu stays above a player near the viewport bottom', async () => {
  const { createMediaPreviewElement } = await import('../src/mediaPreview.js');
  const dom = new JSDOM('', { url: 'https://wmdx.test/' });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 360 });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 300 });
  const player = createMediaPreviewElement(
    dom.window.document,
    'audio',
    'https://media.example/voice.mp3',
    'Voice memo'
  );
  dom.window.document.body.appendChild(player);

  const speedButton = player.querySelector('.wmdx-media-speed');
  speedButton.getBoundingClientRect = () => ({
    left: 250,
    right: 294,
    top: 278,
    bottom: 314,
    width: 44,
    height: 36
  });
  speedButton.click();
  const menu = dom.window.document.querySelector('.wmdx-media-speed-menu');
  assert.ok(menu.classList.contains('wmdx-media-speed-menu--above'));

  [...menu.querySelectorAll('.wmdx-media-speed-option')]
    .find(option => option.textContent === '1.25×')
    .click();
  assert.equal(
    dom.window.localStorage.getItem('wmdx.media.playback-rate.v1'),
    '1.25'
  );
  assert.equal(speedButton.textContent, '1.25×');
  assert.equal(dom.window.document.querySelector('.wmdx-media-speed-menu'), null);
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
