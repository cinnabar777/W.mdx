const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('MP4 Markdown links format, parse, and extract outside code blocks', async () => {
  const {
    extractMarkdownVideoLinks,
    formatMarkdownVideoLink,
    parseMarkdownVideoLink
  } = await import('../src/markdownMedia.js');
  const markdown = formatMarkdownVideoLink('Phone clip.mp4', 'video/Phone clip.mp4');

  assert.equal(markdown, '[Phone clip.mp4](video/Phone%20clip.mp4)');
  assert.deepEqual(parseMarkdownVideoLink(markdown), {
    label: 'Phone clip.mp4',
    url: 'video/Phone%20clip.mp4'
  });
  assert.equal(parseMarkdownVideoLink('[Audio](audio/track.mp3)'), null);
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.mp4?download=1'),
    '[Clip](video/clip.mp4?download=1)'
  );
  assert.deepEqual(
    extractMarkdownVideoLinks(
      '[Clip](video/clip.mp4)\n\n`[Example](video/example.mp4)`'
    ).map(link => link.url),
    ['video/clip.mp4']
  );
});

test('MP4 insertion, package serving, and default rendering are connected', () => {
  const manager = read('../app/src/main/java/com/wmdx/markdownapp/MdzipManager.kt');
  const activity = read('../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const editor = read('src/main.js');
  const toolbarConfig = read('src/toolbarConfig.js');
  const settingsPreview = read('src/toolbarSettingsPreview.js');
  const settingsActivity = read('../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt');
  const widget = read('src/videoPreviewWidget.js');
  const byteRanges = read('../app/src/main/java/com/wmdx/markdownapp/MdzipByteRange.kt');
  const icons = read('src/toolbarIcons.js');

  assert.match(manager, /SUPPORTED_VIDEO_EXTENSIONS = setOf\("mp4"\)/);
  assert.match(manager, /fun addVideo\(/);
  assert.match(manager, /fun syncVideoReferences\(/);
  assert.match(manager, /pendingAudioDeletions \+ session\.pendingVideoDeletions/);
  assert.match(activity, /pickVideoLauncher\.launch\("video\/mp4"\)/);
  assert.match(activity, /MdzipManager\.videoArchiveFile/);
  assert.match(activity, /if \(isVideoAsset\) "video\/mp4"/);
  assert.match(activity, /shouldServeMdzipAssetAsWholeFile\(isVideoAsset, extension, range\)/);
  assert.match(byteRanges, /if \(isVideoAsset\) \{\s*rangeHeader == null/s);
  assert.match(activity, /recordMdzipVideoAsset/);
  assert.match(activity, /"mdzip_video_asset"/);
  assert.match(activity, /fun syncMdzipVideoReferences\(/);
  assert.match(editor, /new VideoPreviewWidget/);
  assert.match(editor, /replacements\.push\(videoDecoration\)/);
  assert.doesNotMatch(editor, /decorations\.push\(videoDecoration\)/);
  assert.match(editor, /syncMdzipVideoReferences\?\./);
  assert.match(editor, /\{ id: 'video', title: 'Insert Video', icon: svgIcons\.video/);
  assert.match(toolbarConfig, /'image', 'audio', 'video', 'link'/);
  assert.match(toolbarConfig, /parsedVersion > 0 && parsedVersion < 8/);
  assert.match(settingsPreview, /\{ id: 'video', title: 'Insert Video', icon: svgIcons\.video \}/);
  assert.match(settingsActivity, /"image", "audio", "video", "link"/);
  assert.match(widget, /video\.controls = true/);
  assert.match(widget, /setAttribute\('aria-label', this\.label\)/);
  assert.doesNotMatch(widget, /createVideoPlayerControls|cm-mdzip-video-speed|speedMenu/);
  assert.match(widget, /video\.error\?\.code/);
  assert.match(widget, /widgetDisposed \|\| !video\.getAttribute\('src'\)/);
  assert.match(widget, /color-scheme:inherit/);
  assert.match(read('index.html'), /:root \{\s*color-scheme: dark;/);
  assert.match(read('index.html'), /body\.light-theme \{\s*color-scheme: light;/);
  assert.doesNotMatch(editor, /video\[data-mdzip-video="true"\]/);
  assert.match(icons, /video: `<svg/);
});
