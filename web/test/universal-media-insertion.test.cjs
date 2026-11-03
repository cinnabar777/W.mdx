const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainActivity = fs.readFileSync(
  path.join(__dirname, '../../app/src/main/java/com/wmdx/markdownapp/MainActivity.kt'),
  'utf8'
);

test('audio, video, and attachment insertion use storage for the active document format', () => {
  const start = mainActivity.indexOf('private fun insertAssetFromUri(');
  const end = mainActivity.indexOf('private fun replaceAudioFromUri(', start);
  const insertion = mainActivity.slice(start, end);

  assert.notEqual(start, -1);
  assert.match(insertion, /DocumentFormat\.MDZIP[\s\S]*MdzipManager\.addAudio/);
  assert.match(insertion, /DocumentFormat\.MDZIP[\s\S]*MdzipManager\.addVideo/);
  assert.match(insertion, /DocumentFormat\.MDZIP[\s\S]*MdzipManager\.addAttachment/);
  assert.match(insertion, /DocumentFormat\.TEXT_PACK[\s\S]*TextPackManager\.addAssetFile/);
  assert.match(insertion, /DocumentFormat\.MARKDOWN[\s\S]*MarkdownAssetManager\.addAsset/);
  assert.match(insertion, /requireWrite = true/);
  assert.match(insertion, /pref_markdown_image_location/);
  assert.match(insertion, /window\.editorBridge\?\.\$insertMethod/);
});

test('audio and video widgets use format-neutral removal language', () => {
  for (const widgetFile of ['audioPreviewWidget.js', 'videoPreviewWidget.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../src', widgetFile), 'utf8');
    assert.match(source, /removeLinkButton\.textContent = 'Remove link'/);
    assert.match(source, /deleteButton\.textContent = 'Delete'/);
  }
});
