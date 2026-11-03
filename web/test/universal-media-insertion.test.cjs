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
  const promptStart = mainActivity.indexOf('private fun promptForAssetTitle(');
  const promptEnd = mainActivity.indexOf('private fun insertAttachmentFromUri(', promptStart);
  const titlePrompt = mainActivity.slice(promptStart, promptEnd);

  assert.notEqual(start, -1);
  assert.notEqual(promptStart, -1);
  assert.match(insertion, /DocumentFormat\.MDZIP[\s\S]*MdzipManager\.addAudio/);
  assert.match(insertion, /DocumentFormat\.MDZIP[\s\S]*MdzipManager\.addVideo/);
  assert.match(insertion, /DocumentFormat\.MDZIP[\s\S]*MdzipManager\.addAttachment/);
  assert.match(insertion, /DocumentFormat\.TEXT_PACK[\s\S]*TextPackManager\.addAssetFile/);
  assert.match(insertion, /DocumentFormat\.MARKDOWN[\s\S]*MarkdownAssetManager\.addAsset/);
  assert.match(insertion, /requireWrite = true/);
  assert.match(insertion, /pref_markdown_image_location/);
  assert.match(insertion, /window\.editorBridge\?\.\$insertMethod/);
  assert.match(insertion, /MdzipManager\.addAudio\(session, assetInput, originalName\)/);
  assert.match(insertion, /MdzipManager\.addVideo\(session, assetInput, originalName\)/);
  assert.match(insertion, /MdzipManager\.addAttachment\(session, assetInput, originalName\)/);
  assert.match(insertion, /val escapedTitle = JSONObjectWrapper\.quote\(title\)/);
  assert.match(insertion, /\$insertMethod\?\.\(\$escapedLink, \$escapedTitle\)/);
  assert.match(titlePrompt, /setTitle\("Set \$kindTitle title"\)/);
  assert.match(
    titlePrompt,
    /setMessage\("This title appears in the document\. It does not rename the file\."\)/
  );
  assert.match(titlePrompt, /hint = "Displayed title"/);
  assert.match(titlePrompt, /setText\(defaultTitle\)/);
  assert.match(mainActivity, /promptForAssetTitle\(uri, InsertAssetKind\.AUDIO\)/);
  assert.match(mainActivity, /promptForAssetTitle\(uri, InsertAssetKind\.VIDEO\)/);
  assert.match(mainActivity, /promptForAssetTitle\(uri, InsertAssetKind\.ATTACHMENT\)/);
});

test('audio and video widgets use format-neutral removal language', () => {
  for (const widgetFile of ['audioPreviewWidget.js', 'videoPreviewWidget.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../src', widgetFile), 'utf8');
    assert.match(source, /removeLinkButton\.textContent = 'Remove link'/);
    assert.match(source, /deleteButton\.textContent = 'Delete'/);
  }
});

test('MDZip image insertion gives extensionless picker names a MIME-derived extension', () => {
  const start = mainActivity.indexOf('private fun insertImageFromUri(');
  const end = mainActivity.indexOf('private fun insertImageMarkdown(', start);
  const insertion = mainActivity.slice(start, end);

  assert.notEqual(start, -1);
  assert.match(insertion, /resolveImageMimeType\(uri, originalName\)/);
  assert.match(
    insertion,
    /currentMdzipSession != null -> MdzipManager\.addImage\([\s\S]*?originalName,[\s\S]*?mimeType/
  );
});

test('image insertion separates file, Base64, and URL choices', () => {
  const menuStart = mainActivity.indexOf('private fun handleInsertImage()');
  const menuEnd = mainActivity.indexOf('private fun handleInsertAudio()', menuStart);
  const menu = mainActivity.slice(menuStart, menuEnd);
  const urlStart = mainActivity.indexOf('private fun showImageUrlDialog()');
  const urlEnd = mainActivity.indexOf('private fun showPasteBase64ImageDialog()', urlStart);
  const urlDialog = mainActivity.slice(urlStart, urlEnd);
  const downloadStart = mainActivity.indexOf('private fun downloadImageFromUrl(');
  const downloadEnd = mainActivity.indexOf('private fun fetchImageFromUrl(', downloadStart);
  const download = mainActivity.slice(downloadStart, downloadEnd);

  assert.match(
    menu,
    /"Choose image file",\s*"Choose image file and embed as Base64",\s*"Paste Base64",\s*"Enter URL"/
  );
  assert.match(urlDialog, /text = "Download image to document assets"/);
  assert.match(urlDialog, /text = "Embed image as Base64"/);
  assert.match(urlDialog, /Leave both options unchecked to use the URL directly/);
  assert.doesNotMatch(urlDialog, /isChecked\s*=\s*true/);
  assert.match(urlDialog, /if \(checked\) embedAsBase64\.isChecked = false/);
  assert.match(urlDialog, /if \(checked\) downloadImage\.isChecked = false/);
  assert.match(urlDialog, /if \(shouldDownload\)[\s\S]*?downloadImageFromUrl/);
  assert.match(urlDialog, /else \{\s*insertImageMarkdown\(url\)/);
  assert.match(mainActivity, /private fun normalizeBase64Image\(/);
  assert.match(mainActivity, /detectImageMimeType\(bytes\)/);
  assert.match(download, /fetchImageFromUrl\(url\)/);
  assert.match(download, /storeImageAsset\(/);
  assert.match(mainActivity, /MAX_DOWNLOADED_IMAGE_BYTES/);
});
