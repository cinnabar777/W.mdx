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

test('MP4 insertion, package serving, rendering, and deletion are connected', () => {
  const manager = read('../app/src/main/java/com/wmdx/markdownapp/MdzipManager.kt');
  const activity = read('../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const editor = read('src/main.js');
  const widget = read('src/videoPreviewWidget.js');
  const icons = read('src/toolbarIcons.js');

  assert.match(manager, /SUPPORTED_VIDEO_EXTENSIONS = setOf\("mp4"\)/);
  assert.match(manager, /fun addVideo\(/);
  assert.match(manager, /fun syncVideoReferences\(/);
  assert.match(manager, /pendingAudioDeletions \+ session\.pendingVideoDeletions/);
  assert.match(activity, /pickVideoLauncher\.launch\("video\/mp4"\)/);
  assert.match(activity, /MdzipManager\.videoArchiveFile/);
  assert.match(activity, /if \(isVideoAsset\) "video\/mp4"/);
  assert.match(activity, /fun syncMdzipVideoReferences\(/);
  assert.match(editor, /new VideoPreviewWidget/);
  assert.match(editor, /syncMdzipVideoReferences\?\./);
  assert.match(editor, /id: 'video', icon: svgIcons\.video/);
  assert.match(widget, /video\.controls = true/);
  assert.match(widget, /userEvent: 'delete\.mdzip-video'/);
  assert.match(icons, /video: `<svg/);
});
