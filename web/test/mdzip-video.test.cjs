const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('playable and notice-only video links format, parse, and extract outside code blocks', async () => {
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
  const m4vMarkdown = formatMarkdownVideoLink('Camera clip.m4v', 'video/Camera clip.m4v');
  assert.deepEqual(parseMarkdownVideoLink(m4vMarkdown), {
    label: 'Camera clip.m4v',
    url: 'video/Camera%20clip.m4v'
  });
  const webmMarkdown = formatMarkdownVideoLink('Screen recording.webm', 'video/Screen recording.webm');
  assert.deepEqual(parseMarkdownVideoLink(webmMarkdown), {
    label: 'Screen recording.webm',
    url: 'video/Screen%20recording.webm'
  });
  const threeGpMarkdown = formatMarkdownVideoLink('Older phone clip.3gp', 'video/Older phone clip.3gp');
  assert.deepEqual(parseMarkdownVideoLink(threeGpMarkdown), {
    label: 'Older phone clip.3gp',
    url: 'video/Older%20phone%20clip.3gp'
  });
  const movMarkdown = formatMarkdownVideoLink('QuickTime clip.mov', 'video/QuickTime clip.mov');
  assert.deepEqual(parseMarkdownVideoLink(movMarkdown), {
    label: 'QuickTime clip.mov',
    url: 'video/QuickTime%20clip.mov'
  });
  const mkvMarkdown = formatMarkdownVideoLink('Matroska clip.mkv', 'video/Matroska clip.mkv');
  assert.deepEqual(parseMarkdownVideoLink(mkvMarkdown), {
    label: 'Matroska clip.mkv',
    url: 'video/Matroska%20clip.mkv'
  });
  const aviMarkdown = formatMarkdownVideoLink('Old camera clip.avi', 'video/Old camera clip.avi');
  assert.deepEqual(parseMarkdownVideoLink(aviMarkdown), {
    label: 'Old camera clip.avi',
    url: 'video/Old%20camera%20clip.avi',
    unsupported: true
  });
  for (const extension of ['mpeg', 'mpg', 'ogv', 'wmv']) {
    assert.deepEqual(parseMarkdownVideoLink(`[Unsupported](video/sample.${extension})`), {
      label: 'Unsupported',
      url: `video/sample.${extension}`,
      unsupported: true
    });
    assert.equal(
      formatMarkdownVideoLink('Clip', `video/clip.${extension}?download=1`),
      `[Clip](video/clip.${extension}?download=1)`
    );
  }
  assert.deepEqual(parseMarkdownVideoLink('[Playable](video/clip.mkv)'), {
    label: 'Playable',
    url: 'video/clip.mkv'
  });
  const layoutMarkdown = formatMarkdownVideoLink(
    'Framed clip.mp4',
    'video/Framed clip.mp4',
    { width: 65, alignment: 'center' }
  );
  assert.equal(
    layoutMarkdown,
    '[Framed clip.mp4](video/Framed%20clip.mp4 "wmdx-video:width=65;align=center")'
  );
  assert.deepEqual(parseMarkdownVideoLink(layoutMarkdown), {
    label: 'Framed clip.mp4',
    url: 'video/Framed%20clip.mp4',
    layout: { width: 65, alignment: 'center' }
  });
  assert.equal(
    formatMarkdownVideoLink('Clip.mp4', 'video/Clip.mp4', { width: 100, alignment: 'left' }),
    '[Clip.mp4](video/Clip.mp4)'
  );
  assert.throws(
    () => formatMarkdownVideoLink('Clip.mp4', 'video/Clip.mp4', { width: 35, alignment: 'left' }),
    RangeError
  );
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.mp4?download=1'),
    '[Clip](video/clip.mp4?download=1)'
  );
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.m4v?download=1'),
    '[Clip](video/clip.m4v?download=1)'
  );
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.webm?download=1'),
    '[Clip](video/clip.webm?download=1)'
  );
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.3gp?download=1'),
    '[Clip](video/clip.3gp?download=1)'
  );
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.mov?download=1'),
    '[Clip](video/clip.mov?download=1)'
  );
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.mkv?download=1'),
    '[Clip](video/clip.mkv?download=1)'
  );
  assert.equal(
    formatMarkdownVideoLink('Clip', 'video/clip.avi?download=1'),
    '[Clip](video/clip.avi?download=1)'
  );
  assert.deepEqual(
    extractMarkdownVideoLinks(
      '[Clip](video/clip.mp4)\n[Camera](video/camera.m4v)\n[Screen](video/screen.webm)\n[Older phone](video/older.3gp)\n[QuickTime](video/quicktime.mov)\n[Matroska](video/matroska.mkv)\n[Legacy](video/legacy.avi)\n[MPEG](video/movie.mpeg)\n[MPG](video/movie.mpg)\n[Ogg](video/movie.ogv)\n[Windows](video/movie.wmv)\n\n`[Example](video/example.mp4)`'
    ).map(link => link.url),
    [
      'video/clip.mp4',
      'video/camera.m4v',
      'video/screen.webm',
      'video/older.3gp',
      'video/quicktime.mov',
      'video/matroska.mkv',
      'video/legacy.avi',
      'video/movie.mpeg',
      'video/movie.mpg',
      'video/movie.ogv',
      'video/movie.wmv'
    ]
  );
});

test('playable and notice-only video formats are packaged and rendered distinctly', () => {
  const manager = read('../app/src/main/java/com/wmdx/markdownapp/MdzipManager.kt');
  const activity = read('../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt');
  const editor = read('src/main.js');
  const toolbarConfig = read('src/toolbarConfig.js');
  const settingsPreview = read('src/toolbarSettingsPreview.js');
  const settingsActivity = read('../app/src/main/java/com/wmdx/markdownapp/SettingsActivity.kt');
  const widget = read('src/videoPreviewWidget.js');
  const byteRanges = read('../app/src/main/java/com/wmdx/markdownapp/MdzipByteRange.kt');
  const icons = read('src/toolbarIcons.js');
  const capture = read('src/navigationCapture.js');

  assert.match(manager, /SUPPORTED_VIDEO_EXTENSIONS =\s*setOf\("mp4", "m4v", "webm", "3gp", "mov", "mkv", "avi", "mpeg", "mpg", "ogv", "wmv"\)/);
  assert.match(manager, /fun addVideo\(/);
  assert.match(manager, /fun syncVideoReferences\(/);
  assert.match(
    manager,
    /session\.pendingAudioDeletions \+[\s\S]*session\.pendingVideoDeletions \+[\s\S]*session\.pendingAttachmentDeletions/
  );
  assert.match(activity, /pickVideoLauncher\.launch\("video\/\*"\)/);
  assert.match(activity, /MdzipManager\.isSupportedVideoFileName\(archivePath\)/);
  assert.match(activity, /MdzipManager\.assetArchiveFile\(session, archivePath\)/);
  assert.match(activity, /mdzipVideoMimeType\(extension\)/);
  assert.match(activity, /"webm" -> "video\/webm"/);
  assert.match(activity, /"3gp" -> "video\/3gpp"/);
  assert.match(activity, /"mov" -> "video\/quicktime"/);
  assert.match(activity, /"mkv" -> "video\/x-matroska"/);
  assert.match(activity, /"avi" -> "video\/x-msvideo"/);
  assert.match(activity, /"mpeg", "mpg" -> "video\/mpeg"/);
  assert.match(activity, /"ogv" -> "video\/ogg"/);
  assert.match(activity, /"wmv" -> "video\/x-ms-wmv"/);
  assert.match(activity, /Choose an MP4, M4V, WebM, 3GP, MOV, MKV, AVI, MPEG, MPG, OGV, or WMV video file/);
  assert.match(editor, /mov\|mkv\|avi\|mpeg\|mpg\|ogv\|wmv/);
  assert.match(capture, /mkv\|avi\|mpeg\|mpg\|ogv\|wmv/);
  assert.match(activity, /shouldServeMdzipAssetAsWholeFile\(isVideoAsset, extension, range\)/);
  assert.equal(
    (editor.match(/hiddenSyntaxRanges\.push\(videoDecoration\)/g) || []).length,
    2
  );
  assert.match(byteRanges, /if \(isVideoAsset\) \{\s*rangeHeader == null/s);
  assert.match(activity, /recordMdzipVideoAsset/);
  assert.match(activity, /"mdzip_video_asset"/);
  assert.match(activity, /fun syncMdzipVideoReferences\(/);
  assert.match(editor, /new VideoPreviewWidget/);
  assert.match(editor, /replacements\.push\(videoDecoration\)/);
  assert.doesNotMatch(editor, /decorations\.push\(videoDecoration\)/);
  assert.match(editor, /syncMdzipVideoReferences\?\./);
  assert.match(editor, /\{ id: 'video', title: 'Insert Video', icon: svgIcons\.video/);
  assert.match(toolbarConfig, /'image', 'audio', 'video', 'attachment', 'embed', 'link'/);
  assert.match(toolbarConfig, /parsedVersion > 0 && parsedVersion < 8/);
  assert.match(settingsPreview, /\{ id: 'video', title: 'Insert Video', icon: svgIcons\.video \}/);
  assert.match(settingsActivity, /"image", "audio", "video", "attachment", "embed", "link"/);
  assert.match(widget, /video\.controls = true/);
  assert.match(widget, /Unsupported video format\. This app can play MP4, M4V, WebM, 3GP, MOV, and MKV\./);
  assert.match(editor, /videoLink\.unsupported/);
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

test('video preview keeps native controls and safely edits or deletes the entire link', () => {
  const widget = read('src/videoPreviewWidget.js');
  const editor = read('src/main.js');

  assert.match(widget, /video\.controls = true/);
  assert.match(widget, /const video = this\.unsupported \? null : document\.createElement\('video'\)/);
  assert.match(widget, /Long-press for video options/);
  assert.match(widget, /}, 550\)/);
  assert.match(widget, /wrapper\.addEventListener\('pointerdown', onPointerDown\)/);
  assert.match(widget, /wrapper\.addEventListener\('contextmenu', onContextMenu\)/);
  assert.match(widget, /video\?\.addEventListener\('contextmenu', onContextMenu\)/);
  assert.match(widget, /'-webkit-touch-callout:none'/);
  assert.match(widget, /editButton\.textContent = 'Edit'/);
  assert.match(widget, /removeLinkButton\.textContent = 'Remove link'/);
  assert.match(widget, /deleteButton\.textContent = 'Delete'/);
  assert.match(widget, /changes: \{ from: this\.from, to: this\.to, insert: '' \}/);
  assert.match(widget, /userEvent: deletePackagedAsset \? 'delete\.packaged-video' : 'delete\.video-link'/);
  assert.match(widget, /Unsupported video format\. This app can play MP4, M4V, WebM, 3GP, MOV, and MKV\./);
  assert.match(widget, /this\.onEdit\(view/);
  assert.equal((editor.match(/new VideoPreviewWidget\(/g) || []).length, 2);
  assert.equal((editor.match(/openVideoEditDialog\(editView, item\)/g) || []).length, 2);
  assert.match(editor, /input\.mdzip-video-layout/);
});

test('MDZip writes and verifies a staged archive before opening the destination', () => {
  const manager = read('../app/src/main/java/com/wmdx/markdownapp/MdzipManager.kt');
  const saveStart = manager.indexOf('fun save(');
  const writerStart = manager.indexOf('internal fun writeSessionArchive(', saveStart);
  const saveBody = manager.slice(saveStart, writerStart);
  const stageIndex = saveBody.indexOf('writeSessionArchive(');
  const verifyIndex = saveBody.indexOf('verifyStagedArchive(stagedArchive)');
  const destinationIndex = saveBody.indexOf('openOutputStream(targetUri, "rwt")');

  assert.ok(stageIndex >= 0 && verifyIndex > stageIndex && destinationIndex > verifyIndex);
  assert.match(
    saveBody,
    /writeSessionArchive\(\s*session\.sessionDir,[\s\S]*?stagedArchive,[\s\S]*?session\.originalArchivePaths/
  );
  assert.match(manager, /entry\.method = ZipEntry\.STORED/);
});
