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

test('recognizes M4A, FLAC, Opus, OGG, and OGA links and rejects unsupported audio formats', async () => {
  const { parseMarkdownAudioLink } = await import('../src/markdownMedia.js');
  assert.deepEqual(parseMarkdownAudioLink('[Voice memo](audio/voice.m4a)'), {
    label: 'Voice memo',
    url: 'audio/voice.m4a'
  });
  assert.deepEqual(parseMarkdownAudioLink('[Voice](audio/voice.flac)'), {
    label: 'Voice',
    url: 'audio/voice.flac'
  });
  assert.deepEqual(parseMarkdownAudioLink('[Voice](audio/voice.opus)'), {
    label: 'Voice',
    url: 'audio/voice.opus'
  });
  assert.deepEqual(parseMarkdownAudioLink('[Voice](audio/voice.ogg)'), {
    label: 'Voice',
    url: 'audio/voice.ogg'
  });
  assert.deepEqual(parseMarkdownAudioLink('[Voice](audio/voice.oga)'), {
    label: 'Voice',
    url: 'audio/voice.oga'
  });
  assert.equal(parseMarkdownAudioLink('[Voice](audio/voice.wav)'), null);
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

test('stores audio width and alignment in standard Markdown link titles', async () => {
  const { formatMarkdownAudioLink, parseMarkdownAudioLink } =
    await import('../src/markdownMedia.js');
  const markdown = formatMarkdownAudioLink(
    'Voice memo.mp3',
    'audio/Voice%20memo.mp3',
    { width: 65, alignment: 'right' }
  );

  assert.equal(
    markdown,
    '[Voice memo.mp3](audio/Voice%20memo.mp3 "wmdx-audio:width=65;align=right")'
  );
  assert.deepEqual(parseMarkdownAudioLink(markdown), {
    label: 'Voice memo.mp3',
    url: 'audio/Voice%20memo.mp3',
    layout: { width: 65, alignment: 'right' }
  });
  assert.equal(
    formatMarkdownAudioLink('Hash track.mp3', 'audio/hash#track.mp3'),
    '[Hash track.mp3](audio/hash%23track.mp3)'
  );
  assert.equal(
    formatMarkdownAudioLink('Question track.mp3', 'audio/name?mix.mp3'),
    '[Question track.mp3](audio/name%3Fmix.mp3)'
  );
  assert.equal(
    formatMarkdownAudioLink('Download.mp3', 'audio/download.mp3?source=local'),
    '[Download.mp3](audio/download.mp3?source=local)'
  );
  assert.equal(
    formatMarkdownAudioLink('Lossless', 'audio/track.flac?source=local'),
    '[Lossless](audio/track.flac?source=local)'
  );
  assert.equal(
    formatMarkdownAudioLink('Voice', 'audio/track.opus?source=local'),
    '[Voice](audio/track.opus?source=local)'
  );
  assert.equal(
    formatMarkdownAudioLink('Ogg', 'audio/track.ogg?source=local'),
    '[Ogg](audio/track.ogg?source=local)'
  );
  assert.equal(
    formatMarkdownAudioLink('OGA', 'audio/track.oga?source=local'),
    '[OGA](audio/track.oga?source=local)'
  );
});

test('extracts MP3, M4A, FLAC, Opus, OGG, and OGA links without treating images or code as attachments', async () => {
  const { extractMarkdownAudioLinks } = await import('../src/markdownMedia.js');
  const markdown = [
    '[Voice](audio/voice.mp3)',
    '[Recording](audio/recording.m4a)',
    '[Lossless](audio/recording.flac)',
    '[Voice](audio/recording.opus)',
    '[Ogg](audio/recording.ogg)',
    '[Oga](audio/recording.oga)',
    '![Artwork](audio/image.mp3)',
    '`[Inline example](audio/inline.mp3)`',
    '```md',
    '[Fenced example](audio/fenced.mp3)',
    '```'
  ].join('\n');

  assert.deepEqual(
    extractMarkdownAudioLinks(markdown).map(({ url }) => url),
    [
      'audio/voice.mp3',
      'audio/recording.m4a',
      'audio/recording.flac',
      'audio/recording.opus',
      'audio/recording.ogg',
      'audio/recording.oga'
    ]
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
