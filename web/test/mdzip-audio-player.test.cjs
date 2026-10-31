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
  assert.match(player, /AndroidNative\?\.editMdzipAudio/);
  assert.match(player, /userEvent: 'delete\.mdzip-audio'/);
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
