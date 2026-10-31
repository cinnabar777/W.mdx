const test = require('node:test');
const assert = require('node:assert/strict');

test('formats MP3 links with URL-encoded filenames and readable labels', async () => {
  const { formatMarkdownAudioLink, parseMarkdownAudioLink } =
    await import('../src/markdownMedia.js');
  const markdown = formatMarkdownAudioLink(
    'A voice memo (1).mp3',
    'audio/A voice memo (1).mp3'
  );

  assert.equal(
    markdown,
    '[A voice memo (1).mp3](audio/A%20voice%20memo%20%281%29.mp3)'
  );
  assert.deepEqual(parseMarkdownAudioLink(markdown), {
    label: 'A voice memo (1).mp3',
    url: 'audio/A%20voice%20memo%20%281%29.mp3'
  });
});

test('does not treat non-MP3 links as the first MDZip audio format', async () => {
  const { parseMarkdownAudioLink } = await import('../src/markdownMedia.js');
  assert.equal(parseMarkdownAudioLink('[Voice](audio/voice.flac)'), null);
  assert.equal(parseMarkdownAudioLink('![Voice](audio/voice.mp3)'), null);
});

test('unescapes a closing bracket in the displayed MP3 filename', async () => {
  const { formatMarkdownAudioLink, parseMarkdownAudioLink } =
    await import('../src/markdownMedia.js');
  const markdown = formatMarkdownAudioLink('voice ] one.mp3', 'audio/voice.mp3');
  assert.deepEqual(parseMarkdownAudioLink(markdown), {
    label: 'voice ] one.mp3',
    url: 'audio/voice.mp3'
  });
});

test('extracts linked MP3s without treating images or code samples as attachments', async () => {
  const { extractMarkdownAudioLinks } = await import('../src/markdownMedia.js');
  const markdown = [
    '[Voice](audio/voice.mp3)',
    '![Artwork](audio/image.mp3)',
    '`[Inline example](audio/inline.mp3)`',
    '```md',
    '[Fenced example](audio/fenced.mp3)',
    '```'
  ].join('\n');

  assert.deepEqual(
    extractMarkdownAudioLinks(markdown).map(({ url }) => url),
    ['audio/voice.mp3']
  );
});

test('migrates existing toolbar layouts to include the MDZip actions', async () => {
  const { normalizeBottomToolbarConfig } = await import('../src/toolbarConfig.js');
  const config = normalizeBottomToolbarConfig({
    version: 6,
    order: ['undo', 'insert', 'menu'],
    popupGroups: {
      insert: { order: ['image'], hidden: [] },
      menu: { order: ['openFile'], hidden: [] }
    }
  });

  assert.ok(config.popupGroups.insert.order.includes('audio'));
  assert.ok(config.popupGroups.menu.order.includes('saveAsMdzip'));
});
