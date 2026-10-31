const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relativePath =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('MDZip audio uses custom controls and a viewport-clamped speed menu', () => {
  const player = read('src/audioPreviewWidget.js');
  assert.doesNotMatch(player, /audio\.controls\s*=\s*true/);
  assert.match(player, /setAttribute\('aria-label', 'Playback speed'\)/);
  assert.match(player, /const bounds = viewportBounds\(\)/);
  assert.match(player, /Math\.max\(minTop, Math\.min\(above, maxTop\)\)/);
  assert.match(player, /setPlaybackRate\(rate, true\)/);
});

test('long-press exposes edit and explicit package delete actions', () => {
  const player = read('src/audioPreviewWidget.js');
  assert.match(player, /editButton\.textContent = 'Edit'/);
  assert.match(player, /deleteButton\.textContent = 'Delete from MDZip'/);
  assert.match(player, /this\.onEdit\(view/);
  assert.doesNotMatch(player, /editMdzipAudio/);
  assert.match(player, /userEvent: 'delete\.mdzip-audio'/);
});

test('M4A, FLAC, and Opus files are accepted and served with the correct MIME types', () => {
  const manager = read('../app/src/main/java/com/wmdx/markdownapp/MdzipManager.kt');
  const activity = read('../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const capture = read('src/navigationCapture.js');
  assert.match(manager, /setOf\("mp3", "m4a", "flac", "opus"\)/);
  assert.match(manager, /fun addAudio\(/);
  assert.match(manager, /fun isSupportedAudioFileName\(/);
  assert.match(activity, /pickAudioLauncher\.launch\("audio\/\*"\)/);
  assert.match(activity, /"m4a" -> "audio\/mp4"/);
  assert.match(activity, /"flac" -> "audio\/flac"/);
  assert.match(activity, /"opus" -> "audio\/ogg"/);
  assert.match(activity, /"mdzip_audio_asset"/);
  assert.match(capture, /enqueue\('media_event'/);
  assert.match(capture, /mediaErrorCode:/);
});

test('M4A and FLAC use bounded Blob seeking; Opus prepares duration when WebView omits it', () => {
  const player = read('src/audioPreviewWidget.js');
  const blobLoader = read('src/mdzipAudioBlobSeek.js');
  const activity = read('../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  assert.match(player, /isBlobSeekSource =/);
  assert.match(player, /audio\.preload = isBlobSeekSource \? 'auto' : 'metadata'/);
  assert.match(player, /void seekAudioWithBlob\(targetTime\)/);
  assert.match(player, /fetchAudioSeekBlob\(this\.src/);
  assert.match(player, /prepareOpusDuration/);
  assert.match(player, /getOggOpusDuration\(blob\)/);
  assert.match(player, /duration <= 0/);
  assert.match(player, /isFlacSource[\s\S]*'audio\/flac'[\s\S]*isOpusSource[\s\S]*'audio\/ogg'/);
  assert.match(player, /URL\.revokeObjectURL\(seekBlobUrl\)/);
  assert.match(blobLoader, /MAX_AUDIO_SEEK_BYTES = 32 \* 1024 \* 1024/);
  assert.doesNotMatch(player, /enableMdzipAudioRangeRequests/);
  assert.match(
    activity,
    /if \(extension in setOf\("m4a", "flac", "opus"\)\) \{\s*headers\.remove\("Accept-Ranges"\)/
  );
  const seekCommit = player.match(/const commitSeek = \(\) => \{([\s\S]*?)\n    \};/)?.[1];
  assert.ok(seekCommit);
  assert.match(seekCommit, /void seekAudioWithBlob\(targetTime\)/);
});

test('Opus duration is recovered from the final Ogg granule position', async () => {
  const { getOggOpusDuration } = await import('../src/oggOpusDuration.js');
  const makePage = ({ flags, serial, sequence, granule, packet }) => {
    const page = new Uint8Array(28 + packet.length);
    page.set([0x4f, 0x67, 0x67, 0x53], 0);
    page[4] = 0;
    page[5] = flags;
    const view = new DataView(page.buffer);
    view.setBigUint64(6, BigInt(granule), true);
    view.setUint32(14, serial, true);
    view.setUint32(18, sequence, true);
    page[26] = 1;
    page[27] = packet.length;
    page.set(packet, 28);
    return page;
  };
  const opusHead = new Uint8Array(19);
  opusHead.set(new TextEncoder().encode('OpusHead'));
  opusHead[8] = 1;
  opusHead[9] = 2;
  opusHead[11] = 15; // 3840 pre-skip samples
  const headPage = makePage({
    flags: 2,
    serial: 7,
    sequence: 0,
    granule: 0,
    packet: opusHead
  });
  const endPage = makePage({
    flags: 4,
    serial: 7,
    sequence: 1,
    granule: 480000 + 3840,
    packet: new Uint8Array([0])
  });

  assert.equal(
    await getOggOpusDuration(new Blob([headPage, endPage], { type: 'audio/ogg' })),
    10
  );
  assert.equal(await getOggOpusDuration(new Blob(['not an Ogg stream'])), null);
});

test('MDZip duplicate Save As moves the generated number before the extension', () => {
  const activity = read('../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const manager = read('../app/src/main/java/com/wmdx/markdownapp/MdzipManager.kt');
  assert.match(activity, /if \(saveAsMdzip == true\) \{\s*normalizeDuplicateMdzipUri\(uri\)/);
  assert.match(activity, /DocumentsContract\.renameDocument\([\s\S]*?correctedName/);
  assert.match(manager, /fun normalizeDuplicateMdzipFileName/);
});

test('audio seek buffering enforces the size limit before reading large bodies', async () => {
  const { fetchAudioSeekBlob } = await import('../src/mdzipAudioBlobSeek.js');
  const originalFetch = global.fetch;
  let bodyCancelled = false;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => '33' },
    body: {
      cancel: async () => {
        bodyCancelled = true;
      }
    },
    blob: async () => {
      throw new Error('Large response body should not be read.');
    }
  });
  try {
    await assert.rejects(
      fetchAudioSeekBlob('https://example.test/audio.m4a', { maxBytes: 32 }),
      error => error.code === 'AUDIO_SEEK_TOO_LARGE'
    );
    assert.equal(bodyCancelled, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('audio seek buffering returns a playable audio Blob within the limit', async () => {
  const { fetchAudioSeekBlob } = await import('../src/mdzipAudioBlobSeek.js');
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => '4' },
    blob: async () => new Blob(['m4a!'], { type: 'audio/mp4' })
  });
  try {
    const blob = await fetchAudioSeekBlob(
      'https://example.test/audio.m4a',
      { maxBytes: 4 }
    );
    assert.equal(blob.size, 4);
    assert.equal(blob.type, 'audio/mp4');
  } finally {
    global.fetch = originalFetch;
  }
});

test('FLAC seek buffering applies the FLAC MIME type when needed', async () => {
  const { fetchAudioSeekBlob } = await import('../src/mdzipAudioBlobSeek.js');
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => '5' },
    blob: async () => new Blob(['flac!'])
  });
  try {
    const blob = await fetchAudioSeekBlob(
      'https://example.test/audio.flac',
      { maxBytes: 5, mimeType: 'audio/flac' }
    );
    assert.equal(blob.size, 5);
    assert.equal(blob.type, 'audio/flac');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Opus seek buffering applies the Ogg MIME type when needed', async () => {
  const { fetchAudioSeekBlob } = await import('../src/mdzipAudioBlobSeek.js');
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => '5' },
    blob: async () => new Blob(['opus!'])
  });
  try {
    const blob = await fetchAudioSeekBlob(
      'https://example.test/audio.opus',
      { maxBytes: 5, mimeType: 'audio/ogg' }
    );
    assert.equal(blob.size, 5);
    assert.equal(blob.type, 'audio/ogg');
  } finally {
    global.fetch = originalFetch;
  }
});

test('audio scrubbing commits one seek on release instead of on every input event', () => {
  const player = read('src/audioPreviewWidget.js');
  const capture = read('src/navigationCapture.js');
  const inputHandler = player.match(
    /seek\.addEventListener\('input', \(\) => \{([\s\S]*?)\n    \}\);/
  )?.[1];
  assert.ok(inputHandler);
  assert.doesNotMatch(inputHandler, /audio\.currentTime\s*=/);
  assert.match(player, /seek\.addEventListener\('pointerup', commitSeek\)/);
  assert.match(player, /seek\.addEventListener\('change', commitSeek\)/);
  assert.match(capture, /'seeking', 'seeked'/);
});

test('audio edit controls save width and alignment, and the keyboard requests sentence caps', () => {
  const editor = read('src/main.js');
  const player = read('src/audioPreviewWidget.js');
  assert.match(editor, /function openAudioEditDialog/);
  assert.match(editor, /formatMarkdownAudioLink\([\s\S]*?alignment: alignmentInput\.value/);
  assert.match(editor, /EditorView\.contentAttributes\.of\(\{\s*autocapitalize: 'sentences'/);
  assert.match(player, /width:\$\{this\.layout\.width\}%/);
  assert.match(player, /this\.layout\.alignment === 'center'/);
});

test('audio link edits synchronize packaged assets and retain their bytes for undo', () => {
  const editor = read('src/main.js');
  const player = read('src/audioPreviewWidget.js');
  const manager = read('../app/src/main/java/com/wmdx/markdownapp/MdzipManager.kt');
  assert.match(editor, /syncMdzipAudioReferences\?\.\(\s*JSON\.stringify\(\[\.\.\.previousUrls\]\)/);
  assert.match(manager, /pendingAudioDeletions: MutableSet<String>/);
  assert.match(manager, /name !in pendingDeletions/);
  assert.match(manager, /fun syncAudioReferences\(/);
  assert.match(manager, /session\.pendingAudioDeletions\.add\(archivePath\)/);
  assert.match(player, /userEvent: 'delete\.mdzip-audio'/);
});

test('view changes preserve CodeMirror undo history', () => {
  const editor = read('src/main.js');
  assert.match(editor, /historyState: activeAdapter\.view\.state\.toJSON/);
  assert.match(editor, /EditorState\.fromJSON\(\s*modeSnapshot\.historyState/);
  assert.match(editor, /this\.historyCompartment\.reconfigure\(\[\]\)/);
});

test('WYSIWYG and live preview make the whole audio link atomic', () => {
  const editor = read('src/main.js');
  assert.equal(
    (editor.match(/hiddenSyntaxRanges\.push\(audioDecoration\)/g) || []).length,
    2
  );
});

test('media playback settings expose color theme and persistent speed choices', () => {
  const settings = read('../app/src/main/res/xml/preferences_media.xml');
  const root = read('../app/src/main/res/xml/preferences.xml');
  const native = read('../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const reset = read('../app/src/main/java/com/wmdx/markdownapp/ResetPreferences.kt');
  const editor = read('src/main.js');
  assert.match(root, /app:key="pref_page_media"/);
  for (const key of [
    'pref_media_player_background_color',
    'pref_media_controls_background_color',
    'pref_media_controls_text_color',
    'pref_media_controls_accent_color',
    'pref_media_controls_corner_radius'
  ]) {
    assert.match(settings, new RegExp(`app:key="${key}"`));
  }
  assert.match(settings, /app:key="pref_media_playback_speed"/);
  assert.match(settings, /pref_media_controls_corner_radius[\s\S]*?android:max="36"/);
  assert.match(native, /putString\("pref_media_playback_speed", storedSpeed\)/);
  assert.match(reset, /key == "pref_media_controls_corner_radius" -> 24/);
  assert.match(editor, /--media-controls-radius/);
});
